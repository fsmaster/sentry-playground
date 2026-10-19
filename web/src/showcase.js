import { Sentry, ORG, BROWSER_PROJECT, NODE_PROJECT } from "./sentry.js";
import { checkout } from "./checkout.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(path, body) {
  const r = await fetch(`/sentry/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

// Same trick as on the server: run id in a tag and (optionally) the fingerprint.
function capture(err, run, fresh) {
  return Sentry.withScope((scope) => {
    scope.setTag("run_id", run);
    if (fresh) scope.setFingerprint(["{{ default }}", run]);
    return Sentry.captureException(err);
  });
}

const issues = (project, run) =>
  `${ORG}/issues/?project=${project}&query=run_id%3A${run}&statsPeriod=24h`;
const trace = (id) => `${ORG}/explore/traces/trace/${id}/`;

function fib(n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

export const SHOWCASE = [
  {
    id: "error",
    title: "Error + source maps",
    what: "Browser exception from minified JS. Source maps are uploaded in CI and deleted from the server.",
    look: "Issue → stack trace shows checkout.js with original code, not the minified bundle.",
    async run(run, fresh) {
      try {
        checkout(run);
      } catch (err) {
        const id = capture(err, run, fresh);
        return [["Issue", issues(BROWSER_PROJECT, run)], [`event ${id.slice(0, 8)}`]];
      }
    },
  },
  {
    id: "backend-error",
    title: "Backend error",
    what: "Node/Express handler hits a missing DB row. The SQL query is a span, so it shows as breadcrumb and in the trace.",
    look: "Issue in playground-node project, with the trace of the request.",
    async run(run, fresh) {
      const r = await api("showcase/error", { run, fresh });
      return [["Issue", issues(NODE_PROJECT, run)], [`event ${r.event_id?.slice(0, 8)}`]];
    },
  },
  {
    id: "trace",
    title: "Distributed trace",
    what: "Click → browser span → fetch → Express → SQL spans → outgoing HTTP. sentry-trace header joins both sides into one trace.",
    look: "Trace view: browser and backend spans in one waterfall.",
    async run(run) {
      let traceId;
      await Sentry.startSpan(
        { name: `checkout click ${run}`, op: "ui.action", forceTransaction: true },
        async (span) => {
          traceId = span.spanContext().traceId;
          await Sentry.startSpan({ name: "validate form", op: "ui.render" }, () => sleep(80));
          await api("showcase/trace", { run });
        },
      );
      return [["Trace", trace(traceId)]];
    },
  },
  {
    id: "spans",
    title: "Custom spans",
    what: "Nested spans made by hand with attributes: load, sort, paint of an imaginary report.",
    look: "Trace view: one transaction with 3 children and their attributes.",
    async run(run) {
      let traceId;
      await Sentry.startSpan(
        { name: `render report ${run}`, op: "ui.render", forceTransaction: true, attributes: { run } },
        async (span) => {
          traceId = span.spanContext().traceId;
          await Sentry.startSpan({ name: "load rows", op: "http.client", attributes: { rows: 1200 } }, () => sleep(150));
          await Sentry.startSpan({ name: "sort rows", op: "function", attributes: { by: "date" } }, () => sleep(60));
          await Sentry.startSpan({ name: "paint table", op: "ui.render" }, () => sleep(40));
        },
      );
      return [["Trace", trace(traceId)]];
    },
  },
  {
    id: "logs",
    title: "Logs",
    what: "Structured logs with attributes from browser and backend, attached to the current trace.",
    look: "Explore → Logs, filter by run. Click a log line to jump to its trace.",
    async run(run) {
      Sentry.logger.info(Sentry.logger.fmt`User opened checkout, run ${run}`, { page: "checkout" });
      Sentry.logger.warn("Coupon field is empty", { run });
      await api("showcase/logs", { run });
      return [["Logs", `${ORG}/explore/logs/?project=${BROWSER_PROJECT}&project=${NODE_PROJECT}&logsQuery=${run}&statsPeriod=1h`]];
    },
  },
  {
    id: "replay",
    title: "Session Replay",
    what: "The SDK buffers the last 60 s of the page in memory. On error it sends that buffer. Inputs and text are masked by default.",
    look: "Replay player: the typing in the demo box, then the error. Text shows as *** (masked).",
    async run(run, fresh) {
      const box = document.querySelector("#replay-demo");
      box.hidden = false;
      const input = box.querySelector("input");
      input.value = "";
      for (const ch of `demo order ${run}`) {
        input.value += ch;
        await sleep(40);
      }
      box.querySelector("button").click();
      await sleep(300);
      const id = capture(new Error(`Replay demo: submit failed [run ${run}]`), run, fresh);
      await sleep(1500);
      const replayId = Sentry.getReplay()?.getReplayId();
      return [
        ["Replay", replayId ? `${ORG}/explore/replays/${replayId}/` : `${ORG}/explore/replays/`],
        ["Issue", issues(BROWSER_PROJECT, run)],
        [`event ${id.slice(0, 8)}`],
      ];
    },
  },
  {
    id: "feedback",
    title: "User Feedback",
    what: "Feedback sent from code (the widget does the same thing with a form). Linked to replay if one is running.",
    look: "User Feedback page.",
    async run(run) {
      Sentry.captureFeedback({ name: "Playground visitor", message: `Checkout is slow today (run ${run})` });
      return [["Feedback", `${ORG}/issues/feedback/?project=${BROWSER_PROJECT}`]];
    },
  },
  {
    id: "profiling",
    title: "Profiling",
    what: "CPU profile of a slow function, in browser (JS Self-Profiling API) and in Node.",
    look: "Trace → span → Profile tab. Flame graph shows fib() eating the time.",
    async run(run) {
      let traceId;
      await Sentry.startSpan({ name: `heavy calc ${run}`, op: "function", forceTransaction: true }, async (span) => {
        traceId = span.spanContext().traceId;
        fib(29);
        await api("showcase/profile", { run });
      });
      return [["Trace", trace(traceId)], ["Profiles", `${ORG}/explore/profiling/`]];
    },
  },
  {
    id: "metrics",
    title: "Metrics",
    what: "Counter, distribution and gauge sent from the backend, each with the run as attribute.",
    look: "Explore → Metrics, pick checkout.click or checkout.basket_cents.",
    async run(run) {
      await api("showcase/metrics", { run });
      return [["Metrics", `${ORG}/explore/metrics/`]];
    },
  },
  {
    id: "cron",
    title: "Cron monitor",
    what: "Backend job wrapped in withMonitor: sends in_progress then ok check-in. Monitor is created by the first check-in.",
    look: "Insights → Crons → playground-nightly-report.",
    async run(run) {
      await api("showcase/cron", { run });
      return [["Crons", `${ORG}/insights/crons/`]];
    },
  },
  {
    id: "crash",
    title: "Crash dump + debug symbols",
    what: "C program with sentry-native segfaults. crashpad writes a minidump and uploads it. Symbols came from CI.",
    look: "Issue in sdk-native: real function names and lines from the minidump.",
    async run(run, fresh) {
      await api("sdk/native", { run, fresh, kind: "crash" });
      return [["Issue", issues("4512284738519040", run)], ["(minidump takes ~20 s to process)"]];
    },
  },
];
