/**
 * dsh-web-tools dev script — auto-rebuild + restart on source changes.
 *
 * Usage:
 *   npm run dev
 *
 * This script:
 *   1. Runs `npm run build` (initial build)
 *   2. Starts `dsh web` as a child process
 *   3. Watches `src/` for file changes (`.ts` / `.tsx`)
 *   4. On change, rebuilds and restarts `dsh web`
 *
 * No external dependencies — uses only Node.js built-ins.
 *
 * @module
 */

import { watch, readdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "src");
const DEBOUNCE_MS = 300; // wait for file-change bursts to settle
const POLL_MS = 1000; // fs.watch fallback polling interval

// ── State ────────────────────────────────────────────────────────────────────
let dshProcess /** @type {import("node:child_process").ChildProcess | null} */ =
  null;
let building = false;
let pendingRestart = false;
let debounceTimer /** @type {NodeJS.Timeout | null} */ = null;
let lastPolled = 0;

// ── Logging helpers ──────────────────────────────────────────────────────────
const log = (msg) => process.stdout.write(`[dev] ${msg}\n`);
const err = (msg) => process.stderr.write(`[dev] ${msg}\n`);

// ── DSH lifecycle ────────────────────────────────────────────────────────────
function startDsh() {
  if (dshProcess) {
    log("Stopping DSH…");
    dshProcess.kill("SIGTERM");
    // On Windows, SIGTERM may not work; force-kill after a grace period
    const forceKill = setTimeout(() => {
      if (dshProcess) dshProcess.kill("SIGKILL");
    }, 5000);
    dshProcess.on("exit", () => clearTimeout(forceKill));
    dshProcess = null;
  }

  log("Starting DSH web…");
  dshProcess = spawn("dsh", ["web"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: { ...process.env },
  });

  dshProcess.on("exit", (code, signal) => {
    log(`DSH exited (code: ${code}, signal: ${signal})`);
    dshProcess = null;
    if (pendingRestart) {
      pendingRestart = false;
      startDsh();
    }
  });

  dshProcess.on("error", (e) => err(`DSH spawn error: ${e.message}`));
}

// ── Build ────────────────────────────────────────────────────────────────────
async function rebuild() {
  if (building) {
    pendingRestart = true;
    return;
  }

  building = true;
  log("Change detected, rebuilding…");

  try {
    const b = spawn("npm", ["run", "build"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
    });

    await new Promise((resolve, reject) => {
      b.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Build failed with exit code ${code}`));
      });
      b.on("error", reject);
    });

    log("Build complete, restarting DSH…");
    startDsh();
  } catch (e) {
    err(`Build failed: ${e.message}`);
  } finally {
    building = false;
    if (pendingRestart) {
      pendingRestart = false;
      rebuild();
    }
  }
}

function scheduleRebuild() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    rebuild();
  }, DEBOUNCE_MS);
}

// ── File watching ────────────────────────────────────────────────────────────
function isSourceFile(name) {
  if (!name) return false;
  const ext = extname(name);
  return ext === ".ts" || ext === ".tsx";
}

/** Scan changed files by polling modification times (fallback). */
function pollScan() {
  if (building) return;
  const now = Date.now();
  if (now - lastPolled < POLL_MS) return;
  lastPolled = now;

  try {
    const entries = readdirSync(SRC, { recursive: true, encoding: "utf8" });
    for (const entry of entries) {
      if (!isSourceFile(entry)) continue;
      const full = resolve(SRC, entry);
      try {
        const s = statSync(full);
        if (s.mtimeMs > lastPolled) {
          log(`Poll detected change: ${relative(SRC, full)}`);
          scheduleRebuild();
          break;
        }
      } catch {
        // file might have been deleted — still counts as a change
        scheduleRebuild();
        break;
      }
    }
  } catch {
    // directory not ready yet
  }
}

function startPollingWatch() {
  log("Using polling fallback (more reliable but less efficient)");
  lastPolled = Date.now();
  setInterval(pollScan, POLL_MS);
}

function startFsWatch() {
  log(`Watching ${SRC} via fs.watch (recursive)…`);
  try {
    const watcher = watch(SRC, { recursive: true }, (event, filename) => {
      if (isSourceFile(filename)) {
        log(`Change: ${relative(SRC, filename)} (${event})`);
        scheduleRebuild();
      }
    });

    watcher.on("error", (e) => {
      err(`fs.watch error: ${e.message}`);
      watcher.close();
      startPollingWatch();
    });

    return watcher;
  } catch (e) {
    err(`fs.watch not available: ${e.message}`);
    return null;
  }
}

// ── Entry ────────────────────────────────────────────────────────────────────
function main() {
  log("Initial build…");
  const b = spawn("npm", ["run", "build"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });

  b.on("exit", (code) => {
    if (code !== 0) {
      err(`Initial build failed (exit code ${code})`);
      process.exit(1);
    }

    startDsh();
    const watcher = startFsWatch();
    let poller = null;
    if (!watcher) poller = startPollingWatch();

    process.on("SIGINT", () => {
      log("\nShutting down…");
      if (watcher) watcher.close();
      if (poller) clearInterval(poller);
      if (dshProcess) dshProcess.kill("SIGTERM");
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      if (watcher) watcher.close();
      if (poller) clearInterval(poller);
      if (dshProcess) dshProcess.kill("SIGTERM");
      process.exit(0);
    });
  });

  b.on("error", (e) => {
    err(`Initial build spawn error: ${e.message}`);
    process.exit(1);
  });
}

main();