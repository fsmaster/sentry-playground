import { ORG, BYO, project, parseDsn, savedByo, saveByo } from "./sentry.js";
import "./style.css";
import { SHOWCASE, api } from "./showcase.js";
import SDKS from "./sdks.json";

// New id every click: goes to the message, a run_id tag and the fingerprint.
const newRun = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const fresh = () => document.querySelector("#fresh").checked;

// --- "Use my DSN" -------------------------------------------------------------
const byoBox = document.querySelector("#byo-box");
const byoCheck = document.querySelector("#byo");
const byoDsn = document.querySelector("#byo-dsn");
const byoMsg = document.querySelector("#byo-msg");
const saved = savedByo();
byoCheck.checked = !!BYO;
byoDsn.value = saved.dsn || "";
byoBox.hidden = !byoCheck.checked;

byoCheck.onchange = () => {
  byoBox.hidden = !byoCheck.checked;
  // switching off takes effect right away, switching on waits for Apply
  if (!byoCheck.checked && BYO) {
    saveByo({ ...savedByo(), on: false });
    location.reload();
  }
};
document.querySelector("#byo-apply").onclick = () => {
  if (!parseDsn(byoDsn.value)) {
    byoMsg.className = "err";
    byoMsg.textContent = "Doesn't look like a sentry.io DSN: https://<key>@o123.ingest.us.sentry.io/456";
    return;
  }
  saveByo({ on: true, dsn: byoDsn.value.trim() });
  location.reload();
};
if (BYO) {
  document.querySelector("#byo-state").innerHTML =
    `Sending to <b>your</b> project <code>${BYO.projectId}</code>.`;
}

// --- cards --------------------------------------------------------------------
function card({ title, what, look, badge, buttons, extra = "", disabled = "" }) {
  const el = document.createElement("article");
  el.className = "card";
  el.innerHTML = `
    <header><h3>${title}</h3>${badge ? `<span class="badge">${badge}</span>` : ""}</header>
    <p>${what}</p>
    <p class="look"><b>Where to look:</b> ${look}</p>
    ${extra}
    <div class="actions"></div>
    <output>${disabled}</output>`;
  const out = el.querySelector("output");
  for (const [label, fn] of buttons) {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = !!disabled;
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

const issues = (projectId, run) =>
  `${ORG}/issues/?project=${projectId}${run ? `&query=run_id%3A${run}` : ""}&statsPeriod=7d`;

const g2 = document.querySelector("#sdks");
for (const s of SDKS) {
  const ci = s.mode === "ci";
  const pid = project(s.projectId);
  g2.append(
    card({
      title: s.title,
      what: s.blurb,
      look: `<a href="${issues(pid)}" target="_blank" rel="noopener">${BYO ? "your project" : s.project} issues ↗</a>`,
      badge: ci ? "runs in CI · ~5 min" : "live",
      extra: `<p class="guide"><a href="https://github.com/${s.repo}#readme" target="_blank" rel="noopener">Step by step guide ↗</a></p>`,
      // CI builds upload symbols into our org with our token, so not with a visitor's DSN
      disabled: ci && BYO ? "Not with your DSN: it runs in our CI. Fork the repo to run it with yours." : "",
      buttons: s.kinds.map((kind) => [
        kind,
        async (run) => {
          const r = await api(`sdk/${s.id}`, { run, fresh: fresh(), kind });
          if (r.ci) return [["CI run", r.ci], ["event shows up when the job finishes"]];
          return [["Issue", issues(pid, run)], r.event_id ? [`event ${String(r.event_id).slice(0, 8)}`] : ["sent"]];
        },
      ]),
    }),
  );
}
