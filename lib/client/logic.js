/**
 * Resolve the effective page language. "auto" (or an unknown value) follows
 * the DSH UI language; anything other than "en" falls back to zh.
 */
export function resolveUiLanguage(pref, dshActive) {
    if (pref === "zh" || pref === "en")
        return pref;
    return dshActive === "en" ? "en" : "zh";
}
/**
 * Translate one key from a locale dictionary with cross-locale fallback
 * ({name} placeholder substitution). Returns undefined when neither dict has
 * the key — the caller falls back to the DSH-bound translator.
 */
export function translateDict(dict, fallback, key, params) {
    const raw = dict[key] ?? fallback[key];
    if (raw === undefined)
        return undefined;
    if (!params)
        return raw;
    return raw.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}
/**
 * Status override from a connection-test result. A test that failed is NOT
 * automatically an auth error — `fetch failed` is usually a network problem.
 * Only an explicit auth/rate-limit classification overrides the static guess.
 * @returns the override status, or undefined when the test does not change it.
 */
export function testOutcomeStatus(testResult) {
    if (!testResult || testResult.ok)
        return undefined;
    const code = testResult.error?.code ?? "";
    if (code === "auth" || code === "401" || code === "403")
        return "auth-error";
    if (code === "rate-limit" || code === "quota" || code === "429")
        return "rate-limited";
    // network / timeout / server / config / bad-request → the provider itself
    // may be fine; the failure is about reachability, not credentials.
    return "unreachable";
}
export function providerStatusOf(p, quota, inOrder = true) {
    // Disabled providers are OFF regardless of credentials or order.
    if (p.enabled === false)
        return "disabled";
    if (!inOrder)
        return "not-in-order";
    const selfHosted = p.name === "searxng";
    // Self-hosted providers (SearXNG) are configured by an explicit instance
    // base URL, NOT by an API key — the adapter default URL does not count.
    const configured = selfHosted ? p.baseUrlConfigured === true : p.keyConfigured;
    if (!configured)
        return "not-configured";
    const note = (quota?.note ?? "").toLowerCase();
    if (note.includes("auth") || note.includes("401") || note.includes("403") || note.includes("invalid key"))
        return "auth-error";
    // rate-limited only when the snapshot is meaningful: remaining 0 with a REAL
    // limit (limit > 0). Brave's "49, 0" header (per-second, monthly-0) parses
    // to remaining 0 / limit 0 — that is a window with no quota info, not
    // exhaustion, so it must NOT flip the provider to rate-limited.
    if (quota?.remaining === 0 && quota?.limit !== undefined && quota?.limit > 0)
        return "rate-limited";
    // A note is rate-limit evidence ONLY when it states exhaustion ("429",
    // "rate limit exceeded"); "From Brave rate-limit response headers" merely
    // describes the quota source and must not flip a healthy provider.
    if (note.includes("429") || note.includes("rate limit exceeded") || note.includes("quota exceeded"))
        return "rate-limited";
    return "ready";
}
export function quotaDisplayKind(q) {
    if (!q)
        return "unavailable";
    if (q.source === "self_hosted")
        return "self_hosted";
    if (!q.supported)
        return "unavailable";
    // Brave monthly limit 0 = UNLIMITED (per Brave docs): nothing to measure.
    if (q.limit !== undefined && q.limit === 0 && q.remaining === undefined)
        return "unlimited";
    if (q.source === "local_estimate")
        return "observed_usage";
    if (q.source === "response_header")
        return "rate_limit";
    if (q.unit === "usd_cents")
        return "balance";
    if (q.unit === "credits" || q.unit === "requests" || q.unit === "tokens") {
        // A real remaining_of_limit needs limit > 0; Brave's monthly-0 header
        // (remaining 0 / limit 0) is a window with no quota info → rate_limit.
        if (q.remaining !== undefined && q.limit !== undefined && q.limit > 0)
            return "remaining_of_limit";
        if (q.remaining !== undefined)
            return "rate_limit"; // limit-less countable → window, not balance
    }
    return "unavailable";
}
/** Quota one-line summary, provider-aware (no colors, no layout). */
export function quotaSummary(t, quota) {
    if (!quota?.supported)
        return "";
    const q = quota;
    // Brave reports monthly limit 0 as UNLIMITED (per its docs). A snapshot
    // with limit 0 and no remaining must read "Unlimited", never "0 left".
    if (q.limit !== undefined && q.limit === 0 && q.remaining === undefined)
        return t("quotaUnlimited");
    if (q.unit === "credits" && q.remaining !== undefined)
        return t("quotaCredits", { r: q.remaining, l: q.limit !== undefined && q.limit > 0 ? q.limit : "?" });
    if (q.unit === "requests" && q.remaining !== undefined)
        return t("quotaRequests", { r: q.remaining, l: q.limit !== undefined && q.limit > 0 ? ` / ${q.limit}` : "" });
    if (q.unit === "usd_cents" && q.used !== undefined)
        return t("quotaUsd", { amount: (q.used / 100).toFixed(2) });
    if (q.unit === "usd_cents" && q.remaining !== undefined)
        return t("quotaUsdRemaining", { amount: (q.remaining / 100).toFixed(2) });
    if (q.unit === "tokens" && q.remaining !== undefined)
        return t("quotaTokens", { n: q.remaining.toLocaleString() });
    if (q.remaining !== undefined)
        return `${q.remaining}${q.limit !== undefined && q.limit > 0 ? ` / ${q.limit}` : ""}`;
    return "";
}
/**
 * Remaining-fraction for a progress bar, or undefined when a percentage
 * cannot honestly be computed. Bars are drawn ONLY for countable
 * remaining_of_limit snapshots AND only when remaining ≤ limit — a
 * remaining > limit (e.g. Firecrawl 1,166 / 1,000 plan credits) never gets a
 * fabricated >100% bar.
 * @returns fraction 0..1, or undefined when no bar should be drawn.
 */
