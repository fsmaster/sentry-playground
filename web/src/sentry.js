import * as Sentry from "@sentry/browser";

const OWN_DSN = "https://58126ea7ff5f04d5eef344b8c18eb2f8@o4512264579579904.ingest.us.sentry.io/4512284737470464";

// Same rule as the server (server/dsn.js): only sentry.io DSNs.
const SAAS = /^https:\/\/([0-9a-f]{32})@((?:o\d+\.ingest(?:\.[a-z]{2})?\.)?sentry\.io)\/(\d+)$/;
export function parseDsn(value) {
  const m = SAAS.exec(String(value || "").trim());
  return m ? { dsn: m[0], projectId: m[3] } : null;
}

// "Use my DSN" lives in this browser only. The page reloads after a change,
// because the SDK (and Replay in it) can be initialised once per page.
export function savedByo() {
  try {
    return JSON.parse(localStorage.getItem("byo") || "null") || {};
  } catch {
    return {};
  }
}
export function saveByo(cfg) {
  try {
    localStorage.setItem("byo", JSON.stringify(cfg));
  } catch {
    /* private mode: the setting just won't stick */
  }
}
const saved = savedByo();
const parsed = saved.on && parseDsn(saved.dsn);
export const BYO = parsed ? { ...parsed, org: (saved.org || "").trim() } : null;

// Links into Sentry. Without an org slug sentry.io redirects to the org you
// used last and keeps the ?project= filter.
export const ORG = BYO ? (BYO.org ? `https://${BYO.org}.sentry.io` : "https://sentry.io") : "https://fsmaster.sentry.io";
export const project = (ownId) => (BYO ? BYO.projectId : ownId);
export const BROWSER_PROJECT = project("4512284737470464");
export const NODE_PROJECT = project("4512284737601536");

Sentry.init({
  dsn: BYO ? BYO.dsn : OWN_DSN,
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
  tracePropagationTargets: [/\/sentry\/api\//],
  profileSessionSampleRate: 1.0,
  profileLifecycle: "trace",
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});

export { Sentry };
