/**
 * dsh-web-tools — Tavily provider adapter.
 * Uses Tavily's REST API (POST https://api.tavily.com/search and /extract).
 * @module
 */
import { type ProviderAdapter } from "./types.ts";
export declare const TAVILY_META: {
    readonly name: "tavily";
    readonly label: "Tavily";
    readonly description: "AI-optimized web search";
    readonly credSuffix: "TAVILY";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
export declare const TavilyProvider: ProviderAdapter;
