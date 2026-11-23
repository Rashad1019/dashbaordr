# MultiAgent News Analyst

> *Fetch. Filter. Summarize. Automatically.*

A fully autonomous, three-agent AI pipeline that pulls live news headlines from across the web, ranks them by relevance to your chosen topics, and delivers a curated summary — all in a single click.

---

## What It Does

Most news dashboards show you everything and let you sort it out. This one does the sorting for you, using a coordinated pipeline of three specialized AI agents working in sequence.

**You pick your topics. The agents do the rest.**

---

## How It Works

### The Three-Agent Pipeline

```
Agent A → Agent B → Agent C
```

| Agent | Role | Task |
|---|---|---|
| **Agent A** · *Headline Scanner* | Data Ingestion | Fetches live headlines from Google News RSS feeds across all your selected topics simultaneously. Deduplicates results and auto-tags each headline by category. |
| **Agent B** · *Relevance Ranker* | Intelligence | Scores every headline against your chosen topics using keyword and context analysis. Selects the top 3 highest-relevance results. |
| **Agent C** · *Summary Writer* | Output | Writes a one-paragraph summary of each selected headline with a free OpenRouter model. Without a key it falls back to basic template summaries. |

### Step by Step

1. **Choose your sections** — keep up to seven; remove any you don't want and add your own (your list is saved in the browser)
2. **Highlight today's sections** and click **Print today's edition** — all three agents run in sequence
3. **Read the front page** — a lead story and two side stories with relevance, publisher, date and summary
4. **Go deeper** — open "Read the whole wire" to see every fetched headline ranked by score
5. **Copy or refresh** — copy all summaries to clipboard or run again for a fresh fetch

---

## Topics You Can Track

**Built-in presets** (the first seven are on the list by default; type any of the others to bring it back):
- 🧲 Google Antigravity IDE
- 🤖 AI & Machine Learning
- 🧠 Google DeepMind
- 💻 AI Coding Assistants
- 🔗 Multi-Agent Systems
- ⚡ OpenAI / ChatGPT
- 🔒 Cybersecurity
- 🌐 Web Development
- ☁️ Cloud & DevOps
- 🚀 Startups & VC
- 🔷 Blockchain & Web3
- 📦 Open Source

**Or type anything** — custom topics are fully supported.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 · Vanilla CSS · Vanilla JavaScript |
| Backend | Python 3 (stdlib only — no pip packages) |
| News Source | Google News RSS (free, no API key) |
| Summaries | OpenRouter free models (optional, free key) |
| Hosting | Vercel (static + Python Serverless Functions) |
| Fonts | Newsreader · Schibsted Grotesk (Google Fonts) |

News needs no key. AI summaries use a free OpenRouter key; without one the app still works with basic summaries.

---

## Local Development

**Requirements:** Python 3.8+

```bash
# Clone the repo
git clone https://github.com/Rashad1019/news-dashboard.git
cd news-dashboard

# Start the local server (handles both static files and /api/news)
python server.py

# Open in browser
http://localhost:5500
```

### Turning on AI summaries (optional)

1. Create a free key at https://openrouter.ai/keys
2. Copy `.env.example` to `.env` and paste the key after `OPENROUTER_API_KEY=`
3. Restart `python server.py`. The startup message says whether AI summaries are on.

`.env` is git-ignored, so the key stays on your machine. To use a different free model, set
`OPENROUTER_MODEL` in `.env` (comma-separated list, tried in order).

---

## Project Structure

```
news-dashboard/
├── index.html          # App shell and UI markup
├── style.css           # E-paper newspaper design
├── agents.js           # All three agent logic (frontend)
├── server.py           # Local development server
├── api/
│   ├── news.py         # Vercel serverless function (/api/news)
│   ├── summarize.py    # Vercel serverless function (/api/summarize)
│   └── _openrouter.py  # Shared summary writer (OpenRouter)
├── vercel.json         # Vercel deployment config
├── .env.example        # Template for your OpenRouter key
├── .gitignore
├── README.md
└── ANTIGRAVITY.md      # How Google Antigravity IDE made this possible
```

---

## Deployment

This project is deployed on **Vercel** via GitHub. Every push to `main` triggers an automatic redeploy.
For AI summaries on Vercel, add `OPENROUTER_API_KEY` under Project Settings → Environment Variables.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Rashad1019/news-dashboard)

---

## Contact

**Rashad**
📧 [Rashad19@outlook.com](mailto:Rashad19@outlook.com)
🐙 [github.com/Rashad1019](https://github.com/Rashad1019)

---

*Built with Google Antigravity IDE · See [ANTIGRAVITY.md](./ANTIGRAVITY.md) for the full story.*
