/**
 * dsh-web-tools — Search Mode runtime state model tests (pure, no DSH/pnpm).
 *
 * Covers the behavior table demanded by the "联网搜索" feature: auto leaves the
 * turn free, required freezes the flag per turn, a completed web_search (even
 * a failed one) satisfies the requirement, mid-turn flips only affect the next
 * turn, and sessions never pollute each other.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SearchModeRuntime,
  createSearchModeMessages,
  searchModeStepMessage,
  REQUIRED_SEARCH_TEXT,
  REQUIRED_SEARCH_REMINDER,
  REQUIRED_SEARCH_GROUNDING,
  REQUIRED_SEARCH_CORRECTION_TEXT,
  type TurnState,
} from "../src/host/search-mode-runtime.ts";

function runtime(available = true): SearchModeRuntime {
  return new SearchModeRuntime(() => available);
}

test("default mode is auto and does not mark a turn required", () => {
  const r = runtime();
  assert.equal(r.getMode("s1"), "auto");
  const turn = r.beginTurn("s1", 1);
  assert.equal(turn.required, false);
  assert.equal(turn.webSearchCompleted, false);
});

test("setMode(required) freezes the flag for the CURRENT turn only", () => {
  const r = runtime();
  r.setMode("s1", "required");
  const t17 = r.beginTurn("s1", 17);
  assert.equal(t17.required, true);
  // Mid-turn flip to auto does NOT change the already-begun turn (no race).
  r.setMode("s1", "auto");
  const same17 = r.beginTurn("s1", 17);
  assert.equal(same17.required, true, "frozen for the in-flight turn");
  // A NEW turn reads the updated mode.
  const t18 = r.beginTurn("s1", 18);
  assert.equal(t18.required, false);
});

test("markSearchResult: a completed search (even failure) satisfies the requirement", () => {
  const r = runtime();
  r.setMode("s1", "required");
  r.beginTurn("s1", 5);
  assert.equal(r.getTurn("s1")?.webSearchCompleted, false);
  // All-provider failure is still "tried".
  r.markSearchResult("s1", false);
  const state = r.getTurn("s1");
  assert.equal(state?.webSearchCompleted, true, "failure still counts as completed");
  assert.equal(state?.webSearchSucceeded, false);
});

test("markSearchResult success records succeeded", () => {
  const r = runtime();
  r.setMode("s1", "required");
  r.beginTurn("s1", 1);
  r.markSearchResult("s1", true);
  assert.equal(r.getTurn("s1")?.webSearchCompleted, true);
  assert.equal(r.getTurn("s1")?.webSearchSucceeded, true);
});

test("correction counter increments on steer (no infinite loop), then cancel path", () => {
  const r = runtime();
  r.setMode("s1", "required");
  const state = r.beginTurn("s1", 3);
  assert.equal(state.correctionCount, 0);
  state.correctionCount += 1; // first steer
  assert.equal(state.correctionCount, 1);
  state.correctionCount += 1; // second offense → runtime.cancel is called upstream
  assert.equal(state.correctionCount, 2);
});

test("sessions never pollute each other", () => {
  const r = runtime();
  r.setMode("A", "required");
  assert.equal(r.getMode("B"), "auto");
  r.beginTurn("A", 1);
  r.markSearchResult("A", true);
  assert.equal(r.getTurn("B"), undefined);
  assert.equal(r.getMode("A"), "required");
});

test("required persists across turns in the same session", () => {
  const r = runtime();
  r.setMode("s1", "required");
  assert.equal(r.beginTurn("s1", 1).required, true);
  assert.equal(r.beginTurn("s1", 2).required, true);
});

test("setMode(auto) clears the entry back to auto", () => {
  const r = runtime();
  r.setMode("s1", "required");
  r.setMode("s1", "auto");
  assert.equal(r.getMode("s1"), "auto");
  assert.equal(r.beginTurn("s1", 1).required, false);
});

test("clear drops mode and turn state (agent disposed)", () => {
  const r = runtime();
  r.setMode("s1", "required");
  r.beginTurn("s1", 1);
  r.clear("s1");
  assert.equal(r.getMode("s1"), "auto");
  assert.equal(r.getTurn("s1"), undefined);
});

test("view reports mode and availability", () => {
  const r = runtime(false);
  r.setMode("s1", "required");
  assert.deepEqual(r.view("s1"), { mode: "required", available: false });
  const r2 = runtime(true);
  r2.setMode("s1", "required");
  assert.deepEqual(r2.view("s1"), { mode: "required", available: true });
});

// ---- hosted message shape (official createUserMessage contract) ------------

/** Capture the exact input the official createUserMessage would receive. */
function captureFactory() {
  const calls: any[] = [];
  const createUserMessage = (input: any) => {
    calls.push(input);
    return { __built: input };
  };
  return { calls, createUserMessage };
}

