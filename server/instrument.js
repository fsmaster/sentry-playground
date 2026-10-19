// Loaded with `node --import` before anything else, so Sentry can patch
// express and http before they are imported.
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: process.env.RELEASE,
  environment: process.env.SENTRY_ENVIRONMENT || "playground",
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
  profileSessionSampleRate: 1.0,
  profileLifecycle: "trace",
});
