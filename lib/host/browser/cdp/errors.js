export class CdpError extends Error {
    code;
    constructor(code, message) {
        super(`CDP Error [${code}]: ${message}`);
        this.name = "CdpError";
        this.code = code;
    }
}
export class BrowserProcessError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.name = "BrowserProcessError";
        this.cause = cause;
    }
}
export class NavigationTimeoutError extends Error {
    constructor(url, timeoutMs) {
        super(`Navigation to ${url} timed out after ${timeoutMs}ms`);
        this.name = "NavigationTimeoutError";
    }
}
export class SelectorTimeoutError extends Error {
    constructor(selector, timeoutMs) {
        super(`Selector "${selector}" not found within ${timeoutMs}ms`);
        this.name = "SelectorTimeoutError";
    }
}
export class UrlDisallowedError extends Error {
    constructor(url, platform) {
        super(`URL "${url}" is not allowed for platform "${platform}"`);
        this.name = "UrlDisallowedError";
    }
}
