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
    /** True when this turn runs with web search switched OFF (tools withheld). */
    disabled: boolean;
    webSearchCompleted: boolean;
    webSearchSucceeded: boolean;
    webFetchCompleted: boolean;
    webFetchSucceeded: boolean;
    correctionCount: number;
}
/** Whether the turn has completed ANY web research (search OR fetch). */
export declare function webResearchCompleted(state: TurnState): boolean;
/** The injected "you must research" instruction the model sees on step 1.
 * Compact: one hard requirement (complete an appropriate web tool), concrete
 * routing (URL → web_fetch, otherwise web_search), honest disclosure on
 * failure. General query-quality guidance belongs to DSH's own tool-web
 * prompt, not this per-turn policy. This default DOES advertise platform
 * routing; use {@link requiredSearchText} to decide per live config. */
export declare const REQUIRED_SEARCH_TEXT: string;
/** Same policy with the platform-routing lines dropped (both platforms off). */
export declare const REQUIRED_SEARCH_TEXT_NO_PLATFORMS: string;
/**
 * Pick the policy text for the live configuration.
 * @param platformsEnabled - true when at least one platform source may serve a
 *   routed query. Omitted (or true) keeps the full text.
 */
export declare function requiredSearchText(platformsEnabled?: boolean): string;
/** One-shot steer used when the model tries to end without researching. */
export declare const REQUIRED_SEARCH_CORRECTION_TEXT = "Web Search is required for this turn. Call web_search or web_fetch before finalizing.";
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
    /** True when this session has web search switched OFF. */
    isOff(sessionId: string): boolean;
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
    /** Step 1 (once per turn): web search is switched off for this session. */
    disabled(): unknown;
    /** turn-stopping steer (one-shot notice). */
    correction(): unknown;
}
/** One-shot notice injected on step 1 of an `off` turn. */
export declare const SEARCH_DISABLED_TEXT = "Web search is switched OFF for this session. Do not call web_search or web_fetch; answer from the context you already have. If a question truly requires fresh web data, say what could not be verified.";
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
export declare function createSearchModeMessages(createUserMessage: (input: unknown) => unknown, platformsEnabled?: () => boolean): SearchModeMessages;
/**
 * Decide which pre-step Search Mode message (if any) to inject for one step.
 * Pure and one-shot: ONLY step 1 injects — either the research policy (required
 * turns) or the "switched off" notice (off turns). Later steps inject NOTHING:
 * the web tool result(s) are the freshest context, and enforcement happens at
 * the tool gate, not by re-reminding the model every step.
 * @returns undefined (no injection) unless step 1 of a required/off turn.
 */
export declare function searchModeStepMessage(state: TurnState | undefined, step: number, messages: SearchModeMessages): unknown | undefined;
/** The two model-facing web tools this plugin owns the policy for. */
export declare const WEB_TOOL_NAMES: readonly string[];
/** Denial reason shown to the model when it calls a web tool while OFF. */
export declare const WEB_DISABLED_DENIAL = "Web search is switched OFF for this session, so this tool call was denied. Answer from the existing context and state what could not be verified.";
/**
 * Wire the Search Mode runtime into a host context. All agent-scoped listeners
 * register per created agent (the scope-filtered dispatch seam), and every
 * contribution is effect-scoped so stop/update/undefine removes it cleanly.
 * @param messages - pre-built official UserMessage factories ({ content, source }).
 */
export declare function installSearchModeRuntime(ctx: WebToolsContext, _deps: SearchModeRuntimeDeps, runtime: SearchModeRuntime, messages: SearchModeMessages): () => void;
/** Register the slash command, toggling the SAME mode. */
export declare function registerSearchCommands(ctx: WebToolsContext, runtime: SearchModeRuntime): (() => void) | undefined;
