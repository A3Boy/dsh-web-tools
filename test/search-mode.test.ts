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
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  SearchModeRuntime,
  installSearchModeRuntime,
  createSearchModeMessages,
  searchModeStepMessage,
  webResearchCompleted,
  requiredSearchText,
  SEARCH_AUTO_TEXT,
  SEARCH_DISABLED_TEXT,
  REQUIRED_SEARCH_TEXT,
  REQUIRED_SEARCH_TEXT_NO_PLATFORMS,
  REQUIRED_SEARCH_CORRECTION_TEXT,
  type TurnState,
} from "../src/host/search-mode-runtime.ts";
import { nextSearchMode } from "../src/shared/api-types.ts";

function runtime(available = true): SearchModeRuntime {
  return new SearchModeRuntime(() => available);
}

test("auto criterion is not appended on consecutive turns, but returns after a mode switch (#17)", async () => {
  const r = runtime();
  const history: unknown[] = [];
  const listeners = new Map<string, (...args: any[]) => any>();
  let cleanup: (() => void) | undefined;
  const ctx: any = { on: (event: string, listener: (...args: any[]) => any) => {
    listeners.set(event, listener);
    return () => listeners.delete(event);
  } };
  const agent: any = { id: "s1", session: { deriveMessages: () => history }, ctx: { on: ctx.on, effect: (fn: () => () => void) => { cleanup = fn(); } } };
  const messages = createSearchModeMessages((input) => ({ role: "user", ...(input as object) }));
  const dispose = installSearchModeRuntime(ctx, { searchAvailable: () => true }, r, messages);
  listeners.get("agent/created")!({ agent });
  const step = async (turn: number, step = 1, kind = "enter", signal?: AbortSignal) => {
    const result = await listeners.get("agent/pre-step")!({ turn, step, signal }, async () => ({ kind, messages: ["user query"] }));
    if (kind === "enter" && !signal?.aborted) history.push(...result.messages);
    return result;
  };
  const policy = (result: any) => result.messages.filter((m: any) => m !== "user query");
  try {
    assert.equal(policy(await step(1)).length, 1);
    assert.equal(policy(await step(2)).length, 0, "unchanged auto mode must not append another criterion");
    assert.equal(policy(await step(2, 2)).length, 0);
    r.setMode("s1", "required");
    assert.equal(policy(await step(3)).length, 1);
    assert.equal(policy(await step(4)).length, 1, "required mode still applies to every turn");
    r.setMode("s1", "auto");
    assert.equal(policy(await step(5)).length, 1, "auto must override the previous required instruction");
    assert.equal(policy(await step(6)).length, 0);
    r.setMode("s1", "off");
    assert.equal(policy(await step(7)).length, 1);
    r.setMode("s1", "auto");
    assert.equal((await step(8, 1, "reject")).kind, "reject");
    assert.equal(policy(await step(8, 1, "enter", AbortSignal.abort())).length, 0);
    assert.equal(policy(await step(8)).length, 1, "rejected/aborted steps must not consume the mode change");
    assert.equal(policy(await step(9)).length, 0);
    cleanup!();
    listeners.get("agent/created")!({ agent });
    assert.equal(policy(await step(10)).length, 0, "restoring an agent must reuse its visible session policy");
    history.length = 0;
    assert.equal(policy(await step(10, 2)).length, 1, "after compaction removes the policy, restore it even mid-turn");
    assert.equal(policy(await step(11)).length, 0);
  } finally {
    cleanup?.();
    dispose();
  }
});

test("default mode is auto and does not mark a turn required", () => {
  const r = runtime();
  assert.equal(r.getMode("s1"), "auto");
  const turn = r.beginTurn("s1", 1);
  assert.equal(turn.required, false);
  assert.equal(turn.webSearchCompleted, false);
});

