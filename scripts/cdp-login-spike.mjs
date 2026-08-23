#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { WebSocket } from "ws";

/**
 * CDP Login Spike
 *
 * Verifies Native Chrome / Edge + dedicated profile + raw loopback CDP
 * for Xiaohongshu and Twitter/X session persistence.
 *
 * Constraints & Invariants:
 * 1. 0 Playwright, 0 Puppeteer, 0 Selenium, 0 bundled Chromium.
 * 2. Windows: Edge prioritized, then Chrome.
 * 3. Dedicated profile: ~/.dsh/web-tools/spike/<platform>.
 * 4. Random loopback CDP port (127.0.0.1).
 * 5. Discover webSocketDebuggerUrl from http://127.0.0.1:<port>/json/version.
 * 6. Use ws package for raw CDP client (correlation, timeout, close cleanup).
 * 7. XHS gate: web_session (a1 optional/auxiliary).
 * 8. X gate: auth_token + ct0.
 * 9. Never log/dump raw cookie values.
 */

// 1. Parse CLI options
const args = process.argv.slice(2);
let platform = "xiaohongshu"; // "xiaohongshu" | "x"
let browserChoice = "auto"; // "auto" | "edge" | "chrome" | string (custom path)
let keepOpen = true; // Keep browser open so user session stays intact and user can see state!

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--platform" && args[i + 1]) {
    platform = args[++i];
  } else if (arg === "--browser" && args[i + 1]) {
    browserChoice = args[++i];
  } else if (arg === "--close") {
    keepOpen = false;
  } else if (arg === "--keep-open") {
    keepOpen = true;
  } else if (arg === "-h" || arg === "--help") {
    console.log(`
Usage: node scripts/cdp-login-spike.mjs [options]

Options:
  --platform <xiaohongshu|x>   Platform to test (default: xiaohongshu)
  --browser <auto|edge|chrome|path> Browser executable choice (default: auto)
  --close                      Close browser on success (default: keeps open)
  --keep-open                  Keep browser open on exit (default: true)
  -h, --help                   Show this help message
`);
    process.exit(0);
  }
}

if (platform !== "xiaohongshu" && platform !== "x") {
  console.error(`[Spike] Invalid platform: "${platform}". Must be "xiaohongshu" or "x".`);
  process.exit(1);
}

// 2. Platform target configuration
const PLATFORM_CONFIG = {
  xiaohongshu: {
    name: "Xiaohongshu",
    initialUrl: "https://www.xiaohongshu.com/explore",
    domains: [".xiaohongshu.com", "www.xiaohongshu.com", "xiaohongshu.com"],
    requiredCookies: ["web_session"],
    optionalCookies: ["a1"],
    verifyPredicate: (cookies) => {
      const names = new Set(cookies.map((c) => c.name));
      return names.has("web_session");
    },
  },
  x: {
    name: "Twitter / X",
    initialUrl: "https://x.com/home",
    domains: [".x.com", "x.com", ".twitter.com", "twitter.com"],
    requiredCookies: ["auth_token", "ct0"],
    optionalCookies: [],
    verifyPredicate: (cookies) => {
      const names = new Set(cookies.map((c) => c.name));
      return names.has("auth_token") && names.has("ct0");
    },
  },
};

const config = PLATFORM_CONFIG[platform];

