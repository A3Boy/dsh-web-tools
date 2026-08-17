/** The injected "you must search" instruction the model sees on step 1. */
export const REQUIRED_SEARCH_TEXT = [
    "Web Search mode is enabled for this turn.",
    "",
    "Before giving a substantive answer, complete at least one web_search call.",
    "Use web_fetch afterward when useful.",
    "",
    "If web_search fails, do not answer the factual question from memory.",
    "Tell the user that web search could not be completed.",
].join("\n");
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
    modes = new Map();
    turns = new Map();
    searchAvailable;
    constructor(searchAvailable = () => true) {
        this.searchAvailable = searchAvailable;
    }
    getMode(sessionId) {
        return this.modes.get(sessionId) ?? "auto";
    }
    setMode(sessionId, mode) {
        if (mode === "auto")
            this.modes.delete(sessionId);
        else
            this.modes.set(sessionId, mode);
    }
    /** Whether a usable search provider currently exists (drives `available`). */
    available() {
        try {
            return this.searchAvailable() === true;
        }
        catch {
            return true;
        }
    }
    /**
     * Begin (or re-read) a turn. The `required` flag is frozen when a NEW turn
     * begins; mid-turn mode flips only affect the NEXT turn (no race).
     */
    beginTurn(sessionId, turn) {
        const existing = this.turns.get(sessionId);
        if (existing?.turn === turn)
            return existing;
        const state = {
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
    markSearchResult(sessionId, succeeded) {
        const state = this.turns.get(sessionId);
        if (!state)
            return;
        state.webSearchCompleted = true;
        state.webSearchSucceeded ||= succeeded;
    }
    getTurn(sessionId) {
        return this.turns.get(sessionId);
    }
    /** Drop every state for a disposed agent/session. */
    clear(sessionId) {
        this.modes.delete(sessionId);
        this.turns.delete(sessionId);
    }
    view(sessionId) {
        return { mode: this.getMode(sessionId), available: this.available() };
    }
}
/**
 * Wire the Search Mode runtime into a host context. All agent-scoped listeners
 * register per created agent (the scope-filtered dispatch seam), and every
 * contribution is effect-scoped so stop/update/undefine removes it cleanly.
 * @param deps.createUserMessage - official `@deepseek-ai/dsh-llm` factory.
 */
export function installSearchModeRuntime(ctx, deps, runtime, createUserMessage) {
    const onCreated = ctx.on("agent/created", (payload) => {
        const agent = payload.agent;
        // Register this agent's listeners inside its own scope so scope-filtered
        // dispatch reaches them; cleaning up when the agent scope unwinds.
        return agent.ctx.effect(() => {
            const stopPreStep = agent.ctx.on("agent/pre-step", async (payload, next) => {
                const decision = await next();
                if (!decision || decision.kind === "reject")
                    return decision;
                if (payload.signal?.aborted)
                    return decision;
                const state = runtime.beginTurn(agent.id, payload.turn);
                if (!state.required || payload.step !== 1)
                    return decision;
                const entered = decision;
                return {
                    kind: "enter",
                    messages: [...(entered.messages ?? []), createUserMessage({ required: true })],
                };
            });
            const stopResult = agent.ctx.on("tools/result", (exec, result) => {
                if (exec?.name !== "web_search")
                    return;
                if (!exec.agent?.id)
                    return;
                runtime.markSearchResult(exec.agent.id, result?.isError === false);
            });
            const stopStopping = agent.ctx.on("agent/turn-stopping", (payload) => {
                if (payload.signal?.aborted)
                    return;
                const state = runtime.getTurn(agent.id);
                if (!state?.required || state.webSearchCompleted)
                    return;
                if (state.correctionCount === 0) {
                    state.correctionCount += 1;
                    agent.steer(createUserMessage({ correction: REQUIRED_SEARCH_CORRECTION_TEXT }));
                    return;
                }
                agent.cancel({ kind: "hook", reason: "required web search was not completed" });
            });
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
export function registerSearchCommands(ctx, runtime) {
    const commands = ctx.commands;
    if (!commands?.register)
        return undefined;
    const off = [];
    const make = (name) => ({
        name,
        description: "开启或关闭联网搜索",
        handler: (invocation) => toggleCommandHandler(runtime, invocation),
    });
    const a = commands.register(make("search"));
    off.push(a);
    return () => {
        for (const d of off)
            d();
    };
}
function toggleCommandHandler(runtime, invocation) {
    const id = String(invocation.agent?.id ?? "");
    if (!id)
        return { kind: "error", text: "no session" };
    const next = runtime.getMode(id) === "required" ? "auto" : "required";
    runtime.setMode(id, next);
    return {
        kind: "success",
        text: next === "required" ? "联网搜索已开启（本轮起每轮先搜索）" : "联网搜索已关闭（回到自动判断）",
    };
}