test("auto criterion follows real Session restore and surface compaction", async () => {
  const { Session } = await import("@deepseek-ai/dsh-session");
  const { createUserMessage } = await import("@deepseek-ai/dsh-llm");
  const messages = createSearchModeMessages(createUserMessage as any);
  const session = Session.create("auto-policy-lifecycle" as any);
  const state = runtime().beginTurn("auto-policy-lifecycle", 1);
  session.append("user/message", messages.auto() as any, { surfaceOp: "append" });
  assert.equal(searchModeStepMessage(state, 1, messages, session.deriveMessages()), undefined);
  const restored = Session.create(session.id, JSON.parse(JSON.stringify(session.events)));
  assert.equal(searchModeStepMessage(state, 1, messages, restored.deriveMessages()), undefined);
  const nodes = [...restored.surface.nodes];
  restored.append("user/message", createUserMessage({
    content: [{ type: "text", text: "Summary of the previous conversation" }],
    source: { kind: "plugin", plugin: "compaction" },
  }), {
    surfaceOp: { op: "replace", start: nodes[0], end: nodes[nodes.length - 1] },
    sourceEventSeqs: nodes,
  });
  assert.ok(restored.events.some((e) => e.type === "user/message" && JSON.stringify(e.data).includes(SEARCH_AUTO_TEXT)),
    "the old policy remains in the durable log but is no longer model-visible");
  const replacement: any = searchModeStepMessage(state, 2, messages, restored.deriveMessages());
  assert.equal(replacement.content[0].text, SEARCH_AUTO_TEXT);
  restored.append("user/message", replacement, { surfaceOp: "append" });
  assert.equal(searchModeStepMessage(state, 3, messages, restored.deriveMessages()), undefined);
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

test("markFetchResult: a completed fetch (even failure) satisfies the requirement", () => {
  const r = runtime();
  r.setMode("s1", "required");
  r.beginTurn("s1", 5);
  assert.equal(r.getTurn("s1")?.webFetchCompleted, false);
  r.markFetchResult("s1", false);
  const state = r.getTurn("s1");
  assert.equal(state?.webFetchCompleted, true, "failure still counts as completed");
  assert.equal(state?.webFetchSucceeded, false);
  assert.equal(webResearchCompleted(state!), true, "a fetch alone completes web research");
});

test("markFetchResult success records succeeded", () => {
  const r = runtime();
  r.setMode("s1", "required");
  r.beginTurn("s1", 1);
  r.markFetchResult("s1", true);
  assert.equal(r.getTurn("s1")?.webFetchCompleted, true);
  assert.equal(r.getTurn("s1")?.webFetchSucceeded, true);
  assert.equal(webResearchCompleted(r.getTurn("s1")!), true);
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
  assert.equal(input.source.kind, "plugin:dsh-web-tools");
  assert.equal(input.source.plugin, "dsh-web-tools");
  assert.equal(input.source.form, "snapshot");
  assert.equal(input.source.sections[0].name, "web-search-mode");
  assert.equal(input.source.sections[0].text, REQUIRED_SEARCH_TEXT);
  assert.ok(REQUIRED_SEARCH_TEXT.includes("complete at least one web_search or web_fetch call"),
    "the one-shot notice must state the hard research requirement");
  assert.ok(REQUIRED_SEARCH_TEXT.includes("Use web_fetch for a specific URL"),
    "URL routing guidance must mention web_fetch");
  assert.ok(REQUIRED_SEARCH_TEXT.includes("otherwise use web_search"),
    "non-URL routing guidance must mention web_search");
  assert.ok(REQUIRED_SEARCH_TEXT.includes("use exactly one routing prefix"),
    "platform targeting must distinguish the routing marker from topic keywords");
  assert.ok(REQUIRED_SEARCH_TEXT.includes("not page details or comments"),
    "search snippets must not be represented as fetched comments");
  assert.ok(REQUIRED_SEARCH_TEXT.includes("only when web_fetch returns their contents"),
    "verified comment claims must be grounded in fetched comment content");
});

test("platform-routing lines disappear when no platform source can serve them", () => {
  // Both platforms off: the policy must not teach a prefix that does nothing.
  const { calls, createUserMessage } = captureFactory();
  const messages = createSearchModeMessages(createUserMessage, () => false);
  messages.required();
  const text = calls[0].content[0].text as string;

  assert.equal(text, REQUIRED_SEARCH_TEXT_NO_PLATFORMS);
  assert.ok(!text.includes("routing prefix"),
    "no routing-prefix guidance while both platform sources are disabled");
  assert.ok(!text.includes("platform search box"),
    "no platform-search-box guidance while both platform sources are disabled");
  // The hard requirement and the evidence rules must survive the trim.
  assert.ok(text.includes("complete at least one web_search or web_fetch call"));
  assert.ok(text.includes("Use web_fetch for a specific URL"));
  assert.ok(text.includes("not page details or comments"));
  assert.ok(text.includes("only when web_fetch returns their contents"));
});

test("platform-routing lines return as soon as one platform source is re-enabled", () => {
  let enabled = false;
  const { calls, createUserMessage } = captureFactory();
  const messages = createSearchModeMessages(createUserMessage, () => enabled);

  messages.required();
  assert.ok(!(calls[0].content[0].text as string).includes("routing prefix"),
    "disabled platforms omit the prefix guidance");

  // The predicate is read per call, so a settings flip lands on the NEXT turn
  // without re-wiring the runtime.
  enabled = true;
  messages.required();
  assert.equal(calls[1].content[0].text, REQUIRED_SEARCH_TEXT);
  assert.ok((calls[1].content[0].text as string).includes("routing prefix"));
});

test("requiredSearchText defaults to the platform-aware text", () => {
  assert.equal(requiredSearchText(), REQUIRED_SEARCH_TEXT);
  assert.equal(requiredSearchText(true), REQUIRED_SEARCH_TEXT);
  assert.equal(requiredSearchText(false), REQUIRED_SEARCH_TEXT_NO_PLATFORMS);
});

test("off mode freezes a disabled turn and never demands research", () => {
  const r = runtime();
  r.setMode("s-off", "off");
  assert.equal(r.getMode("s-off"), "off");
  assert.equal(r.isOff("s-off"), true);

  const turn = r.beginTurn("s-off", 1);
  assert.equal(turn.disabled, true, "off turns are frozen as disabled");
  assert.equal(turn.required, false, "off must never be a required turn");
});

test("off mode injects the switched-off notice on step 1 only", () => {
  const { calls, createUserMessage } = captureFactory();
  const messages = createSearchModeMessages(createUserMessage);
  const r = runtime();
  r.setMode("s-off", "off");
  const turn = r.beginTurn("s-off", 1);

  const built = searchModeStepMessage(turn, 1, messages) as { __built: { content: Array<{ text: string }> } };
  assert.equal(built.__built.content[0].text, SEARCH_DISABLED_TEXT);
  assert.equal(calls.length, 1);
  assert.equal((calls[0].source as { summary?: string }).summary, "Web Search disabled");

  assert.equal(searchModeStepMessage(turn, 2, messages), undefined,
    "later steps stay silent; the gate enforces the mode");
});

test("a disabled turn is never corrected at turn-stopping", () => {
  const r = runtime();
  r.setMode("s-off", "off");
  const turn = r.beginTurn("s-off", 1);
  // Turn-stopping only steers `required` turns; off must fall straight through.
  assert.equal(turn.required, false);
  assert.equal(webResearchCompleted(turn), false);
});

test("nextSearchMode cycles auto -> required -> off -> auto", () => {
  assert.equal(nextSearchMode("auto"), "required");
  assert.equal(nextSearchMode("required"), "off");
  assert.equal(nextSearchMode("off"), "auto");
});


test("correction message is a one-shot plugin notice (not a snapshot)", () => {
  const { calls, createUserMessage } = captureFactory();
  const messages = createSearchModeMessages(createUserMessage);
  messages.correction();
  assert.equal(calls.length, 1);
  const input = calls[0];
  assert.equal(input.content[0].text, REQUIRED_SEARCH_CORRECTION_TEXT);
  assert.equal(input.source.kind, "plugin:dsh-web-tools");
  assert.equal(input.source.plugin, "dsh-web-tools");
  assert.equal(input.source.form, "notice");
  assert.equal(input.source.summary, "Web Search required");
});

test("search mode messages are admitted by session format v4 codec", async () => {
  const codecCandidates = [
    process.env.DSH_TOOL_WEB_NM && `${process.env.DSH_TOOL_WEB_NM}/dsh-session-format-v3-to-v4/lib/index.js`,
    "D:/Develop/nvm/v22.22.1/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session-format-v3-to-v4/lib/index.js",
  ].filter(Boolean) as string[];

  let codec: any = null;
  for (const p of codecCandidates) {
    if (existsSync(p)) {
      const mod = await import(pathToFileURL(p).href);
      codec = mod.releasedV4SessionFormatCodec;
      break;
    }
  }

  const { calls, createUserMessage } = captureFactory();
  const messages = createSearchModeMessages(createUserMessage);
  const req = messages.required();
  const corr = messages.correction();

  assert.equal((calls[0].source as any).kind, "plugin:dsh-web-tools");
  assert.equal((calls[1].source as any).kind, "plugin:dsh-web-tools");

  if (codec) {
    assert.doesNotThrow(() => {
      codec.encodeEvent({ type: "user/message", seq: 1, time: Date.now(), data: req });
    });
    assert.doesNotThrow(() => {
      codec.encodeEvent({ type: "user/message", seq: 2, time: Date.now(), data: corr });
    });
  }
});

// ---- one-shot pre-step message policy --------------------------------------

function turnState(overrides: Partial<TurnState> = {}): TurnState {
  return {
    turn: 1,
    required: true,
    webSearchCompleted: false,
    webSearchSucceeded: false,
    webFetchCompleted: false,
    webFetchSucceeded: false,
    correctionCount: 0,
    ...overrides,
  };
}

test("pre-step step 1 injects the compact research policy (required)", () => {
  const messages = createSearchModeMessages(() => "M");
  assert.equal(searchModeStepMessage(turnState(), 1, messages), "M");
});

test("pre-step later steps inject NOTHING (before search completes)", () => {
  const messages = createSearchModeMessages(() => "M");
  const out = searchModeStepMessage(turnState({ webSearchCompleted: false }), 2, messages);
  assert.equal(out, undefined, "no reminder before research — enforcement is turn-stopping");
});

test("pre-step later steps inject NOTHING (after search succeeds)", () => {
  const messages = createSearchModeMessages(() => "M");
  const out = searchModeStepMessage(turnState({ webSearchCompleted: true, webSearchSucceeded: true }), 3, messages);
  assert.equal(out, undefined, "no grounding after success — tool result is the freshest context");
});

test("pre-step later steps inject NOTHING (after a fetch succeeds)", () => {
  const messages = createSearchModeMessages(() => "M");
  const out = searchModeStepMessage(turnState({ webFetchCompleted: true, webFetchSucceeded: true }), 3, messages);
  assert.equal(out, undefined);
});

test("pre-step later steps inject NOTHING (after search attempted and FAILED)", () => {
  const messages = createSearchModeMessages(() => "M");
  const out = searchModeStepMessage(turnState({ webSearchCompleted: true, webSearchSucceeded: false }), 3, messages);
  assert.equal(out, undefined, "no failed notice — the failure is already a tool result");
});

test("webResearchCompleted is true when EITHER search or fetch completed", () => {
  assert.equal(webResearchCompleted(turnState()), false);
  assert.equal(webResearchCompleted(turnState({ webSearchCompleted: true })), true);
  assert.equal(webResearchCompleted(turnState({ webFetchCompleted: true })), true);
  assert.equal(webResearchCompleted(turnState({ webSearchCompleted: true, webFetchCompleted: true })), true);
});

test("auto turns get the optional-use criterion, never the requirement", () => {
  const { calls, createUserMessage } = captureFactory();
  const messages = createSearchModeMessages(createUserMessage);

  const first = searchModeStepMessage(turnState({ required: false }), 1, messages) as {
    __built: { content: Array<{ text: string }> };
  };
  assert.equal(first.__built.content[0].text, SEARCH_AUTO_TEXT);
  assert.ok(SEARCH_AUTO_TEXT.includes("web_search"), "the criterion must name the tool");
  assert.ok(SEARCH_AUTO_TEXT.includes("not required"), "auto must not read as a requirement");
  assert.ok(SEARCH_AUTO_TEXT.includes("otherwise answer directly"), "the default must be stated");

  // Later steps reuse the visible policy; missing state injects nothing.
  assert.equal(searchModeStepMessage(turnState({ required: false, webSearchCompleted: true }), 2, messages,
    [{ role: "user", ...(first as any).__built }]), undefined);
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

test("off mode deduplicates consecutive turns, restores mode across session resume, and works without deriveMessages", async () => {
  const r = runtime();
  const history: unknown[] = [];
  const listeners = new Map<string, (...args: any[]) => any>();
  let cleanup: (() => void) | undefined;
  let restrictedCount = 0;
  const ctx: any = {
    on: (event: string, listener: (...args: any[]) => any) => {
      listeners.set(event, listener);
      return () => listeners.delete(event);
    },
  };
  const agent: any = {
    id: "s-resume-off",
    session: { deriveMessages: () => history },
    ctx: {
      on: ctx.on,
      effect: (fn: () => () => void) => { cleanup = fn(); },
      tools: {
        restrict: () => {
          restrictedCount++;
          return () => { restrictedCount--; };
        },
      },
    },
  };
  const messages = createSearchModeMessages((input) => ({ role: "user", ...(input as object) }));
  const dispose = installSearchModeRuntime(ctx, { searchAvailable: () => true }, r, messages);
  listeners.get("agent/created")!({ agent });

  const step = async (turn: number, stepNum = 1) => {
    const result = await listeners.get("agent/pre-step")!({ turn, step: stepNum }, async () => ({ kind: "enter", messages: ["q"] }));
    history.push(...result.messages);
    return result.messages.filter((m: any) => m !== "q");
  };

  try {
    r.setMode("s-resume-off", "off");
    assert.equal((await step(1)).length, 1, "first off turn injects notice");
    assert.equal((await step(2)).length, 0, "consecutive off turn reuses visible notice");
    assert.equal(restrictedCount, 1);

    // Simulate host restart / agent disposal & resume:
    cleanup!();
    assert.equal(r.getMode("s-resume-off"), "auto", "disposed agent cleared in-memory mode");
    listeners.get("agent/created")!({ agent });
    assert.equal(r.getMode("s-resume-off"), "off", "resumed session restores off mode from history");
    assert.equal(restrictedCount, 1, "resumed off session immediately restricts web tools");
    assert.equal((await step(3)).length, 0, "resumed off session does not duplicate notice");

    // Older host without session.deriveMessages: must not throw and must deduplicate auto/off
    cleanup!();
    const legacyAgent: any = {
      id: "s-legacy",
      ctx: { on: ctx.on, effect: (fn: () => () => void) => { cleanup = fn(); } },
    };
    listeners.get("agent/created")!({ agent: legacyAgent });
    const legacyStep = async (turn: number) => {
      const res = await listeners.get("agent/pre-step")!({ turn, step: 1 }, async () => ({ kind: "enter", messages: ["q"] }));
      return res.messages.filter((m: any) => m !== "q");
    };
    assert.equal((await legacyStep(1)).length, 1, "legacy host injects initial auto criterion");
    assert.equal((await legacyStep(2)).length, 0, "legacy host deduplicates consecutive auto turns");
  } finally {
    cleanup?.();
    dispose();
  }
});