// 3. Browser detection
function locateBrowser(choice) {
  const isWindows = process.platform === "win32";
  if (!isWindows) {
    // Basic macOS / Linux detection if applicable
    if (process.platform === "darwin") {
      const edgeMac = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
      const chromeMac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      if (choice === "edge" && fs.existsSync(edgeMac)) return { kind: "edge", path: edgeMac };
      if (choice === "chrome" && fs.existsSync(chromeMac)) return { kind: "chrome", path: chromeMac };
      if (fs.existsSync(edgeMac)) return { kind: "edge", path: edgeMac };
      if (fs.existsSync(chromeMac)) return { kind: "chrome", path: chromeMac };
    } else if (process.platform === "linux") {
      const candidates = [
        { kind: "edge", path: "/usr/bin/microsoft-edge" },
        { kind: "chrome", path: "/usr/bin/google-chrome" },
        { kind: "chrome", path: "/usr/bin/chromium-browser" },
      ];
      for (const c of candidates) {
        if (fs.existsSync(c.path)) return c;
      }
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  // Windows detection
  const progFiles = process.env.ProgramFiles || "C:\\Program Files";
  const progFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local") : "");

  const edgeCandidates = [
    path.join(progFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(progFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    localAppData ? path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe") : "",
  ].filter(Boolean);

  const chromeCandidates = [
    path.join(progFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(progFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    localAppData ? path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe") : "",
  ].filter(Boolean);

  if (choice !== "auto" && choice !== "edge" && choice !== "chrome") {
    // Custom path
    if (fs.existsSync(choice)) {
      const isEdge = choice.toLowerCase().includes("edge");
      return { kind: isEdge ? "edge" : "chrome", path: choice };
    }
    throw new Error(`Custom browser executable path not found: ${choice}`);
  }

  if (choice === "edge" || choice === "auto") {
    for (const p of edgeCandidates) {
      if (fs.existsSync(p)) return { kind: "edge", path: p };
    }
  }

  if (choice === "chrome" || choice === "auto") {
    for (const p of chromeCandidates) {
      if (fs.existsSync(p)) return { kind: "chrome", path: p };
    }
  }

  throw new Error("No supported Microsoft Edge or Google Chrome executable found on this system.");
}

// 4. Port allocation
async function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : null;
      srv.close((err) => {
        if (err) return reject(err);
        if (!port) return reject(new Error("Failed to obtain ephemeral port"));
        resolve(port);
      });
    });
  });
}

// 5. Poll /json/version for webSocketDebuggerUrl
async function fetchWebSocketDebuggerUrl(port, deadlineMs = 10000) {
  const startTime = Date.now();
  const endpoint = `http://127.0.0.1:${port}/json/version`;

  while (Date.now() - startTime < deadlineMs) {
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.get(endpoint, { timeout: 1000 }, (resp) => {
          let data = "";
          resp.on("data", (chunk) => (data += chunk));
          resp.on("end", () => resolve(data));
        });
        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("HTTP request timed out"));
        });
      });

      const parsed = JSON.parse(res);
      if (parsed && parsed.webSocketDebuggerUrl) {
        return parsed.webSocketDebuggerUrl;
      }
    } catch {
      // Waiting for browser to be ready
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timeout (${deadlineMs}ms) waiting for CDP /json/version on 127.0.0.1:${port}`);
}

// 6. Raw CDP Client
class RawCdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = new Map();
    this.closed = false;
  }

  async connect(timeoutMs = 5000) {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`WebSocket connection timeout to ${this.ws.url}`));
      }, timeoutMs);

      this.ws.once("open", () => {
        clearTimeout(timer);
        this.setupHandlers();
        resolve();
      });

      this.ws.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  setupHandlers() {
    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString("utf8"));
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const req = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          clearTimeout(req.timer);
          if (msg.error) {
            req.reject(new Error(`CDP Error [${msg.error.code}]: ${msg.error.message}`));
          } else {
            req.resolve(msg.result);
          }
        } else if (msg.method) {
          const listeners = this.eventListeners.get(msg.method);
          if (listeners) {
            for (const listener of listeners) {
              try {
                listener(msg.params, msg.sessionId);
              } catch (e) {
                console.error(`[CDP Listener Error] ${msg.method}:`, e);
              }
            }
          }
        }
      } catch (err) {
        console.error("[CDP Parse Error]", err);
      }
    });

    this.ws.on("close", () => {
      this.closed = true;
      for (const [id, req] of this.pending.entries()) {
        clearTimeout(req.timer);
        req.reject(new Error("CDP WebSocket connection closed"));
      }
      this.pending.clear();
    });

    this.ws.on("error", () => {
      // WS error
    });
  }

  send(method, params = {}, sessionId = undefined, timeoutMs = 15000) {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("CDP WebSocket is not open"));
    }

    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command ${method} (id=${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      const payload = { id, method, params };
      if (sessionId) {
        payload.sessionId = sessionId;
      }

      this.ws.send(JSON.stringify(payload), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  on(eventName, listener) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName).add(listener);
    return () => {
      const set = this.eventListeners.get(eventName);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.eventListeners.delete(eventName);
      }
    };
  }

  close() {
    this.closed = true;
    this.ws.close();
  }
}

// 7. Cookie helper
async function getStorageCookies(cdp, domains) {
  try {
    const res = await cdp.send("Storage.getCookies");
    const rawCookies = res.cookies || [];
    // Strict domain matching against configured platform domains only
    const matched = rawCookies.filter((c) => {
      const cookieDomain = (c.domain || "").toLowerCase().replace(/^\./, "");
      return domains.some((d) => {
        const targetDomain = d.toLowerCase().replace(/^\./, "");
        return cookieDomain === targetDomain || cookieDomain.endsWith("." + targetDomain);
      });
    });
    return matched.map((c) => ({
      name: c.name,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      secure: c.secure,
      httpOnly: c.httpOnly,
    }));
  } catch (err) {
    console.error("[Spike] Failed to read cookies:", err);
    return [];
  }
}

// 8. Main Spike execution
async function runSpike() {
  console.log(`\n======================================================`);
  console.log(`[Spike] CDP Login & Session Persistence Spike`);
  console.log(`[Spike] Platform: ${config.name} (${platform})`);
  console.log(`======================================================\n`);

  // Step 1: Detect browser
  const browser = locateBrowser(browserChoice);
  console.log(`[Browser] Detected ${browser.kind.toUpperCase()} at: ${browser.path}`);

  // Step 2: Ensure dedicated profile dir
  const homeDir = os.homedir();
  const profileDir = path.join(homeDir, ".dsh", "web-tools", "spike", platform);
  fs.mkdirSync(profileDir, { recursive: true });
  console.log(`[Profile] Dedicated profile path: ${profileDir}`);

  // Step 3: Allocate random CDP port
  const port = await findFreePort();
  console.log(`[CDP] Assigned random remote debugging port: ${port}`);

  // Step 4: Launch Browser Process
  // Safe args only, strictly 127.0.0.1, no web security disabling, no no-sandbox
  const spawnArgs = [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-address=127.0.0.1`,
    `--remote-debugging-port=${port}`,
    `--no-first-run`,
    `--no-default-browser-check`,
    config.initialUrl,
  ];

  console.log(`[Process] Spawning browser process...`);
  const browserProcess = spawn(browser.path, spawnArgs, {
    stdio: "ignore",
    detached: false,
  });

  browserProcess.on("error", (err) => {
    console.error("[Process Error] Failed to start browser:", err);
    process.exit(1);
  });

  // Step 5: Wait for CDP /json/version
  console.log(`[CDP] Waiting for browser CDP endpoint on port ${port}...`);
  let wsDebuggerUrl = "";
  try {
    wsDebuggerUrl = await fetchWebSocketDebuggerUrl(port, 15000);
    console.log(`[CDP] Discovered WebSocket debugger URL: ${wsDebuggerUrl}`);
  } catch (err) {
    console.error(`[CDP] Failed to connect:`, err.message);
    browserProcess.kill();
    process.exit(1);
  }

  // Step 6: Connect Raw CDP Client
  const cdp = new RawCdpClient(wsDebuggerUrl);
  await cdp.connect();
  console.log(`[CDP] Raw WebSocket CDP Client connected successfully.`);

  // Step 7: Check current cookies (allow brief window for cookie store initialization and page load)
  console.log(`[Auth Check] Querying persistent cookie store...`);
  let isAuthenticated = false;
  let cookies = [];

  for (let i = 0; i < 10; i++) {
    cookies = await getStorageCookies(cdp, config.domains);
    if (config.verifyPredicate(cookies)) {
      isAuthenticated = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  const initialNames = cookies.map((c) => c.name);
  console.log(`[Auth Check] Initial cookies detected: [${initialNames.join(", ")}]`);

  if (isAuthenticated) {
    console.log(`\n🎉 [Auth Gate SUCCESS] Already authenticated from persistent profile!`);
    console.log(`   Platform: ${config.name}`);
    console.log(`   Required cookies present: [${config.requiredCookies.join(", ")}]`);
    console.log(`   Profile persistence is VERIFIED.`);
  } else {
    console.log(`\n⏳ [Auth Required] Profile is not yet authenticated.`);
    console.log(`   Please log in manually on the opened browser window.`);
    console.log(`   Required cookie(s): [${config.requiredCookies.join(", ")}]`);
    console.log(`   Monitoring session state (polling every 1.5s, timeout: 5min)...\n`);

    const loginStartTime = Date.now();
    const loginTimeoutMs = 300000; // 5 min

    while (Date.now() - loginStartTime < loginTimeoutMs) {
      await new Promise((r) => setTimeout(r, 1500));
      cookies = await getStorageCookies(cdp, config.domains);
      const currentNames = cookies.map((c) => c.name);

      if (config.verifyPredicate(cookies)) {
        isAuthenticated = true;
        console.log(`\n🎉 [Auth Gate SUCCESS] Login detected!`);
        console.log(`   Cookies found: [${currentNames.join(", ")}]`);
        console.log(`   Zero raw cookie values logged/stored.`);
        // Allow Chromium to flush SQLite database (Cookies)
        console.log(`   Waiting 3s for profile storage commit before closing...`);
        await new Promise((r) => setTimeout(r, 3000));
        break;
      } else {
        process.stdout.write(`... checking auth status ([${currentNames.join(", ")}])\r`);
      }
    }

    if (!isAuthenticated) {
      console.error(`\n❌ [Auth Gate TIMEOUT] Login was not completed within 5 minutes.`);
    }
  }

  // Cleanup & Summary
  if (!keepOpen) {
    console.log(`\n[Process] Gracefully closing browser via CDP Browser.close...`);
    try {
      await cdp.send("Browser.close", {}, undefined, 3000);
    } catch {
      // Browser.close fallback
    }
  }

  cdp.close();

  if (!keepOpen) {
    try {
      browserProcess.kill();
    } catch {
      // Process might already be closed
    }
  } else {
    console.log(`\n[Process] Browser kept open as requested (--keep-open).`);
  }

  console.log(`\n======================================================`);
  console.log(`[Spike Result Summary]`);
  console.log(`  - Platform: ${config.name} (${platform})`);
  console.log(`  - Browser: ${browser.kind} (${browser.path})`);
  console.log(`  - Dedicated Profile: ${profileDir}`);
  console.log(`  - Authenticated: ${isAuthenticated}`);
  console.log(`======================================================\n`);

  if (!isAuthenticated) {
    process.exit(1);
  }
}

runSpike().catch((err) => {
  console.error("[Spike Fatal Error]", err);
  process.exit(1);
});
