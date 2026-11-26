import { ORG, BYO } from "./sentry.js";
import { initByo } from "./byo.js";
import "./style.css";
import { api } from "./showcase.js";
import SCENARIOS from "./symbols.json";

// Our two projects. With "Use my DSN" everything goes to the visitor's project.
const PROJECTS = { lab: "4512495914057728", bare: "4512495914123264" };
// Dumps are served by this app, symbol zips are release assets on GitHub.
const DUMPS = "/sentry/symbols/dumps/";
const ZIPS = "https://github.com/fsmaster/sentry-playground/releases/download/symbols-lab-1/";

const newRun = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const fresh = () => document.querySelector("#fresh").checked;
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

initByo();
for (const a of document.querySelectorAll("a[data-dl]")) a.href = ZIPS + a.dataset.dl;

const STATE = { good: "works", warn: "looks fine, is not", bad: "broken" };

const grid = document.querySelector("#scenarios");
for (const s of SCENARIOS) {
  const pid = BYO ? BYO.projectId : PROJECTS[s.project];
  const el = document.createElement("article");
  el.className = `card scenario ${s.state}`;
  el.innerHTML = `
    <header><h3>${esc(s.title)}</h3><span class="badge">${STATE[s.state]} · crashlab ${s.version}</span></header>
    <dl>
      <dt>Uploaded</dt><dd>${esc(s.uploaded)}</dd>
      <dt>You see</dt><dd>${esc(s.see)}</dd>
      <dt>Why</dt><dd>${esc(s.why)}</dd>
    </dl>
    ${s.fix.length ? `<details><summary>How to fix</summary><ul>${s.fix.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>` : ""}
    <p class="files">
      <a href="${DUMPS}${s.dump}" download>${s.dump}</a>
      <a href="${ZIPS}crashlab-${s.version}-symbols.zip">right symbols for ${s.version}</a>
    </p>
    <div class="actions"><button type="button">Send this crash</button></div>
    <output></output>`;
  const b = el.querySelector("button");
  const out = el.querySelector("output");
  b.onclick = async () => {
    const run = newRun();
    b.disabled = true;
    out.className = "busy";
    out.textContent = `run ${run} …`;
    try {
      const r = await api(`symbols/${s.id}`, { run, fresh: fresh() });
      if (r.event_id) {
        const q = `${ORG}/issues/?project=${pid}&query=run_id%3A${run}&statsPeriod=7d`;
        out.className = "ok";
        out.innerHTML = `run <code>${run}</code> <a href="${q}" target="_blank" rel="noopener">Issue ↗</a> <span>event ${r.event_id.slice(0, 8)}, give it ~10 s</span>`;
      } else {
        out.className = "err";
        out.textContent = `Sentry answered HTTP ${r.http}: ${r.rejected}. No event, nothing in Issues.`;
      }
    } catch (e) {
      out.className = "err";
      out.textContent = e.message;
    } finally {
      b.disabled = false;
    }
  };
  grid.append(el);
}
