/* ===================================================================
   agents.js  –  Multi-Agent News Analyst
   
   Agent A : Fetches live headlines for YOUR chosen topics
   Agent B : Scores & picks top 3 most relevant
   Agent C : Drafts one-paragraph summary per top result
   =================================================================== */
"use strict";

/* ─── Masthead dateline ─── */
document.getElementById("today-date").textContent =
  new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

/* ═══════════════════════════════════════════
   PRESET TOPICS
═══════════════════════════════════════════ */
const PRESET_TOPICS = [
  { label: "Google Antigravity IDE", icon: "🧲", query: "Google Antigravity IDE multi-agent coding" },
  { label: "AI & Machine Learning",  icon: "🤖", query: "artificial intelligence machine learning 2026" },
  { label: "Google DeepMind",        icon: "🧠", query: "Google DeepMind research developer tools" },
  { label: "AI Coding Assistants",   icon: "💻", query: "AI coding assistant IDE developer productivity" },
  { label: "Multi-Agent Systems",    icon: "🔗", query: "multi-agent AI orchestration autonomous systems" },
  { label: "OpenAI / ChatGPT",       icon: "⚡", query: "OpenAI ChatGPT GPT developer news" },
  { label: "Cybersecurity",          icon: "🔒", query: "cybersecurity hacking data breach 2026" },
  { label: "Web Development",        icon: "🌐", query: "web development frontend React Next.js 2026" },
  { label: "Cloud & DevOps",         icon: "☁️", query: "cloud computing DevOps AWS Azure Google Cloud" },
  { label: "Startups & VC",          icon: "🚀", query: "tech startup venture capital funding 2026" },
  { label: "Blockchain & Web3",      icon: "🔷", query: "blockchain cryptocurrency Web3 news 2026" },
  { label: "Open Source",            icon: "📦", query: "open source software GitHub developer news" },
];

/* ═══════════════════════════════════════════
   STATE
   The section list holds at most 7 sections. Each can be removed;
   a new one can be added only when there's a free slot.
═══════════════════════════════════════════ */
const MAX_SECTIONS = 7;
const STORAGE_KEY  = "mana.sections.v1";

const sameLabel     = (a, b) => a.toLowerCase() === b.toLowerCase();
const defaultLabels = () => PRESET_TOPICS.slice(0, MAX_SECTIONS).map(t => t.label);

// Typing a preset's name brings back its tuned search query
function topicFor(label) {
  return PRESET_TOPICS.find(t => sameLabel(t.label, label)) || { label, query: label };
}

function loadSections() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.every(l => typeof l === "string")) {
      return saved.slice(0, MAX_SECTIONS).map(topicFor);
    }
  } catch { /* storage unavailable: fall back to defaults */ }
  return defaultLabels().map(topicFor);
}
function saveSections() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sections.map(t => t.label))); } catch {}
}

let sections       = loadSections(); // the list shown on the page
let selectedTopics = [];             // the ones highlighted for this edition

const isSelected = label => selectedTopics.some(t => sameLabel(t.label, label));
const isFull     = () => sections.length >= MAX_SECTIONS;

/* ═══════════════════════════════════════════
   SECTION LIST
═══════════════════════════════════════════ */
function renderSections() {
  const grid = document.getElementById("chip-grid");
  grid.innerHTML = "";

  sections.forEach((topic, i) => {
    const on   = isSelected(topic.label);
    const item = document.createElement("span");
    item.className = "section-item" + (on ? " selected" : "");
    item.innerHTML = `
      <button type="button" class="topic-chip" id="chip-${i}" aria-pressed="${on}">${escapeHtml(topic.label)}</button>
      <button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(topic.label)} from your sections">×</button>`;
    item.querySelector(".topic-chip").addEventListener("click", () => toggleTopic(topic));
    item.querySelector(".chip-remove").addEventListener("click", () => removeSection(topic.label));
    grid.appendChild(item);
  });
}

function toggleTopic(topic) {
  if (isSelected(topic.label)) selectedTopics = selectedTopics.filter(t => !sameLabel(t.label, topic.label));
  else selectedTopics.push(topic);
  refresh();
}

