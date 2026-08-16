/**
 * dsh-web-tools — Tavily quota via the official /usage endpoint.
 * GET https://api.tavily.com/usage with Authorization: Bearer <key>.
 * @module
 */
import type { QuotaSnapshot } from "../quota.ts";
export declare function tavilyQuota(apiKey: string, signal?: AbortSignal): Promise<QuotaSnapshot>;
