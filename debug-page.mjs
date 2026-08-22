/** Debug: dump what the DSH settings page actually renders. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { rmSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9334;
const tmpDir = `${process.env.TEMP}\\edge-dsh-debug-${Date.now()}`;
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
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return r.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
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

  await cdp.send("Page.navigate", { url: "http://127.0.0.1:3080/settings" });
  await sleep(15000);

  const dump = await cdp.eval(`(() => ({
    url: location.href,
    title: document.title,
    bodyTextLen: document.body ? document.body.innerText.length : -1,
    bodyTextHead: document.body ? document.body.innerText.slice(0, 500) : '',
    hasApp: !!document.querySelector('#app, #root'),
    hasSettingsNav: !!document.querySelector('.dsw-alias, [class*="settings"], [class*="Settings"]'),
    scriptCount: document.scripts ? document.scripts.length : -1,
    readyState: document.readyState,
  }))()`);
  console.log(JSON.stringify(dump, null, 2));

  if (dump.bodyTextLen > 0 && dump.bodyTextLen < 2000) {
    console.log("--- full body text ---");
    console.log(await cdp.eval(`document.body.innerText`));
  }

  cdp.close();
} catch (e) {
  console.error("FATAL:", e);
} finally {
  if (edge && !edge.killed) edge.kill();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}