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
import type { WebToolsContext } from "./context-types.ts";
import type { SearchMode, SearchModeView } from "../shared/api-types.ts";
/** The two user-facing modes. */
export type { SearchMode };
/** Per-turn tracking (frozen per turn; mode flips only affect the next turn). */
export interface TurnState {
    turn: number;
    required: boolean;
    webSearchCompleted: boolean;
    webSearchSucceeded: boolean;
    webFetchCompleted: boolean;
    webFetchSucceeded: boolean;
    correctionCount: number;
}
/** Whether the turn has completed ANY web research (search OR fetch). */
export declare function webResearchCompleted(state: TurnState): boolean;
/** The injected "you must research" instruction the model sees on step 1.
 * A COMPACT web-research policy: one hard requirement (complete an appropriate
 * web tool), concrete routing (URL → web_fetch, otherwise web_search), one
 * uncertainty at a time (or multiple in parallel via queries array), official
 * sources, and honest disclosure when the web cannot answer. */
export declare const REQUIRED_SEARCH_TEXT: string;
/** Short re-injection for later steps BEFORE the research has completed. */
export declare const REQUIRED_SEARCH_REMINDER = "WEB RESEARCH MODE is active. Complete a web_search or web_fetch call before finalizing.";
/** Re-injection for later steps AFTER research completed (keep using the
 * fresh results as grounding instead of drifting into memory). */
export declare const REQUIRED_SEARCH_GROUNDING = "WEB RESEARCH MODE remains active. Use the fresh web results as evidence; fetch or refine the search if needed. For coding decisions, keep official sources and relevant OSS/community evidence in view.";
/** One-shot steer used when the model tries to end without researching. */
export declare const REQUIRED_SEARCH_CORRECTION_TEXT: string;
/**
 * Pure per-session state machine: one mode per session, one frozen flag per
 * turn. `auto` is the absence of an entry — clearing keeps the map tidy.
 */
export declare class SearchModeRuntime {
    private readonly modes;
    private readonly turns;
    private readonly searchAvailable;
    constructor(searchAvailable?: () => boolean);
    getMode(sessionId: string): SearchMode;
    setMode(sessionId: string, mode: SearchMode): void;
    /** Whether a usable search provider currently exists (drives `available`). */
    available(): boolean;
    /**
     * Begin (or re-read) a turn. The `required` flag is frozen when a NEW turn
     * begins; mid-turn mode flips only affect the NEXT turn (no race).
     */
    beginTurn(sessionId: string, turn: number): TurnState;
    /**
     * Record that a web_search call COMPLETED. Completion (even a total provider
     * failure) satisfies "must research first"; success additionally records that
     * fresh web data was available.
     */
    markSearchResult(sessionId: string, succeeded: boolean): void;
    /**
     * Record that a web_fetch call COMPLETED. A fetch also satisfies the
     * "must research first" requirement — a user-supplied URL is a valid
     * research action and must not be gated behind a pointless search.
     */
    markFetchResult(sessionId: string, succeeded: boolean): void;
    getTurn(sessionId: string): TurnState | undefined;
    /** Drop every state for a disposed agent/session. */
    clear(sessionId: string): void;
    view(sessionId: string): SearchModeView;
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
export declare function createSearchModeMessages(createUserMessage: (input: unknown) => unknown): SearchModeMessages;
/**
 * Decide which pre-step Search Mode message (if any) to append for one step.
 * Pure so the three-phase policy is unit-testable:
 *  - step 1                        -> required() (compact research policy)
 *  - step > 1, not yet researched   -> reminder()
 *  - step > 1, research completed   -> grounding()
 * Returns undefined (no injection) when the turn is not in required mode.
 * "Researched" = web_search OR web_fetch completed.
 */
export declare function searchModeStepMessage(state: TurnState | undefined, step: number, messages: SearchModeMessages): unknown | undefined;
/**
 * Wire the Search Mode runtime into a host context. All agent-scoped listeners
 * register per created agent (the scope-filtered dispatch seam), and every
 * contribution is effect-scoped so stop/update/undefine removes it cleanly.
 * @param messages - pre-built official UserMessage factories ({ content, source }).
 */
export declare function installSearchModeRuntime(ctx: WebToolsContext, deps: SearchModeRuntimeDeps, runtime: SearchModeRuntime, messages: SearchModeMessages): () => void;
/** Register the slash command, toggling the SAME mode. */
export declare function registerSearchCommands(ctx: WebToolsContext, runtime: SearchModeRuntime): (() => void) | undefined;
