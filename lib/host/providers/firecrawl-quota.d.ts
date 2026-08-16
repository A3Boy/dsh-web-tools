/**
 * dsh-web-tools — Firecrawl quota via the official credit-usage endpoint.
 * GET https://api.firecrawl.dev/v2/team/credit-usage with Bearer auth.
 * @module
 */
import type { QuotaSnapshot } from "../quota.ts";
export declare function firecrawlQuota(apiKey: string, signal?: AbortSignal): Promise<QuotaSnapshot>;
