/**
 * dsh-web-tools — "Web Search mode" per-session turn policy (Search Mode).
 *
 * The layer sits ABOVE the provider layer: providers only execute web_search;
 * this module decides whether a turn must complete a web_search call before it
 * may end. Everything is Host-owned so browser refresh / session switch /
 * relaunch cannot desync the button from the real policy.
 *
 * Deploy strategy follows the proven `dsh-at-file` pattern (agent-scoped event
 * listeners): every agent-scoped listener is registered on that agent's scope
 * context inside `agent/created`, so `@deepseek-ai/dsh-scope` dispatches only
 * the matching agent's events to it.
 *   - `agent/pre-step` (waterfall): freeze the per-turn flag and inject one
 *     plugin-source UserMessage (official `createUserMessage`) on step 1.
 *   - `tools/result` (emit): receipt that a web_search ran. Completion — even
 *     a total provider failure — counts as "tried"; that is the requirement.
 *   - `agent/turn-stopping` (serial): no web_search yet → `agent.steer()` once
 *     to continue; a second offense `agent.cancel()`s (no infinite loop).
 *
 * `SearchModeRuntime` is pure/framework-free so its state model is unit-testable.
 * @module
 */
import type { WebToolsContext, WebToolsCommandDefinition, WebToolsCommandInvocation, WebToolsCommandResult } from "./context-types.ts";
import type { SearchMode, SearchModeView } from "../shared/api-types.ts";

/** The two user-facing modes. */
export type { SearchMode };

/** Per-turn tracking (frozen per turn; mode flips only affect the next turn). */
export interface TurnState {
  turn: number;
  required: boolean;
  webSearchCompleted: boolean;
  webSearchSucceeded: boolean;
  correctionCount: number;
}

/** The injected "you must search" instruction the model sees on step 1.
 * A COMPACT research policy: keep the hard requirement short, still carry the
 * research-quality semantics (official sources, mature OSS / issue / PR,
 * citing sources), and let a failed search stop at honest disclosure. */
export const REQUIRED_SEARCH_TEXT = [
  "Web Search mode is enabled for this turn.",
  "",
  "Before answering, complete at least one web_search call; use web_fetch when the page beyond the snippet matters, and refine the query if the first search is insufficient or conflicting.",
  "",
  "Use web results as evidence: prefer primary/official sources for current, factual, API, or compatibility claims; for coding or architecture work also consult mature open-source implementations and relevant issue/PR/community discussions when they materially inform the solution, adapting rather than copying; distinguish sourced facts from your own inference.",
  "",
  "Cite relevant claims with inline markdown links and end with a short Sources / 参考来源 section for the key sources used (match the user's language).",
  "",
  "If web_search fails or finds no useful source, say what could not be verified; you may still continue from the user's code or provided context, but do not present unverified current facts as web-verified.",
].join("\n");

/** Short re-injection for later steps BEFORE the search has completed. */
export const REQUIRED_SEARCH_REMINDER =
  "WEB SEARCH MODE is active. Complete web_search before finalizing.";

/** Re-injection for later steps AFTER a search completed (keep using the
 * fresh results as grounding instead of drifting into memory). */
export const REQUIRED_SEARCH_GROUNDING =
  "WEB SEARCH MODE remains active. Use the fresh web results as evidence; fetch or refine the search if needed. For coding decisions, keep official sources and relevant OSS/community evidence in view.";

