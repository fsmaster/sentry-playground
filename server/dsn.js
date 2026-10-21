// A DSN from the page is used by our server to send events, so we only
// accept sentry.io ingest hosts. Anything else (self-hosted, IPs, internal
// names) would let a visitor make this server call arbitrary URLs.
const SAAS = /^https:\/\/([0-9a-f]{32})@((?:o\d+\.ingest(?:\.[a-z]{2})?\.)?sentry\.io)\/(\d+)$/;

export function parseDsn(value) {
  const m = SAAS.exec(String(value || "").trim());
  return m ? { dsn: m[0], host: m[2], projectId: m[3] } : null;
}
