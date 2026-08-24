import { validatePlatformUrl } from "../browser/paths.js";
import { fallbackSearchToGeneralWeb, fallbackFetchToGeneralWeb } from "./web-fallback.js";
export class SpecializedSourceRegistry {
    sources = new Map();
    fallbackSearchProvider;
    fallbackFetchProvider;
    platformEnabled = { xiaohongshu: true, x: true };
    registerSource(source) {
        this.sources.set(source.id, source);
    }
    setPlatformEnabled(enabledMap) {
        this.platformEnabled = { ...this.platformEnabled, ...enabledMap };
    }
    isPlatformEnabled(platform) {
        return this.platformEnabled[platform] !== false;
    }
    unregisterSource(id) {
        this.sources.delete(id);
    }
    getSource(id) {
        return this.sources.get(id);
    }
    setFallbackProviders(search, fetch) {
        this.fallbackSearchProvider = search;
        this.fallbackFetchProvider = fetch;
    }
    inFlightStatus;
    async getPlatformStatuses() {
        if (this.inFlightStatus) {
            return this.inFlightStatus;
        }
        this.inFlightStatus = (async () => {
            try {
                const platformIds = ["xiaohongshu", "x"];
                const statusPromises = platformIds.map(async (id) => {
                    const source = this.sources.get(id);
                    if (!source) {
                        return {
                            id,
                            name: id === "xiaohongshu" ? "小红书" : "Twitter / X",
                            enabled: this.isPlatformEnabled(id),
                            runtimeAvailable: false,
                            runtimeState: "unavailable",
                            authenticated: false,
                        };
                    }
                    try {
                        const s = await source.status();
                        return {
                            ...s,
                            enabled: this.isPlatformEnabled(id),
                        };
                    }
                    catch (err) {
                        return {
                            id,
                            name: source.name,
                            enabled: this.isPlatformEnabled(id),
                            runtimeAvailable: false,
                            runtimeState: "error",
                            authenticated: false,
                            lastError: err?.message || String(err),
                            lastCheckedAt: Date.now(),
                        };
                    }
                });
                return await Promise.all(statusPromises);
            }
            finally {
                this.inFlightStatus = undefined;
            }
        })();
        return this.inFlightStatus;
    }
    async routeSearch(query, req, signal) {
        return this.search(query, req, signal);
    }
    async search(query, req, signal) {
        const platform = req?.hints?.platform;
        if (!platform) {
            if (this.fallbackSearchProvider) {
                const res = await this.fallbackSearchProvider.search({ query, maxResults: req?.maxResults }, signal);
                const items = (res.sources || []).map((s) => ({
                    id: s.url,
                    title: s.title || s.url,
                    url: s.url,
                    snippet: s.snippet,
                    platform: "general",
                }));
                return { items, retrievalMode: "general-web" };
            }
            return { items: [] };
        }
        const source = this.sources.get(platform);
        if (!source || !this.isPlatformEnabled(platform)) {
            return fallbackSearchToGeneralWeb(query, platform, this.fallbackSearchProvider, req?.maxResults, signal);
        }
        const nativeQuery = req?.hints?.cleanQuery?.trim() || query;
        const outcome = await source.search(nativeQuery, req, signal);
        // If native search succeeded (even 0 results), keep native outcome!
        if (outcome.error === undefined) {
            return { ...outcome, retrievalMode: "native-browser" };
        }
        // Never fallback on explicit aborted signal
        if (signal?.aborted || outcome.error.code === "aborted") {
            return outcome;
        }
        // Fallback on failure
        return fallbackSearchToGeneralWeb(query, platform, this.fallbackSearchProvider, req?.maxResults, signal);
    }
    async routeFetch(url, signal) {
        return this.fetch(url, signal);
    }
    async fetch(url, signal) {
        let targetPlatform;
        if (validatePlatformUrl(url, "xiaohongshu")) {
            targetPlatform = "xiaohongshu";
        }
        else if (validatePlatformUrl(url, "x")) {
            targetPlatform = "x";
        }
        if (!targetPlatform) {
            if (this.fallbackFetchProvider) {
                const res = await this.fallbackFetchProvider.fetch({ url }, signal);
                return {
                    item: { id: url, title: "Web Page", url, text: res.body?.content || "", platform: "general" },
                    retrievalMode: "general-web",
                };
            }
            return { error: { code: "runtime-unavailable", message: "No fetch provider available", retryable: false } };
        }
        const source = this.sources.get(targetPlatform);
        if (!source || !this.isPlatformEnabled(targetPlatform)) {
            return fallbackFetchToGeneralWeb(url, this.fallbackFetchProvider, signal);
        }
        const outcome = await source.fetch(url, signal);
        if (outcome.error === undefined && outcome.item) {
            return { ...outcome, retrievalMode: "native-browser" };
        }
        if (signal?.aborted || outcome.error?.code === "aborted") {
            return outcome;
        }
        // A source marks platform-auth, access-control, and invalid-detail errors
        // as non-retryable. Do not hide that concrete result behind a potentially
        // long general-provider chain that cannot recover native comments/session
        // data and may consume the tool's entire timeout budget.
        if (outcome.error && !outcome.error.retryable) {
            return outcome;
        }
        return fallbackFetchToGeneralWeb(url, this.fallbackFetchProvider, signal);
    }
}
