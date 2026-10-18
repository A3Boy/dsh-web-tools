/**
 * dsh-web-tools — "Web Research mode" per-session turn policy (Search Mode).
 *
 * The layer sits ABOVE the provider layer: providers only execute web tools;
 * this module decides whether a turn must complete a web research call
 * (web_search OR web_fetch) before it may end. Everything is Host-owned so
 * browser refresh / session switch / relaunch cannot desync the button from
 * the real policy.
 *
 * Deploy strategy follows the proven `dsh-at-file` pattern (agent-scoped event
 * listeners): every agent-scoped listener is registered on that agent's scope
 * context inside `agent/created`, so `@deepseek-ai/dsh-scope` dispatches only
 * the matching agent's events to it.
 *   - `agent/pre-step` (waterfall): freeze the per-turn flag and inject one
 *     plugin-source UserMessage (official `createUserMessage`) on step 1.
 *   - `tools/result` (emit): receipt that a web_search or web_fetch ran.
 *     Completion — even a total provider failure — counts as "tried"; that is
 *     the requirement.
 *   - `agent/turn-stopping` (serial): no web research yet → `agent.steer()`
 *     once to continue; a second offense `agent.cancel()`s (no infinite loop).
 *
 * `SearchModeRuntime` is pure/framework-free so its state model is unit-testable.
 * @module
 */
import type { WebToolsContext, WebToolsCommandDefinition, WebToolsCommandInvocation, WebToolsCommandResult } from "./context-types.ts";
import type { SearchMode, SearchModeView } from "../shared/api-types.ts";
import { nextSearchMode } from "../shared/api-types.ts";

/** The two user-facing modes. */
export type { SearchMode };

/** Per-turn tracking (frozen per turn; mode flips only affect the next turn). */
export interface TurnState {
  turn: number;
  required: boolean;
  /** True when this turn runs with web search switched OFF (tools withheld). */
  disabled: boolean;
  webSearchCompleted: boolean;
  webSearchSucceeded: boolean;
  webFetchCompleted: boolean;
  webFetchSucceeded: boolean;
  correctionCount: number;
}

/** Whether the turn has completed ANY web research (search OR fetch). */
export function webResearchCompleted(state: TurnState): boolean {
  return state.webSearchCompleted || state.webFetchCompleted;
}

/** The turn policy lines every required turn needs, regardless of platform routing. */
const REQUIRED_SEARCH_CORE_LINES = [
  "Web Search is required for this turn.",
  "Before finalizing, complete at least one web_search or web_fetch call.",
  "Use web_fetch for a specific URL; otherwise use web_search.",
  "Treat web_search snippets as discovery evidence, not page details or comments.",
  "Describe comments or replies as verified only when web_fetch returns their contents.",
  "If web access fails, say what could not be verified.",
];

/**
 * The two lines that only make sense while a platform source (Xiaohongshu / X)
 * is enabled: they advertise a routing prefix the provider strips before the
 * platform search box. Advertising it while both platforms are switched off
 * would teach the model a prefix that does nothing.
 */
const REQUIRED_SEARCH_PLATFORM_LINES = [
  "To target a platform, use exactly one routing prefix such as 小红书: or X:; do not repeat the platform name as a topic keyword.",
  "The provider removes that routing prefix before entering the platform search box.",
];

/** The injected "you must research" instruction the model sees on step 1.
 * Compact: one hard requirement (complete an appropriate web tool), concrete
 * routing (URL → web_fetch, otherwise web_search), honest disclosure on
 * failure. General query-quality guidance belongs to DSH's own tool-web
 * prompt, not this per-turn policy. This default DOES advertise platform
 * routing; use {@link requiredSearchText} to decide per live config. */
export const REQUIRED_SEARCH_TEXT = [
  ...REQUIRED_SEARCH_CORE_LINES.slice(0, 3),
  ...REQUIRED_SEARCH_PLATFORM_LINES,
  ...REQUIRED_SEARCH_CORE_LINES.slice(3),
].join("\n");

/** Same policy with the platform-routing lines dropped (both platforms off). */
export const REQUIRED_SEARCH_TEXT_NO_PLATFORMS = REQUIRED_SEARCH_CORE_LINES.join("\n");

/**
 * Pick the policy text for the live configuration.
 * @param platformsEnabled - true when at least one platform source may serve a
 *   routed query. Omitted (or true) keeps the full text.
 */
export function requiredSearchText(platformsEnabled?: boolean): string {
  return platformsEnabled === false ? REQUIRED_SEARCH_TEXT_NO_PLATFORMS : REQUIRED_SEARCH_TEXT;
}

/** One-shot steer used when the model tries to end without researching. */
export const REQUIRED_SEARCH_CORRECTION_TEXT =
  "Web Search is required for this turn. Call web_search or web_fetch before finalizing.";

