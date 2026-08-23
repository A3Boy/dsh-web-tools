export declare class CdpError extends Error {
    readonly code: number;
    constructor(code: number, message: string);
}
export declare class BrowserProcessError extends Error {
    readonly cause?: unknown;
    constructor(message: string, cause?: unknown);
}
export declare class NavigationTimeoutError extends Error {
    constructor(url: string, timeoutMs: number);
}
export declare class SelectorTimeoutError extends Error {
    constructor(selector: string, timeoutMs: number);
}
export declare class UrlDisallowedError extends Error {
    constructor(url: string, platform: string);
}
