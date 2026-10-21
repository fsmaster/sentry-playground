import * as Sentry from "@sentry/node";
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { showcase, scoped } from "./showcase.js";
import { parseDsn } from "./dsn.js";

const SDKS = JSON.parse(readFileSync(new URL("../web/src/sdks.json", import.meta.url)));
const PORT = process.env.PORT || 3090;
const app = express();
app.set("trust proxy", "loopback"); // real client ip from nginx for the rate limit
const api = express.Router();
app.use(express.json());

// --- tiny in-memory guard, this page is public -----------------------------
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}
api.use((req, res, next) => {
  if (req.method === "POST" && limited(req.ip, 30, 60_000)) {
    return res.status(429).json({ error: "Too many clicks, wait a minute" });
  }
  next();
});

// "Use my DSN": the visitor's DSN comes in the body. Validated, then the
// action runs in a short-lived worker process initialised with that DSN.
let workers = 0;
function runWorker(job, req) {
  return new Promise((resolve, reject) => {
    workers++;
    execFile(
      process.execPath,
      ["--disable-warning=ExperimentalWarning", "--import", "./server/instrument.js", "server/byo-worker.js", JSON.stringify({
        ...job,
        sentryTrace: req.get("sentry-trace"),
        baggage: req.get("baggage"),
      })],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        timeout: 20_000,
        env: { ...process.env, SENTRY_DSN: job.dsn, SENTRY_ENVIRONMENT: "playground" },
      },
      (err, stdout) => {
        workers--;
        if (err) return reject(err);
        try {
          resolve(JSON.parse(stdout || "{}"));
        } catch {
          resolve({});
        }
      },
    );
  });
}

function visitorDsn(req, res) {
  if (!req.body?.dsn) return undefined;
  const parsed = parseDsn(req.body.dsn);
  if (!parsed) {
    res.status(400).json({ error: "This DSN is not a sentry.io DSN (https://<key>@o123.ingest.sentry.io/456)" });
    return null;
  }
  return parsed.dsn;
}

api.post("/showcase/:kind", async (req, res) => {
  const fn = showcase[req.params.kind];
  if (!fn) return res.status(404).json({ error: "unknown kind" });
  const dsn = visitorDsn(req, res);
  if (dsn === null) return;
  if (dsn) {
    if (workers >= 4) return res.status(429).json({ error: "Busy, try again in a few seconds" });
    const { run, fresh = true } = req.body;
    return res.json(await runWorker({ kind: req.params.kind, run, fresh, dsn }, req));
  }
  const out = await scoped(req.body || {}, fn);
  await Sentry.flush(2000);
  res.json(out || {});
});

// --- group 2: SDK samples ----------------------------------------------------
// "server" samples run next to this app (docker compose), "ci" samples are a
// GitHub Actions workflow, because they need an emulator, a GPU-less Windows
// box and so on.
api.post("/sdk/:id", async (req, res) => {
  const sdk = SDKS.find((s) => s.id === req.params.id);
  if (!sdk) return res.status(404).json({ error: "unknown sdk" });
  const { run, fresh = true, kind = "error" } = req.body || {};
  const dsn = visitorDsn(req, res);
  if (dsn === null) return;

  if (sdk.mode === "server") {
    const r = await fetch(`http://${sdk.service}${sdk.path || "/trigger"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ run, fresh, kind, ...(dsn && { dsn }) }),
      signal: AbortSignal.timeout(20_000),
    });
    return res.status(r.status).json(await r.json().catch(() => ({ error: "bad reply" })));
  }

  if (dsn) {
    // CI builds upload their symbols with our token into our org, and run logs
    // are public. With a visitor's DSN the stack traces would stay obfuscated.
    return res.status(400).json({
      error: `Runs in our GitHub Actions, can't use your DSN. Fork ${sdk.repo} and set your own secrets.`,
    });
  }
  if (limited(`ci:${sdk.id}`, 1, 180_000)) {
    return res.status(429).json({ error: "This one runs in CI, one run per 3 minutes please" });
  }
  const r = await fetch(
    `https://api.github.com/repos/${sdk.repo}/actions/workflows/${sdk.workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.GH_DISPATCH_TOKEN}`,
        accept: "application/vnd.github+json",
      },
      body: JSON.stringify({ ref: "main", inputs: { run_id: run, fresh: String(fresh) } }),
    },
  );
  if (r.status !== 204) return res.status(502).json({ error: `GitHub said ${r.status}` });
  res.json({ ci: `https://github.com/${sdk.repo}/actions/workflows/${sdk.workflow}` });
});

api.get("/health", (req, res) => res.json({ ok: true }));

app.use("/sentry/api", api);
app.use(
  "/sentry",
  express.static(fileURLToPath(new URL("../dist", import.meta.url)), {
    // lets the browser SDK use the JS Self-Profiling API
    setHeaders: (res) => res.setHeader("Document-Policy", "js-profiling"),
  }),
);
Sentry.setupExpressErrorHandler(app);
app.listen(PORT, () => console.log(`playground on :${PORT}/sentry/`));
