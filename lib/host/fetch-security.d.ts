export declare class FetchSecurityError extends Error {
    readonly code: "WEB_INVALID_URL" | "WEB_FETCH_BLOCKED";
    constructor(code: "WEB_INVALID_URL" | "WEB_FETCH_BLOCKED", message: string);
}
/**
 * Validates a target URL before fetching to ensure it is a safe public HTTP/HTTPS URL.
 * Throws FetchSecurityError if invalid or blocked.
 */
export declare function validateFetchUrl(rawUrl: string): URL;