export function quotaFraction(q) {
    if (quotaDisplayKind(q) !== "remaining_of_limit")
        return undefined;
    const remaining = q?.remaining;
    const limit = q?.limit;
    if (remaining === undefined || limit === undefined || limit <= 0)
        return undefined;
    if (remaining > limit)
        return undefined; // bonus above plan → number, no bar
    return Math.min(1, Math.max(0, remaining / limit));
}
/** Bar color tier: ok (≥30%), warn (10–30%), danger (<10%). */
export function quotaTier(fraction) {
    if (fraction === undefined)
        return "ok";
    if (fraction < 0.1)
        return "danger";
    if (fraction < 0.3)
        return "warn";
    return "ok";
}
/** Human "remaining" label, e.g. "823 / 1,000 credits". */
export function quotaRemainingLabel(t, q) {
    if (!q?.supported || q.remaining === undefined)
        return "";
    if (q.unit === "credits" && q.limit !== undefined && q.limit > 0)
        return t("quotaCredits", { r: q.remaining.toLocaleString(), l: q.limit.toLocaleString() });
    if (q.unit === "requests" && q.limit !== undefined && q.limit > 0)
        return t("quotaRequests", { r: q.remaining.toLocaleString(), l: ` / ${q.limit.toLocaleString()}` });
    return quotaSummary(t, q);
}
/** Secondary line for a quota snapshot (plan / since), or "". */
export function quotaMetaLine(t, q) {
    if (!q)
        return "";
    const kind = quotaDisplayKind(q);
    if (kind === "remaining_of_limit" && q.remaining !== undefined && q.limit !== undefined && q.remaining > q.limit) {
        return t("quotaOverPlan", { r: q.remaining.toLocaleString(), l: q.limit.toLocaleString() });
    }
    if (kind === "observed_usage" && q.used !== undefined) {
        return t("quotaSince", { amount: (q.used / 100).toFixed(2) });
    }
    // rate_limit / balance: the kind already says it; keep the line clean.
    return "";
}
/** Human-readable attempt outcome (from Host `attempts[].outcome`). */
export function outcomeLabel(t, outcome) {
    if (outcome === "success")
        return t("successOutcome");
    if (outcome.startsWith("failed:")) {
        const code = outcome.slice("failed:".length);
        switch (code) {
            case "auth": return t("authOutcome");
            case "rate-limit": return t("rateLimitedOutcome");
            case "quota": return t("rateLimitedOutcome");
            case "timeout": return t("timeoutOutcome");
            case "network": return t("networkOutcome");
            case "server": return t("serverOutcome");
            case "aborted": return t("abortedOutcome");
            case "config": return t("configOutcome");
            case "bad-request": return t("badRequestOutcome");
            case "invalid-response": return t("invalidResponseOutcome");
            default: return code;
        }
    }
    if (outcome.startsWith("skipped-"))
        return t("unknownOutcome");
    return t("unknownOutcome");
}
/**
 * Format a human-friendly summary of the currently resolved provider execution
 * options for the collapsed Search Experience section.
 * Accepts optional t() for i18n; falls back to Chinese when no t is provided.
 */
