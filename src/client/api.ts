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
// typed endpoint wrappers (wire types shared with the Host — see shared/api-types)
// ---------------------------------------------------------------------------

import type { ConfigView, CredentialsView, QuotaDescribeView, TestProviderView, TestSearchView } from "../shared/api-types.ts";

export type { ConfigView, CredentialsView, ProviderView, QuotaDescribeView, QuotaView, TestProviderView, TestSearchView } from "../shared/api-types.ts";

export const api = {
  configGet: () => call<ConfigView>("config/get"),
  configSave: (payload: Record<string, unknown>) => call<{ saved: true }>("config/save", payload),
  credentialsDescribe: () => call<CredentialsView>("credentials/describe"),
  credentialsSet: (provider: string, value: string) => call<{ configured: boolean; poolSize: number }>("credentials/set", { provider, value }),
  credentialsAddKey: (provider: string, value: string) => call<{ configured: boolean; poolSize: number }>("credentials/add-key", { provider, value }),
  credentialsRemoveKey: (provider: string, keyId: string) => call<{ configured: boolean; poolSize: number }>("credentials/remove-key", { provider, keyId }),
  testProvider: (provider: string, query?: string) => call<TestProviderView>("test/provider", { provider, query }),
  testSearch: (query: string) => call<TestSearchView>("test/search", { query }),
  quotaDescribe: (force = false) => call<QuotaDescribeView>("quota/describe", { force }),
};
