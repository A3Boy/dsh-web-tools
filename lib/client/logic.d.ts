/**
 * dsh-web-tools — client status & summary logic (pure, framework-free).
 *
 * Extracted from WebToolsSection.tsx so the state model can be unit-tested
 * with plain node (no tsx/jsx involved). No React imports.
 * @module
 */
import type { ProviderView, QuotaView } from "../shared/api-types.ts";
/** t() bound to the dsh-web-tools namespace (injected into the section). */
export type TFunc = (key: string, ...args: unknown[]) => string;
/** Provider page status model (drives the row dot + detail Status block). */
export type ProviderStatus = "ready" | "rate-limited" | "auth-error" | "not-configured" | "not-in-chain" | "unreachable";
/**
 * Status override from a connection-test result. A test that failed is NOT
 * automatically an auth error — `fetch failed` is usually a network problem.
 * Only an explicit auth/rate-limit classification overrides the static guess.
 * @returns the override status, or undefined when the test does not change it.
 */
export declare function testOutcomeStatus(testResult?: {
    ok: boolean;
    error?: {
        code?: string;
    };
}): ProviderStatus | undefined;
export declare function providerStatusOf(p: ProviderView, quota?: QuotaView, inChain?: boolean): ProviderStatus;
/**
 * Quota display model — five kinds, each rendered honestly:
 *  - remaining_of_limit : countable remaining+limit (credits/requests/tokens)
 *                         → progress bar allowed (only when remaining ≤ limit)
 *  - balance            : money balance without a limit (usd_cents) → number only
 *  - observed_usage     : local usage recording (Exa) → number + since
 *  - rate_limit         : rate-limit headers (Brave/Jina) → number only
 *  - unavailable/self_hosted : nothing to show
 */
export type QuotaDisplayKind = "remaining_of_limit" | "balance" | "observed_usage" | "rate_limit" | "unlimited" | "unavailable" | "self_hosted";
export declare function quotaDisplayKind(q: QuotaView | undefined): QuotaDisplayKind;
/** Quota one-line summary, provider-aware (no colors, no layout). */
export declare function quotaSummary(t: TFunc, quota?: QuotaView): string;
/**
 * Remaining-fraction for a progress bar, or undefined when a percentage
 * cannot honestly be computed. Bars are drawn ONLY for countable
 * remaining_of_limit snapshots AND only when remaining ≤ limit — a
 * remaining > limit (e.g. Firecrawl 1,166 / 1,000 plan credits) never gets a
 * fabricated >100% bar.
 * @returns fraction 0..1, or undefined when no bar should be drawn.
 */
export declare function quotaFraction(q: QuotaView | undefined): number | undefined;
/** Bar color tier: ok (≥30%), warn (10–30%), danger (<10%). */
export declare function quotaTier(fraction: number | undefined): "ok" | "warn" | "danger";
/** Human "remaining" label, e.g. "823 / 1,000 credits". */
export declare function quotaRemainingLabel(t: TFunc, q: QuotaView | undefined): string;
/** Secondary line for a quota snapshot (plan / since), or "". */
export declare function quotaMetaLine(t: TFunc, q: QuotaView | undefined): string;
/** Human-readable attempt outcome (from Host `attempts[].outcome`). */
export declare function outcomeLabel(t: TFunc, outcome: string): string;
