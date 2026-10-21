// The "backend" half of the feature showcase. Used by server.js with our DSN
// and by byo-worker.js (a short-lived process) with a visitor's DSN.
import * as Sentry from "@sentry/node";
import { DatabaseSync } from "node:sqlite";

const PORT = process.env.PORT || 3090;
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

// Every click carries a run id. It goes into the message and a tag, and when
// "fresh" is on also into the fingerprint, so each click is a new issue.
export function scoped({ run = "manual", fresh = true }, fn) {
  return Sentry.withScope((scope) => {
    scope.setTag("run_id", run);
    if (fresh) scope.setFingerprint(["{{ default }}", run]);
    return fn(run, scope);
  });
}

export const showcase = {
  error: (run) => {
    try {
      const order = sqlSpan("select * from orders where id = 42")[0];
      return order.cents; // order is undefined -> TypeError
    } catch (err) {
      err.message = `${err.message} [run ${run}]`;
      return { event_id: Sentry.captureException(err) };
    }
  },

  trace: async () => {
    // Called from the browser inside a span, so this request continues the
    // browser's trace: one trace, spans from both sides.
    sqlSpan("select * from orders");
    await Sentry.startSpan({ name: "price basket", op: "function" }, async () => {
      sqlSpan("select sum(cents) from orders");
      await new Promise((r) => setTimeout(r, 120));
    });
    await fetch(`http://127.0.0.1:${PORT}/sentry/api/health`); // http.client span
    return {};
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

  cron: () =>
    Sentry.withMonitor(
      "playground-nightly-report",
      () => sqlSpan("select count(*) from orders"),
      // yearly schedule: the monitor never flags a "missed" run between clicks
      { schedule: { type: "crontab", value: "0 3 1 1 *" }, checkinMargin: 5, maxRuntime: 5 },
    ) && { monitor: "playground-nightly-report" },
};
