"""
api/_openrouter.py — shared summary writer for Agent C.

Calls a free OpenRouter model to write one paragraph per story.
Used by server.py (local) and api/summarize.py (Vercel).
The leading underscore keeps Vercel from exposing this file as a route.
Python stdlib only.
"""

import json
import os
import re
import urllib.request
import urllib.error

API_URL = "https://openrouter.ai/api/v1/chat/completions"

# First model is preferred; OpenRouter falls through to the next if it's busy.
# Override with OPENROUTER_MODEL (comma-separated) if a model stops being free.
DEFAULT_MODELS = [
    "nvidia/nemotron-3-ultra-550b-a55b:free",   # best summaries in testing, ~4s
    "nvidia/nemotron-3.5-super-vl:free",        # good, ~2s
    "nvidia/nemotron-3.5-lightning:free",       # last resort: fast, weaker on topic focus
]

SYSTEM_PROMPT = """You write the summaries for a personal news front page.
For each story you get only the headline, the publisher and the reader's topics,
not the article. Write one paragraph of 2-3 sentences per story that says what
the headline reports and why it matters to the reader. Most stories relate to
just one of the reader's topics: name a topic only if the headline is clearly
about it, and never add a sentence linking a story to a topic it isn't about.
Do not invent facts, numbers, quotes or details that the headline doesn't state;
where something is unclear, say what the reader should look for in the full story.
Plain, direct newspaper prose. No preamble, no bullet points, no markdown.
Reply with JSON only: {"summaries": ["...", "...", "..."]} in the same order as the stories."""


class SummaryError(Exception):
    pass


def load_key() -> str:
    """OPENROUTER_API_KEY from the environment, or from a local .env file."""
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if key:
        return key
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    try:
        with open(env_path) as f:
            for line in f:
                name, _, value = line.strip().partition("=")
                if name.strip() == "OPENROUTER_API_KEY":
                    return value.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return ""


def models() -> list:
    override = os.environ.get("OPENROUTER_MODEL", "").strip()
    return [m.strip() for m in override.split(",") if m.strip()] if override else DEFAULT_MODELS


def summarize(stories: list, topics: list) -> dict:
    """stories: [{headline, publisher}], topics: [str]. Returns {summaries, model}."""
    key = load_key()
    if not key:
        raise SummaryError("No OpenRouter key set. Add OPENROUTER_API_KEY to .env.")
    if not stories:
        raise SummaryError("No stories to summarize.")

    stories = stories[:7]
    lines = [f"Reader's topics: {', '.join(str(t)[:60] for t in topics[:7])}", ""]
    for i, s in enumerate(stories, 1):
        headline  = str(s.get("headline", ""))[:300]
        publisher = str(s.get("publisher", "") or "unknown")[:80]
        lines.append(f"Story {i}: {headline} (publisher: {publisher})")

    payload = {
        "models": models(),
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "\n".join(lines)},
        ],
        "temperature": 0.4,
        "max_tokens": 300 * len(stories) + 200,
        # Free models with thinking enabled can spend the whole token budget
        # reasoning and return nothing, so turn it off for this short task.
        "reasoning": {"enabled": False},
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "X-Title": "MultiAgent News",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = json.load(e).get("error", {}).get("message", "")
        except Exception:
            pass
        if e.code == 401:
            raise SummaryError("OpenRouter rejected the key. Check OPENROUTER_API_KEY.")
        if e.code == 429:
            raise SummaryError("OpenRouter's free limit was reached. Try again later.")
        raise SummaryError(f"OpenRouter error {e.code}: {detail or e.reason}")
    except (urllib.error.URLError, TimeoutError) as e:
        raise SummaryError(f"Couldn't reach OpenRouter: {e}")

    try:
        text = data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        raise SummaryError(f"OpenRouter returned no text: {data.get('error', data)}")

    summaries = parse_summaries(text, len(stories))
    return {"summaries": summaries, "model": data.get("model", "")}


def parse_summaries(text: str, n: int) -> list:
    # Strip reasoning blocks and code fences some free models add
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    match = re.search(r"\{.*\}", text, flags=re.S)
    if not match:
        raise SummaryError("The model didn't reply in the expected format.")
    try:
        items = json.loads(match.group(0)).get("summaries", [])
    except json.JSONDecodeError:
        raise SummaryError("The model didn't reply in the expected format.")
    items = [str(s).strip() for s in items if str(s).strip()]
    if len(items) < n:
        raise SummaryError(f"The model wrote {len(items)} of {n} summaries.")
    return items[:n]
