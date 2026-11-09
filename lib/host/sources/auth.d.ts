/**
 * dsh-web-tools — platform session verification with a single retry.
 *
 * `verifyAuthenticationForOperation` reads the real browser profile (cookies +
 * a live page probe), which is the right thing for a search or a fetch. But the
 * first probe after the browser launches — or while another page operation is
 * closing a target — can observe a half-initialised target and report "signed
 * out" even though the profile is valid. That turned a healthy account into a
 * hard `auth-required` failure with no fallback.
 *
 * One short retry fixes the race at bounded cost: a genuinely signed-out
 * account fails both probes (each is a cheap cookie check first) and still
 * produces `auth-required`.
 * @module
 */
import type { NativeBrowserRuntime } from "../browser/index.ts";
import type { SpecializedPlatformId } from "./types.ts";
/**
 * Verify a platform session for an operation, retrying one transient failure.
 *
 * @param runtime browser runtime that owns the profile
 * @param platform which platform's profile to verify
 * @param signal caller cancellation
 * @param mode `interactive` for platforms that need a visible window
 */
export declare function verifyPlatformSession(runtime: Pick<NativeBrowserRuntime, "verifyAuthenticationForOperation">, platform: SpecializedPlatformId, signal?: AbortSignal, mode?: "headless" | "interactive"): Promise<boolean>;
