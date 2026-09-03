/**
 * dsh-web-tools — Generic Web Fetcher with Defuddle & linkedom.
 *
 * Implements standard, zero-API-key HTTP web fetching with:
 *  - SSRF URL structure validation & userinfo blocking via `fetch-security.ts`
 *  - DNS resolution validation (A/AAAA checking) to defeat DNS rebinding to private IPs
 *  - Explicit attempt timeout budget enforcement
 *  - Proxy compliance via `fetchWithProxy`
 *  - Content-Type filtering (HTML/text/markdown/json/xml supported; binary/media rejected)
 *  - Bounded size streaming (5 MiB cap with safe truncation)
 *  - Manual redirect following (max 5 hops) with per-hop SSRF & DNS validation
 *  - Markdown conversion via Defuddle + linkedom with `{ markdown: true, useAsync: false }` (100% local, no 3rd party API calls)
 *  - Raw text passthrough for plain text, markdown, json, xml
 *  - Rich metadata extraction (title, author, publishedAt, description)
 *  - Strict, granular error classification
 *
 * @module
 */
import { parseHTML } from "linkedom";
import { Defuddle } from "defuddle/node";
import { fetchWithProxy } from "./fetch-proxy.ts";
import {
  validateFetchUrl,
  validateFetchDns,
  FetchSecurityError,
  type DnsLookupFn,
} from "./fetch-security.ts";

/** Maximum response body bytes allowed (5 MiB). */
export const MAX_FETCH_BYTES = 5 * 1024 * 1024;

/** Maximum redirect hops before aborting. */
export const MAX_REDIRECT_HOPS = 5;

/** Default per-attempt timeout for generic fetch (10 seconds). */
export const DEFAULT_GENERIC_FETCH_TIMEOUT_MS = 10_000;

/** Default generic HTTP fetch user agent. */
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 (DSH-WebTools/GenericFetch)";

/** Classified error codes for generic web fetch operations. */
export type GenericFetchErrorCode =
  | "WEB_INVALID_URL"
  | "WEB_FETCH_BLOCKED"
  | "WEB_NETWORK"
  | "WEB_TIMEOUT"
  | "WEB_HTTP_ERROR"
  | "WEB_CONTENT_TOO_LARGE"
  | "WEB_UNSUPPORTED_CONTENT_TYPE"
  | "WEB_PARSE_ERROR"
  | "WEB_EMPTY_CONTENT"
  | "WEB_ABORTED";

export class GenericFetchError extends Error {
  readonly code: GenericFetchErrorCode;
  readonly statusCode?: number;
  readonly url?: string;

  constructor(code: GenericFetchErrorCode, message: string, details?: { statusCode?: number; url?: string }) {
    super(message);
    this.name = "GenericFetchError";
    this.code = code;
    this.statusCode = details?.statusCode;
    this.url = details?.url;
  }
}

export interface GenericFetchResult {
  url: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
  title?: string;
  author?: string;
  publishedAt?: string;
  description?: string;
  content: string;
  truncated: boolean;
  backend: "builtin-http";
  extraction: "defuddle" | "raw-text";
}

export interface GenericFetchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  customFetchWithProxy?: typeof fetchWithProxy;
  customDnsLookup?: DnsLookupFn;
}

/** Check whether a MIME type is acceptable for extraction or text rendering. */
function classifyContentType(contentTypeHeader: string | null): "html" | "text" | "unsupported" {
  if (!contentTypeHeader) return "html"; // default to HTML if unspecified
  const mime = contentTypeHeader.split(";")[0].trim().toLowerCase();

  if (mime === "text/html" || mime === "application/xhtml+xml") {
    return "html";
  }

  if (
    mime === "text/plain" ||
    mime === "text/markdown" ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "text/xml" ||
    mime === "application/ld+json" ||
    mime === "text/csv" ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  ) {
    return "text";
  }

  // Explicitly unsupported formats
  if (
    mime.startsWith("image/") ||
    mime.startsWith("audio/") ||
    mime.startsWith("video/") ||
    mime === "application/pdf" ||
    mime === "application/zip" ||
    mime === "application/octet-stream" ||
    mime === "application/x-msdownload" ||
    mime === "application/x-executable"
  ) {
    return "unsupported";
  }

  return "unsupported";
}

