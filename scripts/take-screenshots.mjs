/**
 * Take screenshots + measure computed styles of the DSH Web Tools settings
 * page with the provider modal open, via Edge CDP (DevTools Protocol).
 *
 * Uses an isolated --user-data-dir so it never touches the user's own browser.
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT = "D:\\web\\dsh-plugins\\dsh-web-tools\\screenshots";
mkdirSync(OUT, { recursive: true });

const PORT = 9333;
const tmpDir = `${process.env.TEMP}\\edge-dsh-shot-${Date.now()}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.msgId = 0;
    this.pending = new Map();
    this.events = [];
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data.toString());
      if (msg.id) {
        const cb = this.pending.get(msg.id);
        if (cb) {
          this.pending.delete(msg.id);
          cb(msg);
        }
      } else {
        this.events.push(msg);
      }
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve);
      this.ws.addEventListener("error", reject);
    });
  }
  async send(method, params = {}) {
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30000);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  /** Evaluate JS in the page and return the value (awaitPromise). */
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) throw new Error("eval exception: " + JSON.stringify(r.exceptionDetails).slice(0, 500));
    return r.result?.value;
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

/** Wait for a JS condition to become truthy. */
async function waitFor(cdp, expression, timeoutMs = 30000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await cdp.eval(expression);
      if (v === true) return;
    } catch {}
    await sleep(intervalMs);
  }
  throw new Error("waitFor timed out: " + expression);
}

