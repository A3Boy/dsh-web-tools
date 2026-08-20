/**
 * dsh-web-tools — Advanced search runtime types.
 *
 * Provider-neutral runtime-level contracts for the provider-native advanced
 * search path. Basic `web_search({query})` stays on `ctx.web.search()`;
 * advanced search goes through dsh-web-tools' own AdvancedSearchRuntime,
 * which calls each provider's `ProviderAdvancedContract` directly — never
 * `ctx.web.search()`.
 *
 * Design rule: **basic request unified, advanced request heterogeneous,
 * evidence normalized.** This file defines zero provider-specific fields so
 * adding Parallel (`objective` + `search_queries[]`) later requires no changes
 * here.
 * @module
 */

// ---------------------------------------------------------------------------
// Capability state
// ---------------------------------------------------------------------------

/**
 * Per-provider capability snapshot handed to `validate` and `search`. Mirrors
 * the basic path's "is this provider usable right now?" but at the advanced
 * capability granularity (e.g. a provider may disable `deep-reasoning` under
 * load without dropping `auto`).
 */
export interface ProviderCapabilityState {
  /** Disabled capability names (e.g. "deep-reasoning"); empty = all usable. */
  readonly disabled: ReadonlySet<string>;
  /** Monotonic revision; bumps when capabilities change (for staleness checks). */
  readonly revision: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Preflight validation result for a provider-native advanced request. */
export interface AdvancedValidationResult<TRequest> {
  readonly ok: boolean;
  /** The normalized request when `ok`; `undefined` when not. */
  readonly request?: TRequest;
  /** Field-level violations when `ok === false`. */
  readonly fieldErrors?: readonly AdvancedFieldError[];
}

/** One field-level validation violation. */
export interface AdvancedFieldError {
  /** JSON path to the offending field (e.g. "additional_queries"). */
  readonly path: string;
  /** Human-readable reason (shown to the model in the tool result). */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Execution context
// ---------------------------------------------------------------------------

/** Context handed to a provider's advanced `search` call. */
export interface AdvancedSearchExecutionContext {
  /** Resolved API key for this provider attempt. */
  readonly apiKey: string;
  /** Per-provider base URL override (self-hosted) or `undefined`. */
  readonly baseUrl: string | undefined;
  /** Per-attempt timeout budget in milliseconds (0 = no timer). */
  readonly attemptTimeoutMs: number;
  /** Caller cancellation signal (never `undefined`; always connected). */
  readonly signal: AbortSignal;
}

// ---------------------------------------------------------------------------
// Provider failure
// ---------------------------------------------------------------------------

/**
 * Closed-union failure codes for the advanced path. Every provider's
 * `classifyError` must map into exactly one of these — never raw `Error`.
 */
export type AdvancedProviderFailureCode =
  | "REQUEST_INVALID"
  | "OPTION_CONFLICT"
  | "UNSUPPORTED_CAPABILITY"
  | "AUTH"
  | "RATE_LIMIT"
  | "QUOTA"
  | "TIMEOUT"
  | "UPSTREAM"
  | "NETWORK"
  | "ABORTED";

/** A classified advanced provider failure (never thrown raw). */
export interface AdvancedProviderFailure {
  readonly code: AdvancedProviderFailureCode;
  /** Human-readable, secret-free message (may reach the model). */
  readonly message: string;
  /** Original HTTP status when applicable. */
  readonly httpStatus?: number;
  /** Retry-After hint in milliseconds when the provider supplies one. */
  readonly retryAfterMs?: number;
  /** Field-level violations for `REQUEST_INVALID` / `OPTION_CONFLICT`. */
  readonly fieldErrors?: readonly AdvancedFieldError[];
}

// ---------------------------------------------------------------------------
// Structured outcome
// ---------------------------------------------------------------------------

/**
 * Normalized source (mirrors the basic `Source` shape so evidence is unified
 * across basic and advanced paths).
 */
export interface AdvancedSearchSource {
  readonly url: string;
  readonly title?: string;
  readonly snippet?: string;
  readonly publishedAt?: string;
  readonly author?: string;
  readonly score?: number;
  readonly highlights?: readonly string[];
}

/** Outcome kind — closed union, machine-readable. */
export type AdvancedSearchOutcomeKind =
  | "success"
  | "repair_required"
  | "provider_transition"
  | "configuration_error"
  | "provider_exhausted";

/** Success: sources returned. */
export interface AdvancedSearchSuccess {
  readonly kind: "success";
  readonly provider: string;
  readonly sources: readonly AdvancedSearchSource[];
  readonly truncated: boolean;
}

/** The request is structurally invalid; the model must fix the arguments. */
export interface AdvancedSearchRepairRequired {
  readonly kind: "repair_required";
  readonly provider: string;
  readonly failure: AdvancedProviderFailure;
}

/**
 * The active provider failed with a retryable error; the runtime has switched
 * the active provider. The next inference will expose the new provider's tool.
 * The model should NOT replay the old provider's arguments.
 */
export interface AdvancedSearchProviderTransition {
  readonly kind: "provider_transition";
  readonly provider: string;
  readonly transition: {
    readonly from: string;
    readonly to: string;
    readonly nextTool: string;
    readonly reason: string;
  };
}

/** The provider is misconfigured (missing key, wrong base URL, etc.). */
export interface AdvancedSearchConfigurationError {
  readonly kind: "configuration_error";
  readonly provider: string;
  readonly failure: AdvancedProviderFailure;
}

/** Every provider in the chain is exhausted; the search cannot continue. */
export interface AdvancedSearchProviderExhausted {
  readonly kind: "provider_exhausted";
  readonly attempts: ReadonlyArray<{
    readonly provider: string;
    readonly outcome: string;
  }>;
}

/** Discriminated union of all advanced search outcomes. */
export type AdvancedSearchOutcome =
  | AdvancedSearchSuccess
  | AdvancedSearchRepairRequired
  | AdvancedSearchProviderTransition
  | AdvancedSearchConfigurationError
  | AdvancedSearchProviderExhausted;

// ---------------------------------------------------------------------------
// Provider advanced contract
// ---------------------------------------------------------------------------

/**
 * A provider-native advanced search contract. Each provider owns its own
 * `TRequest` type, tool schema, validator, wire mapping, and error
 * classification — the runtime never translates between providers.
 *
 * The contract is **optional** on `ProviderAdapter`: providers without
 * advanced support simply have `advanced: undefined`, and the runtime reports
 * `provider_transition` (or `provider_exhausted`) when no advanced-capable
 * provider is available.
 */
export interface ProviderAdvancedContract<TRequest> {
  /** Model-facing tool name (e.g. `web_search_exa`). */
  readonly toolName: string;
  /** Model-facing tool description. */
  readonly toolDescription: string;
  /** Model-facing parameter schema (dsh-tools `ParameterSchemaSpec`). */
  readonly toolParameters: Record<string, unknown>;
  /** Protocol text injected into the system prompt when this provider is active. */
  readonly protocolText: string;

  /**
   * Deterministic preflight validation — runs BEFORE any network call.
   * Catch provider-specific option conflicts (e.g. Exa `additionalQueries`
   * with non-deep type) here, not at the API.
   */
  validate(
    input: unknown,
    capabilities: ProviderCapabilityState,
  ): AdvancedValidationResult<TRequest>;

  /**
   * Execute the provider-native search. Never throws — on failure, return a
   * classified `AdvancedProviderFailure` via `classifyError`.
   */
  search(
    request: TRequest,
    context: AdvancedSearchExecutionContext,
  ): Promise<AdvancedSearchResult>;

  /** Classify any thrown error into the closed failure taxonomy. */
  classifyError(error: unknown): AdvancedProviderFailure;
}

/** Return type of `ProviderAdvancedContract.search` — success or failure. */
export type AdvancedSearchResult =
  | {
    readonly ok: true;
    readonly sources: readonly AdvancedSearchSource[];
    readonly truncated: boolean;
  }
  | {
    readonly ok: false;
    readonly failure: AdvancedProviderFailure;
  };
