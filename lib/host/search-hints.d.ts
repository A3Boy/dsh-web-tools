/**
 * dsh-web-tools — SearchHints semantic extraction layer.
 *
 * Deterministic, zero-LLM lightweight semantic extraction from user queries.
 * Extracts high-confidence hints:
 *  - topic: "code" | "news" | "finance" | "research" | "general"
 *  - freshness: preset ("day" | "week" | "month" | "year"), after_date (YYYY-MM-DD), before_date
 *  - domains: include (hard filter, e.g. site:github.com), exclude (-site:), prefer (soft preference, e.g. "官方文档/official docs")
 *  - locale: language, country
 *  - cleanQuery: query with syntax operators (site:, -site:) stripped for pure keyword matching
 *
 * Principle: ONLY explicit constraints become hard filters (include/exclude domains).
 * Soft preferences (preferDomains / official sources) steer the objective rather than killing recall.
 * @module
 */
export type SearchTopic = "general" | "news" | "finance" | "code" | "research";
export type FreshnessPreset = "day" | "week" | "month" | "year";
export interface FreshnessHint {
    preset?: FreshnessPreset;
    /** RFC 3339 date string YYYY-MM-DD */
    after?: string;
    /** RFC 3339 date string YYYY-MM-DD */
    before?: string;
}
export interface DomainHints {
    /** Hard filter: results MUST come from these domains (e.g. from site:foo.com) */
    include?: string[];
    /** Hard filter: results MUST NOT come from these domains (e.g. from -site:bar.com) */
    exclude?: string[];
    /** Soft preference: prefer/boost these domains or official primary documentation */
    prefer?: string[];
    /** Whether the query explicitly preferred official/primary documentation */
    preferOfficial?: boolean;
}
export interface LocaleHint {
    language?: string;
    country?: string;
}
export interface SearchHints {
    topic?: SearchTopic;
    freshness?: FreshnessHint;
    domains?: DomainHints;
    locale?: LocaleHint;
    /** Cleaned query string with explicit operators (e.g. site:) removed */
    cleanQuery: string;
    /** The original unmodified query */
    rawQuery: string;
}
/**
 * Format a Date object to YYYY-MM-DD
 */
export declare function formatDateYMD(d: Date): string;
/**
 * Calculate an after_date string from a preset relative to a reference date.
 */
export declare function calculateAfterDate(preset: FreshnessPreset, now?: Date): string;
/**
 * Extract structured SearchHints from a raw query.
 * Pure function: deterministic, fast, testable, zero side-effects.
 */
export declare function extractSearchHints(query: string, now?: Date): SearchHints;