/** One-shot steer used when the model tries to end without searching. */
export const REQUIRED_SEARCH_CORRECTION_TEXT = [
  "Web Search is required for this turn and has not been completed yet.",
  "",
  "Call web_search now before completing the turn.",
].join("\n");

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
      webSearchCompleted: false,
      webSearchSucceeded: false,
      correctionCount: 0,
    };
    this.turns.set(sessionId, state);
    return state;
  }

  /**
   * Record that a web_search call COMPLETED. Completion (even a total provider
   * failure) satisfies "must search first"; success additionally records that
   * fresh web data was available.
   */
  markSearchResult(sessionId: string, succeeded: boolean): void {
    const state = this.turns.get(sessionId);
    if (!state) return;
    state.webSearchCompleted = true;
    state.webSearchSucceeded ||= succeeded;
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
 * ad-hoc shape. All three pre-step messages are `form: "snapshot"` plugin
 * sources; only `correction()` (the agent/turn-stopping steer) is a one-shot
 * `form: "notice"`.
 */
export interface SearchModeMessages {
  /** Step 1: the compact research policy. */
  required(): unknown;
  /** Later steps before the search completed: short reminder. */
  reminder(): unknown;
  /** Later steps after the search completed: keep using the results. */
  grounding(): unknown;
  /** turn-stopping steer (one-shot notice). */
  correction(): unknown;
}

/**
 * Build the injected messages with the official `createUserMessage`
 * ({ content, source }). Extracted so tests can assert the exact wire shape
 * without booting the host.
 * @param createUserMessage - the official `@deepseek-ai/dsh-llm` factory.
 */
export function createSearchModeMessages(
  createUserMessage: (input: unknown) => unknown,
): SearchModeMessages {
  const snapshot = (text: string, section: string) =>
    createUserMessage({
      content: [{ type: "text", text }],
      source: {
        kind: "plugin",
        plugin: "dsh-web-tools",
        form: "snapshot",
        sections: [{ name: section, text }],
      },
    });
  return {
    required: () => snapshot(REQUIRED_SEARCH_TEXT, "web-search-mode"),
    reminder: () => snapshot(REQUIRED_SEARCH_REMINDER, "web-search-mode"),
    grounding: () => snapshot(REQUIRED_SEARCH_GROUNDING, "web-search-mode"),
    correction: () =>
      createUserMessage({
        content: [{ type: "text", text: REQUIRED_SEARCH_CORRECTION_TEXT }],
        source: {
          kind: "plugin",
          plugin: "dsh-web-tools",
          form: "notice",
          summary: "Web Search required",
        },
      }),
  };
}

/**
 * Decide which pre-step Search Mode message (if any) to append for one step.
 * Pure so the three-phase policy is unit-testable:
 *  - step 1                    -> required() (compact research policy)
 *  - step > 1, not yet searched -> reminder()
 *  - step > 1, search completed -> grounding()
 * Returns undefined (no injection) when the turn is not in required mode.
 */
export function searchModeStepMessage(
  state: TurnState | undefined,
  step: number,
  messages: SearchModeMessages,
): unknown | undefined {
  if (!state?.required) return undefined;
  if (step === 1) return messages.required();
  if (!state.webSearchCompleted) return messages.reminder();
  return messages.grounding();
}

/** An agent-scoped context that can subscribe to its own pre-step result. */
interface AgentScopedCtx {
  on(event: string, listener: (...args: any[]) => unknown, options?: unknown): () => void;
  effect(fn: () => void | (() => void), label?: string): void;
}
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
  deps: SearchModeRuntimeDeps,
  runtime: SearchModeRuntime,
  messages: SearchModeMessages,
) {
  const onCreated = ctx.on("agent/created", (payload: { agent: ScopedAgent }) => {
    const agent = payload.agent;
    // Register this agent's listeners inside its own scope so scope-filtered
    // dispatch reaches them; cleaning up when the agent scope unwinds.
    return agent.ctx.effect(() => {
      const stopPreStep = agent.ctx.on(
        "agent/pre-step",
        async (payload: { turn: number; step: number; signal?: AbortSignal }, next: () => Promise<unknown>) => {
          const decision = await next();
          if (!decision || (decision as { kind?: string }).kind === "reject") return decision;
          if (payload.signal?.aborted) return decision;
          const state = runtime.beginTurn(agent.id, payload.turn);
          const inject = searchModeStepMessage(state, payload.step, messages);
          if (!inject) return decision;
          const entered = decision as { kind: "enter"; messages: unknown[] };
          // Append LAST so the reminder sits closest to the current reasoning step.
          return {
            kind: "enter",
            messages: [...(entered.messages ?? []), inject],
          };
        },
      );

      const stopResult = agent.ctx.on(
        "tools/result",
        (exec: { name?: string; agent?: { id: string } | null }, result: { isError?: boolean }) => {
          if (exec?.name !== "web_search") return;
          if (!exec.agent?.id) return;
          runtime.markSearchResult(exec.agent.id, result?.isError === false);
        },
      );

      const stopStopping = agent.ctx.on(
        "agent/turn-stopping",
        (payload: { turn: number; signal?: AbortSignal }) => {
          if (payload.signal?.aborted) return;
          const state = runtime.getTurn(agent.id);
          if (!state?.required || state.webSearchCompleted) return;
          if (state.correctionCount === 0) {
            state.correctionCount += 1;
            agent.steer(messages.correction());
            return;
          }
          agent.cancel({ kind: "hook", reason: "required web search was not completed" });
        },
      );

      return () => {
        stopPreStep?.();
        stopResult?.();
        stopStopping?.();
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
  const next = runtime.getMode(id) === "required" ? "auto" : "required";
  runtime.setMode(id, next);
  return {
    kind: "success",
    text: next === "required" ? "联网搜索已开启（本轮起每轮先搜索）" : "联网搜索已关闭（回到自动判断）",
  };
}
