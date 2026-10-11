/**
 * dsh-web-tools — secure outbound transport for operator-configured provider
 * endpoints (Issue #9).
 *
 * ## Why this is separate from `generic-fetch`
 *
 * `generic-fetch` guards a URL the *model* chose, and its job is to fetch any
 * public page. A provider endpoint is different: it is operator-configured, it
 * receives a stored API credential, and it may legitimately be an internal
 * gateway. Reusing the page-fetch guard would either block every gateway
 * (unusable) or, if relaxed globally, disarm page fetching. So the two have
 * separate policies and this module owns the provider one.
 *
 * ## What it enforces
 *
 * 1. URL structure: http(s) only, no userinfo, no fragment, explicit port only
 *    when the policy allows it.
 * 2. Host authorization *before* any DNS work: a trusted default, an explicit
 *    operator authorization, or a public host.
 * 3. Address authorization on **every** candidate A/AAAA record, and then a
 *    socket pinned to one of those exact addresses — so the address that was
 *    validated is the address that is connected to. Validating and then letting
 *    a client re-resolve is the DNS-rebinding hole this closes.
 * 4. `redirect: "error"` — a 3xx never re-sends the credential to a new origin.
 * 5. Byte-capped bodies and a content-type check before JSON parsing.
 * 6. Proxy use is explicit. When a proxy is configured but the policy does not
 *    authorize it, the request FAILS CLOSED: through a proxy the final DNS and
 *    connection happen at the proxy, so a local check could not substantiate
 *    the destination. Silent degradation is deliberately not an option.
 *
 * @module
 */
import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns";
import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { isPrivateOrRestrictedIp } from "./fetch-security.ts";

// ---------------------------------------------------------------------------
// classification
// ---------------------------------------------------------------------------

/** Machine codes the transport raises (mapped to UI codes by the caller). */
export type TransportErrorCode =
  | "invalid-url"
  | "destination-blocked"
  | "proxy-required"
  | "timeout"
  | "network"
  | "invalid-response"
  | "config"
  | "aborted";

