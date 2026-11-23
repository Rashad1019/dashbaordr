"""
api/summarize.py — Vercel Python Serverless Function
Route: POST /api/summarize  {"stories": [{headline, publisher}], "topics": [str]}
Set OPENROUTER_API_KEY in the Vercel project's environment variables.
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _openrouter import summarize, SummaryError  # noqa: E402


class handler(BaseHTTPRequestHandler):

    def _send(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = min(int(self.headers.get("Content-Length", 0)), 20000)
            req    = json.loads(self.rfile.read(length) or b"{}")
            self._send(summarize(req.get("stories", []), req.get("topics", [])))
        except SummaryError as e:
            self._send({"error": str(e)}, 502)
        except (ValueError, json.JSONDecodeError):
            self._send({"error": "Request body must be JSON."}, 400)
