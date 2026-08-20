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
import { type ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { AdvancedSearchRuntime } from "./advanced-search-runtime.ts";
import type { AdvancedSearchOutcome } from "./advanced-search-types.ts";
/**
 * Build the `web_search_exa` ToolDefinition backed by the given runtime.
 *
 * The tool enforces the active-provider execution guard: if Exa is not
 * the active advanced provider, the call settles as a provider_transition
 * outcome so the model can redirect to the active provider.
 */
export declare function createExaAdvancedTool(runtime: AdvancedSearchRuntime): ToolDefinition;
/**
 * Format an AdvancedSearchOutcome into structured, readable text for the LLM.
 */
export declare function formatOutcomeText(outcome: AdvancedSearchOutcome): string;
