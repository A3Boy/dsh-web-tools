#!/usr/bin/env node
/**
 * Debug: capture the SearchTimeline response and dump its structure, so the
 * parser can be written against the REAL schema (not guessed).
 */
import { createNativeBrowserRuntime } from "../src/host/browser/index.ts";
import { buildXSearchUrl } from "../src/host/sources/x.ts";

function summarize(value, depth = 0, maxDepth = 3) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const sample = summarize(value[0], depth + 1, maxDepth);
    return `Array(${value.length})[${sample}]`;
  }
  if (typeof value === "object") {
    if (depth >= maxDepth) return `{...${Object.keys(value).length} keys}`;
    const keys = Object.keys(value);
    const inner = keys.slice(0, 12).map((k) => {
      const v = value[k];
      return `${k}: ${summarize(v, depth + 1, maxDepth)}`;
    });
    const extra = keys.length > 12 ? `, ...${keys.length - 12} more` : "";
    return `{${inner.join(", ")}${extra}}`;
  }
  const s = String(value);
  return s.length > 60 ? s.slice(0, 57) + "..." : s;
}

async function main() {
  const runtime = createNativeBrowserRuntime("auto");
  const isAuth = await runtime.verifyAuthenticationForOperation("x");
  console.log("auth:", isAuth);
  if (!isAuth) {
    await runtime.dispose();
    process.exit(1);
  }

  const page = await runtime.createPage("x");
  const capture = await page.beginJsonCapture({
    urlIncludes: "/SearchTimeline",
    timeoutMs: 12000,
  });
  const searchUrl = buildXSearchUrl("openai", { hints: { platform: "x" } });
  console.log("navigating:", searchUrl);
  await page.navigate(searchUrl);
  const outcome = await capture.wait();
  console.log("outcome:", outcome.state);

  if (outcome.state === "captured") {
    console.log("status:", outcome.status);
    console.log("TOP-LEVEL:", summarize(outcome.json, 0, 1));
    const data = outcome.json?.data;
    if (data) {
      console.log("data keys:", Object.keys(data));
      const search = data.search_by_raw_query || data.search;
      if (search) {
        console.log("search keys:", Object.keys(search));
        const st = search.search_timeline || search.timeline;
        if (st) {
          console.log("search_timeline keys:", Object.keys(st));
          console.log("timeline keys:", Object.keys(st.timeline || {}));
          const instructions = st.timeline?.instructions;
          if (instructions) {
            console.log("instructions count:", instructions.length);
            for (let i = 0; i < instructions.length; i++) {
              const ins = instructions[i];
              console.log(`instruction[${i}].__typename:`, ins?.__typename);
              console.log(`instruction[${i}] keys:`, Object.keys(ins));
              if (ins?.entries) {
                console.log(`  entries count:`, ins.entries.length);
                if (ins.entries[0]) {
                  const e0 = ins.entries[0];
                  console.log("  entry[0].entryId:", e0.entryId);
                  console.log("  entry[0] keys:", Object.keys(e0));
                  console.log("  content keys:", Object.keys(e0.content || {}));
                  console.log("  itemContent keys:", Object.keys(e0.content?.itemContent || {}));
                  const tr = e0.content?.itemContent?.tweet_results?.result;
                  if (tr) {
                    console.log("  tweet result __typename:", tr.__typename);
                    console.log("  tweet result keys:", Object.keys(tr));
                    if (tr.core) {
                      console.log("  core keys:", Object.keys(tr.core));
                      const ur = tr.core.user_results;
                      if (ur) {
                        console.log("  user_results keys:", Object.keys(ur));
                        const ures = ur.result;
                        if (ures) {
                          console.log("  user result __typename:", ures.__typename);
                          console.log("  user result rest_id:", ures.rest_id);
                          console.log("  user result id:", ures.id);
                          console.log("  profile_bio:", JSON.stringify(ures.profile_bio));
                          console.log("  avatar:", JSON.stringify(ures.avatar));
                          console.log("  banner:", JSON.stringify(ures.banner));
                          console.log("  location:", JSON.stringify(ures.location));
                          console.log("  website:", JSON.stringify(ures.website));
                          console.log("  name:", JSON.stringify(ures.name));
                          console.log("  screen_name:", JSON.stringify(ures.screen_name));
                          // Check if core exists inside user result
                          if (ures.core) {
                            console.log("  user.core keys:", Object.keys(ures.core));
                            console.log("  user.core:", JSON.stringify(ures.core));
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      console.log("No data key. Full keys:", Object.keys(outcome.json));
    }
  }

  await page.close();
  await runtime.dispose();
}

main().catch((err) => {
  console.error("debug failed:", err);
  process.exit(1);
});