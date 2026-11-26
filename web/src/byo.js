import { BYO, parseDsn, savedByo, saveByo } from "./sentry.js";

// The "Use my DSN" box. Same markup on every page (#byo, #byo-box, ...).
export function initByo() {
  const byoBox = document.querySelector("#byo-box");
  const byoCheck = document.querySelector("#byo");
  const byoDsn = document.querySelector("#byo-dsn");
  const byoMsg = document.querySelector("#byo-msg");
  const saved = savedByo();
  byoCheck.checked = !!BYO;
  byoDsn.value = saved.dsn || "";
  byoBox.hidden = !byoCheck.checked;

  byoCheck.onchange = () => {
    byoBox.hidden = !byoCheck.checked;
    // switching off takes effect right away, switching on waits for Apply
    if (!byoCheck.checked && BYO) {
      saveByo({ ...savedByo(), on: false });
      location.reload();
    }
  };
  document.querySelector("#byo-apply").onclick = () => {
    if (!parseDsn(byoDsn.value)) {
      byoMsg.className = "err";
      byoMsg.textContent = "Doesn't look like a sentry.io DSN: https://<key>@o123.ingest.us.sentry.io/456";
      return;
    }
    saveByo({ on: true, dsn: byoDsn.value.trim() });
    location.reload();
  };
  if (BYO) {
    document.querySelector("#byo-state").innerHTML =
      `Sending to <b>your</b> project <code>${BYO.projectId}</code>.`;
  }
}