export class TransportError extends Error {
  readonly code: TransportErrorCode;
  readonly status?: number;
  constructor(code: TransportErrorCode, message: string, status?: number) {
    super(message);
    this.name = "TransportError";
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

/** True for any transport failure (already classified — never re-wrap). */
export function isTransportError(value: unknown): value is TransportError {
  return value instanceof TransportError;
}

// ---------------------------------------------------------------------------
// policy
// ---------------------------------------------------------------------------

/**
 * How much the destination is trusted.
 *  - `official` — the adapter's own built-in endpoint. Trusted by definition;
 *    a loopback default (self-hosted SearXNG) is legitimate here.
 *  - `authorized` — an explicit operator authorization matched this host:port.
 *  - `public` — a user-typed address; must be a public host on https.
 */
export type DestinationTrust = "official" | "authorized" | "public";

/** One operator-granted outbound target. */
export interface OutboundAuthorization {
  /** Hostname, IP literal, or `.suffix` for a domain. */
  host: string;
  /** Exact port, or undefined for any port. */
  port?: number;
  /** Allow plain http (default: https only). */
  allowHttp?: boolean;
  /** Allow private/loopback/link-local resolved addresses. */
  allowPrivate?: boolean;
  /** Human note shown in diagnostics. */
  note?: string;
}

/** Operator policy for outbound provider requests. */
export interface OutboundPolicy {
  /** Granted targets. */
  authorizations: OutboundAuthorization[];
  /** Allow http:// for non-official destinations. Default false. */
  allowPublicHttp?: boolean;
  /** Whether proxied requests are permitted for this destination. */
  allowProxy?: boolean;
  /** Hard cap on response bytes (default 2 MiB). */
  maxResponseBytes?: number;
  /** Connect timeout in ms (default 10s). */
  connectTimeoutMs?: number;
  /** Request timeout in ms (default 15s). */
  requestTimeoutMs?: number;
}

export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/** Operator-granted outbound destinations (shared registry). */
export const OUTBOUND_AUTHORIZATIONS: OutboundAuthorization[] = [];

/** Match a host against one authorization entry. */
export function hostMatchesAuthorization(host: string, entry: OutboundAuthorization): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  const pattern = entry.host.toLowerCase().replace(/^\[|\]$/g, "");
  if (pattern.startsWith(".")) return h === pattern.slice(1) || h.endsWith(pattern);
  return h === pattern;
}

/** The authorization covering this host:port, if any. */
export function findAuthorization(
  host: string,
  port: number,
  policy: OutboundPolicy,
): OutboundAuthorization | undefined {
  return policy.authorizations.find(
    (entry) => hostMatchesAuthorization(host, entry) && (entry.port === undefined || entry.port === port),
  );
}

// ---------------------------------------------------------------------------
// URL structural validation
// ---------------------------------------------------------------------------

/** Reject URL shapes that are never legitimate for a provider endpoint. */
export function assertEndpointUrl(rawUrl: string): URL {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new TransportError("invalid-url", "Provider endpoint URL is empty");
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new TransportError("invalid-url", "Provider endpoint URL is not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TransportError("invalid-url", `Unsupported protocol "${parsed.protocol}" for a provider endpoint`);
  }
  if (parsed.username || parsed.password) {
    throw new TransportError("invalid-url", "Provider endpoint URL must not embed userinfo credentials");
  }
  // A fragment is never meaningful to an API and may be used to smuggle text
  // past a naive echo in logs.
  if (parsed.hash) {
    throw new TransportError("invalid-url", "Provider endpoint URL must not contain a fragment");
  }
  if (!parsed.hostname) {
    throw new TransportError("invalid-url", "Provider endpoint URL is missing a hostname");
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// header hygiene
// ---------------------------------------------------------------------------

/** Header names a custom provider may never set (host/transport integrity). */
const RESERVED_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "keep-alive",
  "te",
  "trailer",
  "proxy-authorization",
  "proxy-connection",
]);

/** RFC 7230 token — the only legal shape for a header field name. */
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Validate one user-supplied header name.
 * @throws {TransportError} on a reserved or malformed name.
 */
export function assertHeaderName(name: string): void {
  if (typeof name !== "string" || !HEADER_NAME_RE.test(name)) {
    throw new TransportError("config", `Invalid header name (not an RFC 7230 token)`);
  }
  if (RESERVED_HEADERS.has(name.toLowerCase())) {
    throw new TransportError("config", `Header "${name}" is reserved and cannot be overridden`);
  }
}

/** Upper bound on any single mapped string field. */
export const MAX_MAPPED_STRING_CHARS = 4000;

/**
 * Truncate at a Unicode-safe boundary.
 *
 * `String.prototype.slice` operates on UTF-16 code units, so a naive cut can
 * split a surrogate pair and leave a lone surrogate in the output (invalid
 * text that corrupts downstream JSON/tool contexts). This walks back off a
 * dangling high surrogate instead.
 */
export function truncateUnicodeSafe(value: string, maxChars = MAX_MAPPED_STRING_CHARS): string {
  if (value.length <= maxChars) return value;
  let end = maxChars;
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1; // dangling high surrogate
  return `${value.slice(0, end)}…`;
}

// ---------------------------------------------------------------------------
// dns + connect
// ---------------------------------------------------------------------------

/** One resolved address record. */
export interface ResolvedAddress {
  address: string;
  family: number;
}

/** Injectable DNS resolver (tests never touch the network). */
export type LookupAllFn = (hostname: string) => Promise<ResolvedAddress[]>;

const defaultLookupAll: LookupAllFn = (hostname) =>
  new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true }, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses as ResolvedAddress[]);
    });
  });

