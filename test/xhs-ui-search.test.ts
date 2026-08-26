import assert from "node:assert/strict";
import test from "node:test";
import type { CdpPageLease } from "../src/host/browser/types.ts";
import { navigateXhsSearchViaUi } from "../src/host/sources/xiaohongshu/ui-search.ts";

function fakePage(
  initialState: "ready" | "login-wall" = "ready",
  afterSubmitState: "ready" | "login-wall" = "ready",
) {
  const calls = { navigated: [] as string[], query: "", submitted: false };
  const page = {
    navigate: async (url: string) => { calls.navigated.push(url); },
    waitForLoad: async () => {},
    waitForSelector: async () => {},
    call: async (fn: { name?: string }, args?: unknown[]) => {
      if (fn.name === "detectXhsPageState") return calls.submitted ? afterSubmitState : initialState;
      if (fn.name === "extractXhsSearchState") {
        return { available: true, feeds: [{ id: "note" }] };
      }
      return undefined;
    },
    focus: async () => true,
    insertText: async (text: string) => { calls.query = text; },
    click: async () => {
      calls.submitted = true;
      return true;
    },
    pressKey: async () => { calls.submitted = true; },
    evaluate: async (expression: string) => {
      if (expression === "location.href") {
        return calls.submitted
          ? "https://www.xiaohongshu.com/search_result?keyword=DeepSeek%20Harness"
          : "https://www.xiaohongshu.com/explore";
      }
      if (expression.includes("section.note-item")) return 1;
      return undefined;
    },
  } as unknown as CdpPageLease;
  return { page, calls };
}

test("XHS UI search navigates through explore and enters only the cleaned topic query", async () => {
  const { page, calls } = fakePage();
  const result = await navigateXhsSearchViaUi(page, "DeepSeek Harness");

  assert.deepEqual(calls.navigated, ["https://www.xiaohongshu.com/explore"]);
  assert.equal(calls.query, "DeepSeek Harness");
  assert.equal(calls.submitted, true);
  assert.equal(result.state, "ready");
  assert.equal(result.stage, "after-submit");
  assert.match(result.url, /search_result/);
});

test("XHS UI search labels a post-submit login wall as search-stage restricted", async () => {
  const { page } = fakePage("ready", "login-wall");
  const result = await navigateXhsSearchViaUi(page, "DeepSeek Harness");

  assert.equal(result.state, "login-wall");
  assert.equal(result.stage, "after-submit");
});

test("XHS UI search stops at a visible login wall instead of clicking or timing out", async () => {
  const { page, calls } = fakePage("login-wall");
  const result = await navigateXhsSearchViaUi(page, "DeepSeek Harness");

  assert.equal(result.state, "login-wall");
  assert.equal(result.stage, "explore");
  assert.equal(calls.query, "");
  assert.equal(calls.submitted, false);
});
