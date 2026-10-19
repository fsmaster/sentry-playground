import "./sentry.js";
import "./style.css";
import { SHOWCASE, api } from "./showcase.js";
import SDKS from "./sdks.json";

const ORG = "https://fsmaster.sentry.io";

// New id every click: goes to the message, a run_id tag and the fingerprint.
const newRun = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const fresh = () => document.querySelector("#fresh").checked;

function card({ title, what, look, badge, buttons, extra = "" }) {
  const el = document.createElement("article");
  el.className = "card";
  el.innerHTML = `
    <header><h3>${title}</h3>${badge ? `<span class="badge">${badge}</span>` : ""}</header>
    <p>${what}</p>
    <p class="look"><b>Where to look:</b> ${look}</p>
    ${extra}
    <div class="actions"></div>
    <output></output>`;
  const out = el.querySelector("output");
  for (const [label, fn] of buttons) {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = async () => {
      const run = newRun();
      b.disabled = true;
      out.className = "busy";
      out.textContent = `run ${run} …`;
      try {
        const links = (await fn(run)) || [];
        out.className = "ok";
        out.innerHTML = `run <code>${run}</code> ` +
          links.map(([t, href]) => (href ? `<a href="${href}" target="_blank" rel="noopener">${t} ↗</a>` : `<span>${t}</span>`)).join(" ");
      } catch (e) {
        out.className = "err";
        out.textContent = e.message;
      } finally {
        b.disabled = false;
      }
    };
    el.querySelector(".actions").append(b);
  }
  return el;
}

const g1 = document.querySelector("#showcase");
for (const s of SHOWCASE) {
  g1.append(card({ ...s, buttons: [["Generate", (run) => s.run(run, fresh())]] }));
}

const g2 = document.querySelector("#sdks");
for (const s of SDKS) {
  const ci = s.mode === "ci";
  g2.append(
    card({
      title: s.title,
      what: s.blurb,
      look: `<a href="${ORG}/issues/?project=${s.projectId}&statsPeriod=24h" target="_blank" rel="noopener">${s.project} issues ↗</a>`,
      badge: ci ? "runs in CI · ~5 min" : "live",
      extra: `<p class="guide"><a href="https://github.com/${s.repo}#readme" target="_blank" rel="noopener">Step by step guide ↗</a></p>`,
      buttons: s.kinds.map((kind) => [
        kind,
        async (run) => {
          const r = await api(`sdk/${s.id}`, { run, fresh: fresh(), kind });
          if (r.ci) return [["CI run", r.ci], ["event shows up when the job finishes"]];
          return [
            ["Issue", `${ORG}/issues/?project=${s.projectId}&query=run_id%3A${run}&statsPeriod=24h`],
            r.event_id ? [`event ${String(r.event_id).slice(0, 8)}`] : ["sent"],
          ];
        },
      ]),
    }),
  );
}