function removeSection(label) {
  sections       = sections.filter(t => !sameLabel(t.label, label));
  selectedTopics = selectedTopics.filter(t => !sameLabel(t.label, label));
  saveSections();
  refresh();
}

function refresh() {
  renderSections();

  const n     = sections.length;
  const count = document.getElementById("topic-count");
  const input = document.getElementById("custom-topic-input");
  const add   = document.getElementById("btn-add-topic");

  count.textContent = isFull()
    ? `${n} of ${MAX_SECTIONS} sections. Remove one to add your own.`
    : `${n} of ${MAX_SECTIONS} sections. ${MAX_SECTIONS - n} free.`;

  input.disabled = add.disabled = isFull();
  input.placeholder = isFull() ? "Remove a section to add your own" : "Quantum computing, SpaceX, React 19";

  const defaults  = defaultLabels();
  const isDefault = n === defaults.length && sections.every((t, i) => t.label === defaults[i]);
  document.getElementById("btn-clear").hidden = isDefault;
  document.getElementById("btn-run").disabled = selectedTopics.length === 0;
}

/* ═══════════════════════════════════════════
   ADD A SECTION
═══════════════════════════════════════════ */
function addCustomTopic() {
  const input = document.getElementById("custom-topic-input");
  const raw   = input.value.trim().replace(/\s+/g, " ");
  if (!raw) return;
  if (sections.some(t => sameLabel(t.label, raw))) { showToast("That section is already on your list"); return; }
  if (isFull()) { showToast(`You can have ${MAX_SECTIONS} sections. Remove one to add another.`); return; }

  const topic = topicFor(raw);
  sections.push(topic);
  selectedTopics.push(topic); // a section you just added is probably one you want
  saveSections();
  input.value = "";
  refresh();
}

document.getElementById("btn-clear").addEventListener("click", () => {
  sections       = defaultLabels().map(topicFor);
  selectedTopics = [];
  saveSections();
  refresh();
});

document.getElementById("btn-add-topic").addEventListener("click", addCustomTopic);
document.getElementById("custom-topic-input").addEventListener("keydown", e => {
  if (e.key === "Enter") addCustomTopic();
});

/* ═══════════════════════════════════════════
   CORS PROXY + FETCH
═══════════════════════════════════════════ */
async function fetchFeedForTopic(topic) {
  try {
    const url = `/api/news?q=${encodeURIComponent(topic.query)}&count=15`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.items) return [];
    return data.items.map(item => ({
      headline: item.title.replace(/<[^>]+>/g, "").trim(),
      link:     item.link    || "",
      pubDate:  item.pubDate || "",
      source:   topic.label,
    }));
  } catch { return []; }
}

/* ═══════════════════════════════════════════
   AUTO-TAGGING
═══════════════════════════════════════════ */
const TAG_RULES = [
  { match: ["antigravity","deepmind","google ai"],     tag: "Google / DeepMind" },
  { match: ["gemini"],                                  tag: "Gemini" },
  { match: ["agent","agentic","multi-agent"],           tag: "Agents" },
  { match: ["ide","coding","copilot","assistant"],      tag: "IDE / Tooling" },
  { match: ["llm","gpt","claude","llama","mistral"],    tag: "LLM" },
  { match: ["open source","github","rust","python"],    tag: "OSS / Languages" },
  { match: ["funding","startup","vc","raises"],         tag: "Business" },
  { match: ["cloud","aws","azure","devops"],            tag: "Cloud" },
  { match: ["security","breach","hack","vulnerability"],tag: "Security" },
  { match: ["blockchain","crypto","web3"],              tag: "Web3" },
  { match: ["regulation","eu","policy","act"],          tag: "Policy" },
];
function autoTag(headline) {
  const lower = headline.toLowerCase();
  const tags  = [];
  TAG_RULES.forEach(r => { if (r.match.some(k => lower.includes(k))) tags.push(r.tag); });
  return tags.length ? tags : ["General Tech"];
}

/* ═══════════════════════════════════════════
   RELEVANCE SCORING  (Agent B)
   Scores against all selected topic keywords
═══════════════════════════════════════════ */
function buildKeywords(topics) {
  const keywords = new Set();
  topics.forEach(t => {
    t.query.toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 3) keywords.add(w);
    });
    t.label.toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 3) keywords.add(w);
    });
  });
  return [...keywords];
}

