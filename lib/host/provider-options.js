export const DEFAULT_EXA_OPTIONS = {
    searchType: "auto",
    maxAgeHours: 0, // 0 in type interface conceptually, but undefined in wire means omit
};
export const DEFAULT_TAVILY_OPTIONS = {
    searchDepth: "basic",
    chunksPerSource: 3,
    autoParameters: false,
};
export const DEFAULT_BRAVE_OPTIONS = {
    endpointPreference: "auto",
    contextThresholdMode: "balanced",
    contextTokenBudget: 8192,
};
export const DEFAULT_YOU_OPTIONS = {
    extractionMode: "highlights",
    fetchCrawlTimeoutSec: 10,
    fetchMaxAgeSec: 0,
};
export const DEFAULT_FIRECRAWL_OPTIONS = {
    fetchOnlyMainContent: true,
    fetchMaxAgeMs: 172800000,
};
export const DEFAULT_PARALLEL_OPTIONS = {
    mode: "advanced",
    maxCharsTotal: 25000, // NOT sent by default; only when user overrides (see buildProviderOptionView)
};
/** Validate options patch for a specific provider. Throws or returns sanitized options. */
export function sanitizeProviderOptions(provider, raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const out = {};
    switch (provider) {
        case "exa": {
            const validTypes = ["auto", "fast", "instant", "deep-lite", "deep", "deep-reasoning"];
            if (typeof raw.searchType === "string" && validTypes.includes(raw.searchType)) {
                out.searchType = raw.searchType;
            }
            if (typeof raw.maxAgeHours === "number" && (raw.maxAgeHours >= -1 && raw.maxAgeHours <= 8760)) {
                out.maxAgeHours = Math.round(raw.maxAgeHours);
            }
            break;
        }
        case "tavily": {
            const validDepths = ["basic", "advanced", "fast", "ultra-fast"];
            if (typeof raw.searchDepth === "string" && validDepths.includes(raw.searchDepth)) {
                out.searchDepth = raw.searchDepth;
            }
            if (typeof raw.chunksPerSource === "number" && [1, 2, 3].includes(raw.chunksPerSource)) {
                out.chunksPerSource = raw.chunksPerSource;
            }
            if (typeof raw.autoParameters === "boolean") {
                out.autoParameters = raw.autoParameters;
            }
            break;
        }
        case "brave": {
            const validEndpoints = ["auto", "llm-context", "web-search"];
            if (typeof raw.endpointPreference === "string" && validEndpoints.includes(raw.endpointPreference)) {
                out.endpointPreference = raw.endpointPreference;
            }
            const validThresholds = ["strict", "balanced", "lenient", "disabled"];
            if (typeof raw.contextThresholdMode === "string" && validThresholds.includes(raw.contextThresholdMode)) {
                out.contextThresholdMode = raw.contextThresholdMode;
            }
            if (typeof raw.contextTokenBudget === "number" && raw.contextTokenBudget >= 1024 && raw.contextTokenBudget <= 32768) {
                out.contextTokenBudget = Math.round(raw.contextTokenBudget);
            }
            break;
        }
        case "you": {
            const validExtractions = ["highlights", "none"];
            if (typeof raw.extractionMode === "string" && validExtractions.includes(raw.extractionMode)) {
                out.extractionMode = raw.extractionMode;
            }
            if (typeof raw.fetchCrawlTimeoutSec === "number" && raw.fetchCrawlTimeoutSec >= 1 && raw.fetchCrawlTimeoutSec <= 60) {
                out.fetchCrawlTimeoutSec = Math.round(raw.fetchCrawlTimeoutSec);
            }
            if (typeof raw.fetchMaxAgeSec === "number" && raw.fetchMaxAgeSec >= 0) {
                out.fetchMaxAgeSec = Math.round(raw.fetchMaxAgeSec);
            }
            break;
        }
        case "firecrawl": {
            if (typeof raw.fetchOnlyMainContent === "boolean") {
                out.fetchOnlyMainContent = raw.fetchOnlyMainContent;
            }
            if (typeof raw.fetchMaxAgeMs === "number" && raw.fetchMaxAgeMs >= 0) {
                out.fetchMaxAgeMs = Math.round(raw.fetchMaxAgeMs);
            }
            break;
        }
        case "parallel": {
            const validModes = ["advanced", "basic"];
            if (typeof raw.mode === "string" && validModes.includes(raw.mode)) {
                out.mode = raw.mode;
            }
            if (typeof raw.maxCharsTotal === "number" && raw.maxCharsTotal >= 1000 && raw.maxCharsTotal <= 200000) {
                out.maxCharsTotal = Math.round(raw.maxCharsTotal);
            }
            break;
        }
    }
    return out;
}
/** Build the ProviderOptionView for a provider. */
export function buildProviderOptionView(provider, overrides) {
    const cleanOverrides = overrides ? sanitizeProviderOptions(provider, overrides) : {};
    const hasOverrides = Object.keys(cleanOverrides).length > 0;
    let effective = {};
    switch (provider) {
        case "exa":
            // maxAgeHours omitted by default (undefined = Exa default cache/livecrawl
            // policy); only included on the wire when the user overrides it.
            effective = { searchType: DEFAULT_EXA_OPTIONS.searchType, ...cleanOverrides };
            break;
        case "tavily":
            effective = { ...DEFAULT_TAVILY_OPTIONS, ...cleanOverrides };
            break;
        case "brave":
            effective = { ...DEFAULT_BRAVE_OPTIONS, ...cleanOverrides };
            break;
        case "you":
            effective = { ...DEFAULT_YOU_OPTIONS, ...cleanOverrides };
            break;
        case "firecrawl":
            effective = { ...DEFAULT_FIRECRAWL_OPTIONS, ...cleanOverrides };
            break;
        case "parallel":
            // maxCharsTotal omitted from effective by default: only included on the
            // wire when the user overrides it (top-level field, not advanced_settings).
            effective = { mode: DEFAULT_PARALLEL_OPTIONS.mode, ...cleanOverrides };
            break;
        default:
            effective = cleanOverrides;
    }
    return {
        overrides: cleanOverrides,
        effective,
        customized: hasOverrides,
        isDefault: !hasOverrides,
    };
}
/** Resolve only the effective options map for a provider. */
export function resolveEffectiveOptions(provider, overrides) {
    return buildProviderOptionView(provider, overrides).effective;
}