let edge = null;
try {
  edge = spawn(EDGE, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-software-rasterizer",
    `--user-data-dir=${tmpDir}`,
    "--no-first-run",
    "--disable-sync",
    "--disable-default-apps",
    "--disable-extensions",
    `--remote-debugging-port=${PORT}`,
    "--window-size=1440,900",
    "about:blank",
  ], { stdio: "ignore" });

  // Wait for the debug endpoint
  let version;
  for (let i = 0; i < 40; i++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(2000) });
      version = await resp.json();
      break;
    } catch {
      await sleep(500);
    }
  }
  if (!version) throw new Error("CDP endpoint never became ready");
  console.log("Connected to Edge:", version.Browser);

  // Use a page target (Page.* commands need a page, not the browser target)
  const targetsResp = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const targets = await targetsResp.json();
  const pageTarget = targets.find((t) => t.type === "page");
  if (!pageTarget) throw new Error("No page target found");
  console.log("Page target:", pageTarget.url || "(blank)");

  const cdp = new CDP(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  // Navigate to settings
  console.log("Navigate /settings ...");
  const navPromise = cdp.send("Page.navigate", { url: "http://127.0.0.1:3080/settings" });
  // Wait for the load event
  await new Promise((resolve) => {
    const handler = (ev) => {
      if (ev.method === "Page.loadEventFired") {
        cdp.ws.removeEventListener("message", handler);
        resolve();
      }
    };
    cdp.ws.addEventListener("message", handler);
    // Timeout guard
    setTimeout(resolve, 30000);
  });
  console.log("Page load event fired.");

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // Wait for the page and web-tools section to render (longer timeout)
  await waitFor(cdp, `!!document.querySelector('.dswt-group-card, .dswt-settings-row') || document.body.innerText.indexOf('网页搜索') !== -1`, 60000);
  console.log("Web tools UI rendered.");

  // Give the settings section time to hydrate provider rows
  await sleep(2500);
  const info = await cdp.eval(`(() => {
    const rows = [...document.querySelectorAll('.dswt-settings-row.clickable')];
    const providerRows = rows.filter(r => r.querySelector('img'));
    return {
      totalRows: rows.length,
      providerRows: providerRows.map(r => (r.querySelector('img')||{}).alt || r.textContent.slice(0,40)),
      hasBody: document.body.innerText.length,
    };
  })()`);
  console.log("Page info:", JSON.stringify(info, null, 2));

  // Screenshot: overview at 1440x900
  let shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}\\overview_1440x900.png`, Buffer.from(shot.data, "base64"));
  console.log("Saved overview_1440x900.png");

  // Click the first provider row to open the modal
  const clickResult = await cdp.eval(`(() => {
    const rows = [...document.querySelectorAll('.dswt-settings-row.clickable')];
    const providerRow = rows.find(r => r.querySelector('img'));
    if (!providerRow) return 'NO_PROVIDER_ROW';
    providerRow.click();
    return 'clicked';
  })()`);
  console.log("Click provider row:", clickResult);

  await waitFor(cdp, `!!document.querySelector('.dswt-modal-content, .wt-modal-content')`, 20000);
  console.log("Modal open.");

  // Collapsed modal screenshot
  await sleep(800);
  shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}\\brave_detail_collapsed_1440x900.png`, Buffer.from(shot.data, "base64"));
  console.log("Saved brave_detail_collapsed_1440x900.png");

  // Measure computed styles inside the modal (pixel-level audit)
  const styles = await cdp.eval(`(() => {
    const pick = (sel, props) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const out = { sel };
      for (const p of props) out[p] = cs[p];
      return out;
    };
    const content = document.querySelector('.dswt-modal-content') || document.querySelector('.wt-modal-content');
    const dialog = document.querySelector('.dswt-modal-dialog') || document.querySelector('.wt-modal-dialog');
    return {
      dialog: pick('.dswt-modal-dialog, .wt-modal-dialog', ['width','maxHeight']),
      content: pick('.dswt-modal-content, .wt-modal-content', ['paddingTop','paddingRight','paddingBottom','paddingLeft']),
      header: pick('.dswt-provider-header', ['marginBottom','gap']),
      logo: pick('.dswt-provider-logo', ['width','height','borderRadius']),
      name: pick('.dswt-provider-name', ['fontSize','fontWeight','lineHeight']),
      meta: pick('.dswt-provider-meta', ['fontSize','fontWeight','color']),
      groupTitle: pick('.dswt-group-title', ['fontSize','fontWeight','color']),
      settingsRow: pick('.dswt-settings-row', ['minHeight','paddingTop','paddingLeft','paddingRight','paddingBottom']),
      segmentedTrack: pick('.dswt-segmented-track', ['height','padding','borderRadius','backgroundColor','borderTopWidth','borderTopColor']),
      segmentedSelected: (() => {
        const el = document.querySelector('.dswt-segmented-btn.selected');
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { sel: '.dswt-segmented-btn.selected', fontSize: cs.fontSize, fontWeight: cs.fontWeight, borderTopLeftRadius: cs.borderTopLeftRadius, backgroundColor: cs.backgroundColor, boxShadow: cs.boxShadow };
      })(),
      advancedSurface: pick('.dswt-advanced-surface', ['backgroundColor','borderRadius','paddingTop','paddingLeft','paddingRight','paddingBottom','borderTopColor','marginTop']),
      searchCardInner: pick('.dswt-search-card-inner', ['paddingTop','paddingRight','paddingBottom','paddingLeft']),
      prefDesc: pick('.dswt-pref-desc', ['fontSize','lineHeight','color']),
    };
  })()`);
  console.log("=== MEASURED STYLES (collapsed) ===");
  console.log(JSON.stringify(styles, null, 2));

  // Expand advanced params
  const expandResult = await cdp.eval(`(() => {
    const btn = document.querySelector('.dswt-advanced-btn');
    if (btn) { btn.click(); return 'clicked .dswt-advanced-btn'; }
    return 'NO_ADVANCED_BTN';
  })()`);
  console.log("Expand advanced:", expandResult);

  await sleep(600);
  shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}\\brave_detail_advanced_1440x900.png`, Buffer.from(shot.data, "base64"));
  console.log("Saved brave_detail_advanced_1440x900.png");

  // Measure advanced surface now that it's expanded
  const advanced = await cdp.eval(`(() => {
    const el = document.querySelector('.dswt-advanced-surface');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { backgroundColor: cs.backgroundColor, borderRadius: cs.borderRadius,
      paddingTop: cs.paddingTop, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, paddingBottom: cs.paddingBottom,
      marginTop: cs.marginTop, borderTopColor: cs.borderTopColor, borderTopWidth: cs.borderTopWidth };
  })()`);
  console.log("=== ADVANCED SURFACE (expanded) ===");
  console.log(JSON.stringify(advanced, null, 2));

  // Close modal
  await cdp.eval(`(() => {
    const btn = document.querySelector('.dswt-modal-close-btn');
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  await sleep(600);

  // Screenshot overview at 1920x1080
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
  shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}\\overview_1920x1080.png`, Buffer.from(shot.data, "base64"));
  console.log("Saved overview_1920x1080.png");

  // Reopen modal for 1080p modal shot
  await cdp.eval(`(() => {
    const rows = [...document.querySelectorAll('.dswt-settings-row.clickable')];
    const providerRow = rows.find(r => r.querySelector('img'));
    if (providerRow) { providerRow.click(); return true; }
    return false;
  })()`);
  await waitFor(cdp, `!!document.querySelector('.dswt-modal-content, .wt-modal-content')`, 20000);
  await sleep(800);
  shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}\\brave_detail_collapsed_1920x1080.png`, Buffer.from(shot.data, "base64"));
  console.log("Saved brave_detail_collapsed_1920x1080.png");
  await cdp.eval(`(() => {
    const btn = document.querySelector('.dswt-advanced-btn');
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  await sleep(500);
  shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}\\brave_detail_advanced_1920x1080.png`, Buffer.from(shot.data, "base64"));
  console.log("Saved brave_detail_advanced_1920x1080.png");

  cdp.close();
  console.log("ALL SCREENSHOTS DONE");
} catch (e) {
  console.error("FATAL:", e);
  process.exitCode = 1;
} finally {
  if (edge && !edge.killed) edge.kill();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}