import contextlib
import http.client
import http.server
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch, Mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server
import _summary_security as security
spec = importlib.util.spec_from_file_location('vercel_summary', ROOT / 'api/summarize.py')
vercel = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vercel)
TOKEN = 'test-only-' + 'x' * 40
VALID = {'stories': [{'headline': 'Example headline', 'publisher': 'Example'}], 'topics': ['AI']}


@contextlib.contextmanager
def running(handler):
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield httpd.server_port
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join()


class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'SUMMARY_ACCESS_TOKEN': TOKEN})
        self.env.start()
        security._calls.clear()

    def tearDown(self):
        self.env.stop()

    def request(self, port, path, body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
        conn.request('GET' if body is None else 'POST', path, body, headers or {})
        response = conn.getresponse()
        status, data, headers = response.status, response.read(), dict(response.getheaders())
        conn.close()
        return status, data, headers

    def post(self, port, data=VALID, auth=True, **headers):
        h = {'Content-Type': 'application/json'}
        if auth:
            h['Authorization'] = 'Bearer ' + TOKEN
        h.update(headers)
        return self.request(port, '/api/summarize', json.dumps(data), h)

    def test_static_allowlist(self):
        with running(server.Handler) as port:
            for path in ('/', '/index.html', '/style.css', '/agents.js'):
                with self.subTest(path=path):
                    self.assertEqual(self.request(port, path)[0], 200)
            for path in ('/.env', '/.git/config', '/server.py', '/api/_openrouter.py',
                         '/README.md', '/vercel.json', '/.replit', '/../server.py',
                         '/%2eenv', '/%2e%2e/server.py', '//server.py', '/api/summarize.py'):
                with self.subTest(path=path):
                    self.assertEqual(self.request(port, path)[0], 404)

    def test_static_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / 'private').write_text('secret')
            (root / 'agents.js').symlink_to(root / 'private')
            with patch.object(server, 'BASE_DIR', d), running(server.Handler) as port:
                self.assertEqual(self.request(port, '/agents.js')[0], 404)

    def test_both_summary_endpoints(self):
        for module, handler in ((server, server.Handler), (vercel, vercel.handler)):
            with self.subTest(endpoint=module.__name__), running(handler) as port:
                security._calls.clear()
                with patch.object(module, 'summarize', return_value={'summaries': ['Safe'], 'model': 'mock'}) as ai:
                    self.assertEqual(self.post(port, auth=False)[0], 401)
                    self.assertEqual(self.post(port, Authorization='Bearer wrong')[0], 401)
                    with patch.dict(os.environ, {'SUMMARY_ACCESS_TOKEN': ''}):
                        self.assertEqual(self.post(port)[0], 503)
                    for invalid in ([], None, {}, {'stories': [None], 'topics': []},
                                    {'stories': [{'headline': 3}], 'topics': []},
                                    {'stories': VALID['stories'], 'topics': [False]},
                                    {'stories': VALID['stories'] * 8, 'topics': []}):
                        self.assertEqual(self.post(port, invalid)[0], 400)
                    self.assertEqual(self.post(port, **{'Content-Type': 'text/plain'})[0], 415)
                    self.assertEqual(self.request(port, '/api/summarize', b'x' * 20001,
                        {'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'})[0], 413)
                    self.assertEqual(self.request(port, '/api/summarize', b'\xff',
                        {'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'})[0], 400)
                    self.assertEqual(self.post(port, **{'Content-Length': '-1'})[0], 400)
                    ai.assert_not_called()
                    status, body, headers = self.post(port)
                    self.assertEqual(status, 200)
                    self.assertEqual(json.loads(body)['summaries'], ['Safe'])
                    self.assertNotIn('Access-Control-Allow-Origin', headers)
                    self.assertEqual(headers['Cache-Control'], 'no-store')
                    ai.assert_called_once_with(VALID['stories'], VALID['topics'])

    def test_error_does_not_expose_provider_details(self):
        for module, handler in ((server, server.Handler), (vercel, vercel.handler)):
            with running(handler) as port, patch.object(module, 'summarize', side_effect=module.SummaryError('secret')):
                status, body, _ = self.post(port)
                self.assertEqual(status, 502)
                self.assertNotIn(b'secret', body)

    def test_rate_limit(self):
        with running(server.Handler) as port, patch.object(server, 'summarize', return_value={}) as ai:
            for _ in range(10):
                self.assertEqual(self.post(port)[0], 200)
            self.assertEqual(self.post(port, **{'X-Forwarded-For': '1.2.3.4'})[0], 429)
            self.assertEqual(ai.call_count, 10)

    def test_concurrency_limit_and_release_on_error(self):
        with security.summary_slot(), security.summary_slot():
            with self.assertRaises(security.RequestError) as error:
                with security.summary_slot():
                    self.fail('Third concurrent request accepted')
            self.assertEqual(error.exception.status, 429)
        try:
            with security.summary_slot():
                raise RuntimeError()
        except RuntimeError:
            pass
        with security.summary_slot(), security.summary_slot():
            pass

    def test_rate_window_expires(self):
        with patch.object(security.time, 'monotonic', return_value=100):
            for _ in range(10):
                with security.summary_slot():
                    pass
        with patch.object(security.time, 'monotonic', return_value=161):
            with security.summary_slot():
                pass

    def test_bad_framing_and_timeout(self):
        from email.message import Message
        from types import SimpleNamespace
        for lengths, transfer, expected in (([], None, 411), (['1', '1'], None, 411),
                                           (['x'], None, 400), (['2'], 'chunked', 400)):
            headers = Message()
            headers['Authorization'] = 'Bearer ' + TOKEN
            for length in lengths:
                headers['Content-Length'] = length
            if transfer:
                headers['Transfer-Encoding'] = transfer
            with self.assertRaises(security.RequestError) as e:
                security.read_request(SimpleNamespace(headers=headers))
            self.assertEqual(e.exception.status, expected)

    def test_incomplete_and_timed_out_bodies(self):
        from email.message import Message
        from types import SimpleNamespace
        headers = Message()
        headers['Authorization'] = 'Bearer ' + TOKEN
        headers['Content-Length'] = '2'
        headers['Content-Type'] = 'application/json'
        for reader, expected in ((io.BytesIO(b'{'), 400), (Mock(), 408)):
            if isinstance(reader, Mock):
                reader.read.side_effect = TimeoutError()
            with self.assertRaises(security.RequestError) as error:
                security.read_request(SimpleNamespace(headers=headers, rfile=reader, connection=Mock()))
            self.assertEqual(error.exception.status, expected)

    def test_news_still_works(self):
        with running(server.Handler) as port, patch.object(server, 'fetch_news', return_value=[]):
            self.assertEqual(self.request(port, '/api/news?q=AI')[0], 200)

    def test_port_from_environment(self):
        for value in ('3000', '6789'):
            result = subprocess.check_output([sys.executable, '-c', 'import server; print(server.PORT)'],
                cwd=ROOT, env={**os.environ, 'PORT': value}, text=True)
            self.assertEqual(result.strip(), value)

    def test_vercel_routes_deny_other_paths(self):
        import re
        routes = json.loads((ROOT / 'vercel.json').read_text())['routes']
        for path in ('/.env', '/server.py', '/.git/config', '/README.md', '/api/_openrouter.py'):
            route = next(r for r in routes if re.fullmatch(r['src'], path))
            self.assertEqual(route.get('status'), 404)


if __name__ == '__main__':
    unittest.main()
