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
from _summary_security import read_request, summary_slot, RequestError


class handler(BaseHTTPRequestHandler):

    def _send(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        self.close_connection = True
        try:
            stories, topics = read_request(self)
            with summary_slot():
                result = summarize(stories, topics)
            self._send(result)
        except RequestError as e:
            self._send({"error": str(e)}, e.status)
        except SummaryError:
            self._send({"error": "AI summaries are temporarily unavailable."}, 502)
