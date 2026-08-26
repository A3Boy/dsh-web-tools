export class CdpError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(`CDP Error [${code}]: ${message}`);
    this.name = "CdpError";
    this.code = code;
  }
}

export class BrowserProcessError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "BrowserProcessError";
    this.cause = cause;
  }
}

export class NavigationTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Navigation to ${url} timed out after ${timeoutMs}ms`);
    this.name = "NavigationTimeoutError";
  }
}

export class SelectorTimeoutError extends Error {
  constructor(selector: string, timeoutMs: number) {
    super(`Selector "${selector}" not found within ${timeoutMs}ms`);
    this.name = "SelectorTimeoutError";
  }
}

export class UrlDisallowedError extends Error {
  constructor(url: string, platform: string) {
    super(`URL "${url}" is not allowed for platform "${platform}"`);
    this.name = "UrlDisallowedError";
  }
}
