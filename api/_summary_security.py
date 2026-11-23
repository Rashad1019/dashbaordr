"""Shared, fail-closed controls for both summary endpoints (stdlib only)."""
import hmac
import json
import os
import threading
import time
from collections import deque
from contextlib import contextmanager

MAX_BODY = 20000
_calls = deque()
_lock = threading.Lock()
_slots = threading.BoundedSemaphore(2)


class RequestError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def read_request(handler):
    token = os.environ.get("SUMMARY_ACCESS_TOKEN", "")
    if len(token) < 32:
        raise RequestError(503, "AI summaries are disabled until an access token is configured.")
    supplied = handler.headers.get("Authorization", "")
    if not hmac.compare_digest(supplied.encode(), ("Bearer " + token).encode()):
        raise RequestError(401, "A valid summary access token is required.")
    if handler.headers.get("Transfer-Encoding"):
        raise RequestError(400, "Transfer encoding is not supported.")
    lengths = handler.headers.get_all("Content-Length", [])
    if len(lengths) != 1:
        raise RequestError(411, "One Content-Length header is required.")
    try:
        length = int(lengths[0])
    except ValueError:
        raise RequestError(400, "Invalid Content-Length.")
    if length <= 0:
        raise RequestError(400, "Request body is required.")
    if length > MAX_BODY:
        raise RequestError(413, "Request body is too large.")
    if handler.headers.get_content_type() != "application/json":
        raise RequestError(415, "Content-Type must be application/json.")
    handler.connection.settimeout(10)
    try:
        body = handler.rfile.read(length)
        if len(body) != length:
            raise RequestError(400, "Incomplete request body.")
        data = json.loads(body)
    except (ValueError, UnicodeError, RecursionError):
        raise RequestError(400, "Request body must be valid JSON.")
    except (TimeoutError, OSError):
        raise RequestError(408, "Request body timed out.")
    if not isinstance(data, dict):
        raise RequestError(400, "Request must be an object.")
    stories, topics = data.get("stories"), data.get("topics")
    if not isinstance(stories, list) or not 1 <= len(stories) <= 7:
        raise RequestError(400, "Provide between 1 and 7 stories.")
    if not isinstance(topics, list) or len(topics) > 7:
        raise RequestError(400, "Provide at most 7 topics.")
    for topic in topics:
        if not isinstance(topic, str) or not 1 <= len(topic.strip()) <= 60:
            raise RequestError(400, "Each topic must contain 1 to 60 characters.")
    for story in stories:
        if not isinstance(story, dict):
            raise RequestError(400, "Each story must be an object.")
        headline, publisher = story.get("headline"), story.get("publisher", "")
        if not isinstance(headline, str) or not 1 <= len(headline.strip()) <= 300:
            raise RequestError(400, "Headlines must contain 1 to 300 characters.")
        if not isinstance(publisher, str) or len(publisher) > 80:
            raise RequestError(400, "Publishers must be strings of at most 80 characters.")
    return stories, topics


@contextmanager
def summary_slot():
    # Process-wide rather than IP-based: forwarded headers cannot bypass it.
    # Serverless replicas have separate limits; authentication is always required.
    with _lock:
        now = time.monotonic()
        while _calls and _calls[0] <= now - 60:
            _calls.popleft()
        if len(_calls) >= 10:
            raise RequestError(429, "Summary limit reached. Try again in a minute.")
        if not _slots.acquire(blocking=False):
            raise RequestError(429, "Summary service is busy. Try again shortly.")
        _calls.append(now)
    try:
        yield
    finally:
        _slots.release()