/**
 * Pure per-session state machine: one mode per session, one frozen flag per
 * turn. `auto` is the absence of an entry — clearing keeps the map tidy.
 */
export class SearchModeRuntime {
  private readonly modes = new Map<string, SearchMode>();
  private readonly turns = new Map<string, TurnState>();
  private readonly searchAvailable: () => boolean;

  constructor(searchAvailable: () => boolean = () => true) {
    this.searchAvailable = searchAvailable;
  }

  getMode(sessionId: string): SearchMode {
    return this.modes.get(sessionId) ?? "auto";
  }

  setMode(sessionId: string, mode: SearchMode): void {
    if (mode === "auto") this.modes.delete(sessionId);
    else this.modes.set(sessionId, mode);
  }

  /** True when this session has web search switched OFF. */
  isOff(sessionId: string): boolean {
    return this.getMode(sessionId) === "off";
  }

  /** Whether a usable search provider currently exists (drives `available`). */
  available(): boolean {
    try {
      return this.searchAvailable() === true;
    } catch {
      return true;
    }
  }

  /**
   * Begin (or re-read) a turn. The `required` flag is frozen when a NEW turn
   * begins; mid-turn mode flips only affect the NEXT turn (no race).
   */
  beginTurn(sessionId: string, turn: number): TurnState {
    const existing = this.turns.get(sessionId);
    if (existing?.turn === turn) return existing;
    const state: TurnState = {
      turn,
      required: this.getMode(sessionId) === "required",
      disabled: this.isOff(sessionId),
      webSearchCompleted: false,
      webSearchSucceeded: false,
      webFetchCompleted: false,
      webFetchSucceeded: false,
      correctionCount: 0,
    };
    this.turns.set(sessionId, state);
    return state;
  }

  /**
   * Record that a web_search call COMPLETED. Completion (even a total provider
   * failure) satisfies "must research first"; success additionally records that
   * fresh web data was available.
   */
  markSearchResult(sessionId: string, succeeded: boolean): void {
    const state = this.turns.get(sessionId);
    if (!state) return;
    state.webSearchCompleted = true;
    state.webSearchSucceeded ||= succeeded;
  }

  /**
   * Record that a web_fetch call COMPLETED. A fetch also satisfies the
   * "must research first" requirement — a user-supplied URL is a valid
   * research action and must not be gated behind a pointless search.
   */
  markFetchResult(sessionId: string, succeeded: boolean): void {
    const state = this.turns.get(sessionId);
    if (!state) return;
    state.webFetchCompleted = true;
    state.webFetchSucceeded ||= succeeded;
  }

  getTurn(sessionId: string): TurnState | undefined {
    return this.turns.get(sessionId);
  }

  /** Drop every state for a disposed agent/session. */
  clear(sessionId: string): void {
    this.modes.delete(sessionId);
    this.turns.delete(sessionId);
  }

  view(sessionId: string): SearchModeView {
    return { mode: this.getMode(sessionId), available: this.available() };
  }
}

/** Deps for wiring the runtime into the host context. */
export interface SearchModeRuntimeDeps {
  /** True when a usable search provider exists (from the plugin's provider). */
  searchAvailable: () => boolean;
}

/**
 * The UserMessages the runtime injects. Constructed with the OFFICIAL
 * `@deepseek-ai/dsh-llm` `createUserMessage` ({ content, source }) — never an
 * ad-hoc shape. THREE messages exist:
 *  - required(): the one-shot step-1 policy snapshot.
 *  - disabled(): the one-shot step-1 "web search is OFF" notice.
 *  - correction(): the one-shot turn-stopping steer (form: "notice").
 * Later-step reminder/grounding/failure re-injection is intentionally gone:
 * tool results already become the freshest context of the next model request.
 */
export interface SearchModeMessages {
  /** Step 1 (once per turn): the compact research policy. */
  required(): unknown;
  /** Step 1 (once per turn): search is allowed on demand (default mode). */
  auto(): unknown;
  /** Step 1 (once per turn): web search is switched off for this session. */
  disabled(): unknown;
  /** turn-stopping steer (one-shot notice). */
  correction(): unknown;
}

/** One-shot notice injected on step 1 of an `off` turn. */
export const SEARCH_DISABLED_TEXT =
  "Web search is switched OFF for this session. Do not call web_search or web_fetch; answer from the context you already have. If a question truly requires fresh web data, say what could not be verified.";

/**
 * One-shot policy injected on step 1 of an `auto` turn.
 *
 * Auto used to inject NOTHING, and the observed result was that the model never
 * reached for the tools: DSH's own tool-web guidance only covers how to treat a
 * result once you have one, not when to search. One sentence of criterion is
 * enough — and it stays a permission, not a requirement.
 */