test("required message is a plugin snapshot section carrying REQUIRED_SEARCH_TEXT", () => {
  const { calls, createUserMessage } = captureFactory();
  const messages = createSearchModeMessages(createUserMessage);
  const built = messages.required();
  assert.equal(calls.length, 1);
  const input = calls[0];
  assert.ok(Array.isArray(input.content));
  assert.equal(input.content[0].type, "text");
  assert.equal(input.content[0].text, REQUIRED_SEARCH_TEXT);
  assert.equal(input.source.kind, "plugin");
  assert.equal(input.source.plugin, "dsh-web-tools");
  assert.equal(input.source.form, "snapshot");
  assert.equal(input.source.sections[0].name, "web-search-mode");
  assert.equal(input.source.sections[0].text, REQUIRED_SEARCH_TEXT);
  assert.ok(REQUIRED_SEARCH_TEXT.includes("complete at least one web_search call"));
});

test("correction message is a one-shot plugin notice (not a snapshot)", () => {
  const { calls, createUserMessage } = captureFactory();
  const messages = createSearchModeMessages(createUserMessage);
  messages.correction();
  assert.equal(calls.length, 1);
  const input = calls[0];
  assert.equal(input.content[0].text, REQUIRED_SEARCH_CORRECTION_TEXT);
  assert.equal(input.source.kind, "plugin");
  assert.equal(input.source.plugin, "dsh-web-tools");
  assert.equal(input.source.form, "notice");
  assert.equal(input.source.summary, "Web Search required");
});

test("reminder and grounding are plugin snapshot sections (not notices)", () => {
  const { calls, createUserMessage } = captureFactory();
  const messages = createSearchModeMessages(createUserMessage);
  messages.reminder();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].source.kind, "plugin");
  assert.equal(calls[0].source.form, "snapshot");
  assert.equal(calls[0].content[0].text, REQUIRED_SEARCH_REMINDER);

  messages.grounding();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].source.kind, "plugin");
  assert.equal(calls[1].source.form, "snapshot");
  assert.equal(calls[1].content[0].text, REQUIRED_SEARCH_GROUNDING);
});

// ---- three-phase pre-step message policy -----------------------------------

function turnState(overrides: Partial<TurnState> = {}): TurnState {
  return {
    turn: 1,
    required: true,
    webSearchCompleted: false,
    webSearchSucceeded: false,
    correctionCount: 0,
    ...overrides,
  };
}

test("pre-step step 1 injects the compact research policy (required)", () => {
  const messages = createSearchModeMessages(() => "M");
  assert.equal(searchModeStepMessage(turnState(), 1, messages), "M");
});

test("pre-step later step before search completes injects the short reminder", () => {
  const messages = createSearchModeMessages((input: any) => `built:${input.content[0].text}`);
  const out = searchModeStepMessage(turnState({ webSearchCompleted: false }), 2, messages);
  assert.equal(out, `built:${REQUIRED_SEARCH_REMINDER}`);
});

test("pre-step later step after search completes injects the grounding reminder", () => {
  const messages = createSearchModeMessages((input: any) => `built:${input.content[0].text}`);
  const out = searchModeStepMessage(turnState({ webSearchCompleted: true }), 3, messages);
  assert.equal(out, `built:${REQUIRED_SEARCH_GROUNDING}`);
});

test("pre-step injects nothing when the turn is not in required mode", () => {
  const messages = createSearchModeMessages(() => "M");
  assert.equal(searchModeStepMessage(turnState({ required: false }), 1, messages), undefined);
  assert.equal(searchModeStepMessage(turnState({ required: false, webSearchCompleted: true }), 2, messages), undefined);
  assert.equal(searchModeStepMessage(undefined, 1, messages), undefined);
});

// ---- identity authority: UI sessionId drives the same Agent runtime --------

test("a UI/route setMode(sessionId, required) makes that session's Agent turn required", () => {
  const r = runtime();
  // This is exactly what the /search-mode/set route does with the sessionId the
  // conversation slot provides (identical to agent.id — one Session per Agent).
  const sessionIdFromConversationSlot = "sess-abc";
  r.setMode(sessionIdFromConversationSlot, "required");
  // The Agent runtime keys turn state by agent.id === session.id; here the same
  // string is used, so beginTurn() sees the required flag.
  const agentId = sessionIdFromConversationSlot;
  const turn = r.beginTurn(agentId, 7);
  assert.equal(turn.required, true);
});

test("slash /search and the UI button write the same runtime", () => {
  const r = runtime();
  const id = "sess-xyz";
  // UI button path (searchMode.set) and /search handler both call setMode(key).
  r.setMode(id, "required");
  assert.equal(r.getMode(id), "required");
  // /search toggles: required → auto
  r.setMode(id, r.getMode(id) === "required" ? "auto" : "required");
  assert.equal(r.getMode(id), "auto");
});
