import * as Sentry from "@sentry/browser";

export const ORG = "https://fsmaster.sentry.io";
export const BROWSER_PROJECT = "4512284737470464";
export const NODE_PROJECT = "4512284737601536";

Sentry.init({
  dsn: "https://58126ea7ff5f04d5eef344b8c18eb2f8@o4512264579579904.ingest.us.sentry.io/4512284737470464",
  release: __RELEASE__,
  environment: "playground",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.browserProfilingIntegration(),
    // Buffer the last minute all the time, send it only when an error happens.
    Sentry.replayIntegration(),
    Sentry.feedbackIntegration({ autoInject: false, colorScheme: "system" }),
  ],
  tracesSampleRate: 1.0,
  // only our own API gets the sentry-trace / baggage headers
  tracePropagationTargets: [/^\/sentry\/api\//],
  profileSessionSampleRate: 1.0,
  profileLifecycle: "trace",
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});

export { Sentry };
