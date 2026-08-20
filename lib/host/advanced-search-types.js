/**
 * dsh-web-tools — Advanced search runtime types.
 *
 * Provider-neutral runtime-level contracts for the provider-native advanced
 * search path. Basic `web_search({query})` stays on `ctx.web.search()`;
 * advanced search goes through dsh-web-tools' own AdvancedSearchRuntime,
 * which calls each provider's `ProviderAdvancedContract` directly — never
 * `ctx.web.search()`.
 *
 * Design rule: **basic request unified, advanced request heterogeneous,
 * evidence normalized.** This file defines zero provider-specific fields so
 * adding Parallel (`objective` + `search_queries[]`) later requires no changes
 * here.
 * @module
 */
export {};