function scoreHeadline(headline, keywords) {
  const lower   = headline.toLowerCase();
  let score     = 0;
  const matched = [];
  keywords.forEach(kw => {
    if (lower.includes(kw)) {
      score += kw.length > 7 ? 20 : kw.length > 5 ? 12 : 6;
      matched.push(kw);
    }
  });
  return { score: Math.min(score, 100), keywords: [...new Set(matched)] };
}

/* ═══════════════════════════════════════════
   SUMMARY GENERATOR  (Agent C)
═══════════════════════════════════════════ */
function generateSummary(headline, keywords, topics, rank) {
  const h           = headline.toLowerCase();
  const topicNames  = topics.map(t => t.label).join(", ");
  const keyStr      = keywords.slice(0, 3).join("**, **");

  const openers = [
    `At the intersection of ${topicNames}, this headline marks a significant development worth your immediate attention.`,
    `This story directly touches your selected interest in ${topicNames}, representing one of the most noteworthy signals from today's news cycle.`,
    `For anyone tracking ${topicNames}, this development stands out as a key indicator of where the space is heading.`,
  ];

  const middles = keywords.length
    ? `The presence of themes around **${keyStr}** places this story at the core of the topics you care about most.`
    : `Even without explicit keyword matches, the broader context of this story aligns clearly with your stated interests.`;

  const closers = [
    `Keeping a close eye on follow-up coverage of this story is recommended, as early signals like this often precede larger shifts in the field.`,
    `Whether you're a practitioner or observer in this space, the implications of this story are likely to ripple outward in the coming days and weeks.`,
    `This is the kind of story that benefits from reading the full article — the headline only scratches the surface of what's being announced or discussed.`,
  ];

  const summary = `${openers[rank % 3]} ${middles} ${closers[rank % 3]}`;
  return summary;
}

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
const sleep      = ms => new Promise(r => setTimeout(r, ms));
const escapeHtml = s  => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const safeLink   = u  => /^https?:\/\//i.test(u || "");

function formatDate(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function setMetric(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setAgentState(id, state) {
  const el = document.getElementById(`agent-${id}`);
  if (el) el.dataset.state = state;
}
function setAgentStatus(id, msg) {
  const el = document.getElementById(`agent-${id}-status`);
  if (el) el.textContent = msg;
}
function setProgress(id, pct) {
  const el = document.getElementById(`prog-${id}`);
  if (el) el.style.width = `${pct}%`;
}

function showToast(msg, dur = 3000) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), dur);
}

/* ═══════════════════════════════════════════
   AGENT A – FETCH + CATALOGUE
═══════════════════════════════════════════ */
async function runAgentA(topics) {
  setAgentState("a", "running");
  setAgentStatus("a", `Fetching from ${topics.length} topic feed(s)…`);
  const start = Date.now();

  // Fetch all topics in parallel
  const allResults = await Promise.all(topics.map(fetchFeedForTopic));

  // Flatten + deduplicate
  const seen = new Set();
  const raw  = [];
  allResults.forEach(items => {
    items.forEach(item => {
      const key = item.headline.toLowerCase().slice(0, 65);
      if (!seen.has(key) && item.headline.length > 12) {
        seen.add(key); raw.push(item);
      }
    });
  });

  if (raw.length === 0) {
    showToast("No headlines came back. Check your connection, then print again.", 4500);
    setAgentState("a", "idle");
    return [];
  }

  setAgentStatus("a", `Cataloguing ${raw.length} headlines…`);

  const catalogue = [];
  for (let i = 0; i < raw.length; i++) {
    setProgress("a", ((i + 1) / raw.length) * 100);
    setMetric("m-a-parsed", i + 1);
    catalogue.push({
      id:       i + 1,
      headline: raw[i].headline,
      link:     raw[i].link,
      pubDate:  raw[i].pubDate,
      source:   raw[i].source,
      tags:     autoTag(raw[i].headline),
    });
    await sleep(32);
  }

  setMetric("m-a-fetched", raw.length);
  setMetric("m-a-parsed",  raw.length);
  setMetric("m-a-time",    Date.now() - start);
  setAgentStatus("a", `${raw.length} headlines catalogued`);
  setAgentState("a", "done");
  document.getElementById("arrow-ab").classList.add("active");
  return catalogue;
}

