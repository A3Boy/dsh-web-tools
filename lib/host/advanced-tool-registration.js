/**
 * dsh-web-tools — Provider-native advanced tool registrations.
 *
 * Exposes provider-specific advanced search tools via defineTool() from
 * `@deepseek-ai/dsh-tools`.
 *
 * Invariants:
 * 1. Each tool's execute() enforces an active-provider guard: if the tool's
 *    provider is not currently active, it returns a structured provider_transition
 *    outcome instead of firing against the provider.
 * 2. Advanced tools do NOT call ctx.web.search() — they route directly
 *    through AdvancedSearchRuntime.
 * 3. Results are returned as structured LLM-readable text with full evidence
 *    (highlights, titles, URLs, published dates, relevance scores).
 * @module
 */
import { defineTool } from "@deepseek-ai/dsh-tools";
/**
 * Build the `web_search_exa` ToolDefinition backed by the given runtime.
 *
 * The tool enforces the active-provider execution guard: if Exa is not
 * the active advanced provider, the call settles as a provider_transition
 * outcome so the model can redirect to the active provider.
 */
export function createExaAdvancedTool(runtime) {
    return defineTool({
        name: "web_search_exa",
        description: "Advanced neural search powered by Exa. Use when you need deep search, " +
            "category filtering (company, people, research paper, news, personal site, " +
            "financial report), published-date ranges, domain inclusions/exclusions, " +
            "query-relevant highlights (recommended over full text for token efficiency), " +
            "or multi-query deep search.",
        parameters: {
            query: {
                type: "string",
                description: "The primary search query or natural language description of what to find.",
                required: true,
            },
            type: {
                type: "string",
                enum: ["auto", "instant", "fast", "deep-lite", "deep", "deep-reasoning"],
                description: "Search mode. 'auto' (default) lets Exa choose. 'instant' (<250ms, low cost). " +
                    "'fast' (1-2s). 'deep-lite' (~7s, balanced). 'deep' (~20s, comprehensive multi-query). " +
                    "'deep-reasoning' (~40s, multi-hop research). 'additional_queries' is only valid with deep variants.",
            },
            category: {
                type: "string",
                enum: ["company", "people", "research paper", "news", "personal site", "financial report"],
                description: "Target content category. Narrows results to specific data types. " +
                    "Note: 'company' and 'people' categories do not support published-date filters or exclude_domains.",
            },
            num_results: {
                type: "number",
                description: "Maximum number of results to return (1-100, default 10).",
            },
            include_domains: {
                type: "array",
                items: { type: "string" },
                description: "Only return results from these domains/subdomains (e.g. ['arxiv.org', 'github.com']).",
            },
            exclude_domains: {
                type: "array",
                items: { type: "string" },
                description: "Exclude results from these domains. Not allowed with category=company or category=people.",
            },
            start_published_date: {
                type: "string",
                description: "Only results published on or after this ISO-8601 date (YYYY-MM-DD or full ISO).",
            },
            end_published_date: {
                type: "string",
                description: "Only results published on or before this ISO-8601 date (YYYY-MM-DD or full ISO).",
            },
            additional_queries: {
                type: "array",
                items: { type: "string" },
                description: "Additional query variations for multi-query deep search. ONLY valid when type is deep-lite, deep, or deep-reasoning.",
            },
            highlights: {
                type: "boolean",
                description: "Return query-relevant extractive highlights instead of full text (default true, highly recommended).",
            },
            max_age_hours: {
                type: "number",
                description: "Only return cached content crawled within the last N hours.",
            },
        },
        output: {
            schema: { type: "json" },
            render(_args, value) {
                return [
                    {
                        type: "text",
                        text: formatOutcomeText(value),
                    },
                ];
            },
            presentationMeta(_args, value) {
                return {
                    kind: "advanced-search",
                    outcome: value,
                };
            },
        },
        async execute(args, exec) {
            // 1. Active-provider execution guard: prevent stale tool calls when
            // the active provider has transitioned away from Exa.
            const active = runtime.resolveActiveProvider();
            if (active !== "exa") {
                return runtime.buildStaleProviderTransition("exa", active);
            }
            // 2. Dispatch through AdvancedSearchRuntime (never calls ctx.web.search)
            const outcome = await runtime.search("exa", args, exec.signal);
            return outcome;
        },
    });
}
/**
 * Format an AdvancedSearchOutcome into structured, readable text for the LLM.
 */
export function formatOutcomeText(outcome) {
    switch (outcome.kind) {
        case "success": {
            if (outcome.sources.length === 0) {
                return `[Exa Search — 0 results found]\nNo matching sources found for the query. Try broadening search terms or relaxing domain/date filters.`;
            }
            const lines = [
                `[Exa Search — ${outcome.sources.length} results${outcome.truncated ? " (truncated)" : ""}]`,
                "",
            ];
            outcome.sources.forEach((s, i) => {
                lines.push(`### [${i + 1}] ${s.title ?? "Untitled"}`);
                lines.push(`URL: ${s.url}`);
                if (s.publishedAt)
                    lines.push(`Published: ${s.publishedAt}`);
                if (s.author)
                    lines.push(`Author: ${s.author}`);
                if (s.score !== undefined)
                    lines.push(`Score: ${s.score.toFixed(3)}`);
                if (s.highlights && s.highlights.length > 0) {
                    lines.push("Highlights:");
                    for (const h of s.highlights) {
                        lines.push(`> ${h}`);
                    }
                }
                else if (s.snippet) {
                    lines.push(`Snippet: ${s.snippet}`);
                }
                lines.push("");
            });
            return lines.join("\n").trimEnd();
        }
        case "repair_required": {
            const f = outcome.failure;
            const lines = [
                `[Exa Search Parameter Error: ${f.code}]`,
                f.message,
            ];
            if (f.fieldErrors && f.fieldErrors.length > 0) {
                lines.push("", "Field errors:");
                for (const fe of f.fieldErrors) {
                    lines.push(`- ${fe.path}: ${fe.message}`);
                }
            }
            lines.push("", "Please correct the parameters above and retry.");
            return lines.join("\n");
        }
        case "provider_transition": {
            const t = outcome.transition;
            const nextActionDesc = t.nextTool && t.nextTool !== "web_search"
                ? `Call tool '${t.nextTool}' with provider-native arguments.`
                : "Use basic 'web_search' tool.";
            return (`[Search Provider Transition]\n` +
                `Active provider changed from '${t.from}' to '${t.to}'.\n` +
                `Reason: ${t.reason}\n` +
                `Next action: ${nextActionDesc}`);
        }
        case "configuration_error": {
            const f = outcome.failure;
            return (`[Exa Configuration Error: ${f.code}]\n` +
                `${f.message}\n` +
                `Configure an Exa API key in settings or switch to an available provider.`);
        }
        case "provider_exhausted": {
            const details = outcome.attempts
                .map((a) => `- ${a.provider}: ${a.outcome}`)
                .join("\n");
            return (`[Search Providers Exhausted]\n` +
                `No advanced or fallback providers are currently available.\n` +
                `Attempts:\n${details}`);
        }
    }
}
