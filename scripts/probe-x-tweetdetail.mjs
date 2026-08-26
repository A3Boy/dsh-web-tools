#!/usr/bin/env node
/**
 * P7.2-B1 probe: inspect all GraphQL requests fired by X web client when
 * navigating to a tweet status URL. Identify operation name & schema.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNativeBrowserRuntime } from "../src/host/browser/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, "..", "test", "fixtures");
const FIXTURE_PATH = path.join(FIXTURE_DIR, "x-tweetdetail.json");

// Tweet from our Search fixture
const SAMPLE_TWEET_URL = "https://x.com/thsottiaux/status/2091688655828246890";
const TARGET_TWEET_ID = "2091688655828246890";

async function main() {
  console.log("=== P7.2-B1 X TweetDetail Network Probe ===\n");

  const runtime = createNativeBrowserRuntime("auto");
  const isAuth = await runtime.verifyAuthenticationForOperation("x");
  if (!isAuth) {
    console.error("Not authenticated! Please log in to X first.");
    await runtime.dispose();
    process.exit(1);
  }
  console.log("✓ Session is authenticated.");

  const page = await runtime.createPage("x");
  console.log("✓ Created blank page, targetId:", page.targetId);

  // Capture ANY GraphQL response
  console.log("Installing broad GraphQL capture for /i/api/graphql/ ...");
  const capture = await page.beginJsonCapture({
    urlIncludes: "/i/api/graphql/",
    timeoutMs: 15000,
  });

  console.log("Navigating to:", SAMPLE_TWEET_URL);
  await page.navigate(SAMPLE_TWEET_URL);

  console.log("Waiting for GraphQL capture...");
  const outcome = await capture.wait();
  console.log("Capture outcome:", outcome.state);

  if (outcome.state === "captured") {
    console.log("Captured URL:", outcome.url);
    console.log("Status:", outcome.status);

    const parsedUrl = new URL(outcome.url);
    console.log("Pathname:", parsedUrl.pathname);
    const opMatch = parsedUrl.pathname.match(/\/i\/api\/graphql\/([^/]+)\/([^/?]+)/);
    if (opMatch) {
      console.log("Query ID:", opMatch[1]);
      console.log("Operation Name:", opMatch[2]);
    }

    const json = outcome.json;
    console.log("Top-level keys:", Object.keys(json || {}));
    if (json?.data) {
      console.log("data keys:", Object.keys(json.data));
    }

    // Save fixture
    if (!fs.existsSync(FIXTURE_DIR)) {
      fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    }
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(json, null, 2), "utf-8");
    console.log(`\n✓ Saved full raw fixture to ${FIXTURE_PATH}`);
  } else {
    console.error("✗ Failed to capture GraphQL response. State:", outcome.state);
  }

  await page.close();
  await runtime.dispose();
  console.log("\n=== Probe complete ===");
}

main().catch((err) => {
  console.error("Probe error:", err);
  process.exit(1);
});