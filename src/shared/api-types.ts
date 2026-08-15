/**
 * dsh-web-tools — shared wire types between Host routes and the Client card.
 *
 * Single source of truth for the /web-tools/api contract, so Host return
 * shapes and Client consumption cannot drift apart.
 * @module
 */

/** One provider as surfaced to the settings card. */
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
  /** Number of keys in the credential pool (no per-key health — runtime state). */
  poolSize: number;
}

/** Full config snapshot for the card. */
export interface ConfigView {
  enabled: boolean;
  defaultProvider: string;
  providerAttemptTimeoutMs: number;
  fallbackOrder: string[];
  providers: ProviderView[];
}

/** One quota snapshot for the card (display only). */
export interface QuotaView {
  supported: boolean;
  authoritative: boolean;
  unit: string;
  remaining?: number;
  used?: number;
  limit?: number;
  resetAt?: string;
  breakdown?: Record<string, number>;
  source: string;
  note?: string;
}

/** Result of a Test Search run through the real executor. */
export interface TestSearchView {
  ok: boolean;
  backend?: string;
  latencyMs?: number;
  resultCount?: number;
  results?: Array<{ title: string; url: string; snippet: string }>;
  attempts?: Array<{ provider: string; outcome: string; latencyMs?: number }>;
  error?: { code: string; message: string };
}

/** Result of a single-provider connection test. */
export interface TestProviderView {
  ok: boolean;
  latencyMs?: number;
  resultCount?: number;
  title?: string;
  error?: { code: string; message: string };
}

/** A credential's configured state (values never cross the wire). */
export interface CredentialView {
  configured: boolean;
  source?: string;
  writable: boolean;
}

/** The full credentials/describe response. */
export interface CredentialsView {
  credentials: Record<string, CredentialView>;
}

/** The full quota/describe response. */
export interface QuotaDescribeView {
  quotas: Record<string, QuotaView>;
}
