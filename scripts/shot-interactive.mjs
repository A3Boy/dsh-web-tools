/**
 * Interactive screenshots: click Settings -> Web Search section -> provider modal.
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT = "D:\\web\\dsh-plugins\\dsh-web-tools\\screenshots";
mkdirSync(OUT, { recursive: true });

const PORT = 9335;
const tmpDir = `${process.env.TEMP}\\edge-dsh-int-${Date.now()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.msgId = 0; this.pending = new Map(); }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data.toString());
      if (msg.id) {
        const cb = this.pending.get(msg.id);
        if (cb) { this.pending.delete(msg.id); cb(msg); }
      }
    });
    await new Promise((res, rej) => {
      this.ws.addEventListener("open", res);
      this.ws.addEventListener("error", rej);
    });
  }
  async send(method, params = {}) {
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`timeout ${method}`)); }, 20000);
      this.pending.set(id, (msg) => { clearTimeout(timer); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) return "EVAL_ERR: " + JSON.stringify(r.exceptionDetails).slice(0, 300);
    return r.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function waitFor(cdp, expr, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await cdp.eval(expr);
    if (v === true) return;
    await sleep(500);
  }
  throw new Error("waitFor timed out: " + expr);
}

let edge = null;
try {
  edge = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-software-rasterizer",
    `--user-data-dir=${tmpDir}`, "--no-first-run", "--disable-sync", "--disable-default-apps", "--disable-extensions",
    `--remote-debugging-port=${PORT}`, "--window-size=1440,900", "about:blank",
  ], { stdio: "ignore" });

  let targets;
  for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; } catch { await sleep(500); }
  }
  const page = targets.find((t) => t.type === "page");
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await cdp.send("Page.navigate", { url: "http://127.0.0.1:3080/" });
  await sleep(12000);
  console.log("Loaded home. Body head:", JSON.stringify((await cdp.eval(`document.body.innerText.slice(0,120)`))));

  // Find and click "设置" (Settings) in the nav
  const clickedSettings = await cdp.eval(`(() => {
    const all = [...document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"], [role="treeitem"], span, div')];
    const el = all.find(e => e.textContent && e.textContent.trim() === '设置' && e.offsetParent !== null);
    if (el) { el.click(); return 'clicked 设置'; }
    const el2 = all.find(e => e.textContent && e.textContent.trim() === 'Settings' && e.offsetParent !== null);
    if (el2) { el2.click(); return 'clicked Settings'; }
    return 'NOT FOUND';
  })()`);
  console.log("Click 设置:", clickedSettings);
  await sleep(4000);

  const bodyAfterSettings = await cdp.eval(`document.body.innerText.slice(0, 400)`);
  console.log("After settings click:", JSON.stringify(bodyAfterSettings));

  // Look for the web-tools section entry (网页搜索)
  const webToolsClick = await cdp.eval(`(() => {
    const all = [...document.querySelectorAll('a, button, [role="tab"], [role="button"], span, div')];
    const candidates = all.filter(e => e.offsetParent !== null && e.textContent && (e.textContent.includes('网页搜索') || e.textContent.includes('Web Search')));
    if (candidates.length === 0) return 'NO web search entry';
    // Pick the smallest (most leaf) element
    candidates.sort((a, b) => a.textContent.length - b.textContent.length);
    candidates[0].click();
    const el = candidates[0];
    return 'clicked: ' + (el.tagName) + ' | ' + el.textContent.slice(0, 40);
  })()`);
  console.log("Click web-tools:", webToolsClick);
  await sleep(5000);

  const bodyAfterWebTools = await cdp.eval(`document.body.innerText.slice(0, 600)`);
  console.log("After web-tools click:", JSON.stringify(bodyAfterWebTools));

  // Check for our classes
  const classCheck = await cdp.eval(`(() => ({
    dswtRows: document.querySelectorAll('.dswt-settings-row').length,
    dswtGroups: document.querySelectorAll('.dswt-group-card').length,
    imgs: document.querySelectorAll('.dswt-settings-row img').length,
  }))()`);
  console.log("Class check:", JSON.stringify(classCheck));

  // Screenshot overview
  let shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}\\overview_1440x900.png`, Buffer.from(shot.data, "base64"));
  console.log("saved overview_1440x900.png");

  // Click first provider row
  const clickedRow = await cdp.eval(`(() => {
    const imgs = [...document.querySelectorAll('.dswt-settings-row img')];
    if (imgs.length === 0) return 'NO ROW IMG';
    const row = imgs[0].closest('.dswt-settings-row.clickable');
    if (!row) return 'NO CLICKABLE ROW';
    row.click();
    return 'clicked row for ' + (imgs[0].alt || 'provider');
  })()`);
  console.log("Click provider row:", clickedRow);
  await sleep(3000);

  // Check modal
  const modal = await cdp.eval(`(() => {
    const m = document.querySelector('.dswt-modal-content, .wt-modal-content');
    return m ? { text: m.innerText.slice(0, 200), cls: m.className } : null;
  })()`);
  console.log("Modal:", JSON.stringify(modal));

  if (modal) {
    shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}\\brave_detail_collapsed_1440x900.png`, Buffer.from(shot.data, "base64"));
    console.log("saved brave_detail_collapsed_1440x900.png");

    // Advanced
    const adv = await cdp.eval(`(() => {
      const b = document.querySelector('.dswt-advanced-btn');
      if (b) { b.click(); return 'clicked advanced'; }
      return 'no advanced btn';
    })()`);
    console.log("Advanced:", adv);
    await sleep(1000);
    shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}\\brave_detail_advanced_1440x900.png`, Buffer.from(shot.data, "base64"));
    console.log("saved brave_detail_advanced_1440x900.png");
  }

  cdp.close();
  console.log("DONE");
} catch (e) {
  console.error("FATAL:", e);
  process.exitCode = 1;
} finally {
  if (edge && !edge.killed) edge.kill();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}