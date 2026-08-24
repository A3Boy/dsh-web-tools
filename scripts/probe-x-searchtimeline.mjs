#!/usr/bin/env node
/**
 * P7.2-A probe: launch a real headless browser, navigate to X Search, capture
 * the SearchTimeline GraphQL response via CDP, and save a desensitized fixture
 * for the parser baseline.
 *
 * Usage:
 *   node --experimental-strip-types scripts/probe-x-searchtimeline.mjs
 *
 * Flow:
 *   1. Verify auth → if not logged in, trigger interactive login (5 min window).
 *   2. createPage("x") → about:blank attached page, no navigate.
 *   3. beginJsonCapture({ urlIncludes: "/SearchTimeline" }) → Network.enable.
 *   4. navigate to x.com/search?q=openai.
 *   5. await capture.wait() → first SearchTimeline response.
 *   6. Save desensitized fixture to test/fixtures/x-searchtimeline.json.
 *   7. Close page, stop browser.
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNativeBrowserRuntime } from "../src/host/browser/index.ts";
import { buildXSearchUrl } from "../src/host/sources/x.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, "..", "test", "fixtures");
const FIXTURE_PATH = path.join(FIXTURE_DIR, "x-searchtimeline.json");

async function main() {
  console.log("=== P7.2-A X SearchTimeline Probe ===\n");

  const runtime = createNativeBrowserRuntime("auto");

  // --- Step 1: Verify auth ---
  console.log("[1/5] Verifying X authentication status…");
  const isAuth = await runtime.verifyAuthenticationForOperation("x");
  if (!isAuth) {
    console.log("  → Not authenticated. Launching interactive login.\n");
    console.log("  Please log in to X in the browser window that opens.\n");
    const status = await runtime.login("x");
    if (!status.authenticated) {
      console.error("  ✗ Login failed or timed out. Aborting probe.");
      await runtime.dispose();
      process.exit(1);
    }
    console.log("  ✓ Login confirmed.\n");
  } else {
    console.log("  ✓ Session is authenticated.\n");
  }

  // --- Step 2: Create blank page (NO navigation yet) ---
  console.log("[2/5] Creating blank page (about:blank)…");
  const page = await runtime.createPage("x");
  console.log("  → targetId:", page.targetId, "sessionId:", page.sessionId);

  // --- Step 3: Begin JSON capture ---
  console.log("[3/5] Installing Network capture for /SearchTimeline…");
  const capture = await page.beginJsonCapture({
    urlIncludes: "/SearchTimeline",
    timeoutMs: 15000,
  });

  // --- Step 4: Navigate ---
  const searchUrl = buildXSearchUrl("openai", {
    hints: { platform: "x" },
    maxResults: 10,
  });
  console.log("[4/5] Navigating to:", searchUrl);
  await page.navigate(searchUrl, undefined);

  // --- Step 5: Wait for capture ---
  console.log("[5/5] Waiting for SearchTimeline response…");
  const outcome = await capture.wait();
  console.log("  → Outcome:", outcome.state);

  if (outcome.state !== "captured") {
    console.error("  ✗ Failed to capture SearchTimeline response.");
    console.error("    State:", outcome.state);
    await page.close();
    await runtime.dispose();
    process.exit(1);
  }

  console.log("  → URL:", outcome.url);
  console.log("  → Status:", outcome.status);

  // --- Desensitize & save fixture ---
  const raw = outcome.json;
  const entries = extractTimelineEntries(raw);
  console.log("  → Timeline entries found:", entries.length);

  // Keep at most 3 entries for the fixture (2 tweets + 1 cursor)
  const kept = entries.slice(0, 3);
  const fixture = {
    _meta: {
      capturedAt: new Date().toISOString(),
      outcomeUrl: outcome.url,
      outcomeStatus: outcome.status,
      totalEntries: entries.length,
      keptEntries: kept.length,
    },
    timeline: kept,
  };

  // Create fixture dir if needed
  if (!fs.existsSync(FIXTURE_DIR)) {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  }

  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2), "utf-8");
  console.log(`\n  ✓ Fixture saved to ${FIXTURE_PATH}`);

  // --- Cleanup ---
  await page.close();
  await runtime.dispose();
  console.log("\n=== Probe complete ===");
}

/**
 * Extract structured timeline entries from a raw SearchTimeline GraphQL response.
 * Follows the user's guidance: only TimelineAddEntries/PinEntry, top-level
 * itemContent.tweet_results.result, ignore cursor/promoted/user/card noise.
 */
function extractTimelineEntries(raw) {
  const entries = [];

  try {
    const instructions =
      raw?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ||
      [];

    for (const instruction of instructions) {
      // X uses `type` (not `__typename`) for timeline instructions.
      const type = instruction?.type || instruction?.__typename || "";
      if (!type.includes("TimelineAddEntries") &&
          !type.includes("TimelinePinEntry") &&
          !type.includes("TimelineReplaceEntry")) {
        continue;
      }

      const items = instruction?.entries || [];
      for (const entry of items) {
        const entryId = entry?.entryId || "";

        // Skip cursor entries
        if (entryId.includes("cursor")) continue;

        // Skip promoted entries
        if (entryId.includes("promoted")) continue;

        // Grab the tweet result
        const result = entry?.content?.itemContent?.tweet_results?.result;
        if (!result) continue;

        const tweet = unwrapTweetResult(result);
        if (!tweet) continue;

        entries.push({
          entryId,
          rest_id: tweet.rest_id || "",
          legacy: {
            full_text: tweet.legacy?.full_text || "",
            created_at: tweet.legacy?.created_at || "",
            favorite_count: tweet.legacy?.favorite_count ?? 0,
            retweet_count: tweet.legacy?.retweet_count ?? 0,
            reply_count: tweet.legacy?.reply_count ?? 0,
            // Keep only the first media item for the fixture
            entities: {
              urls: (tweet.legacy?.entities?.urls || []).slice(0, 2),
            },
            extended_entities: tweet.legacy?.extended_entities
              ? {
                  media: (tweet.legacy.extended_entities.media || []).slice(0, 1).map((m) => ({
                    type: m.type,
                    media_url_https: m.media_url_https,
                  })),
                }
              : undefined,
          },
          core: {
            user_results: {
              result: {
                rest_id: tweet.core?.user_results?.result?.rest_id || "",
                core: {
                  name: tweet.core?.user_results?.result?.core?.name || "",
                  screen_name: tweet.core?.user_results?.result?.core?.screen_name || "",
                },
                avatar: tweet.core?.user_results?.result?.avatar
                  ? { image_url: tweet.core.user_results.result.avatar.image_url || "" }
                  : undefined,
                profile_bio: tweet.core?.user_results?.result?.profile_bio
                  ? { description: tweet.core.user_results.result.profile_bio.description || "" }
                  : undefined,
              },
            },
          },
          // Long text via note_tweet
          note_tweet: tweet.note_tweet
            ? {
                note_tweet_results: {
                  result: {
                    text: tweet.note_tweet.note_tweet_results?.result?.text || "",
                  },
                },
              }
            : undefined,
        });
      }
    }
  } catch (err) {
    console.error("Warning: extractTimelineEntries error:", err.message);
  }

  return entries;
}

function unwrapTweetResult(result) {
  if (!result) return undefined;
  if (result.__typename === "TweetWithVisibilityResults") {
    return result.tweet || undefined;
  }
  if (result.__typename === "Tweet") {
    return result;
  }
  // Unknown type — may be a tombstone, unavailable, etc.
  return undefined;
}

main().catch((err) => {
  console.error("Probe failed:", err);
  process.exit(1);
});