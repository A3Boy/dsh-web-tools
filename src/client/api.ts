/**
 * dsh-web-tools — browser card: typed fetch client over the plugin's fenced
 * `/web-tools/api` routes.
 *
 * The browser never talks to provider APIs directly and never receives
 * credential values — only configured/writable state and quota snapshots
 * (which contain no secrets).
 * @module
 */

export const API_PREFIX = "/web-tools/api";

/** One wire failure. */
export class WebToolsApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Call one API method; throws WebToolsApiError on failure. */
export async function call<T>(method: string, payload?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });
  } catch (e) {
    throw new WebToolsApiError("network", `web-tools API unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new WebToolsApiError("bad-response", `web-tools API returned non-JSON (HTTP ${res.status})`);
  }
  const body = json as { ok?: boolean; value?: T; error?: { code?: string; message?: string } };
  if (!body.ok || body.value === undefined) {
    throw new WebToolsApiError(body.error?.code ?? "error", body.error?.message ?? "web-tools API error");
  }
  return body.value;
}

// ---------------------------------------------------------------------------
// typed endpoint wrappers
// ---------------------------------------------------------------------------

export interface ProviderView {
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  baseUrl?: string;
  credRef: string;
  keyConfigured: boolean;
  keyWritable: boolean;
  keyHint?: string;
  poolSize: number;
  pool: Array<{ hint: string; uses: number; healthy: boolean }>;
}

export interface ConfigView {
  enabled: boolean;
  defaultProvider: string;
  maxResults: number;
  searchTimeoutMs: number;
  fallbackOrder: string[];
  maxFallbackProviders: number;
  providers: ProviderView[];
}

export interface QuotaView {
  supported: boolean;
  authoritative: boolean;
  unit: string;
  remaining?: number;
  limit?: number;
  resetAt?: string;
  breakdown?: Record<string, number>;
  source: string;
  note?: string;
}

export interface TestSearchView {
  ok: boolean;
  backend?: string;
  latencyMs?: number;
  resultCount?: number;
  results?: Array<{ title: string; url: string; snippet: string }>;
  attempts?: Array<{ provider: string; outcome: string; latencyMs?: number }>;
  error?: { code: string; message: string };
}

export interface TestProviderView {
  ok: boolean;
  latencyMs?: number;
  resultCount?: number;
  title?: string;
  error?: { code: string; message: string };
}

export const api = {
  configGet: () => call<ConfigView>("config/get"),
  configSave: (payload: Record<string, unknown>) => call<{ saved: true }>("config/save", payload),
  credentialsDescribe: () => call<{ credentials: Record<string, { configured: boolean; source?: string; writable: boolean }> }>("credentials/describe"),
  credentialsSet: (provider: string, value: string) => call<{ configured: boolean; poolSize: number }>("credentials/set", { provider, value }),
  testProvider: (provider: string, query?: string) => call<TestProviderView>("test/provider", { provider, query }),
  testSearch: (query: string, provider?: string) => call<TestSearchView>("test/search", { query, provider }),
  quotaDescribe: () => call<{ quotas: Record<string, QuotaView> }>("quota/describe"),
};
