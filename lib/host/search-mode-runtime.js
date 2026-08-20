/** Whether the turn has completed ANY web research (search OR fetch). */
export function webResearchCompleted(state) {
    return state.webSearchCompleted || state.webFetchCompleted;
}
/** The injected "you must research" instruction the model sees on step 1.
 * A COMPACT web-research policy: one hard requirement (complete an appropriate
 * web tool), concrete routing (URL → web_fetch, otherwise web_search), one
 * uncertainty at a time (or multiple in parallel via queries array), official
 * sources, and honest disclosure when the web cannot answer. */
export const REQUIRED_SEARCH_TEXT = [
    "Web Research mode is enabled for this turn.",
    "",
    "Before giving a substantive answer, complete at least one appropriate web tool call.",
    "",
    "If the user provides a relevant HTTP(S) URL or asks about a specific page, repository, or document, use web_fetch on that URL directly. Otherwise, use web_search to discover relevant sources.",
    "",
    "Search one concrete uncertainty at a time, or submit multiple queries in the queries array for parallel search across different angles. For named projects, APIs, or providers, include the exact name and relevant endpoint, error code, or code symbol. Prefer official documentation and repositories.",
    "",
    "If the first search returns only generic or irrelevant sources, refine the query or submit multiple query variations and search again.",
    "",
    "Cite the relevant URLs as markdown links in your answer.",
    "",
    "If web research fails or finds nothing useful, say what could not be verified; you may still continue from the user's code or provided context, but do not present unverified current facts as web-verified.",
].join("\n");
/** Short re-injection for later steps BEFORE the research has completed. */
export const REQUIRED_SEARCH_REMINDER = "WEB RESEARCH MODE is active. Complete a web_search or web_fetch call before finalizing.";
/** Re-injection for later steps AFTER research completed (keep using the
 * fresh results as grounding instead of drifting into memory). */
export const REQUIRED_SEARCH_GROUNDING = "WEB RESEARCH MODE remains active. Use the fresh web results as evidence; fetch or refine the search if needed. For coding decisions, keep official sources and relevant OSS/community evidence in view.";
/** One-shot steer used when the model tries to end without researching. */
export const REQUIRED_SEARCH_CORRECTION_TEXT = [
    "Web Research is required for this turn and has not been completed yet.",
    "",
    "Call web_search (to discover sources) or web_fetch (for a specific URL) now before completing the turn.",
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
    markSearchResult(sessionId, succeeded) {
        const state = this.turns.get(sessionId);
        if (!state)
            return;
        state.webSearchCompleted = true;
        state.webSearchSucceeded ||= succeeded;
    }
    /**
     * Record that a web_fetch call COMPLETED. A fetch also satisfies the
     * "must research first" requirement — a user-supplied URL is a valid
     * research action and must not be gated behind a pointless search.
     */
    markFetchResult(sessionId, succeeded) {
        const state = this.turns.get(sessionId);
        if (!state)
            return;
        state.webFetchCompleted = true;
        state.webFetchSucceeded ||= succeeded;
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
 * Build the injected messages with the official `createUserMessage`
 * ({ content, source }). Extracted so tests can assert the exact wire shape
 * without booting the host.
 * @param createUserMessage - the official `@deepseek-ai/dsh-llm` factory.
 */
export function createSearchModeMessages(createUserMessage) {
    const snapshot = (text, section) => createUserMessage({
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
        correction: () => createUserMessage({
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
 *  - step 1                        -> required() (compact research policy)
 *  - step > 1, not yet researched   -> reminder()
 *  - step > 1, research completed   -> grounding()
 * Returns undefined (no injection) when the turn is not in required mode.
 * "Researched" = web_search OR web_fetch completed.
 */
export function searchModeStepMessage(state, step, messages) {
    if (!state?.required)
        return undefined;
    if (step === 1)
        return messages.required();
    if (!webResearchCompleted(state))
        return messages.reminder();
    return messages.grounding();
}
/**
 * Wire the Search Mode runtime into a host context. All agent-scoped listeners
 * register per created agent (the scope-filtered dispatch seam), and every
 * contribution is effect-scoped so stop/update/undefine removes it cleanly.
 * @param messages - pre-built official UserMessage factories ({ content, source }).
 */
export function installSearchModeRuntime(ctx, deps, runtime, messages) {
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
                const inject = searchModeStepMessage(state, payload.step, messages);
                if (!inject)
                    return decision;
                const entered = decision;
                // Append LAST so the reminder sits closest to the current reasoning step.
                return {
                    kind: "enter",
                    messages: [...(entered.messages ?? []), inject],
                };
            });
            const stopResult = agent.ctx.on("tools/result", (exec, result) => {
                if (!exec.agent?.id)
                    return;
                const succeeded = result?.isError === false;
                if (exec?.name === "web_search")
                    runtime.markSearchResult(exec.agent.id, succeeded);
                else if (exec?.name === "web_fetch")
                    runtime.markFetchResult(exec.agent.id, succeeded);
            });
            const stopStopping = agent.ctx.on("agent/turn-stopping", (payload) => {
                if (payload.signal?.aborted)
                    return;
                const state = runtime.getTurn(agent.id);
                if (!state?.required || webResearchCompleted(state))
                    return;
                if (state.correctionCount === 0) {
                    state.correctionCount += 1;
                    agent.steer(messages.correction());
                    return;
                }
                agent.cancel({ kind: "hook", reason: "required web research was not completed" });
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
