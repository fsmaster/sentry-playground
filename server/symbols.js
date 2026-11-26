// Debug symbols lab: every scenario is a real Windows minidump of crashlab.exe
// (symbols-lab/crashlab), recorded once. The button uploads the dump to the
// Sentry minidump endpoint, the same way a crash reporter without an SDK does.
// What Sentry shows depends only on which debug files the project has.
import { readFileSync } from "node:fs";
import { parseDsn } from "./dsn.js";

const SCENARIOS = JSON.parse(readFileSync(new URL("../web/src/symbols.json", import.meta.url)));
const DUMPS = new URL("../symbols-lab/dumps/", import.meta.url);

// DSNs are public keys. Two projects: "lab" has Microsoft symbol server on,
// "bare" has all built-in repositories removed.
const OWN = {
  lab: process.env.DSN_SYMBOLS_LAB ||
    "https://6a1294255d74dad9f6117e0fa9323781@o4512264579579904.ingest.us.sentry.io/4512495914057728",
  bare: process.env.DSN_SYMBOLS_BARE ||
    "https://33969de90ef88f807feb69a03cdfc9d2@o4512264579579904.ingest.us.sentry.io/4512495914123264",
};

// https://<key>@<host>/<project>  ->  https://<host>/api/<project>/minidump/?sentry_key=<key>
function minidumpUrl(dsn) {
  const u = new URL(dsn);
  return `https://${u.host}/api${u.pathname}/minidump/?sentry_key=${u.username}`;
}

export async function sendScenario(id, { run, fresh, dsn }) {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) return { status: 404, body: { error: "unknown scenario" } };

  const form = new FormData();
  form.append("upload_file_minidump", new Blob([readFileSync(new URL(s.dump, DUMPS))]), s.dump);
  // extra event attributes go next to the dump as JSON in the "sentry" field
  form.append(
    "sentry",
    JSON.stringify({
      release: `crashlab@${s.version}`,
      environment: "lab",
      tags: { scenario: s.id, run_id: String(run || "manual").slice(0, 40) },
      ...(fresh && { fingerprint: ["{{ default }}", String(run)] }),
    }),
  );

  const target = dsn || OWN[s.project];
  const r = await fetch(minidumpUrl(target), { method: "POST", body: form, signal: AbortSignal.timeout(20_000) });
  const text = (await r.text()).trim();
  return {
    status: 200,
    body: {
      http: r.status,
      // 200: plain text event id. Anything else: what Sentry answered.
      ...(r.ok ? { event_id: text } : { rejected: text.slice(0, 200) }),
      projectId: parseDsn(target)?.projectId,
    },
  };
}