/* ═══════════════════════════════════════════
   AGENT B – RANK + SELECT TOP 3
═══════════════════════════════════════════ */
async function runAgentB(catalogue, topics) {
  setAgentState("b", "running");
  setAgentStatus("b", "Scoring relevance…");
  const start    = Date.now();
  const keywords = buildKeywords(topics);

  const scored = [];
  for (let i = 0; i < catalogue.length; i++) {
    setProgress("b", ((i + 1) / catalogue.length) * 100);
    setMetric("m-b-scored", i + 1);
    const { score, keywords: kw } = scoreHeadline(catalogue[i].headline, keywords);
    scored.push({ ...catalogue[i], score, keywords: kw });
    await sleep(22);
  }

  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const top3   = ranked.slice(0, 3);

  setMetric("m-b-selected", top3.length);
  setMetric("m-b-time",     Date.now() - start);
  setAgentStatus("b", `Top 3 picked from ${catalogue.length}`);
  setAgentState("b", "done");
  document.getElementById("arrow-bc").classList.add("active");
  return { ranked, top3 };
}

/* ═══════════════════════════════════════════
   AGENT C – WRITE SUMMARIES
═══════════════════════════════════════════ */
async function runAgentC(top3, topics) {
  setAgentState("c", "running");
  setAgentStatus("c", "Writing summaries…");
  const start     = Date.now();
  const summaries = [];
  let totalWords  = 0;

  for (let i = 0; i < top3.length; i++) {
    const item    = top3[i];
    const summary = generateSummary(item.headline, item.keywords, topics, i);
    summaries.push({ ...item, summary });
    totalWords += summary.split(/\s+/).length;
    setProgress("c", ((i + 1) / top3.length) * 100);
    setMetric("m-c-drafted", i + 1);
    setMetric("m-c-words",   totalWords);
    await sleep(480);
  }

  setMetric("m-c-time",  Date.now() - start);
  setAgentStatus("c", `${top3.length} summaries written`);
  setAgentState("c", "done");
  return summaries;
}