/**
 * Reads a response stream up to `maxBytes` safely without buffering unbounded streams.
 */
async function readStreamBounded(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) {
    const text = await response.text();
    return { text, truncated: false };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;

  try {
    while (true) {
      if (signal?.aborted) {
        throw new GenericFetchError("WEB_ABORTED", "Fetch aborted by signal");
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        if (totalBytes + value.byteLength > maxBytes) {
          const sliceBytes = maxBytes - totalBytes;
          if (sliceBytes > 0) {
            chunks.push(value.subarray(0, sliceBytes));
            totalBytes += sliceBytes;
          }
          truncated = true;
          // Cancel the rest of the stream to save network bandwidth
          try {
            await reader.cancel();
          } catch {
            // ignore cancel failure
          }
          break;
        }
        chunks.push(value);
        totalBytes += value.byteLength;
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Merge chunks into text
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
  return { text: decoder.decode(merged), truncated };
}

/**
 * Fetch a web page using built-in HTTP client with proxy support, redirect security, DNS SSRF guard, and local-only Defuddle parsing.
 */
export async function fetchGenericWebPage(
  initialUrl: string,
  optionsOrSignal?: AbortSignal | GenericFetchOptions,
  legacyCustomFetch?: typeof fetchWithProxy,
): Promise<GenericFetchResult> {
  const options: GenericFetchOptions =
    optionsOrSignal && "aborted" in optionsOrSignal
      ? { signal: optionsOrSignal as AbortSignal, customFetchWithProxy: legacyCustomFetch }
      : (optionsOrSignal as GenericFetchOptions) ?? { customFetchWithProxy: legacyCustomFetch };

  const externalSignal = options.signal;
  const timeoutMs = options.timeoutMs ?? DEFAULT_GENERIC_FETCH_TIMEOUT_MS;
  const customFetch = options.customFetchWithProxy ?? fetchWithProxy;
  const customDnsLookup = options.customDnsLookup;

  // Setup abort controller with timeout budget
  const controller = new AbortController();
  let abortCause: "caller" | "timeout" | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const onExternalAbort = () => {
    abortCause = "caller";
    clearTimer();
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) throw new GenericFetchError("WEB_ABORTED", "Fetch aborted by caller");
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      if (abortCause !== undefined) return;
      abortCause = "timeout";
      controller.abort(new Error(`generic fetch timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  }

  try {
    let currentParsedUrl = validateFetchUrl(initialUrl);
    let currentUrl = currentParsedUrl.href;
    let hopCount = 0;
    let response: Response | undefined;

    // Validate initial hostname DNS resolution
    await validateFetchDns(currentParsedUrl.hostname, customDnsLookup);

    // Manual redirect loop to validate SSRF and DNS on every hop
    while (true) {
      if (controller.signal.aborted) {
        throw new GenericFetchError(
          abortCause === "timeout" ? "WEB_TIMEOUT" : "WEB_ABORTED",
          abortCause === "timeout" ? `Fetch timed out after ${timeoutMs}ms` : "Fetch aborted by signal",
        );
      }

      if (hopCount > MAX_REDIRECT_HOPS) {
        throw new GenericFetchError(
          "WEB_FETCH_BLOCKED",
          `Too many redirects (exceeded limit of ${MAX_REDIRECT_HOPS})`,
          { url: currentUrl },
        );
      }

      try {
        response = await customFetch(currentUrl, {
          method: "GET",
          headers: {
            "User-Agent": DEFAULT_USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/json,text/plain,text/markdown;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
          },
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          throw new GenericFetchError(
            abortCause === "timeout" ? "WEB_TIMEOUT" : "WEB_ABORTED",
            abortCause === "timeout" ? `Fetch timed out after ${timeoutMs}ms` : "Fetch aborted by signal",
          );
        }
        throw new GenericFetchError(
          "WEB_NETWORK",
          `Network error fetching "${currentUrl}": ${err instanceof Error ? err.message : String(err)}`,
          { url: currentUrl },
        );
      }

      // Handle HTTP Redirects (301, 302, 303, 307, 308)
      if (
        response.status === 301 ||
        response.status === 302 ||
        response.status === 303 ||
        response.status === 307 ||
        response.status === 308
      ) {
        const location = response.headers.get("location");
        if (!location) {
          throw new GenericFetchError("WEB_HTTP_ERROR", `Redirect status ${response.status} missing Location header`, {
            statusCode: response.status,
            url: currentUrl,
          });
        }

        // Resolve relative redirect URL against current URL
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).href;
        } catch {
          throw new GenericFetchError("WEB_INVALID_URL", `Invalid redirect URL "${location}" from "${currentUrl}"`);
        }

        // Re-validate target URL and DNS for SSRF / loopback / private IP
        try {
          const validatedNext = validateFetchUrl(nextUrl);
          await validateFetchDns(validatedNext.hostname, customDnsLookup);
          currentParsedUrl = validatedNext;
          currentUrl = validatedNext.href;
        } catch (secErr) {
          if (secErr instanceof FetchSecurityError) {
            throw new GenericFetchError(secErr.code, `Redirect to "${nextUrl}" blocked: ${secErr.message}`, {
              url: nextUrl,
            });
          }
          throw secErr;
        }

        hopCount++;
        continue;
      }

      break;
    }

    if (!response) {
      throw new GenericFetchError("WEB_NETWORK", "No response received");
    }

    // Handle HTTP error status codes (4xx, 5xx)
    if (!response.ok) {
      throw new GenericFetchError(
        "WEB_HTTP_ERROR",
        `HTTP fetch failed with status ${response.status} (${response.statusText || "Error"})`,
        { statusCode: response.status, url: currentUrl },
      );
    }

    const rawContentType = response.headers.get("content-type") || "";
    const typeKind = classifyContentType(rawContentType);

    if (typeKind === "unsupported") {
      throw new GenericFetchError(
        "WEB_UNSUPPORTED_CONTENT_TYPE",
        `Unsupported Content-Type "${rawContentType || "unknown"}". Only HTML, text, markdown, json, and xml are supported.`,
        { statusCode: response.status, url: currentUrl },
      );
    }

    // Read response body safely with size cap
    const { text: bodyText, truncated } = await readStreamBounded(response, MAX_FETCH_BYTES, controller.signal);

    if (!bodyText || bodyText.trim().length === 0) {
      throw new GenericFetchError("WEB_EMPTY_CONTENT", `Fetched web page from "${currentUrl}" is empty`, {
        statusCode: response.status,
        url: currentUrl,
      });
    }

    if (typeKind === "text") {
      return {
        url: initialUrl,
        finalUrl: currentUrl,
        statusCode: response.status,
        contentType: rawContentType,
        content: bodyText,
        truncated,
        backend: "builtin-http",
        extraction: "raw-text",
      };
    }

    // HTML content: Parse with linkedom + Defuddle (strictly local, useAsync: false)
    try {
      const { document } = parseHTML(bodyText);
      const extracted = await Defuddle(document, currentUrl, {
        markdown: true,
        useAsync: false, // Disallow async third-party fallback APIs (e.g. FxTwitter) for privacy & predictability
      });

      const markdownContent = extracted?.content ? extracted.content.trim() : "";
      const finalContent = markdownContent || bodyText.trim();

      if (!finalContent) {
        throw new GenericFetchError("WEB_EMPTY_CONTENT", `Could not extract text content from "${currentUrl}"`, {
          statusCode: response.status,
          url: currentUrl,
        });
      }

      return {
        url: initialUrl,
        finalUrl: currentUrl,
        statusCode: response.status,
        contentType: rawContentType,
        title: extracted?.title?.trim() || undefined,
        author: extracted?.author?.trim() || undefined,
        publishedAt: extracted?.published?.trim() || undefined,
        description: extracted?.description?.trim() || undefined,
        content: finalContent,
        truncated,
        backend: "builtin-http",
        extraction: "defuddle",
      };
    } catch (parseErr) {
      if (parseErr instanceof GenericFetchError) throw parseErr;
      // Fallback to raw HTML text if DOM parsing failed catastrophically
      return {
        url: initialUrl,
        finalUrl: currentUrl,
        statusCode: response.status,
        contentType: rawContentType,
        content: bodyText,
        truncated,
        backend: "builtin-http",
        extraction: "raw-text",
      };
    }
  } finally {
    clearTimer();
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  }
}