export function formatProviderOptionsSummary(providerName, effective, t) {
    if (!effective)
        return t ? t("prefsDefault") : "默认设置";
    switch (providerName) {
        case "exa": {
            const type = String(effective.searchType ?? "auto");
            const typeLabel = type === "fast" ? (t ? t("prefsFast") : "快速") : type === "instant" ? (t ? t("prefsInstant") : "极速") : type.startsWith("deep") ? (t ? t("prefsDeep") : "深入") : (t ? t("prefsAutoLabel") : "自动");
            const freshness = effective.maxAgeHours === 0 ? (t ? t("prefsFreshnessLive") : "每次刷新") : effective.maxAgeHours === -1 ? (t ? t("prefsFreshnessCache") : "仅缓存") : (t ? t("prefsFreshnessAuto") : "缓存自动");
            return `${typeLabel} · ${freshness}`;
        }
        case "tavily": {
            if (effective.autoParameters)
                return t ? t("prefsTavilyAutoParams") : "自动调节";
            const depth = String(effective.searchDepth ?? "basic");
            if (depth === "advanced")
                return `${t ? t("prefsTavilyAdvanced") : "深入"} · 2 credits`;
            if (depth === "fast")
                return `${t ? t("prefsTavilyFast") : "快速"} · 1 credit`;
            if (depth === "ultra-fast")
                return `${t ? t("prefsTavilyUltraFast") : "极速"} · 1 credit`;
            return `${t ? t("prefsTavilyBasic") : "标准"} · 1 credit`;
        }
        case "brave": {
            const pref = String(effective.endpointPreference ?? "auto");
            if (pref === "web-search")
                return t ? t("prefsBraveWebSearch") : "Web Search";
            if (pref === "llm-context")
                return t ? t("prefsBraveLlmContext") : "LLM Context";
            return t ? t("prefsBraveAuto") : "自动";
        }
        case "you": {
            const ext = String(effective.extractionMode ?? "highlights");
            return ext === "none" ? (t ? t("prefsYouSummary") : "搜索摘要") : (t ? t("prefsYouHighlights") : "重点片段");
        }
        case "firecrawl": {
            const fresh = effective.fetchMaxAgeMs === 0 ? (t ? t("prefsFreshnessLive") : "每次刷新") : (t ? t("prefsFreshnessAuto") : "自动缓存");
            return `${t ? t("prefsFirecrawlOnlyMain") : "仅正文"} · ${fresh}`;
        }
        case "parallel": {
            const mode = String(effective.mode ?? "advanced");
            if (mode === "basic")
                return t ? t("prefsParallelBasic") : "标准";
            if (mode === "fast")
                return t ? t("prefsParallelFast") : "快速";
            if (mode === "turbo")
                return t ? t("prefsParallelTurbo") : "极速";
            return t ? t("prefsParallelAdvanced") : "深入";
        }
        case "jina": {
            const engine = String(effective.fetchEngine ?? "auto");
            const readerLm = effective.fetchReaderLmV2 === true;
            const engineLabel = engine === "curl" ? (t ? t("prefsJinaModeDirect") : "直接读取") : engine === "browser" ? (t ? t("prefsJinaModeBrowser") : "浏览器") : (t ? t("prefsJinaModeAuto") : "由 Jina 选择读取方式");
            return readerLm ? `${engineLabel} · ${t ? t("prefsJinaReaderLmLabel") : "ReaderLM-v2"}` : engineLabel;
        }
        default:
            return t ? t("prefsDefault") : "默认设置";
    }
}