export const SEARCH_AUTO_TEXT =
  "Web search is available but not required. Call web_search (or web_fetch for a specific URL) when the answer needs current, external, or verifiable information; otherwise answer directly from the context you already have.";

/**
 * Build the injected messages with the official `createUserMessage`
 * ({ content, source }). Extracted so tests can assert the exact wire shape
 * without booting the host.
 * @param createUserMessage - the official `@deepseek-ai/dsh-llm` factory.
 * @param platformsEnabled - live predicate for the platform-routing lines. Read
 *   on every `required()` call so toggling a platform source in settings takes
 *   effect on the NEXT turn without re-wiring the runtime. Omitted keeps the
 *   full text.
 */
export function createSearchModeMessages(
  createUserMessage: (input: unknown) => unknown,
  platformsEnabled?: () => boolean,
): SearchModeMessages {
  const snapshot = (text: string, section: string) =>
    createUserMessage({
      content: [{ type: "text", text }],
      source: {
        kind: "plugin:dsh-web-tools",
        plugin: "dsh-web-tools",
        form: "snapshot",
        sections: [{ name: section, text }],
      },
    });
  const policyText = () => {
    let enabled = true;
    if (platformsEnabled !== undefined) {
      try {
        enabled = platformsEnabled() !== false;
      } catch {
        enabled = true;
      }
    }
    return requiredSearchText(enabled);
  };
  return {
    required: () => snapshot(policyText(), "web-search-mode"),
    auto: () => snapshot(SEARCH_AUTO_TEXT, "web-search-mode"),
    disabled: () =>
      createUserMessage({
        content: [{ type: "text", text: SEARCH_DISABLED_TEXT }],
        source: {
          kind: "plugin:dsh-web-tools",
          plugin: "dsh-web-tools",
          form: "notice",
          summary: "Web Search disabled",
        },
      }),
    correction: () =>
      createUserMessage({
        content: [{ type: "text", text: REQUIRED_SEARCH_CORRECTION_TEXT }],
        source: {
          kind: "plugin:dsh-web-tools",
          plugin: "dsh-web-tools",
          form: "notice",
          summary: "Web Search required",
        },
      }),
  };
}

/**
 * Decide which pre-step Search Mode message (if any) to inject for one step.
 * Pure and one-shot: ONLY step 1 injects — the research policy (required
 * turns), the optional-use criterion (auto turns), or the "switched off" notice
 * (off turns). Later steps inject NOTHING: the web tool result(s) are the
 * freshest context, and enforcement happens at the tool gate, not by
 * re-reminding the model every step.
 * @returns undefined (no injection) outside step 1 or without a turn state.
 */
export function searchModeStepMessage(
  state: TurnState | undefined,
  step: number,
  messages: SearchModeMessages,
): unknown | undefined {
  if (!state) return undefined;
  if (step !== 1) return undefined;
  if (state.disabled) return messages.disabled();
  if (state.required) return messages.required();
  return messages.auto();
}

