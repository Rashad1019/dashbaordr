"""
api/news.py — Vercel Python Serverless Function
Route: /api/news?q=<query>&count=<n>
Fetches Google News RSS server-side and returns JSON.
No external dependencies — Python stdlib only.
"""

import urllib.request
import urllib.parse
import json
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    """Vercel's Python runtime looks for a BaseHTTPRequestHandler named `handler`."""

    def _send(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        query  = params.get("q", [""])[0].strip()
        try:
            count = max(1, min(int(params.get("count", ["15"])[0]), 50))
        except ValueError:
            count = 15

        if not query:
            self._send({"error": "missing q parameter"}, 400)
            return
        try:
            self._send({"status": "ok", "items": fetch_news(query, count)})
        except Exception as e:
            self._send({"error": str(e)}, 500)


def fetch_news(query: str, count: int = 15) -> list:
    encoded = urllib.parse.quote(query)
    url     = (
        f"https://news.google.com/rss/search"
        f"?q={encoded}&hl=en-US&gl=US&ceid=US:en"
    )
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        )
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read()

    root  = ET.fromstring(raw)
    items = []
    for item in root.findall(".//item")[:count]:
        title   = item.findtext("title",   default="").strip()
        link    = item.findtext("link",    default="").strip()
        pubDate = item.findtext("pubDate", default="").strip()
        source_el = item.find("source")
        source  = source_el.text.strip() if source_el is not None else "Google News"
        if title:
            items.append({
                "title":   title,
                "link":    link,
                "pubDate": pubDate,
                "source":  source,
            })
    return items
