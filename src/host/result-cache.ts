/**
 * dsh-web-tools — short-lived result cache + in-flight coalescing (pure logic, no I/O).
 *
 * Only successful results are cached. Identical concurrent requests share one
 * upstream call; the upstream call is aborted only when EVERY waiter has
 * cancelled, so one caller's cancellation never cancels another caller's request.
 * @module
 */
import { createHash } from "node:crypto";

export interface ResultCacheOptions {
  /** Entry lifetime in ms (absolute from insertion; reads do not extend it). */
  ttlMs: number;
  maxEntries: number;
  /** Total size budget in `sizeOf` units; a single larger value is never cached. */
  maxBytes?: number;
  now?: () => number;
  sizeOf?: (value: unknown) => number;
}

interface CacheSlot<T> {
  value: T;
  expiresAt: number;
  bytes: number;
}

export interface ResultCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
  readonly bytes: number;
}

export function defaultSizeOf(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    return 0;
  }
}

/** TTL + LRU cache bounded by entry count and total size. */
export function createResultCache<T>(options: ResultCacheOptions): ResultCache<T> {
  const now = options.now ?? (() => Date.now());
  const sizeOf = options.sizeOf ?? defaultSizeOf;
  const maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY;
  const slots = new Map<string, CacheSlot<T>>();
  let totalBytes = 0;

  const drop = (key: string) => {
    const slot = slots.get(key);
    if (!slot) return;
    totalBytes -= slot.bytes;
    slots.delete(key);
  };

  const evict = () => {
    while (slots.size > options.maxEntries || totalBytes > maxBytes) {
      const oldest = slots.keys().next();
      if (oldest.done) break;
      drop(oldest.value);
    }
  };

  return {
    get(key) {
      const slot = slots.get(key);
      if (!slot) return undefined;
      if (now() >= slot.expiresAt) {
        drop(key);
        return undefined;
      }
      // Refresh recency (Map keeps insertion order; oldest key is evicted first).
      slots.delete(key);
      slots.set(key, slot);
      return slot.value;
    },
    set(key, value) {
      const bytes = sizeOf(value);
      drop(key);
      if (bytes > maxBytes) return;
      slots.set(key, { value, expiresAt: now() + options.ttlMs, bytes });
      totalBytes += bytes;
      evict();
    },
    delete: drop,
    clear() {
      slots.clear();
      totalBytes = 0;
    },
    get size() {
      return slots.size;
    },
    get bytes() {
      return totalBytes;
    },
  };
}

// ---------------------------------------------------------------------------
// keys
// ---------------------------------------------------------------------------

/** Trim and collapse whitespace so trivially different queries share an entry. */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(",")}}`;
}

/** Order-independent short hash of the configuration that shapes results. */
export function fingerprint(value: unknown): string {
  return createHash("sha1").update(stableStringify(value)).digest("hex").slice(0, 16);
}

export function searchCacheKey(query: string, maxResults: number | undefined, configFingerprint: string): string {
  return `search|${configFingerprint}|${maxResults ?? ""}|${normalizeQuery(query)}`;
}

/** Fragments never reach the server, so they must not split cache entries. */
export function fetchCacheKey(url: string, configFingerprint: string): string {
  let normalized = url.trim();
  try {
    const parsed = new URL(normalized);
    parsed.hash = "";
    normalized = parsed.href;
  } catch {
    // keep the raw string for unparsable input
  }
  return `fetch|${configFingerprint}|${normalized}`;
}

// ---------------------------------------------------------------------------
// in-flight coalescing
// ---------------------------------------------------------------------------

function abortError(): Error {
  return Object.assign(new Error("aborted by caller"), { code: "aborted" });
}

interface InFlight<T> {
  promise: Promise<T>;
  controller: AbortController;
  waiters: number;
}

export interface Coalescer<T> {
  run(key: string, factory: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T>;
  readonly size: number;
}

/**
 * Share one in-flight call per key. The factory's signal fires only when all
 * waiters have aborted; an aborted waiter itself rejects with code `aborted`.
 */
export function createCoalescer<T>(): Coalescer<T> {
  const inflight = new Map<string, InFlight<T>>();

  return {
    run(key, factory, signal) {
      if (signal?.aborted) return Promise.reject(abortError());

      let entry = inflight.get(key);
      if (!entry) {
        const controller = new AbortController();
        const created: InFlight<T> = { controller, waiters: 0, promise: undefined as unknown as Promise<T> };
        created.promise = Promise.resolve()
          .then(() => factory(controller.signal))
          .finally(() => {
            if (inflight.get(key) === created) inflight.delete(key);
          });
        // Waiters observe the rejection; this only prevents an unhandled-rejection
        // report when every waiter has already left.
        created.promise.catch(() => {});
        inflight.set(key, created);
        entry = created;
      }

      const shared = entry;
      shared.waiters += 1;

      return new Promise<T>((resolve, reject) => {
        let settled = false;
        const onAbort = () => {
          if (settled) return;
          settled = true;
          shared.waiters -= 1;
          if (shared.waiters <= 0) {
            // Detach first so a new caller starts fresh instead of joining a dying call.
            if (inflight.get(key) === shared) inflight.delete(key);
            shared.controller.abort(signal?.reason);
          }
          reject(abortError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        shared.promise.then(
          (value) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            resolve(value);
          },
          (error) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            reject(error);
          },
        );
      });
    },
    get size() {
      return inflight.size;
    },
  };
}

// ---------------------------------------------------------------------------
// cache + coalescing together
// ---------------------------------------------------------------------------

export interface CachedCallArgs<T> {
  cache: ResultCache<T>;
  coalescer: Coalescer<T>;
  key: string;
  factory: (signal: AbortSignal) => Promise<T>;
  signal?: AbortSignal;
  /** Skip reads and writes (manual "test search"); never joins a cached call. */
  bypass?: boolean;
  /** Return false to keep a successful-but-useless result (e.g. empty) out of the cache. */
  shouldCache?: (value: T) => boolean;
}

/** Serve from cache, else run once (shared among identical callers) and cache successes. */
export async function cachedCall<T>(args: CachedCallArgs<T>): Promise<{ value: T; cacheHit: boolean }> {
  const { cache, coalescer, key, factory, signal, bypass } = args;
  if (signal?.aborted) throw abortError();
  if (!bypass) {
    const hit = cache.get(key);
    if (hit !== undefined) return { value: hit, cacheHit: true };
  }
  const value = await coalescer.run(
    bypass ? `bypass:${key}` : key,
    async (s) => {
      const result = await factory(s);
      if (!s.aborted && !bypass && (args.shouldCache?.(result) ?? true)) cache.set(key, result);
      return result;
    },
    signal,
  );
  return { value, cacheHit: false };
}