/**
 * Decide whether one resolved address may be connected to.
 *
 * `allowPrivate` is the single gate for loopback/RFC1918/link-local: it is true
 * only for a built-in provider's own official endpoint or for a host the
 * operator explicitly authorized with `allowPrivate`.
 *
 * @throws {TransportError} `destination-blocked` when it may not.
 */
export function assertAddressAllowed(address: string, allowPrivate: boolean): void {
  if (allowPrivate) return;
  if (isPrivateOrRestrictedIp(address)) {
    throw new TransportError(
      "destination-blocked",
      `Resolved address ${address} is private, loopback, or link-local and this destination is not authorized for it`,
    );
  }
}

/** Injectable socket connector (tests substitute a fake). */
export type ConnectFn = (options: {
  address: string;
  port: number;
  servername: string;
  useTls: boolean;
  timeoutMs: number;
  signal?: AbortSignal;
}) => Socket | TLSSocket;

/** Default connector: real TCP/TLS, pinned to one validated address. */
export const defaultConnect: ConnectFn = ({ address, port, servername, useTls, timeoutMs, signal }) => {
  if (useTls) {
    return tlsConnect(
      { host: address, port, servername, rejectUnauthorized: true, ...(signal ? { signal } : {}) },
      undefined,
    );
  }
  const socket = netConnect({ host: address, port, ...(signal ? { signal } : {}) });
  socket.setTimeout(timeoutMs);
  return socket;
};

// ---------------------------------------------------------------------------
// request / response
// ---------------------------------------------------------------------------

/** One outbound provider request. */
export interface TransportRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  /** Serialized request body (POST only). Never logged. */
  body?: string;
  /** Structural description for diagnostics — no secrets. */
  label: string;
  trust: DestinationTrust;
  policy: OutboundPolicy;
  signal?: AbortSignal;
  /**
   * Skip the public-address check for this request. Only the built-in adapters
   * set this, and only for their own hardcoded official endpoint.
   */
  builtInOfficial?: boolean;
}

/** One outbound provider response. */
export interface TransportResponse {
  status: number;
  ok: boolean;
  contentType: string;
  /** Parsed JSON when the body parsed; otherwise undefined. */
  json?: unknown;
  /** Raw text (bounded) when JSON parsing was attempted or content was text. */
  text: string;
  /** True when the body exceeded the cap and was truncated. */
  truncated: boolean;
  headers: Headers;
}

/** Injectable seams so tests never open a socket. */
export interface TransportDeps {
  lookupAll: LookupAllFn;
  connect: ConnectFn;
  /** Resolve a proxy URL, or undefined when no proxy is configured. */
  proxyUrl?: () => string | undefined;
  /** Build a dispatcher for a proxy URL (undici ProxyAgent). */
  proxyDispatcher?: (proxyUrl: string) => Promise<unknown>;
  /** Bound the whole request (tests inject an instant timer). */
  now: () => number;
}

/** Result of a DNS pre-flight (also used by the connect guard). */
export interface DnsPreflight {
  addresses: ResolvedAddress[];
  allowPrivate: boolean;
}

/**
 * Resolve and validate every candidate address for a destination.
 * @throws {TransportError} when any candidate is disallowed.
 */
