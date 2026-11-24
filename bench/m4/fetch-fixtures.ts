/**
 * M4 benchmark — download fixtures for the cases (run on a machine with network).
 *
 *   node --experimental-strip-types bench/m4/fetch-fixtures.ts [--cases f] [--fixtures dir] [--fetcher module] [--force]
 *
 * Fixtures are saved as `<fixtures>/<case id>.md`, exactly as the plugin's own
 * fetch pipeline returns them — that is the text web_read sees in production.
 * They are third-party pages: keep the directory in .gitignore and commit only
 * the cases file and the lock.
 *
 * The fetcher module must export:
 *   fetchPage(url: string, signal: AbortSignal): Promise<{ content: string }>
 * See fetcher.default.ts for the wiring you need to complete once.
 * @module
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256 } from "./lock.ts";
import { validateCases } from "./schema.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const opt = (flag: string, fallback: string): string => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const casesFile = opt("--cases", path.join(HERE, "cases.json"));
  const dir = opt("--fixtures", path.join(HERE, "fixtures"));
  const fetcherPath = path.resolve(opt("--fetcher", path.join(HERE, "fetcher.default.ts")));
  const force = argv.includes("--force");

  const { cases, errors } = validateCases(JSON.parse(readFileSync(casesFile, "utf8")));
  if (errors.length > 0) {
    console.error("Invalid cases file:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    return 1;
  }
  const mod = (await import(pathToFileURL(fetcherPath).href)) as {
    fetchPage?: (url: string, signal: AbortSignal) => Promise<{ content: string }>;
  };
  if (typeof mod.fetchPage !== "function") {
    console.error(`${fetcherPath} must export fetchPage(url, signal)`);
    return 1;
  }

  mkdirSync(dir, { recursive: true });
  let failed = 0;
  for (const c of cases) {
    const file = path.join(dir, `${c.id}.md`);
    if (existsSync(file) && !force) {
      console.log(`skip  ${c.id} (exists)`);
      continue;
    }
    try {
      const page = await mod.fetchPage(c.url, AbortSignal.timeout(60_000));
      writeFileSync(file, page.content);
      const chars = Array.from(page.content).length;
      writeFileSync(
        file.replace(/\.md$/, ".meta.json"),
        JSON.stringify({ url: c.url, fetchedAt: new Date().toISOString(), chars, sha256: sha256(page.content) }, null, 2) + "\n",
      );
      console.log(`ok    ${c.id}  ${chars} chars${chars < 20000 ? "  (shorter than the 20k target)" : ""}`);
    } catch (err) {
      failed++;
      console.error(`FAIL  ${c.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return failed > 0 ? 1 : 0;
}

main().then((code) => {
  process.exitCode = code;
});