/* ═══════════════════════════════════════════
   RENDER RESULTS
═══════════════════════════════════════════ */
function renderResults(summaries, allRanked, topics) {
  const grid    = document.getElementById("results-grid");
  const tbody   = document.getElementById("raw-tbody");
  const section = document.getElementById("results-section");
  const title   = document.getElementById("results-title");
  const desc    = document.getElementById("results-desc");

  grid.innerHTML  = "";
  tbody.innerHTML = "";

  const topicStr = topics.map(t => t.label).join(", ");
  title.textContent = "Front page";
  desc.textContent  = `Covering ${topicStr}. Ranked by Agent B, written by Agent C.`;

  const selectedIds = new Set(summaries.map(s => s.id));
  const ordinals    = ["1st", "2nd", "3rd"];

  summaries.forEach((item, i) => {
    const summary  = item.summary.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    const date     = formatDate(item.pubDate);
    const linkHtml = safeLink(item.link)
      ? `<a class="result-link" href="${escapeHtml(item.link)}" target="_blank" rel="noopener">Read the full story</a>` : "";

    // Google News headlines end in " - Publisher"; move that into the byline
    const m         = item.headline.match(/^(.*\S)\s+[-–—|]\s+([^-–—|]{2,60})$/);
    const headline  = m ? m[1] : item.headline;
    const publisher = m ? m[2] : "";

    const card = document.createElement("article");
    card.className = `result-card ${i === 0 ? "lead" : "side"}`;
    card.innerHTML = `
      <p class="kicker">${escapeHtml(item.tags.join(", "))}</p>
      <h3 class="result-headline">${escapeHtml(headline)}</h3>
      <div class="result-meta">
        <span class="meter" title="Relevance to your sections">
          <span class="meter-track"><span class="meter-fill" data-target="${item.score}"></span></span>
          ${item.score}% match
        </span>
        <span>Ranked ${ordinals[i]}</span>
        ${publisher ? `<span>${escapeHtml(publisher)}</span>` : ""}
        <span>Filed under ${escapeHtml(item.source)}</span>
        ${date ? `<span>${date}</span>` : ""}
      </div>
      <p class="summary-text">${summary}</p>
      ${linkHtml}
    `;
    grid.appendChild(card);
  });

  allRanked.forEach((item, i) => {
    const isTop = selectedIds.has(item.id);
    const tr    = document.createElement("tr");
    if (isTop) tr.classList.add("highlighted");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><span>${escapeHtml(item.headline)}</span></td>
      <td>${escapeHtml(item.tags.join(", "))}</td>
      <td><span class="score-chip ${item.score >= 20 ? "score-high" : "score-mid"}">${item.score}</span></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("blank-page").style.display = "none";
  section.style.display = "block";
  section.classList.remove("printing");
  void section.offsetWidth; // restart the print animation
  section.classList.add("printing");

  requestAnimationFrame(() => requestAnimationFrame(() => {
    section.querySelectorAll(".meter-fill").forEach(el => { el.style.width = el.dataset.target + "%"; });
  }));

  const stamp = document.getElementById("edition-stamp");
  stamp.textContent = `Edition printed ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  stamp.classList.add("printed");

  setTimeout(() => section.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
}

/* ═══════════════════════════════════════════
   RESET
═══════════════════════════════════════════ */
function resetPipeline() {
  ["a","b","c"].forEach(id => {
    setAgentState(id, "idle");
    setProgress(id, 0);
    setAgentStatus(id, "Waiting");
  });
  ["m-a-fetched","m-a-parsed","m-a-time",
   "m-b-scored","m-b-selected","m-b-time",
   "m-c-drafted","m-c-words","m-c-time"].forEach(id => setMetric(id, "–"));
  ["arrow-ab","arrow-bc"].forEach(id =>
    document.getElementById(id).classList.remove("active")
  );
}

/* ═══════════════════════════════════════════
   MAIN RUN
═══════════════════════════════════════════ */
document.getElementById("btn-run").addEventListener("click", async () => {
  if (!selectedTopics.length) return;

  document.getElementById("btn-run").disabled = true;
  document.getElementById("results-section").style.display = "none";
  resetPipeline();

  const topics = [...selectedTopics];
  const tTotal = Date.now();

  try {
    const catalogue          = await runAgentA(topics);
    if (!catalogue.length) { document.getElementById("btn-run").disabled = false; return; }
    await sleep(220);

    const { ranked, top3 }  = await runAgentB(catalogue, topics);
    await sleep(220);

    const summaries          = await runAgentC(top3, topics);
    await sleep(150);

    renderResults(summaries, ranked, topics);
    const elapsed = ((Date.now() - tTotal) / 1000).toFixed(1);
    showToast(`Edition printed in ${elapsed}s from ${catalogue.length} headlines.`);

  } catch (err) {
    console.error(err);
    showToast("The press stopped on an error. Details are in the browser console.");
  } finally {
    document.getElementById("btn-run").disabled = selectedTopics.length === 0;
  }
});

/* Reset button */
document.getElementById("btn-reset").addEventListener("click", () => {
  document.getElementById("results-section").style.display = "none";
  document.getElementById("blank-page").style.display = "";
  resetPipeline();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

/* Copy summaries */
document.getElementById("btn-copy").addEventListener("click", () => {
  const cards = document.querySelectorAll(".result-card");
  let text = "";
  cards.forEach((card, i) => {
    const h = card.querySelector(".result-headline").textContent;
    const s = card.querySelector(".summary-text").textContent;
    text += `── HEADLINE ${i + 1} ──\n${h}\n\nSUMMARY:\n${s}\n\n`;
  });
  navigator.clipboard.writeText(text.trim())
    .then(()  => showToast("Summaries copied"))
    .catch(()  => showToast("Copy failed. Your browser blocked clipboard access."));
});

/* Footer clock */
(function clock() {
  const el = document.getElementById("footer-time");
  if (el) el.textContent = new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12: false });
  setTimeout(clock, 1000);
})();

/* Init sections */
refresh();
