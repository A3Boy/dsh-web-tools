window.__ModuleLoader__.load({
	id: "dsh-web-tools",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/api.ts
		/**
		* dsh-web-tools — browser card: typed fetch client over the plugin's fenced
		* `/web-tools/api` routes.
		*
		* The browser never talks to provider APIs directly and never receives
		* credential values — only configured/writable state and quota snapshots
		* (which contain no secrets).
		* @module
		*/
		const API_PREFIX = "/web-tools/api";
		/** One wire failure. */
		var WebToolsApiError = class extends Error {
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
			}
		};
		/** Call one API method; throws WebToolsApiError on failure. */
		async function call(method, payload) {
			let res;
			try {
				res = await fetch(`${API_PREFIX}/${method}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload ?? {})
				});
			} catch (e) {
				throw new WebToolsApiError("network", `web-tools API unreachable: ${e instanceof Error ? e.message : String(e)}`);
			}
			let json;
			try {
				json = await res.json();
			} catch {
				throw new WebToolsApiError("bad-response", `web-tools API returned non-JSON (HTTP ${res.status})`);
			}
			const body = json;
			if (!body.ok || body.value === void 0) throw new WebToolsApiError(body.error?.code ?? "error", body.error?.message ?? "web-tools API error");
			return body.value;
		}
		const api = {
			configGet: () => call("config/get"),
			configSave: (payload) => call("config/save", payload),
			credentialsDescribe: () => call("credentials/describe"),
			credentialsSet: (provider, value) => call("credentials/set", {
				provider,
				value
			}),
			credentialsAddKey: (provider, value) => call("credentials/add-key", {
				provider,
				value
			}),
			credentialsRemoveKey: (provider, keyId) => call("credentials/remove-key", {
				provider,
				keyId
			}),
			testProvider: (provider, query) => call("test/provider", {
				provider,
				query
			}),
			testSearch: (query) => call("test/search", { query }),
			quotaDescribe: (force = false) => call("quota/describe", { force }),
			searchModeGet: (sessionId) => call("search-mode/get", { sessionId }),
			searchModeSet: (sessionId, mode) => call("search-mode/set", {
				sessionId,
				mode
			})
		};
		//#endregion
		//#region src/client/theme.ts
		/**
		* dsh-web-tools — semantic theme tokens.
		*
		* Every color below maps to a DSH `--dsw-alias-*` variable so the page
		* inherits the host theme (light/dark) instead of deciding its own palette.
		* Components reference these constants — never raw hex — so the page cannot
		* drift from the DSH design language.
		* @module
		*/
		/** Text hierarchy. */
		const text = {
			primary: "var(--dsw-alias-label-primary)",
			secondary: "var(--dsw-alias-label-secondary)",
			tertiary: "var(--dsw-alias-label-tertiary)"
		};
		/** Surfaces & borders. */
		const surface = {
			bg: "var(--dsw-alias-bg-base)",
			layer1: "var(--dsw-alias-bg-layer-1)",
			layer2: "var(--dsw-alias-bg-layer-2)",
			border: "var(--dsw-alias-border-l2)",
			borderStrong: "var(--dsw-alias-border-l3)",
			hover: "var(--dsw-alias-interactive-bg-hover)",
			active: "var(--dsw-alias-interactive-bg-active)",
			hoverDanger: "var(--dsw-alias-interactive-bg-hover-danger)"
		};
		/** Semantic state colors. */
		const state = {
			success: "var(--dsw-alias-state-success-primary)",
			warning: "var(--dsw-alias-state-warn-primary)",
			warnLabel: "var(--dsw-alias-state-warn-label)",
			danger: "var(--dsw-alias-state-error-primary)",
			business: "var(--dsw-alias-state-business-primary)"
		};
		/** Buttons. */
		const button = {
			primaryFill: "var(--dsw-alias-button-primary-fill)",
			primaryText: "var(--dsw-alias-label-primary-foreground)",
			primaryHover: "var(--dsw-alias-button-primary-hover)",
			ghostActive: "var(--dsw-alias-button-ghost-active-fill)"
		};
		//#endregion
		//#region src/client/logic.ts
		/**
		* Resolve the effective page language. "auto" (or an unknown value) follows
		* the DSH UI language; anything other than "en" falls back to zh.
		*/
		function resolveUiLanguage(pref, dshActive) {
			if (pref === "zh" || pref === "en") return pref;
			return dshActive === "en" ? "en" : "zh";
		}
		/**
		* Translate one key from a locale dictionary with cross-locale fallback
		* ({name} placeholder substitution). Returns undefined when neither dict has
		* the key — the caller falls back to the DSH-bound translator.
		*/
		function translateDict(dict, fallback, key, params) {
			const raw = dict[key] ?? fallback[key];
			if (raw === void 0) return void 0;
			if (!params) return raw;
			return raw.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
		}
		/**
		* Status override from a connection-test result. A test that failed is NOT
		* automatically an auth error — `fetch failed` is usually a network problem.
		* Only an explicit auth/rate-limit classification overrides the static guess.
		* @returns the override status, or undefined when the test does not change it.
		*/
		function testOutcomeStatus(testResult) {
			if (!testResult || testResult.ok) return void 0;
			const code = testResult.error?.code ?? "";
			if (code === "auth" || code === "401" || code === "403") return "auth-error";
			if (code === "rate-limit" || code === "quota" || code === "429") return "rate-limited";
			return "unreachable";
		}
		function providerStatusOf(p, quota, inChain = true) {
			if (!inChain) return "not-in-chain";
			if (!(p.name === "searxng" ? p.baseUrlConfigured === true : p.keyConfigured)) return "not-configured";
			const note = (quota?.note ?? "").toLowerCase();
			if (note.includes("auth") || note.includes("401") || note.includes("403") || note.includes("invalid key")) return "auth-error";
			if (quota?.remaining === 0 && quota?.limit !== void 0 && quota?.limit > 0) return "rate-limited";
			if (note.includes("429") || note.includes("rate limit exceeded") || note.includes("quota exceeded")) return "rate-limited";
			return "ready";
		}
		function quotaDisplayKind(q) {
			if (!q) return "unavailable";
			if (q.source === "self_hosted") return "self_hosted";
			if (!q.supported) return "unavailable";
			if (q.limit !== void 0 && q.limit === 0 && q.remaining === void 0) return "unlimited";
			if (q.source === "local_estimate") return "observed_usage";
			if (q.source === "response_header") return "rate_limit";
			if (q.unit === "usd_cents") return "balance";
			if (q.unit === "credits" || q.unit === "requests" || q.unit === "tokens") {
				if (q.remaining !== void 0 && q.limit !== void 0 && q.limit > 0) return "remaining_of_limit";
				if (q.remaining !== void 0) return "rate_limit";
			}
			return "unavailable";
		}
		/** Quota one-line summary, provider-aware (no colors, no layout). */
		function quotaSummary(t, quota) {
			if (!quota?.supported) return "";
			const q = quota;
			if (q.limit !== void 0 && q.limit === 0 && q.remaining === void 0) return t("quotaUnlimited");
			if (q.unit === "credits" && q.remaining !== void 0) return t("quotaCredits", {
				r: q.remaining,
				l: q.limit !== void 0 && q.limit > 0 ? q.limit : "?"
			});
			if (q.unit === "requests" && q.remaining !== void 0) return t("quotaRequests", {
				r: q.remaining,
				l: q.limit !== void 0 && q.limit > 0 ? ` / ${q.limit}` : ""
			});
			if (q.unit === "usd_cents" && q.used !== void 0) return t("quotaUsd", { amount: (q.used / 100).toFixed(2) });
			if (q.unit === "usd_cents" && q.remaining !== void 0) return t("quotaUsdRemaining", { amount: (q.remaining / 100).toFixed(2) });
			if (q.unit === "tokens" && q.remaining !== void 0) return t("quotaTokens", { n: q.remaining.toLocaleString() });
			if (q.remaining !== void 0) return `${q.remaining}${q.limit !== void 0 && q.limit > 0 ? ` / ${q.limit}` : ""}`;
			return "";
		}
		/**
		* Remaining-fraction for a progress bar, or undefined when a percentage
		* cannot honestly be computed. Bars are drawn ONLY for countable
		* remaining_of_limit snapshots AND only when remaining ≤ limit — a
		* remaining > limit (e.g. Firecrawl 1,166 / 1,000 plan credits) never gets a
		* fabricated >100% bar.
		* @returns fraction 0..1, or undefined when no bar should be drawn.
		*/
		function quotaFraction(q) {
			if (quotaDisplayKind(q) !== "remaining_of_limit") return void 0;
			const remaining = q?.remaining;
			const limit = q?.limit;
			if (remaining === void 0 || limit === void 0 || limit <= 0) return void 0;
			if (remaining > limit) return void 0;
			return Math.min(1, Math.max(0, remaining / limit));
		}
		/** Human "remaining" label, e.g. "823 / 1,000 credits". */
		function quotaRemainingLabel(t, q) {
			if (!q?.supported || q.remaining === void 0) return "";
			if (q.unit === "credits" && q.limit !== void 0 && q.limit > 0) return t("quotaCredits", {
				r: q.remaining.toLocaleString(),
				l: q.limit.toLocaleString()
			});
			if (q.unit === "requests" && q.limit !== void 0 && q.limit > 0) return t("quotaRequests", {
				r: q.remaining.toLocaleString(),
				l: ` / ${q.limit.toLocaleString()}`
			});
			return quotaSummary(t, q);
		}
		/** Secondary line for a quota snapshot (plan / since), or "". */
		function quotaMetaLine(t, q) {
			if (!q) return "";
			const kind = quotaDisplayKind(q);
			if (kind === "remaining_of_limit" && q.remaining !== void 0 && q.limit !== void 0 && q.remaining > q.limit) return t("quotaOverPlan", {
				r: q.remaining.toLocaleString(),
				l: q.limit.toLocaleString()
			});
			if (kind === "observed_usage" && q.remaining !== void 0) return t("quotaSince", { amount: (q.remaining / 100).toFixed(2) });
			return "";
		}
		/** Human-readable attempt outcome (from Host `attempts[].outcome`). */
		function outcomeLabel(t, outcome) {
			if (outcome === "success") return t("successOutcome");
			if (outcome.startsWith("failed:")) {
				const code = outcome.slice(7);
				switch (code) {
					case "auth": return t("authOutcome");
					case "rate-limit": return t("rateLimitedOutcome");
					case "quota": return t("rateLimitedOutcome");
					case "timeout": return t("timeoutOutcome");
					case "network": return t("networkOutcome");
					case "server": return t("serverOutcome");
					case "aborted": return t("abortedOutcome");
					case "config": return t("configOutcome");
					case "bad-request": return t("badRequestOutcome");
					case "invalid-response": return t("invalidResponseOutcome");
					default: return code;
				}
			}
			if (outcome.startsWith("skipped-")) return t("unknownOutcome");
			return t("unknownOutcome");
		}
		//#endregion
		//#region src/client/ProviderModal.tsx
		/**
		* dsh-web-tools — provider detail dialog (Modal).
		*
		* One provider's full management surface: enabled switch, status, quota with
		* progress + refresh, per-key credential list with add/remove (the Host keeps
		* its comma-joined credential string; the browser only ever sees masked
		* hints), self-hosted Base URL, and a connection test.
		*
		* Default page shows NO password input — editing happens one key at a time.
		* @module
		*/
		function QuotaBar(props) {
			const { quota, t, onRefresh } = props;
			const [refreshing, setRefreshing] = (0, react.useState)(false);
			const kind = quotaDisplayKind(quota);
			if (kind === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					color: text.tertiary,
					fontSize: 12
				},
				children: t("quotaUnavailable")
			});
			if (kind === "self_hosted") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					color: text.tertiary,
					fontSize: 12
				},
				children: t("quotaSelfHostedShort")
			});
			if (kind === "unlimited") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					color: text.secondary,
					fontSize: 12
				},
				children: t("quotaUnlimited")
			});
			const fraction = quotaFraction(quota);
			const fillColor = state.success;
			const label = quotaRemainingLabel(t, quota) || quotaSummary(t, quota) || t("quotaUnavailable");
			const ago = quota.fetchedAt !== void 0 ? quota.fetchedAt > Date.now() - 6e4 ? t("updatedJustNow") : t("updatedAgo", { mins: Math.max(1, Math.round((Date.now() - quota.fetchedAt) / 6e4)) }) : void 0;
			const meta = [
				quota.remaining !== void 0 && quota.limit !== void 0 && quota.remaining > quota.limit ? t("quotaOverPlan", {
					r: quota.remaining.toLocaleString(),
					l: quota.limit.toLocaleString()
				}) : void 0,
				quotaSourceLabel(t, quota.source),
				ago
			].filter((x) => typeof x === "string" && x.length > 0).join(" · ");
			const refresh = async () => {
				setRefreshing(true);
				try {
					onRefresh();
				} finally {
					setTimeout(() => setRefreshing(false), 600);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 6
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: 14,
									color: text.primary
								},
								children: label
							}),
							fraction !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									color: fillColor,
									fontSize: 12,
									fontWeight: 600
								},
								children: [Math.round(fraction * 100), "%"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { marginLeft: "auto" },
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "ghost",
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 14 }),
									onClick: () => void refresh(),
									disabled: refreshing,
									children: t("refreshQuota")
								})
							})
						]
					}),
					fraction !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							height: 6,
							borderRadius: 3,
							background: surface.layer2,
							overflow: "hidden"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
							width: `${fraction * 100}%`,
							height: "100%",
							background: fillColor,
							transition: "width .3s ease"
						} })
					}),
					meta && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: text.tertiary,
							fontSize: 11
						},
						children: meta
					}),
					quota.breakdown && Object.keys(quota.breakdown).length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							color: text.tertiary,
							fontSize: 11
						},
						children: [
							t("usage"),
							": ",
							Object.entries(quota.breakdown).map(([k, v]) => `${k} ${v}`).join(" · ")
						]
					})
				]
			});
		}
		/** Quiet human source label (no "Official/Authoritative" tag stacking). */
		function quotaSourceLabel(t, source) {
			if (!source) return "";
			const key = `quotaSource${source[0].toUpperCase()}${source.slice(1)}`;
			const value = t(key);
			return value !== key ? value : t("quotaSource", { s: source });
		}
		/** Credential list: masked hints + health + add/remove (no plaintext). */
		function CredentialList(props) {
			const { t, p, onChanged, onAfterChange, onError } = props;
			const [adding, setAdding] = (0, react.useState)(false);
			const [draft, setDraft] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(null);
			const keys = p.keys ?? [];
			const addKey = async () => {
				const value = draft.trim();
				if (!value) return;
				setBusy("add");
				try {
					await api.credentialsAddKey(p.name, value);
					setDraft("");
					setAdding(false);
					onChanged();
					await onAfterChange();
					onChanged();
				} catch (e) {
					onError(e instanceof Error ? e.message : String(e));
				} finally {
					setBusy(null);
				}
			};
			const removeKey = async (keyId) => {
				setBusy(keyId);
				try {
					await api.credentialsRemoveKey(p.name, keyId);
					onChanged();
				} catch (e) {
					onError(e instanceof Error ? e.message : String(e));
				} finally {
					setBusy(null);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 6
				},
				children: [
					keys.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: text.secondary,
							fontSize: 12
						},
						children: t("keysConfigured", { n: keys.length })
					}),
					keys.map((k) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							fontSize: 13
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontFamily: "var(--ds-font-family-code, ui-monospace, Menlo, Consolas, monospace)",
									color: text.primary,
									minWidth: 0,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: k.hint
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									color: k.healthy ? state.success : state.danger,
									fontSize: 12,
									whiteSpace: "nowrap"
								},
								children: k.healthy ? t("keyReady") : t("keyAuthError")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { marginLeft: "auto" },
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "ghost",
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, { size: 14 }),
									onClick: () => void removeKey(k.id),
									disabled: busy === k.id,
									"aria-label": t("removeKey")
								})
							})
						]
					}, k.id)),
					adding ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 6,
							alignItems: "center",
							marginTop: 4
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								autoFocus: true,
								type: "password",
								value: draft,
								onChange: (e) => setDraft(e.target.value),
								onKeyDown: (e) => {
									if (e.key === "Enter") addKey();
								},
								placeholder: t("addKeyPlaceholder"),
								style: {
									flex: 1,
									padding: "6px 10px",
									borderRadius: 6,
									border: `1px solid ${surface.border}`,
									background: surface.layer2,
									color: text.primary,
									fontFamily: "inherit",
									fontSize: 13
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "primary",
								onClick: () => void addKey(),
								disabled: busy === "add" || !draft.trim(),
								children: t("add")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								onClick: () => {
									setAdding(false);
									setDraft("");
								},
								children: t("cancel")
							})
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 4 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: "outline",
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
							onClick: () => setAdding(true),
							children: t("addKey")
						})
					})
				]
			});
		}
		function ProviderModal(props) {
			const { t, p, quota, testResult, busy, isDefault, inChain, onClose, onToggle, onBaseUrl, onTest, onRefreshQuota, onConfigChanged } = props;
			const [localError, setLocalError] = (0, react.useState)("");
			const base = providerStatusOf(p, quota, inChain);
			const status = base === "ready" ? testOutcomeStatus(testResult) ?? base : base;
			const statusText = {
				ready: t("ready"),
				"rate-limited": t("rateLimited"),
				"auth-error": t("authError"),
				"unreachable": t("unreachable"),
				"not-configured": t("notConfigured"),
				"not-in-chain": t("notInChain")
			}[status];
			const statusState = status === "ready" ? "done" : status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "hollow";
			const statusColor = status === "ready" ? state.success : status === "auth-error" ? state.danger : status === "rate-limited" || status === "unreachable" ? state.warning : text.tertiary;
			const selfHosted = p.name === "searxng";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: p.label,
				closeLabel: t("close"),
				description: p.description,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							onClick: onTest,
							disabled: busy,
							style: { flex: "none" },
							children: busy ? t("testingConnection") : t("testConnection")
						}),
						testResult && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								fontSize: 12,
								color: testResult.ok ? state.success : state.danger,
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
								state: testResult.ok ? "done" : "error",
								size: 8
							}), testResult.ok ? `${t("testOk")} · ${testResult.latencyMs}ms · ${t("resultCount", { n: testResult.resultCount ?? 0 })}` : `${t("testFail")}: ${testResult.error?.message ?? ""}`]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								marginLeft: "auto",
								flex: "none"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "ghost",
								onClick: onClose,
								children: t("close")
							})
						})
					]
				}),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 20
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 10
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
									checked: p.enabled,
									onChange: onToggle,
									label: p.enabled ? t("enabledLabel") : t("disabledLabel")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: text.secondary,
										fontSize: 13
									},
									children: p.enabled ? t("enabledLabel") : t("disabledLabel")
								}),
								isDefault && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: "var(--dsw-alias-brand-primary)",
										fontSize: 12,
										fontWeight: 600,
										border: "1px solid currentColor",
										borderRadius: 4,
										padding: "0 6px"
									},
									children: t("defaultProviderLabel")
								}),
								!inChain && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: text.tertiary,
										fontSize: 12
									},
									children: t("notInChain")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
								style: {
									margin: 0,
									fontSize: 13,
									fontWeight: 600,
									color: text.secondary
								},
								children: t("providerStatus")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 8,
									fontSize: 14
								},
								children: [
									statusState === "hollow" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": true,
										style: {
											width: 10,
											height: 10,
											borderRadius: "50%",
											border: `1.5px solid ${text.tertiary}`,
											flex: "none",
											boxSizing: "border-box"
										}
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
										state: statusState,
										size: 10
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											color: statusColor,
											fontWeight: 500
										},
										children: statusText
									}),
									status === "ready" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										style: {
											color: text.tertiary,
											fontSize: 12
										},
										children: ["· ", t("connected")]
									})
								]
							})]
						}),
						quota && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
								style: {
									margin: 0,
									fontSize: 13,
									fontWeight: 600,
									color: text.secondary
								},
								children: t("quotaTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaBar, {
								quota,
								t,
								onRefresh: onRefreshQuota
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
								style: {
									margin: 0,
									fontSize: 13,
									fontWeight: 600,
									color: text.secondary
								},
								children: t("credentials")
							}), p.keyWritable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CredentialList, {
								t,
								p,
								onChanged: onConfigChanged,
								onAfterChange: onTest,
								onError: setLocalError
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									color: text.tertiary,
									fontSize: 12
								},
								children: t("notConfigured")
							})]
						}),
						(selfHosted || p.baseUrl !== void 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
								style: {
									margin: 0,
									fontSize: 13,
									fontWeight: 600,
									color: text.secondary
								},
								children: t("baseUrlLabel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									gap: 8,
									alignItems: "center"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									value: p.baseUrl ?? "",
									onChange: (e) => onBaseUrl(e.target.value),
									placeholder: t("baseUrlPlaceholder"),
									style: {
										flex: 1,
										padding: "6px 10px",
										borderRadius: 6,
										border: `1px solid ${surface.border}`,
										background: surface.layer2,
										color: text.primary,
										fontFamily: "inherit",
										fontSize: 13
									}
								}), !p.baseUrl && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: text.tertiary,
										fontSize: 12,
										whiteSpace: "nowrap"
									},
									children: t("baseUrlDefault")
								})]
							})]
						}),
						localError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								color: state.danger,
								fontSize: 12
							},
							children: localError
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/RoutingModal.tsx
		/**
		* dsh-web-tools — search-order editor dialog (Modal).
		*
		* Edits ONE ordered list = [defaultProvider, ...fallbackOrder]; persists back
		* with the Host schema untouched (defaultProvider = list[0], fallbackOrder =
		* rest). Per-row actions: make default / move up / move down / remove.
		* Add appends an enabled provider not yet in the chain.
		* @module
		*/
		function RoutingModal(props) {
			const { t, providers, ordered, onClose, onSave } = props;
			const [draft, setDraft] = (0, react.useState)(ordered);
			const [showAdd, setShowAdd] = (0, react.useState)(false);
			const dragIndex = (0, react.useRef)(null);
			const [overIndex, setOverIndex] = (0, react.useState)(null);
			const providerOf = (name) => providers.find((p) => p.name === name);
			const enabledNames = new Set(providers.filter((p) => p.enabled).map((p) => p.name));
			const available = providers.filter((p) => p.enabled && !draft.includes(p.name)).map((p) => p.name);
			const move = (index, delta) => {
				const target = index + delta;
				if (target < 0 || target >= draft.length) return;
				const next = [...draft];
				[next[index], next[target]] = [next[target], next[index]];
				setDraft(next);
			};
			const reorder = (from, to) => {
				if (from === to || from < 0 || to < 0 || from >= draft.length || to >= draft.length) return;
				const next = [...draft];
				const [moved] = next.splice(from, 1);
				next.splice(to, 0, moved);
				setDraft(next);
			};
			const remove = (name) => {
				if (draft[0] === name) return;
				setDraft(draft.filter((n) => n !== name));
			};
			const add = (name) => {
				setDraft([...draft, name]);
				setShowAdd(false);
			};
			const dirty = draft.join(",") !== ordered.join(",");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: t("orderLabel"),
				closeLabel: t("close"),
				description: t("orderHint"),
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								color: text.tertiary,
								fontSize: 12,
								marginRight: "auto"
							},
							children: t("defaultFirstHint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "ghost",
							onClick: onClose,
							children: t("cancel")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							disabled: !dirty,
							onClick: () => {
								onSave(draft);
								onClose();
							},
							children: t("save")
						})
					]
				}),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 4
					},
					children: [
						draft.map((name, i) => {
							const p = providerOf(name);
							const ok = p !== void 0 && enabledNames.has(name);
							const isDefault = i === 0;
							const isOver = overIndex === i && dragIndex.current !== null && dragIndex.current !== i;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								draggable: true,
								onDragStart: (e) => {
									dragIndex.current = i;
									e.dataTransfer.effectAllowed = "move";
									e.dataTransfer.setData("text/plain", name);
								},
								onDragOver: (e) => {
									e.preventDefault();
									e.dataTransfer.dropEffect = "move";
									if (overIndex !== i) setOverIndex(i);
								},
								onDragLeave: () => {
									if (overIndex === i) setOverIndex(null);
								},
								onDrop: (e) => {
									e.preventDefault();
									const from = dragIndex.current;
									dragIndex.current = null;
									setOverIndex(null);
									if (from !== null) reorder(from, i);
								},
								onDragEnd: () => {
									dragIndex.current = null;
									setOverIndex(null);
								},
								style: {
									display: "flex",
									alignItems: "center",
									gap: 10,
									padding: "10px 12px",
									borderRadius: 10,
									background: isOver ? surface.hover : surface.layer1,
									border: `1px solid ${isOver ? "var(--dsw-alias-brand-primary)" : surface.border}`,
									opacity: ok ? 1 : .55,
									cursor: "grab"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": true,
										style: {
											color: text.tertiary,
											fontSize: 14,
											cursor: "grab",
											userSelect: "none",
											flex: "none"
										},
										title: t("moveUp"),
										children: "⠿"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										style: {
											color: text.tertiary,
											fontSize: 12,
											width: 18
										},
										children: [i + 1, "."]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											color: text.primary,
											fontWeight: isDefault ? 600 : 400,
											fontSize: 14
										},
										children: p?.label ?? name
									}),
									isDefault && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											color: "var(--dsw-alias-brand-primary)",
											fontSize: 11,
											fontWeight: 600,
											border: "1px solid currentColor",
											borderRadius: 4,
											padding: "0 6px"
										},
										children: t("defaultProviderLabel")
									}),
									!ok && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											color: state.danger,
											fontSize: 12
										},
										children: t("disabledLabel")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										style: {
											marginLeft: "auto",
											display: "flex",
											gap: 2
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												size: "sm",
												variant: "ghost",
												icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutline14, { size: 14 }),
												disabled: i === 0,
												onClick: () => move(i, -1),
												"aria-label": t("moveUp")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												size: "sm",
												variant: "ghost",
												icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { size: 14 }),
												disabled: i === draft.length - 1,
												onClick: () => move(i, 1),
												"aria-label": t("moveDown")
											}),
											!isDefault && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												size: "sm",
												variant: "ghost",
												onClick: () => remove(name),
												"aria-label": t("removeFromChain"),
												children: "×"
											})
										]
									})
								]
							}, name);
						}),
						draft.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								color: text.tertiary,
								fontSize: 13,
								padding: "8px 4px"
							},
							children: t("notConfigured")
						}),
						showAdd ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 4,
								padding: "8px 4px"
							},
							children: [available.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									color: text.tertiary,
									fontSize: 13
								},
								children: t("noAvailableProviders")
							}) : available.map((name) => {
								const p = providerOf(name);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => add(name),
									style: {
										display: "flex",
										alignItems: "center",
										gap: 8,
										padding: "8px 10px",
										background: "transparent",
										border: "none",
										borderRadius: 8,
										cursor: "pointer",
										fontFamily: "inherit",
										fontSize: 13,
										color: text.primary,
										textAlign: "left"
									},
									onMouseEnter: (e) => e.currentTarget.style.background = surface.hover,
									onMouseLeave: (e) => e.currentTarget.style.background = "transparent",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
										state: "warning",
										size: 8
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: p?.label ?? name })]
								}, name);
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { marginTop: 4 },
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "ghost",
									onClick: () => setShowAdd(false),
									children: t("cancel")
								})
							})]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: { padding: "8px 4px" },
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "outline",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
								onClick: () => setShowAdd(true),
								disabled: available.length === 0,
								children: t("addToChain")
							})
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/WebToolsSection.tsx
		/**
		* dsh-web-tools — Web Search settings page (settings.section, id "web-tools").
		*
		* Information architecture: a one-level Settings page.
		*   - header row: title + enabled switch
		*   - search order summary + edit entry (RoutingModal)
		*   - Providers: one unified list surface (row per provider → ProviderModal)
		*   - Test Search (real run through the Host chain, human-readable timeline)
		*   - Advanced: collapsible low-frequency knobs (timeout)
		*
		* Credentials are NEVER shown as plaintext: the page shows masked hints and
		* manages keys one at a time through Host add/remove endpoints; the Host
		* keeps its existing comma-joined credential string contract.
		* @module
		*/
		/** Local switch (DSH primitives ship no toggle; role=switch keeps it accessible). */
		function Switch(props) {
			const { checked, onChange, label } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				role: "switch",
				"aria-checked": checked,
				"aria-label": label,
				onClick: () => onChange(!checked),
				style: {
					position: "relative",
					width: 36,
					height: 20,
					borderRadius: 10,
					border: "1px solid " + (checked ? "transparent" : surface.border),
					background: checked ? button.primaryFill : surface.layer2,
					cursor: "pointer",
					flex: "none",
					padding: 0,
					transition: "background .15s ease"
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
					position: "absolute",
					top: 2,
					left: checked ? 18 : 2,
					width: 14,
					height: 14,
					borderRadius: "50%",
					background: checked ? button.primaryText : text.tertiary,
					transition: "left .15s ease"
				} })
			});
		}
		/** One provider card in the providers list (click → ProviderModal).
		*  Cards in the search chain are draggable to reorder; cards outside the
		*  chain render non-draggable with a "not in chain" tag. */
		function ProviderCard(props) {
			const { t, p, quota, testResult, orderRank, isDefault, draggable, isDragOver, onClick, onDragStart, onDragOver, onDrop, onDragEnd } = props;
			const base = providerStatusOf(p, quota, orderRank !== void 0);
			const status = base === "ready" ? testOutcomeStatus(testResult) ?? base : base;
			const statusText = {
				ready: t("ready"),
				"rate-limited": t("rateLimited"),
				"auth-error": t("authError"),
				"unreachable": t("unreachable"),
				"not-configured": t("notConfigured"),
				"not-in-chain": t("notInChain")
			}[status];
			const selfHosted = p.name === "searxng";
			const dotState = status === "ready" ? "done" : status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "hollow";
			const statusColor = status === "ready" ? state.success : status === "auth-error" ? state.danger : status === "rate-limited" || status === "unreachable" ? state.warning : text.tertiary;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				draggable,
				onDragStart,
				onDragOver,
				onDrop,
				onDragEnd,
				onClick,
				className: "wt-provider-row",
				role: "button",
				tabIndex: 0,
				onKeyDown: (e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onClick();
					}
				},
				style: {
					display: "flex",
					alignItems: "center",
					gap: 12,
					width: "100%",
					padding: "12px 14px",
					background: isDragOver ? surface.hover : surface.layer1,
					border: `1px solid ${isDragOver ? "var(--dsw-alias-brand-primary)" : surface.border}`,
					borderRadius: 12,
					cursor: draggable ? "grab" : "pointer",
					fontFamily: "inherit",
					fontSize: 14,
					color: text.primary,
					textAlign: "left",
					boxSizing: "border-box"
				},
				onMouseEnter: (e) => {
					if (!isDragOver) e.currentTarget.style.background = surface.hover;
				},
				onMouseLeave: (e) => {
					if (!isDragOver) e.currentTarget.style.background = surface.layer1;
				},
				children: [
					draggable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": true,
						style: {
							color: text.tertiary,
							fontSize: 14,
							cursor: "grab",
							userSelect: "none",
							flex: "none"
						},
						children: "⠿"
					}),
					dotState === "hollow" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": true,
						style: {
							width: 10,
							height: 10,
							borderRadius: "50%",
							border: `1.5px solid ${text.tertiary}`,
							flex: "none",
							boxSizing: "border-box"
						}
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: dotState }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontWeight: 500,
							minWidth: 0,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: p.label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 6,
							flex: 1,
							minWidth: 0
						},
						className: "wt-provider-meta",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								color: statusColor,
								fontSize: 12,
								whiteSpace: "nowrap"
							},
							children: statusText
						}), selfHosted && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								color: text.tertiary,
								fontSize: 12,
								whiteSpace: "nowrap",
								border: `1px solid ${surface.border}`,
								borderRadius: 4,
								padding: "0 6px"
							},
							children: t("selfHosted")
						})]
					}),
					quota && quota.supported && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderQuotaInline, {
						t,
						quota
					}),
					isDefault && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: accentText(),
							fontSize: 11,
							fontWeight: 600,
							border: "1px solid currentColor",
							borderRadius: 4,
							padding: "0 6px",
							whiteSpace: "nowrap"
						},
						children: t("defaultProviderLabel")
					}),
					orderRank !== void 0 && !isDefault && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							color: text.tertiary,
							fontSize: 12,
							whiteSpace: "nowrap"
						},
						children: ["#", orderRank]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 14 })
				]
			});
		}
		/** Inline quota summary for the provider card: label + bar when computable. */
		function ProviderQuotaInline(props) {
			const { t, quota } = props;
			const kind = quotaDisplayKind(quota);
			const fraction = quotaFraction(quota);
			if (kind === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					color: text.tertiary,
					fontSize: 11,
					whiteSpace: "nowrap"
				},
				children: t("quotaUnavailable")
			});
			if (kind === "self_hosted") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					color: text.tertiary,
					fontSize: 11,
					whiteSpace: "nowrap"
				},
				children: t("quotaSelfHostedShort")
			});
			if (kind === "unlimited") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					color: text.secondary,
					fontSize: 11,
					whiteSpace: "nowrap"
				},
				children: t("quotaUnlimited")
			});
			const label = quotaRemainingLabel(t, quota) || quotaSummary(t, quota) || t("quotaUnavailable");
			const meta = quotaMetaLine(t, quota);
			const fillColor = state.success;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 3,
					flex: 1,
					minWidth: 120,
					alignItems: "flex-end",
					textAlign: "right"
				},
				className: "wt-provider-quota",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 6,
							justifyContent: "flex-end"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								color: text.secondary,
								fontSize: 12,
								whiteSpace: "nowrap"
							},
							children: label
						}), fraction !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								color: fillColor,
								fontSize: 11,
								fontWeight: 600,
								whiteSpace: "nowrap"
							},
							children: [Math.round(fraction * 100), "%"]
						})]
					}),
					fraction !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							width: 140,
							height: 4,
							borderRadius: 2,
							background: surface.layer2,
							overflow: "hidden",
							display: "block"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
							width: `${fraction * 100}%`,
							height: "100%",
							background: fillColor,
							display: "block"
						} })
					}),
					meta && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: text.tertiary,
							fontSize: 10,
							whiteSpace: "nowrap"
						},
						children: meta
					})
				]
			});
		}
		function accentText() {
			return "var(--dsw-alias-brand-primary)";
		}
		/** Test Search block: one input + real run + human-readable timeline. */
		function TestSearchBlock(props) {
			const { t, config, onError } = props;
			const [query, setQuery] = (0, react.useState)("DeepSeek Harness");
			const [testing, setTesting] = (0, react.useState)(false);
			const [result, setResult] = (0, react.useState)(null);
			const [cleared, setCleared] = (0, react.useState)(false);
			const run = async () => {
				if (!query.trim()) return;
				setTesting(true);
				setCleared(false);
				try {
					const r = await api.testSearch(query);
					setResult(r);
				} catch (e) {
					onError(e instanceof Error ? e.message : String(e));
				} finally {
					setTesting(false);
				}
			};
			const attempts = result?.attempts ?? [];
			const label = (name) => config.providers.find((p) => p.name === name)?.label ?? name;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 10
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						gap: 8
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							value: query,
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, { size: 14 }),
							onChange: (e) => setQuery(e.target.value),
							placeholder: t("searchPlaceholder"),
							onKeyDown: (e) => {
								if (e.key === "Enter") run();
							}
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "primary",
						size: "md",
						onClick: () => void run(),
						disabled: testing || !query.trim(),
						children: testing ? t("searching") : t("search")
					})]
				}), result && !cleared && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 8
					},
					children: [
						result.ok ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								color: state.success,
								fontSize: 13
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
									state: "done",
									size: 8
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: { fontWeight: 600 },
									children: [
										label(result.backend ?? ""),
										" · ",
										result.latencyMs,
										"ms · ",
										t("resultCount", { n: result.resultCount ?? 0 })
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { marginLeft: "auto" },
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "ghost",
										onClick: () => setCleared(true),
										children: t("clearResult")
									})
								})
							]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								color: state.danger,
								fontSize: 13
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
									state: "error",
									size: 8
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { fontWeight: 600 },
									children: result.error?.message ?? t("unknownOutcome")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { marginLeft: "auto" },
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "ghost",
										onClick: () => setCleared(true),
										children: t("clearResult")
									})
								})
							]
						}),
						attempts.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 2,
								fontSize: 12,
								color: text.secondary
							},
							children: attempts.map((a, i) => {
								const ok = a.outcome === "success";
								const skipped = a.outcome.startsWith("skipped-");
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										alignItems: "center",
										gap: 8
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												width: 14,
												color: text.tertiary
											},
											children: [i + 1, "."]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												color: text.primary,
												fontWeight: 500
											},
											children: label(a.provider)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: { color: ok ? state.success : skipped ? text.tertiary : state.danger },
											children: outcomeLabel(t, a.outcome)
										}),
										a.latencyMs !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: { color: text.tertiary },
											children: [a.latencyMs, "ms"]
										}),
										i < attempts.length - 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												marginLeft: "auto",
												color: text.tertiary
											},
											children: "↓"
										})
									]
								}, i);
							})
						}),
						result.ok && (result.results ?? []).length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: (result.results ?? []).slice(0, 5).map((r, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 2,
									paddingTop: 6,
									borderTop: `1px solid ${surface.border}`
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									href: r.url,
									target: "_blank",
									rel: "noreferrer",
									style: {
										color: accentText(),
										textDecoration: "none",
										fontSize: 13
									},
									children: r.title
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: text.tertiary,
										fontSize: 12,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap"
									},
									children: r.snippet
								})]
							}, i))
						})
					]
				})]
			});
		}
		/** The page. */
		function WebToolsSection(props) {
			const { t: baseT, ui } = props;
			const [config, setConfig] = (0, react.useState)(null);
			const [uiPref, setUiPref] = (0, react.useState)("auto");
			const [dshActive, setDshActive] = (0, react.useState)(() => ui?.getActiveLocale() ?? "zh");
			(0, react.useEffect)(() => {
				if (!ui) return;
				return ui.subscribeLocale(() => setDshActive(ui.getActiveLocale()));
			}, [ui]);
			(0, react.useEffect)(() => {
				if (config) setUiPref(config.uiLanguage ?? "auto");
			}, [config]);
			const effectiveLang = resolveUiLanguage(uiPref, dshActive);
			const t = (0, react.useMemo)(() => {
				if (!ui) return baseT;
				const dict = effectiveLang === "en" ? ui.enDict : ui.zhDict;
				const fallback = effectiveLang === "en" ? ui.zhDict : ui.enDict;
				return (key, ...args) => {
					const params = args[0];
					return translateDict(dict, fallback, key, params) ?? baseT(key, ...args);
				};
			}, [
				ui,
				effectiveLang,
				baseT
			]);
			const [quotas, setQuotas] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)("");
			const [saving, setSaving] = (0, react.useState)(false);
			const [saved, setSaved] = (0, react.useState)(false);
			const [detailFor, setDetailFor] = (0, react.useState)(null);
			const [routingOpen, setRoutingOpen] = (0, react.useState)(false);
			const [providerTestResults, setProviderTestResults] = (0, react.useState)({});
			const [busyProviders, setBusyProviders] = (0, react.useState)({});
			const dragName = (0, react.useRef)(null);
			const [dragOverName, setDragOverName] = (0, react.useState)(null);
			const [localProviderOrder, setLocalProviderOrder] = (0, react.useState)(null);
			const loadToken = (0, react.useRef)(0);
			const mounted = (0, react.useRef)(true);
			const load = async () => {
				const token = ++loadToken.current;
				try {
					const cfg = await api.configGet();
					if (token !== loadToken.current) return;
					setConfig(cfg);
					setLocalProviderOrder(null);
					setError("");
				} catch (e) {
					if (token === loadToken.current) setError(e instanceof Error ? e.message : String(e));
				}
			};
			const loadQuotas = async (force = false) => {
				try {
					const quota = await api.quotaDescribe(force);
					if (!mounted.current) return;
					setQuotas(quota.quotas);
				} catch {}
			};
			(0, react.useEffect)(() => {
				load();
				loadQuotas();
				return () => {
					loadToken.current += 1;
					mounted.current = false;
				};
			}, []);
			if (!config) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: "12px 0",
					color: text.tertiary,
					fontSize: 14
				},
				children: error ? `${t("webToolsError")}: ${error}` : t("loading")
			});
			const save = async (patch) => {
				setSaving(true);
				try {
					await api.configSave(patch);
					await load();
					setSaved(true);
					setTimeout(() => setSaved(false), 2e3);
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setSaving(false);
				}
			};
			const setEnabled = (enabled) => void save({ enabled });
			const toggleProvider = (name, enabled) => {
				const providerEnabled = Object.fromEntries(config.providers.map((p) => [p.name, p.name === name ? enabled : p.enabled]));
				save({ providerEnabled });
			};
			const setBaseUrl = (name, baseUrl) => {
				const providerBaseUrls = { ...config.providers.reduce((a, p) => ({
					...a,
					[p.name]: p.baseUrl ?? ""
				}), {}) };
				providerBaseUrls[name] = baseUrl;
				save({ providerBaseUrls });
			};
			const setAttemptTimeout = (v) => void save({ providerAttemptTimeoutMs: Math.min(6e4, Math.max(1e3, v)) });
			const orderedProviders = [config.defaultProvider, ...config.fallbackOrder.filter((n) => n !== config.defaultProvider)];
			const providerOf = (name) => config.providers.find((p) => p.name === name);
			const enabledNames = new Set(config.providers.filter((p) => p.enabled).map((p) => p.name));
			const saveOrder = (ordered) => {
				const next = ordered.filter((n, i) => ordered.indexOf(n) === i);
				const first = next[0] ?? config.defaultProvider;
				save({
					defaultProvider: first,
					fallbackOrder: next.slice(1)
				});
			};
			const reorderOnDrop = (dragged, over) => {
				if (dragged === over) return;
				const next = [...orderedProviders];
				const from = next.indexOf(dragged);
				const to = next.indexOf(over);
				if (from < 0 || to < 0) return;
				next.splice(from, 1);
				next.splice(to, 0, dragged);
				setLocalProviderOrder(next);
				saveOrder(next);
			};
			const renderedProviders = (localProviderOrder ?? orderedProviders).map((name) => providerOf(name)).filter((x) => x !== void 0).concat(config.providers.filter((p) => !orderedProviders.includes(p.name)));
			const readyCount = config.providers.filter((p) => {
				if (!p.enabled) return false;
				const inChain = orderedProviders.includes(p.name);
				return providerStatusOf(p, quotas?.[p.name], inChain) === "ready";
			}).length;
			const testProvider = async (provider) => {
				setBusyProviders((b) => ({
					...b,
					[provider]: true
				}));
				try {
					const r = await api.testProvider(provider, "OpenAI");
					setProviderTestResults((prev) => ({
						...prev,
						[provider]: r
					}));
				} catch (e) {
					setProviderTestResults((prev) => ({
						...prev,
						[provider]: {
							ok: false,
							error: {
								code: "error",
								message: e instanceof Error ? e.message : String(e)
							}
						}
					}));
				} finally {
					setBusyProviders((b) => ({
						...b,
						[provider]: false
					}));
				}
			};
			const detailProvider = detailFor !== null ? providerOf(detailFor) : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 22,
					maxWidth: 720,
					padding: "4px 0 24px"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: `
        @media (max-width: 640px) {
          .wt-provider-row { flex-wrap: wrap; row-gap: 4px; }
          .wt-provider-meta { flex-basis: 100%; order: 10; padding-left: 22px; }
        }
      ` }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "flex-start",
							gap: 12
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								flex: 1,
								minWidth: 0
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								style: {
									margin: 0,
									fontSize: 20,
									fontWeight: 600,
									lineHeight: "28px",
									color: text.primary
								},
								children: t("title")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									margin: "4px 0 0",
									fontSize: 14,
									lineHeight: "22px",
									color: text.secondary
								},
								children: t("tagline")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 12,
								paddingTop: 2,
								flex: "none",
								flexWrap: "wrap",
								justifyContent: "flex-end"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									style: {
										display: "flex",
										alignItems: "center",
										gap: 6,
										fontSize: 12,
										color: text.secondary,
										whiteSpace: "nowrap"
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("uiLanguage") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: uiPref,
										onChange: (e) => {
											const v = e.target.value;
											setUiPref(v);
											save({ uiLanguage: v });
										},
										style: {
											padding: "4px 8px",
											borderRadius: 8,
											border: `1px solid ${surface.border}`,
											background: surface.layer2,
											color: text.primary,
											fontFamily: "inherit",
											fontSize: 12,
											cursor: "pointer"
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "auto",
												children: t("uiLangAuto")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "zh",
												children: "中文"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "en",
												children: "English"
											})
										]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
									checked: config.enabled,
									onChange: setEnabled,
									label: config.enabled ? t("enabledLabel") : t("disabledLabel")
								}),
								saving && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: text.tertiary,
										fontSize: 12
									},
									children: t("saving")
								}),
								saved && !saving && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: state.success,
										fontSize: 12
									},
									children: t("saved")
								})
							]
						})]
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							color: state.danger,
							fontSize: 13
						},
						children: error
					}),
					config.proxy?.configured === true && config.proxy?.degraded === true && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 4,
							padding: "10px 14px",
							borderRadius: 12,
							border: `1px solid ${state.warning}`,
							background: surface.layer1,
							fontSize: 13,
							color: text.secondary
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							style: {
								color: state.warning,
								fontSize: 13
							},
							children: t("proxyDegradedTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("proxyDegradedBody") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 16,
							padding: "10px 14px",
							borderRadius: 12,
							background: surface.layer1,
							border: `1px solid ${surface.border}`,
							fontSize: 13,
							color: text.secondary,
							flexWrap: "wrap"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("readySummary", {
								n: readyCount,
								total: config.providers.length
							}) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { color: surface.border },
								children: "|"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								t("defaultProviderLabel"),
								": ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									style: { color: text.primary },
									children: providerOf(config.defaultProvider)?.label ?? config.defaultProvider
								})
							] })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 10
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "baseline",
								gap: 8
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									style: {
										margin: 0,
										fontSize: 15,
										fontWeight: 600,
										color: text.primary
									},
									children: t("orderLabel")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: text.tertiary,
										fontSize: 12
									},
									children: t("orderHint")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { marginLeft: "auto" },
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "ghost",
										icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, { size: 14 }),
										onClick: () => setRoutingOpen(true),
										children: t("editOrder")
									})
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 6,
								flexWrap: "wrap",
								padding: "10px 14px",
								borderRadius: 12,
								background: surface.layer1,
								border: `1px solid ${surface.border}`,
								fontSize: 13
							},
							children: [orderedProviders.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { color: text.tertiary },
								children: t("notConfigured")
							}), orderedProviders.map((name, i) => {
								const p = providerOf(name);
								const ok = p !== void 0 && enabledNames.has(name);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "inline-flex",
										alignItems: "center",
										gap: 4
									},
									children: [
										i > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: { color: text.tertiary },
											children: "→"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												color: ok ? text.primary : text.tertiary,
												fontWeight: i === 0 ? 600 : 400
											},
											children: p?.label ?? name
										}),
										i === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												color: accentText(),
												fontSize: 11,
												fontWeight: 600
											},
											children: t("defaultProviderLabel")
										})
									]
								}, name);
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 10
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "baseline",
								gap: 8
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									style: {
										margin: 0,
										fontSize: 15,
										fontWeight: 600,
										color: text.primary
									},
									children: t("providersLabel")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: text.tertiary,
										fontSize: 12
									},
									children: t("orderHint")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { marginLeft: "auto" },
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "ghost",
										icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, { size: 14 }),
										onClick: () => setRoutingOpen(true),
										children: t("editOrder")
									})
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 8
							},
							children: renderedProviders.map((p) => {
								const inChain = orderedProviders.includes(p.name);
								const testResult = providerTestResults[p.name];
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderCard, {
									t,
									p,
									quota: quotas?.[p.name],
									testResult,
									orderRank: inChain ? orderedProviders.indexOf(p.name) + 1 : void 0,
									isDefault: p.name === config.defaultProvider,
									draggable: inChain,
									isDragOver: dragOverName === p.name && dragName.current !== null && dragName.current !== p.name,
									onClick: () => setDetailFor(p.name),
									onDragStart: (e) => {
										dragName.current = p.name;
										e.dataTransfer.effectAllowed = "move";
										e.dataTransfer.setData("text/plain", p.name);
									},
									onDragOver: (e) => {
										if (!inChain || dragName.current === null) return;
										e.preventDefault();
										e.dataTransfer.dropEffect = "move";
										if (dragOverName !== p.name) setDragOverName(p.name);
									},
									onDrop: (e) => {
										e.preventDefault();
										const dragged = dragName.current;
										dragName.current = null;
										setDragOverName(null);
										if (dragged !== null) reorderOnDrop(dragged, p.name);
									},
									onDragEnd: () => {
										dragName.current = null;
										setDragOverName(null);
									}
								}, p.name);
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 10
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							style: {
								margin: 0,
								fontSize: 15,
								fontWeight: 600,
								color: text.primary
							},
							children: t("testSearchTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TestSearchBlock, {
							t,
							config,
							onError: (msg) => setError(msg)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						style: { fontSize: 13 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
							style: {
								cursor: "pointer",
								color: text.secondary,
								fontSize: 13,
								padding: "4px 0"
							},
							children: t("advanced")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 8,
								padding: "10px 0 0"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 10
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										style: { color: text.secondary },
										children: t("attemptTimeoutLabel")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 1e3,
										max: 6e4,
										step: 1e3,
										value: config.providerAttemptTimeoutMs,
										onChange: (e) => setAttemptTimeout(Number(e.target.value)),
										style: {
											width: 90,
											padding: "4px 8px",
											borderRadius: 6,
											border: `1px solid ${surface.border}`,
											background: surface.layer2,
											color: text.primary,
											fontFamily: "inherit",
											fontSize: 13
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										style: {
											color: text.tertiary,
											fontSize: 12
										},
										children: [
											t("attemptTimeoutHint"),
											" (",
											t("seconds", { n: Math.round(config.providerAttemptTimeoutMs / 1e3) }),
											")"
										]
									})
								]
							})
						})]
					}),
					detailProvider && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderModal, {
						t,
						p: detailProvider,
						quota: quotas?.[detailProvider.name],
						testResult: providerTestResults[detailProvider.name],
						busy: !!busyProviders[detailProvider.name],
						isDefault: detailProvider.name === config.defaultProvider,
						inChain: orderedProviders.includes(detailProvider.name),
						onClose: () => {
							setDetailFor(null);
							setProviderTestResults((prev) => {
								const next = { ...prev };
								delete next[detailProvider.name];
								return next;
							});
						},
						onToggle: (enabled) => toggleProvider(detailProvider.name, enabled),
						onBaseUrl: (url) => setBaseUrl(detailProvider.name, url),
						onTest: () => testProvider(detailProvider.name),
						onRefreshQuota: () => void loadQuotas(true),
						onConfigChanged: () => {
							setProviderTestResults((prev) => {
								const next = { ...prev };
								delete next[detailProvider.name];
								return next;
							});
							load();
						}
					}),
					routingOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RoutingModal, {
						t,
						providers: config.providers,
						ordered: orderedProviders,
						onClose: () => setRoutingOpen(false),
						onSave: saveOrder
					})
				]
			});
		}
		//#endregion
		//#region src/client/registration.ts
		/**
		* dsh-web-tools — settings.section registration (pure, testable).
		*
		* Extracted from the client entry so the slot contract can be unit-tested
		* without a browser: given a minimal slots/locale surface it registers
		* EXACTLY ONE settings.section entry (id "web-tools") and never touches
		* settings.plugin.item.
		*
		* The section component is injected (not imported here) so this module stays
		* plain TypeScript — node can run it directly for tests.
		* @module
		*/
		/** Settings page nav id (drives the Settings section key). */
		const SECTION_ID = "web-tools";
		/**
		* Register the Web Search settings page.
		* @param ctx - client root context (slots service).
		* @param t - locale-bound translator for the page copy.
		* @param component - the section component (WebToolsSection).
		* @param ui - optional page-language face (independent language switch).
		*/
		function registerSettingsSection(ctx, t, component, ui) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: SECTION_ID,
				order: 30,
				label: () => t("nav"),
				inject: () => ({
					t,
					ui
				})
			}, component));
		}
		//#endregion
		//#region src/client/SearchModeButton.css.ts
		/**
		* dsh-web-tools — Search Mode button styles.
		*
		* DSH client plugins inject their own CSS at runtime (a `<style>` tag with a
		* stable id, HMR-safe) instead of emitting a separate `.css` bundle — the web
		* shell only loads the single `client.js`. This mirrors the proven pattern of
		* `dsh-at-file` (`adoptStyles`). All colors are DSH semantic tokens; no raw
		* hex anywhere, no solid brand fill — a blue thin outline when active.
		* @module
		*/
		const STYLE_ID = "dsh-web-tools-search-mode";
		const CSS = `
.wt-search-mode-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  height: 28px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsw-font-family);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 100ms ease, border-color 100ms ease, color 100ms ease;
}
.wt-search-mode-trigger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.wt-search-mode-trigger[data-active="true"] {
  border-color: var(--dsw-alias-state-business-primary);
  background: transparent;
  color: var(--dsw-alias-state-business-primary);
}
.wt-search-mode-trigger[data-active="true"]:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.wt-search-mode-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);
}
.wt-search-mode-trigger:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
  opacity: 0.55;
}
.wt-search-mode-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.wt-search-mode-label {
  white-space: nowrap;
}
`;
		/** Stable class map the component references. */
		const searchModeCss = {
			trigger: "wt-search-mode-trigger",
			icon: "wt-search-mode-icon",
			label: "wt-search-mode-label"
		};
		/** Inject the stylesheet once (idempotent, HMR-safe). */
		function adoptSearchModeStyles() {
			if (typeof document === "undefined") return;
			if (document.getElementById(STYLE_ID) !== null) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			document.head.appendChild(style);
		}
		//#endregion
		//#region src/client/SearchModeButton.tsx
		/**
		* dsh-web-tools — "联网搜索" toggle button mounted in `conversation.input.left`.
		*
		* A small always-visible per-session control: click toggles the session's
		* Search Mode between `auto` and `required`. The mode lives in the HOST (single
		* source of truth, shared by the `/search` command and this button); this is a
		* thin read/write over `/web-tools/api/search-mode`.
		*
		* The button revalidates against the Host so a change made elsewhere (e.g. the
		* `/search` slash command, another tab) shows up here:
		*  - on mount / session change
		*  - every ~1s while the page is visible (paused when hidden)
		*  - immediately on window focus / visibility restore
		*  - never while an optimistic toggle is in flight (don't yank the UI back)
		*  - never overlapping the previous request (inFlight guard)
		*  - on a failed GET keep the last known state — a network error is NOT "auto"
		*
		* Interaction mirrors the DSH composer toolbar: `onMouseDown` keeps the
		* textarea caret, and clicks are optimistic. No extra state store, no settings
		* write, no DSH event-allowlist change, no poll of the command registry.
		* @module
		*/
		/** Revalidation cadence while the page is visible. */
		const REVALIDATE_MS = 1e3;
		function SearchModeButton({ sessionId, label = "联网搜索", unavailableLabel = "没有可用的搜索源" }) {
			const [mode, setMode] = (0, react.useState)();
			const [available, setAvailable] = (0, react.useState)(true);
			const [pending, setPending] = (0, react.useState)(false);
			const generation = (0, react.useRef)(0);
			const pendingRef = (0, react.useRef)(false);
			const inFlight = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				adoptSearchModeStyles();
			}, []);
			const refresh = () => {
				if (inFlight.current) return;
				if (pendingRef.current) return;
				inFlight.current = true;
				const current = generation.current;
				api.searchModeGet(sessionId).then((view) => {
					if (generation.current !== current) return;
					if (pendingRef.current) return;
					setMode(view.mode);
					setAvailable(view.available);
				}).catch(() => {}).finally(() => {
					if (generation.current === current) inFlight.current = false;
				});
			};
			(0, react.useEffect)(() => {
				generation.current += 1;
				setMode(void 0);
				setPending(false);
				pendingRef.current = false;
				inFlight.current = false;
				refresh();
				const interval = setInterval(refresh, REVALIDATE_MS);
				const onVisible = () => {
					if (!document.hidden) refresh();
				};
				window.addEventListener("focus", onVisible);
				document.addEventListener("visibilitychange", onVisible);
				return () => {
					clearInterval(interval);
					window.removeEventListener("focus", onVisible);
					document.removeEventListener("visibilitychange", onVisible);
				};
			}, [sessionId]);
			const required = mode === "required";
			const toggle = async () => {
				if (mode === void 0 || pending || !available) return;
				const current = generation.current;
				const previous = mode;
				const next = previous === "required" ? "auto" : "required";
				setPending(true);
				pendingRef.current = true;
				setMode(next);
				try {
					const view = await api.searchModeSet(sessionId, next);
					if (generation.current !== current) return;
					setMode(view.mode);
					setAvailable(view.available);
				} catch {
					if (generation.current !== current) return;
					setMode(previous);
				} finally {
					if (generation.current === current) {
						setPending(false);
						pendingRef.current = false;
					}
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: searchModeCss.trigger,
				"data-active": required || void 0,
				"aria-pressed": required,
				"aria-label": label,
				title: available ? label : unavailableLabel,
				disabled: !available || mode === void 0 || pending,
				onMouseDown: (event) => {
					event.preventDefault();
				},
				onClick: () => {
					toggle();
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: searchModeCss.icon,
					"aria-hidden": true,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutline14, { size: 14 })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: searchModeCss.label,
					children: label
				})]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-web-tools — browser client plugin entry.
		*
		* Registers a top-level Settings page (`settings.section`, id `web-tools`)
		* — the same slot contract the official Models / Plugins pages use — so the
		* plugin appears in the Settings nav as "Web Search / 网页搜索", not buried
		* under Plugins → Plugin configuration.
		*
		* The page talks to the Host exclusively through the plugin's fenced
		* `/web-tools/api` HTTP routes (see ../host/routes.ts) — credentials never
		* reach the browser.
		*
		* Copy is registered through the DSH locale service (zh/en dictionaries
		* below). The page follows the DSH UI language by default, and additionally
		* offers its own language selector (Follow system / 中文 / English) that is
		* persisted in the plugin's own config — it never changes the DSH-wide
		* language.
		* @module
		*/
		/** Locale namespace for this page's copy. */
		const NS = "dsh-web-tools";
		/** Services required by this client plugin. */
		const inject = ["slots", "locale"];
		/** zh page copy (key-set source of truth). */
		const zhDict = {
			nav: "网页搜索",
			title: "网页搜索",
			tagline: "配置多个搜索服务，并在 Provider 不可用时按设定顺序继续搜索。",
			enabledLabel: "已启用",
			disabledLabel: "已禁用",
			readySummary: "{total} 个 Provider 中 {n} 个可用",
			defaultProviderLabel: "默认",
			orderLabel: "搜索顺序",
			orderHint: "从上到下依次尝试；第一项为默认 Provider",
			editOrder: "编辑顺序",
			providersLabel: "Providers",
			notInChain: "未加入搜索顺序",
			notConfigured: "未配置",
			selfHosted: "自建部署",
			ready: "正常",
			rateLimited: "触发限流",
			authError: "鉴权失败",
			unreachable: "连接失败",
			quotaCredits: "{r} / {l} credits",
			quotaRequests: "{r} 次请求{l}",
			quotaUsd: "已用 ${amount}",
			quotaUsdRemaining: "剩余 ${amount}",
			quotaTokens: "{n} tokens",
			updatedJustNow: "刚刚更新",
			updatedAgo: "{mins} 分钟前更新",
			refreshQuota: "刷新额度",
			quotaTitle: "额度",
			resetOn: "重置于 {d}",
			usage: "消耗",
			testSearchTitle: "测试搜索",
			searchPlaceholder: "输入查询…",
			search: "搜索",
			searching: "搜索中…",
			clearResult: "清空",
			resultCount: "{n} 个结果",
			attempt: "尝试",
			successOutcome: "成功",
			rateLimitedOutcome: "限流",
			authOutcome: "鉴权失败",
			timeoutOutcome: "超时",
			networkOutcome: "网络错误",
			serverOutcome: "服务端错误",
			abortedOutcome: "已取消",
			configOutcome: "配置错误",
			badRequestOutcome: "请求错误",
			invalidResponseOutcome: "响应异常",
			unknownOutcome: "未知",
			providerStatus: "状态",
			connected: "已连接",
			credentials: "Credentials",
			keysConfigured: "{n} 把 API Key 已配置",
			addKey: "+ 添加 API Key",
			addKeyPlaceholder: "输入 API Key…",
			cancel: "取消",
			add: "添加",
			removeKey: "移除",
			keyReady: "正常",
			keyAuthError: "鉴权失败",
			keyNotConfigured: "未配置",
			keyWritableHint: "可写",
			baseUrlLabel: "Base URL",
			baseUrlDefault: "默认",
			baseUrlPlaceholder: "自定义端点（留空使用默认）",
			testConnection: "测试连接",
			testingConnection: "测试中…",
			testOk: "连接成功",
			testFail: "连接失败",
			advanced: "高级设置",
			attemptTimeoutLabel: "单 Provider 超时",
			attemptTimeoutHint: "单个搜索源最多等待多久，超时后切换下一家",
			seconds: "{n} 秒",
			save: "保存",
			saved: "已保存",
			saving: "保存中…",
			close: "关闭",
			loading: "正在加载配置…",
			webToolsError: "网页搜索",
			proxyDegradedTitle: "代理不可用",
			proxyDegradedBody: "检测到系统配置了代理，但未找到 undici（代理依赖）——请求将直连发送，走代理的 Provider 可能超时。请在 profile 目录运行 `pnpm install` 后重启。",
			moveUp: "上移",
			moveDown: "下移",
			makeDefault: "设为默认",
			removeFromChain: "移出搜索顺序",
			addToChain: "加入搜索顺序",
			availableProviders: "可添加",
			noAvailableProviders: "没有可添加的 Provider",
			defaultFirstHint: "第一项为默认 Provider",
			back: "返回",
			quotaUnavailable: "不支持额度查询",
			quotaUnlimited: "按量计费 · 无月度配额",
			quotaSelfHostedShort: "自建部署 · 无平台额度",
			quotaSource: "数据源: {s}",
			quotaSourceApi: "官方",
			quotaSourceResponseHeader: "响应头",
			quotaSourceBestEffortApi: "尽力查询",
			quotaSourceLocalEstimate: "本地估算",
			quotaSourceDashboard: "控制台",
			quotaSourceSelfHosted: "自建部署",
			quotaOverPlan: "剩余 {r} · 计划 {l}",
			quotaSince: "本地已记录 ${amount}",
			searchAuto: "自动",
			autoChain: "自动 · {s}",
			uiLanguage: "语言",
			uiLangAuto: "跟随系统",
			searchModeLabel: "联网搜索",
			searchModeUnavailable: "没有可用的搜索源"
		};
		/** en page copy, checked complete against the zh key set. */
		const enDict = {
			nav: "Web Search",
			title: "Web Search",
			tagline: "Use multiple search providers with automatic fallback in a fixed order.",
			enabledLabel: "Enabled",
			disabledLabel: "Disabled",
			readySummary: "{n} of {total} providers ready",
			defaultProviderLabel: "Default",
			orderLabel: "Search order",
			orderHint: "Providers are tried from top to bottom; the first is the default",
			editOrder: "Edit order",
			providersLabel: "Providers",
			notInChain: "Not in search chain",
			notConfigured: "Not configured",
			selfHosted: "Self-hosted",
			ready: "Ready",
			rateLimited: "Rate limited",
			authError: "Auth error",
			unreachable: "Unreachable",
			quotaCredits: "{r} / {l} credits",
			quotaRequests: "{r} requests{l}",
			quotaUsd: "${amount} used",
			quotaUsdRemaining: "${amount} remaining",
			quotaTokens: "{n} tokens",
			updatedJustNow: "Updated just now",
			updatedAgo: "Updated {mins} min ago",
			refreshQuota: "Refresh quota",
			quotaTitle: "Quota",
			resetOn: "Resets on {d}",
			usage: "Usage",
			testSearchTitle: "Test Search",
			searchPlaceholder: "Enter a query…",
			search: "Search",
			searching: "Searching…",
			clearResult: "Clear",
			resultCount: "{n} result(s)",
			attempt: "Attempt",
			successOutcome: "Success",
			rateLimitedOutcome: "Rate limited",
			authOutcome: "Auth error",
			timeoutOutcome: "Timed out",
			networkOutcome: "Network error",
			serverOutcome: "Server error",
			abortedOutcome: "Cancelled",
			configOutcome: "Config error",
			badRequestOutcome: "Bad request",
			invalidResponseOutcome: "Bad response",
			unknownOutcome: "Unknown",
			providerStatus: "Status",
			connected: "Connected",
			credentials: "Credentials",
			keysConfigured: "{n} API key(s) configured",
			addKey: "+ Add API key",
			addKeyPlaceholder: "Paste an API key…",
			cancel: "Cancel",
			add: "Add",
			removeKey: "Remove",
			keyReady: "Ready",
			keyAuthError: "Auth error",
			keyNotConfigured: "Not configured",
			keyWritableHint: "writable",
			baseUrlLabel: "Base URL",
			baseUrlDefault: "Default",
			baseUrlPlaceholder: "Custom endpoint (leave empty for default)",
			testConnection: "Test connection",
			testingConnection: "Testing…",
			testOk: "Connected",
			testFail: "Connection failed",
			advanced: "Advanced",
			attemptTimeoutLabel: "Per-provider timeout",
			attemptTimeoutHint: "How long one provider may run before switching to the next",
			seconds: "{n} seconds",
			save: "Save",
			saved: "Saved",
			saving: "Saving…",
			close: "Close",
			loading: "Loading Web Search configuration…",
			webToolsError: "Web Search",
			proxyDegradedTitle: "Proxy unavailable",
			proxyDegradedBody: "A system proxy is configured, but undici (the proxy dependency) was not found — requests will go out directly, so proxy-dependent providers may time out. Run `pnpm install` in the profile directory and restart.",
			moveUp: "Move up",
			moveDown: "Move down",
			makeDefault: "Make default",
			removeFromChain: "Remove from chain",
			addToChain: "Add to chain",
			availableProviders: "Available",
			noAvailableProviders: "No providers to add",
			defaultFirstHint: "First entry is the default provider",
			back: "Back",
			quotaUnavailable: "Quota not supported",
			quotaUnlimited: "Pay-as-you-go · no monthly cap",
			quotaSelfHostedShort: "Self-hosted · no platform quota",
			quotaSource: "Source: {s}",
			quotaSourceApi: "Official",
			quotaSourceResponseHeader: "Response header",
			quotaSourceBestEffortApi: "Best-effort",
			quotaSourceLocalEstimate: "Local estimate",
			quotaSourceDashboard: "Dashboard",
			quotaSourceSelfHosted: "Self-hosted",
			quotaOverPlan: "{r} remaining · plan {l}",
			quotaSince: "${amount} recorded locally",
			searchAuto: "Auto",
			autoChain: "Auto · {s}",
			uiLanguage: "UI language",
			uiLangAuto: "Follow system",
			searchModeLabel: "Web Search",
			searchModeUnavailable: "No search provider available"
		};
		/** Register the Settings page. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh: zhDict,
				en: enDict
			}));
			const t = ctx.locale.bind(NS);
			registerSettingsSection(ctx, t, WebToolsSection, {
				getActiveLocale: () => ctx.locale.getLocale().active,
				subscribeLocale: (fn) => ctx.locale.subscribe(fn),
				zhDict,
				enDict
			});
			const SearchModeControl = (props) => {
				(0, react.useSyncExternalStore)((cb) => ctx.locale.subscribe(cb), () => ctx.locale.getLocale().active);
				return react.createElement(SearchModeButton, {
					sessionId: props.sessionId,
					label: t("searchModeLabel"),
					unavailableLabel: t("searchModeUnavailable")
				});
			};
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "dsh-web-tools-search-mode",
				order: 30,
				label: () => t("searchModeLabel")
			}, SearchModeControl));
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.enDict = enDict;
		exports.inject = inject;
		exports.zhDict = zhDict;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map