/** An agent-scoped context that can subscribe to its own pre-step result. */
interface AgentScopedCtx {
  on(event: string, listener: (...args: any[]) => unknown, options?: unknown): () => void;
  effect(fn: () => void | (() => void), label?: string): void;
  /** Per-scope tool surface (may be absent on older hosts). */
  tools?: {
    restrict?(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void;
    guard?(guard: (execution: { name: string }) => string | undefined): () => void;
  };
}

/** The two model-facing web tools this plugin owns the policy for. */
export const WEB_TOOL_NAMES: readonly string[] = ["web_search", "web_fetch"];

/** Denial reason shown to the model when it calls a web tool while OFF. */
export const WEB_DISABLED_DENIAL =
  "Web search is switched OFF for this session, so this tool call was denied. Answer from the existing context and state what could not be verified.";
interface ScopedAgent {
  id: string;
  ctx: AgentScopedCtx;
  steer(input: unknown): void;
  cancel(cause: unknown): void;
}

/**
 * Wire the Search Mode runtime into a host context. All agent-scoped listeners
 * register per created agent (the scope-filtered dispatch seam), and every
 * contribution is effect-scoped so stop/update/undefine removes it cleanly.
 * @param messages - pre-built official UserMessage factories ({ content, source }).
 */
export function installSearchModeRuntime(
  ctx: WebToolsContext,
  _deps: SearchModeRuntimeDeps,
  runtime: SearchModeRuntime,
  messages: SearchModeMessages,
) {
  const onCreated = ctx.on("agent/created", (payload: { agent: ScopedAgent }) => {
    const agent = payload.agent;
    // Register this agent's listeners inside its own scope so scope-filtered
    // dispatch reaches them; cleaning up when the agent scope unwinds.
    return agent.ctx.effect(() => {
      // ---- layer 1: hide the web tools from this agent's tool list ---------
      // Scoped, so other sessions keep their tools. Applied at turn start and
      // lifted as soon as the mode leaves `off`.
      let liftRestriction: (() => void) | undefined;
      const syncRestriction = () => {
        const off = runtime.isOff(agent.id);
        if (off && liftRestriction === undefined) {
          liftRestriction = agent.ctx.tools?.restrict?.({ deny: [...WEB_TOOL_NAMES] });
        } else if (!off && liftRestriction !== undefined) {
          liftRestriction();
          liftRestriction = undefined;
        }
      };
      // ---- layer 2: monotonic gate -----------------------------------------
      // Model inertia can still emit a call from history after a toggle; the
      // guard denies it before the body runs and cannot be re-allowed by a
      // later listener.
      const stopGuard = agent.ctx.tools?.guard?.((execution) =>
        runtime.isOff(agent.id) && WEB_TOOL_NAMES.includes(execution.name) ? WEB_DISABLED_DENIAL : undefined,
      );

      const stopPreStep = agent.ctx.on(
        "agent/pre-step",
        async (payload: { turn: number; step: number; signal?: AbortSignal }, next: () => Promise<unknown>) => {
          const decision = await next();
          if (!decision || (decision as { kind?: string }).kind === "reject") return decision;
          if (payload.signal?.aborted) return decision;
          const state = runtime.beginTurn(agent.id, payload.turn);
          syncRestriction();
          const inject = searchModeStepMessage(state, payload.step, messages);
          if (!inject) return decision;
          const entered = decision as { kind: "enter"; messages: unknown[] };
          // Prepend so the Search Mode policy sits before the user's direct
          // message (the model's last user-role input remains the user query).
          return {
            kind: "enter",
            messages: [inject, ...(entered.messages ?? [])],
          };
        },
      );

      const stopResult = agent.ctx.on(
        "tools/result",
        (exec: { name?: string; agent?: { id: string } | null }, result: { isError?: boolean }) => {
          if (!exec.agent?.id) return;
          const succeeded = result?.isError === false;
          if (exec?.name === "web_search") runtime.markSearchResult(exec.agent.id, succeeded);
          else if (exec?.name === "web_fetch") runtime.markFetchResult(exec.agent.id, succeeded);
        },
      );

      const stopStopping = agent.ctx.on(
        "agent/turn-stopping",
        (payload: { turn: number; signal?: AbortSignal }) => {
          if (payload.signal?.aborted) return;
          const state = runtime.getTurn(agent.id);
          if (!state?.required || webResearchCompleted(state)) return;
          if (state.correctionCount === 0) {
            state.correctionCount += 1;
            agent.steer(messages.correction());
            return;
          }
          agent.cancel({ kind: "hook", reason: "required web research was not completed" });
        },
      );

      return () => {
        stopPreStep?.();
        stopResult?.();
        stopStopping?.();
        stopGuard?.();
        if (liftRestriction !== undefined) {
          liftRestriction();
          liftRestriction = undefined;
        }
        runtime.clear(agent.id);
      };
    }, "dsh-web-tools: search-mode agent listeners");
  });

  // ---- /search slash command (toggle, same Host state) ------
  const offCommands = registerSearchCommands(ctx, runtime);
  return () => {
    onCreated?.();
    offCommands?.();
  };
}

/** Register the slash command, toggling the SAME mode. */
export function registerSearchCommands(
  ctx: WebToolsContext,
  runtime: SearchModeRuntime,
): (() => void) | undefined {
  const commands = ctx.commands;
  if (!commands?.register) return undefined;
  const off: Array<() => void> = [];
  const make = (name: string): WebToolsCommandDefinition => ({
    name,
    description: "开启或关闭联网搜索",
    handler: (invocation: WebToolsCommandInvocation) => toggleCommandHandler(runtime, invocation),
  });
  const a = commands.register(make("search"));
  off.push(a);
  return () => {
    for (const d of off) d();
  };
}

function toggleCommandHandler(
  runtime: SearchModeRuntime,
  invocation: WebToolsCommandInvocation,
): WebToolsCommandResult {
  const id = String(invocation.agent?.id ?? "");
  if (!id) return { kind: "error", text: "no session" };
  const next = nextSearchMode(runtime.getMode(id));
  runtime.setMode(id, next);
  const text =
    next === "required"
      ? "联网搜索已开启（每轮强制搜索）"
      : next === "off"
        ? "联网搜索已关闭（不提供联网工具，Agent 不能搜索）"
        : "联网搜索已恢复为自动（Agent 自行判断是否需要搜索）";
  return { kind: "success", text };
}
