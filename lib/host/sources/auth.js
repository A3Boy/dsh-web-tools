/** Delay before the retry. Short enough to stay invisible in the search. */
const RETRY_DELAY_MS = 250;
/** `setTimeout` that also wakes up on abort. */
function delay(ms, signal) {
    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }
        const finish = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", finish);
            resolve();
        };
        const timer = setTimeout(finish, ms);
        signal?.addEventListener("abort", finish, { once: true });
    });
}
/**
 * Verify a platform session for an operation, retrying one transient failure.
 *
 * @param runtime browser runtime that owns the profile
 * @param platform which platform's profile to verify
 * @param signal caller cancellation
 * @param mode `interactive` for platforms that need a visible window
 */
export async function verifyPlatformSession(runtime, platform, signal, mode = "headless") {
    if (await runtime.verifyAuthenticationForOperation(platform, signal, mode))
        return true;
    if (signal?.aborted)
        return false;
    await delay(RETRY_DELAY_MS, signal);
    if (signal?.aborted)
        return false;
    return runtime.verifyAuthenticationForOperation(platform, signal, mode);
}
