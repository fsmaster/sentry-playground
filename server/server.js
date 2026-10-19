import * as Sentry from "@sentry/node";
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

// Every click carries a run id. It goes into the message and a tag, and when
// "fresh" is on also into the fingerprint, so each click is a new issue.
function scoped(req, fn) {
  const { run = "manual", fresh = true } = req.body || {};
  return Sentry.withScope((scope) => {
    scope.setTag("run_id", run);
    if (fresh) scope.setFingerprint(["{{ default }}", run]);
    return fn(run, scope);
  });
}

// --- group 1: feature showcase (this Node app is the "backend") ------------
const db = new DatabaseSync(":memory:");
db.exec("create table orders(id integer primary key, item text, cents int)");
db.exec("insert into orders(item, cents) values ('coffee', 450), ('bagel', 300)");

function sqlSpan(sql) {
  return Sentry.startSpan(
    { name: sql, op: "db.sql.query", attributes: { "db.system": "sqlite" } },
    () => db.prepare(sql).all(),
  );
}

function fib(n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

const showcase = {
  error: (run) => {
    try {
      const order = sqlSpan("select * from orders where id = 42")[0];
      return order.cents; // order is undefined -> TypeError
    } catch (err) {
      err.message = `${err.message} [run ${run}]`;
      return { event_id: Sentry.captureException(err) };
    }
  },

  trace: async (run) => {
    // Called from the browser inside a span, so this request continues the
    // browser's trace: one trace, spans from both sides.
    sqlSpan("select * from orders");
    await Sentry.startSpan({ name: "price basket", op: "function" }, async () => {
      sqlSpan("select sum(cents) from orders");
      await new Promise((r) => setTimeout(r, 120));
    });
    await fetch(`http://127.0.0.1:${PORT}/sentry/api/health`); // http.client span
    return { trace_id: Sentry.getActiveSpan() && Sentry.spanToJSON(Sentry.getActiveSpan()).trace_id };
  },

  logs: (run) => {
    Sentry.logger.info(Sentry.logger.fmt`Order received for run ${run}`, { cents: 450 });
    Sentry.logger.warn("Stock is low", { item: "bagel", left: 2, run });
    Sentry.logger.error("Payment provider timeout", { provider: "stripe-fake", run });
    return { logs: 3 };
  },

  profile: (run) =>
    Sentry.startSpan({ name: `heavy calc ${run}`, op: "function" }, () => ({ fib: fib(31) })),

  metrics: (run) => {
    Sentry.metrics.count("checkout.click", 1, { attributes: { run } });
    Sentry.metrics.distribution("checkout.basket_cents", 300 + Math.round(Math.random() * 900), {
      unit: "none",
      attributes: { run },
    });
    Sentry.metrics.gauge("queue.depth", Math.round(Math.random() * 50), { attributes: { run } });
    return { metrics: 3 };
  },

  cron: (run) =>
    Sentry.withMonitor(
      "playground-nightly-report",
      () => sqlSpan("select count(*) from orders"),
      // yearly schedule: the monitor never flags a "missed" run between clicks
      { schedule: { type: "crontab", value: "0 3 1 1 *" }, checkinMargin: 5, maxRuntime: 5 },
    ) && { monitor: "playground-nightly-report" },
};

api.post("/showcase/:kind", async (req, res) => {
  const fn = showcase[req.params.kind];
  if (!fn) return res.status(404).json({ error: "unknown kind" });
  const out = await scoped(req, fn);
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

  if (sdk.mode === "server") {
    const r = await fetch(`http://${sdk.service}${sdk.path || "/trigger"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ run, fresh, kind }),
      signal: AbortSignal.timeout(20_000),
    });
    return res.status(r.status).json(await r.json().catch(() => ({ error: "bad reply" })));
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
