#!/usr/bin/env node
import { spawn } from "node:child_process";
import { WebSocket } from "ws";
import os from "node:os";
import path from "node:path";
import http from "node:http";

async function findFreePort() {
  const net = await import("node:net");
  return new Promise((r, j) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", j);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = addr?.port;
      srv.close(() => r(port));
    });
  });
}

async function main() {
  const profileDir = path.join(os.homedir(), ".dsh", "web-tools", "browser-profiles", "xiaohongshu");
  const port = await findFreePort();
  const cp = spawn("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-address=127.0.0.1`,
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    "https://www.xiaohongshu.com/explore",
  ], { stdio: "ignore" });

  const wsUrl = await new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
        let data = "";
        res.on("data", (c) => data += c);
        res.on("end", () => {
          try { const j = JSON.parse(data); if (j.webSocketDebuggerUrl) resolve(j.webSocketDebuggerUrl); } catch {}
        });
      }).on("error", () => Date.now() - start < 15000 ? setTimeout(poll, 200) : reject(new Error("timeout")));
    };
    poll();
  });

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });

  const send = (method, params = {}, sessionId) => {
    return new Promise((resolve, reject) => {
      const mid = id++;
      const timer = setTimeout(() => { pending.delete(mid); reject(new Error("timeout")); }, 15000);
      pending.set(mid, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    });
  };

  await new Promise((r) => setTimeout(r, 8000));

  // Check cookies
  const cookies = await send("Storage.getCookies");
  const xhsCookies = cookies.cookies.filter(c => c.domain.includes("xiaohongshu"));
  console.log("XHS cookies:", xhsCookies.map(c => c.name + "=" + (c.name === "web_session" ? "***" : "***")).join(", "));

  const hasWebSession = xhsCookies.some(c => c.name === "web_session");
  console.log("has web_session:", hasWebSession);

  // Check page title
  const targets = await send("Target.getTargets");
  const page = targets.targetInfos.find((t) => t.type === "page");
  if (page) {
    const attach = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
    const sid = attach.sessionId;
    await send("Runtime.enable", {}, sid);
    const title = await send("Runtime.evaluate", { expression: "document.title", returnByValue: true, awaitPromise: true }, sid);
    console.log("Page title:", title?.result?.value);
    const url = await send("Runtime.evaluate", { expression: "window.location.href", returnByValue: true, awaitPromise: true }, sid);
    console.log("URL:", url?.result?.value?.slice(0, 120));
  }

  ws.close();
  cp.kill();
}

main().catch(console.error);