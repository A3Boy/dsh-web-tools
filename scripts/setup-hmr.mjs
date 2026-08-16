/**
 * dsh-web-tools HMR setup — install cordis-plugin-hmr into the profile.
 *
 * Usage:
 *   npm run setup:hmr
 *
 * This script:
 *   1. Runs `pnpm add @deepseek-ai/cordis-plugin-hmr @deepseek-ai/cordis-plugin-timer` in the profile
 *   2. Creates a symlink-friendly hmr.dev.yml pointing to the profile's copy
 *
 * After running, start DSH with HMR:
 *   dsh web --patch hmr.dev.yml
 *
 * @module
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PROFILE_DIR = resolve(
  process.env.DSH_HOME ||
    `${process.env.USERPROFILE || process.env.HOME}\\.dsh`,
  "profiles",
  "web"
);

// ── Logging helpers ──────────────────────────────────────────────────────────
const log = (msg) => process.stdout.write(`[setup:hmr] ${msg}\n`);
const err = (msg) => process.stderr.write(`[setup:hmr] ${msg}\n`);

// ── Helpers ──────────────────────────────────────────────────────────────────
function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      shell: true,
    });
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`"${cmd} ${args.join(" ")}" exited with code ${code}`));
    });
    p.on("error", reject);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Check profile directory
  if (!existsSync(PROFILE_DIR)) {
    err(`Profile directory not found: ${PROFILE_DIR}`);
    err("Make sure you've run `dsh web` at least once to create the profile.");
    process.exit(1);
  }

  log("Profile directory: " + PROFILE_DIR);

  // 2. Install HMR plugin into the profile
  log("Installing @deepseek-ai/cordis-plugin-hmr into the profile…");
  try {
    await run(
      "pnpm",
      ["add", "@deepseek-ai/cordis-plugin-hmr", "@deepseek-ai/cordis-plugin-timer"],
      PROFILE_DIR
    );
    log("HMR plugins installed successfully.");
  } catch (e) {
    err(`Failed to install HMR plugins: ${e.message}`);
    err("You can try manually: cd " + PROFILE_DIR + " && pnpm add @deepseek-ai/cordis-plugin-hmr @deepseek-ai/cordis-plugin-timer");
    process.exit(1);
  }

  // 3. Update hmr.dev.yml with the correct absolute path
  const libPath = resolve(ROOT, "lib").replace(/\\/g, "\\\\");
  const patchPath = resolve(ROOT, "hmr.dev.yml");
  let patchContent = readFileSync(patchPath, "utf8");

  // Replace the root path with the correct absolute path
  const oldRoot = /root:\s*\n\s*-\s*.*dsh-web-tools/g;
  const newRoot = `root:\n        - ${resolve(ROOT, "lib").replace(/\\/g, "\\\\")}`;
  patchContent = patchContent.replace(oldRoot, newRoot);

  writeFileSync(patchPath, patchContent, "utf8");
  log("hmr.dev.yml updated with correct path.");

  // 4. Done
  log("\n✓ HMR setup complete!");
  log("\nTo use HMR, run in separate terminals:");
  log("  1. npm run dev:watch     (auto-rebuild on source changes)");
  log("  2. dsh web --patch hmr.dev.yml  (start DSH with HMR)");
  log("\nFor client-side changes (browser bundle), manually reload the page.");
  log("\nAlternatively, for a simpler auto-restart approach:");
  log("  npm run dev              (watches src/ + rebuilds + restarts DSH)");
}

main().catch((e) => {
  err(e.message);
  process.exit(1);
});