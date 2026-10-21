// One showcase action with a visitor's DSN, in its own process.
// The Node SDK (OpenTelemetry inside) is global per process, so this is the
// simple honest way to send spans + errors to a different project.
//   SENTRY_DSN=<theirs> node --import ./server/instrument.js server/byo-worker.js '{"kind":"trace",...}'
import * as Sentry from "@sentry/node";
import { showcase, scoped } from "./showcase.js";

const job = JSON.parse(process.argv[2]);
const fn = showcase[job.kind];

const out = await Sentry.continueTrace(
  { sentryTrace: job.sentryTrace, baggage: job.baggage },
  () =>
    Sentry.startSpan(
      { name: `POST /sentry/api/showcase/${job.kind}`, op: "http.server", forceTransaction: true },
      () => scoped(job, fn),
    ),
);
await Sentry.flush(5000);
process.stdout.write(JSON.stringify(out || {}));
process.exit(0);