export async function preflightDns(
  hostname: string,
  trust: DestinationTrust,
  policy: OutboundPolicy,
  deps: Pick<TransportDeps, "lookupAll">,
): Promise<DnsPreflight> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const literal = isIP(host);

  // A literal address bypasses DNS entirely.
  if (literal !== 0) {
    const allowPrivate = trust === "official" || isAuthorizedPrivate(host, policy);
    assertAddressAllowed(host, allowPrivate);
    return { addresses: [{ address: host, family: literal }], allowPrivate };
  }

  let records: ResolvedAddress[];
  try {
    records = await deps.lookupAll(host);
  } catch (err) {
    throw new TransportError("network", `DNS lookup failed for "${host}": ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!records || records.length === 0) {
    throw new TransportError("network", `DNS lookup for "${host}" returned no addresses`);
  }

  const allowPrivate = trust === "official" || policy.authorizations.some((entry) => entry.allowPrivate && hostMatchesAuthorization(host, entry));
  for (const record of records) {
    assertAddressAllowed(record.address, allowPrivate);
  }
  return { addresses: records, allowPrivate };
}

function isAuthorizedPrivate(host: string, policy: OutboundPolicy): boolean {
  return policy.authorizations.some((entry) => entry.allowPrivate && hostMatchesAuthorization(host, entry));
}

/**
 * Fetch one provider endpoint under an explicit outbound policy.
 *
 * @throws {TransportError} on any policy, DNS, network, or size violation.
 */
export async function transact(
  request: TransportRequest,
  overrides: Partial<TransportDeps> = {},
): Promise<TransportResponse> {
  const deps: TransportDeps = {
    lookupAll: overrides.lookupAll ?? defaultLookupAll,
    connect: overrides.connect ?? defaultConnect,
    proxyUrl: overrides.proxyUrl,
    proxyDispatcher: overrides.proxyDispatcher,
    now: overrides.now ?? (() => Date.now()),
  };

  const parsed = assertEndpointUrl(request.url);
  const policy = request.policy;
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  const maxBytes = policy.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  // ---- 1. scheme & host authorization -----------------------------------
  const authorization = findAuthorization(parsed.hostname, port, policy);
  if (parsed.protocol === "http:") {
    const isAuthorizedHttp = authorization?.allowHttp === true;
    const allowed = request.trust === "official"
      ? isLoopbackHost(parsed.hostname)
      : (policy.allowPublicHttp === true || isAuthorizedHttp);
    if (!allowed) {
      throw new TransportError(
        "destination-blocked",
        "Plain http:// endpoints are only allowed for loopback defaults or an explicitly authorized target",
      );
    }
  }

  // ---- 2. host authorization (before DNS) --------------------------------
  if (request.trust === "authorized" && !authorization) {
    throw new TransportError("destination-blocked", `Destination "${parsed.hostname}:${port}" is not authorized`);
  }
  if ((request.trust === "official" || request.trust === "authorized") && authorization?.allowHttp && parsed.protocol === "http:") {
    // explicit http grant for a non-loopback authorized target
  }

  // ---- 3. header hygiene -------------------------------------------------
  for (const name of Object.keys(request.headers)) assertHeaderName(name);

  // ---- 4. proxy decision (fail closed) ----------------------------------
  const proxyUrl = deps.proxyUrl?.();
  let dispatcher: unknown;
  if (proxyUrl !== undefined && !(request.builtInOfficial === true)) {
    if (policy.allowProxy !== true) {
      throw new TransportError(
        "proxy-required",
        "A proxy is configured and this destination is not authorized for proxied requests: the final DNS resolution and connection would happen at the proxy, so the destination cannot be verified locally",
      );
    }
    dispatcher = await deps.proxyDispatcher?.(proxyUrl);
  }

  // ---- 5. DNS pre-flight + pinned connect --------------------------------
  const preflight = await preflightDns(parsed.hostname, request.trust, policy, deps);
  const pinned = preflight.addresses[0];
  const useTls = parsed.protocol === "https:";

  // Only attach the custom dispatcher when we are NOT pinning, i.e. built-in
  // official endpoints (whose host is trusted by construction) and proxied
  // requests (where the proxy performs the connection).
  const signal = combineAbort(request.signal, policy.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);

  const init: Record<string, unknown> = {
    method: request.method,
    headers: request.headers,
    // A 3xx must never re-send the credential to another origin.
    redirect: "error",
    signal: signal.signal,
    ...(request.body !== undefined ? { body: request.body } : {}),
  };
  let pinnedDispatcher: any = undefined;
  if (dispatcher !== undefined) {
    init.dispatcher = dispatcher;
  } else if (request.trust === "official") {
    // Built-in official endpoint: host is trusted by construction (no DNS
    // rebinding incentive — the credential goes where it was always going),
    // so the platform fetch resolves and connects normally. The redirect and
    // size guards above still apply.
  } else {
    // Operator-typed destination: always pinned to a pre-validated address.
    pinnedDispatcher = await createPinnedDispatcher({
      address: pinned.address,
      port,
      servername: parsed.hostname,
      useTls,
      connectTimeoutMs: policy.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      connect: deps.connect,
      signal: signal.signal,
    });
    init.dispatcher = pinnedDispatcher;
  }

  let response: Response;
  try {
    response = await fetch(parsed.href, init as RequestInit);
  } catch (err) {
    signal.dispose();
    if (pinnedDispatcher && typeof pinnedDispatcher.destroy === "function") {
      try { await pinnedDispatcher.destroy(); } catch {}
    }
    if (request.signal?.aborted) throw new TransportError("aborted", `${request.label} aborted by caller`);
    if (isTransportError(err)) throw err;
    const cause = describeCause(err);
    if (signal.timedOut()) throw new TransportError("timeout", `${request.label} timed out (${cause})`);
    // A rejected pinned connect surfaces here — surface the block, not a bare
    // "fetch failed", so the UI can explain the denial.
    if (isDestinationBlocked(cause)) throw new TransportError("destination-blocked", `${request.label}: ${cause}`);
    throw new TransportError("network", `${request.label} failed: ${cause}`);
  }

  try {
    // ---- 6. content-type + size bounded read -----------------------------
    const contentType = response.headers.get("content-type") ?? "";
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new TransportError("invalid-response", `${request.label} response is ${contentLength} bytes, above the ${maxBytes}-byte cap`);
    }

    const { text, truncated } = await readBounded(response, maxBytes, signal.signal);
    let json: unknown;
    if (looksLikeJson(contentType, text)) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new TransportError("invalid-response", `${request.label} returned a body that is not valid JSON`);
      }
    }
    return { status: response.status, ok: response.ok, contentType, json, text, truncated, headers: response.headers };
  } finally {
    signal.dispose();
    if (pinnedDispatcher && typeof pinnedDispatcher.destroy === "function") {
      try { await pinnedDispatcher.destroy(); } catch {}
    }
  }
}

/** Content-type gate for JSON parsing (a missing type still parses). */
function looksLikeJson(contentType: string, text: string): boolean {
  const type = contentType.toLowerCase();
  if (type.includes("json")) return true;
  if (type === "" || type.includes("text/plain")) {
    const head = text.trimStart()[0];
    return head === "{" || head === "[";
  }
  return false;
}

/** Read a response body up to `maxBytes`. */
async function readBounded(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ text: string; truncated: boolean }> {
  if (response.body === null) return { text: "", truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal.aborted) throw new TransportError("aborted", "response read aborted");
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        const keep = value.byteLength - (total - maxBytes);
        if (keep > 0) chunks.push(value.subarray(0, keep));
        truncated = true;
        break;
      }
      chunks.push(value);
    }
  } finally {
    // A capped read must not leave the socket streaming.
    if (truncated || signal.aborted) await reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(merged), truncated };
}

/** Build an undici dispatcher whose connections are pinned to one address. */
async function createPinnedDispatcher(options: {
  address: string;
  port: number;
  servername: string;
  useTls: boolean;
  connectTimeoutMs: number;
  connect: ConnectFn;
  signal: AbortSignal;
}): Promise<unknown> {
  const undici = (await import("undici").catch(() => undefined)) as
    | { Agent?: new (opts: unknown) => unknown; buildConnector?: (opts: unknown) => unknown }
    | undefined;
  if (!undici?.Agent) {
    // FAIL CLOSED. Without a dispatcher there is no way to bind the connection
    // to the address that was just validated, so the request would re-resolve
    // the name and re-open the DNS-rebinding hole this guard exists to close.
    // Refusing is the only safe option; silently degrading to a plain fetch is
    // exactly the failure mode that makes an SSRF guard worthless.
    throw new TransportError(
      "network",
      "Secure transport unavailable: the undici Agent required to pin the connection to a validated address could not be loaded",
    );
  }

  // Use Undici's buildConnector if default connector is active, ensuring full TLS,
  // ALPN, and HTTP/1.1 socket lifecycle handling while pinning DNS to options.address.
  let baseConnector: any;
  if (options.connect === defaultConnect && typeof undici.buildConnector === "function") {
    baseConnector = undici.buildConnector({
      lookup: (_hostname: string, _opts: any, cb: (err: Error | null, addresses: Array<{ address: string; family: number }>) => void) => {
        const family = options.address.includes(":") ? 6 : 4;
        cb(null, [{ address: options.address, family }]);
      },
      timeout: options.connectTimeoutMs,
    });
  }

  const connector = (opts: { hostname?: string; port?: string | number; servername?: string }, cb: (err: Error | null, socket: any) => void) => {
    // undici passes the authority it is about to dial. It must be exactly the
    // authority this transport approved, otherwise the client resolved (or
    // was redirected to) something we never authorized.
    const requestedPort = opts.port === undefined ? options.port : Number(opts.port);
    const requestedHost = String(opts.hostname ?? options.servername);
    if (requestedHost !== options.servername || !Number.isFinite(requestedPort) || requestedPort !== options.port) {
      const err = new TransportError(
        "destination-blocked",
        `Connection attempt for unapproved authority ${requestedHost}:${String(requestedPort)}`,
      );
      if (typeof cb === "function") cb(err, null);
      else throw err;
      return;
    }

    if (baseConnector) {
      baseConnector(opts, cb);
      return;
    }

    // Custom or mock connector path:
    try {
      const socket = options.connect({
        address: options.address,
        port: options.port,
        servername: options.servername,
        useTls: options.useTls,
        timeoutMs: options.connectTimeoutMs,
        signal: options.signal,
      });

      if (typeof cb === "function") {
        if ("once" in socket) {
          const onConnect = () => {
            cleanup();
            cb(null, socket);
          };
          const onError = (err: Error) => {
            cleanup();
            cb(err, null);
          };
          const cleanup = () => {
            socket.removeListener("connect", onConnect);
            socket.removeListener("secureConnect", onConnect);
            socket.removeListener("error", onError);
          };
          socket.once("error", onError);
          if (options.useTls) {
            socket.once("secureConnect", onConnect);
          } else {
            socket.once("connect", onConnect);
          }
        } else {
          cb(null, socket);
        }
      }
      return socket;
    } catch (err: any) {
      if (typeof cb === "function") cb(err instanceof Error ? err : new Error(String(err)), null);
      else throw err;
    }
  };

  return new undici.Agent({
    connect: connector,
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Caller abort + request timeout, merged with explicit cause tracking. */
function combineAbort(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onAbort = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    controller.abort(external?.reason);
  };
  if (external) {
    if (external.aborted) controller.abort(external.reason);
    else external.addEventListener("abort", onAbort, { once: true });
  }
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();
  }
  return {
    signal: controller.signal,
    dispose: () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (external) external.removeEventListener("abort", onAbort);
    },
    timedOut: () => timedOut,
  };
}

/** Flatten an undici error's cause chain into one diagnostic string. */
function describeCause(err: unknown): string {
  const top = err instanceof Error ? err.message : String(err);
  let cause: unknown = (err as { cause?: unknown })?.cause;
  const seen = new Set<unknown>([err]);
  while (cause !== undefined && cause !== null && !seen.has(cause)) {
    seen.add(cause);
    if (isTransportError(cause)) return cause.message;
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message && message !== top) return message;
    cause = (cause as { cause?: unknown })?.cause;
  }
  return top;
}

/** True when a flattened error came from the destination guard. */
function isDestinationBlocked(message: string): boolean {
  return /unapproved authority|not authorized|private, loopback, or link-local|blocked/i.test(message);
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  return /^127\./.test(host);
}
