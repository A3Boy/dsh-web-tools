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
			}),
			providerOptionsSet: (provider, options) => call("provider-options/set", {
				provider,
				options
			}),
			providerOptionsReset: (provider) => call("provider-options/reset", { provider }),
			providerOptionsBatch: (providers) => call("provider-options/batch", { providers }),
			routingSet: (policy, orderedProviders) => call("routing/set", {
				policy,
				orderedProviders
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
		/** Brand / accent. */
		const accent = {
			primary: "var(--dsw-alias-brand-primary)",
			text: "var(--dsw-alias-brand-text)"
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
		function providerStatusOf(p, quota, inOrder = true) {
			if (p.enabled === false) return "disabled";
			if (!inOrder) return "not-in-order";
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
		/**
		* Format a human-friendly summary of the currently resolved provider execution
		* options for the collapsed Search Experience section.
		* Accepts optional t() for i18n; falls back to Chinese when no t is provided.
		*/
		function formatProviderOptionsSummary(providerName, effective, t) {
			if (!effective) return t ? t("prefsDefault") : "默认设置";
			switch (providerName) {
				case "exa": {
					const type = String(effective.searchType ?? "auto");
					return `${type === "fast" ? t ? t("prefsFast") : "快速" : type === "instant" ? t ? t("prefsInstant") : "极速" : type.startsWith("deep") ? t ? t("prefsDeep") : "深入" : t ? t("prefsAutoLabel") : "自动"} · ${effective.maxAgeHours === 0 ? t ? t("prefsFreshnessLive") : "每次刷新" : effective.maxAgeHours === -1 ? t ? t("prefsFreshnessCache") : "仅缓存" : t ? t("prefsFreshnessAuto") : "缓存自动"}`;
				}
				case "tavily": {
					if (effective.autoParameters) return t ? t("prefsTavilyAutoParams") : "自动调节";
					const depth = String(effective.searchDepth ?? "basic");
					if (depth === "advanced") return `${t ? t("prefsTavilyAdvanced") : "深入"} · 2 credits`;
					if (depth === "fast") return `${t ? t("prefsTavilyFast") : "快速"} · 1 credit`;
					if (depth === "ultra-fast") return `${t ? t("prefsTavilyUltraFast") : "极速"} · 1 credit`;
					return `${t ? t("prefsTavilyBasic") : "标准"} · 1 credit`;
				}
				case "brave": {
					const pref = String(effective.endpointPreference ?? "auto");
					if (pref === "web-search") return t ? t("prefsBraveWebSearch") : "Web Search";
					if (pref === "llm-context") return t ? t("prefsBraveLlmContext") : "LLM Context";
					return t ? t("prefsBraveAuto") : "自动";
				}
				case "you": return String(effective.extractionMode ?? "highlights") === "none" ? t ? t("prefsYouSummary") : "搜索摘要" : t ? t("prefsYouHighlights") : "重点片段";
				case "firecrawl": {
					const fresh = effective.fetchMaxAgeMs === 0 ? t ? t("prefsFreshnessLive") : "每次刷新" : t ? t("prefsFreshnessAuto") : "自动缓存";
					return `${t ? t("prefsFirecrawlOnlyMain") : "仅正文"} · ${fresh}`;
				}
				case "parallel": {
					const mode = String(effective.mode ?? "advanced");
					if (mode === "basic") return t ? t("prefsParallelBasic") : "标准";
					if (mode === "fast") return t ? t("prefsParallelFast") : "快速";
					if (mode === "turbo") return t ? t("prefsParallelTurbo") : "极速";
					return t ? t("prefsParallelAdvanced") : "深入";
				}
				case "jina": {
					const engine = String(effective.fetchEngine ?? "auto");
					const readerLm = effective.fetchReaderLmV2 === true;
					const engineLabel = engine === "curl" ? t ? t("prefsJinaModeDirect") : "直接读取" : engine === "browser" ? t ? t("prefsJinaModeBrowser") : "浏览器" : t ? t("prefsJinaModeAuto") : "自动读取";
					return readerLm ? `${engineLabel} · ${t ? t("prefsJinaReaderLmLabel") : "高质量转换"}` : engineLabel;
				}
				default: return t ? t("prefsDefault") : "默认设置";
			}
		}
		//#endregion
		//#region src/client/provider-preferences/ChoiceCard.tsx
		/**
		* dsh-web-tools — ChoiceCard: single-select radio card.
		*
		* Replaces native <select> for primary provider mode selection.
		* role=radio / radiogroup, DSH theme tokens, no large icons/gradients.
		* @module
		*/
		function ChoiceCard(props) {
			const { selected, title, description, badge, badgeTone, meta, warning, disabled, onClick } = props;
			const badgeObj = badge ? typeof badge === "string" ? {
				label: badge,
				tone: badgeTone ?? (badge === "推荐" || badge === "默认" || badge === "Default" || badge === "Recommended" ? "brand" : "neutral")
			} : badge : null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				role: "radio",
				"aria-checked": selected,
				"aria-disabled": disabled,
				onClick: disabled ? void 0 : onClick,
				onKeyDown: (e) => {
					if (disabled) return;
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onClick();
					}
				},
				tabIndex: disabled ? -1 : 0,
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 4,
					minHeight: 66,
					padding: "10px 12px",
					borderRadius: 10,
					cursor: disabled ? "not-allowed" : "pointer",
					border: `1px solid ${selected ? accent.primary : surface.border}`,
					background: selected ? `color-mix(in srgb, ${accent.primary} 6%, transparent)` : surface.layer2,
					opacity: disabled ? .5 : 1,
					fontFamily: "inherit",
					fontSize: 14,
					color: text.primary,
					textAlign: "left",
					boxSizing: "border-box",
					transition: "border-color .12s ease, background .12s ease",
					outline: "none"
				},
				onMouseEnter: (e) => {
					if (!disabled && !selected) e.currentTarget.style.background = surface.hover;
				},
				onMouseLeave: (e) => {
					if (!disabled && !selected) e.currentTarget.style.background = surface.layer2;
				},
				onFocus: (e) => {
					e.currentTarget.style.boxShadow = `0 0 0 2px ${accent.primary}40`;
				},
				onBlur: (e) => {
					e.currentTarget.style.boxShadow = "none";
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 6,
							flexWrap: "wrap"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontWeight: 600,
									fontSize: 13,
									color: text.primary
								},
								children: title
							}),
							badgeObj && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
								active: badgeObj.tone === "brand",
								children: badgeObj.label
							}),
							meta && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									marginLeft: "auto",
									fontSize: 11,
									color: text.tertiary,
									whiteSpace: "nowrap"
								},
								children: meta
							})
						]
					}),
					description && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 12,
							color: text.secondary,
							lineHeight: 1.4
						},
						children: description
					}),
					warning && selected && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 11,
							color: state.warning
						},
						children: warning
					})
				]
			});
		}
		//#endregion
		//#region src/client/provider-preferences/ProviderPreferencesSection.tsx
		/**
		* dsh-web-tools — P4 Search Preferences (ProviderPreferencesSection).
		*
		* Modern single-select preference UI replacing the old white <select> form.
		*
		* Wire contract unchanged: draft holds raw provider-native overrides; save
		* posts them to provider-options/set, reset deletes the override.
		* @module
		*/
		/** Collapsed pill: 已调整 (neutral) / 未保存 (warning). Default state returns null (§30). */
		function Pill(props) {
			if (props.kind === "none" || props.kind === "default") return null;
			const isUnsaved = props.kind === "unsaved";
			const color = isUnsaved ? state.warning : text.tertiary;
			const bg = surface.layer2;
			const label = isUnsaved ? props.t("prefsUnsaved") : props.t("prefsAdjusted");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					display: "inline-flex",
					alignItems: "center",
					fontSize: 11,
					lineHeight: 1,
					padding: "3px 8px",
					borderRadius: 999,
					border: `1px solid ${color}55`,
					background: bg,
					color,
					fontWeight: 600,
					whiteSpace: "nowrap"
				},
				children: label
			});
		}
		function Segmented(props) {
			const { options, value, onChange, disabled } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				role: "radiogroup",
				style: {
					display: "flex",
					gap: 4,
					flexWrap: "wrap"
				},
				children: options.map((o) => {
					const selected = o.value === value;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						role: "radio",
						"aria-checked": selected,
						disabled,
						title: o.title,
						onClick: () => onChange(o.value),
						style: {
							padding: "5px 12px",
							fontSize: 12,
							fontWeight: 500,
							borderRadius: 999,
							cursor: disabled ? "not-allowed" : "pointer",
							border: `1px solid ${selected ? "var(--dsw-alias-brand-primary)" : surface.border}`,
							background: selected ? "color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)" : surface.layer2,
							color: selected ? "var(--dsw-alias-label-primary)" : text.secondary,
							fontFamily: "inherit",
							outline: "none"
						},
						children: o.label
					}, o.value);
				})
			});
		}
		function NumberField(props) {
			const { label, hint, value, placeholder, onChange } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 4,
					fontSize: 12,
					color: text.secondary
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "number",
						value,
						placeholder,
						onChange: (e) => onChange(e.target.value),
						style: {
							padding: "5px 9px",
							borderRadius: 7,
							border: `1px solid ${surface.border}`,
							background: surface.layer2,
							color: text.primary,
							fontFamily: "inherit",
							fontSize: 13,
							width: 120
						}
					}),
					hint && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: text.tertiary,
							fontSize: 11
						},
						children: hint
					})
				]
			});
		}
		function ProviderPreferencesSection(props) {
			const { t, p, onConfigChanged } = props;
			if (p.name === "searxng" || !p.options) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreferencesBody, {
				t,
				p,
				onConfigChanged
			}, p.name);
		}
		function PreferencesBody(props) {
			const { t, p, onConfigChanged } = props;
			const [expanded, setExpanded] = (0, react.useState)(false);
			const seed = { ...p.options?.overrides ?? {} };
			const [draft, setDraft] = (0, react.useState)(seed);
			const [saving, setSaving] = (0, react.useState)(false);
			const [msg, setMsg] = (0, react.useState)(null);
			const eff = p.options.effective;
			const isDef = p.options.isDefault;
			const savedOverrides = p.options.overrides ?? {};
			const setValue = (key, value, defaultValue) => {
				setDraft((prev) => {
					const next = { ...prev };
					if (value === defaultValue) delete next[key];
					else next[key] = value;
					return next;
				});
			};
			const dirtyKeys = [.../* @__PURE__ */ new Set([...Object.keys(draft), ...Object.keys(savedOverrides)])].filter((key) => !Object.is(draft[key], savedOverrides[key]));
			const dirty = dirtyKeys.length > 0;
			const handleSave = async () => {
				setSaving(true);
				setMsg(null);
				try {
					await api.providerOptionsSet(p.name, draft);
					onConfigChanged();
					setMsg({
						text: t("prefsSaved"),
						tone: "success"
					});
					window.setTimeout(() => setMsg(null), 2e3);
				} catch {
					setMsg({
						text: t("prefsSaveFailed"),
						tone: "error"
					});
				} finally {
					setSaving(false);
				}
			};
			const handleCancel = () => {
				setDraft(savedOverrides);
				setMsg(null);
			};
			const handleResetToDefaults = () => {
				setDraft({});
				setMsg(null);
			};
			const summary = formatProviderOptionsSummary(p.name, eff, (key) => t(key));
			const pillKind = dirty ? "unsaved" : !isDef ? "adjusted" : "default";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					marginTop: 16,
					borderTop: `1px solid ${surface.border}`,
					paddingTop: 14
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					role: "button",
					tabIndex: 0,
					"aria-expanded": expanded,
					onClick: () => setExpanded(!expanded),
					onKeyDown: (e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							setExpanded(!expanded);
						}
					},
					style: {
						display: "flex",
						alignItems: "center",
						gap: 10,
						cursor: "pointer",
						borderRadius: 8,
						padding: "2px 4px",
						margin: "-2px -4px",
						outline: "none"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontWeight: 600,
								fontSize: 13,
								color: text.primary
							},
							children: t("prefsTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								marginTop: 2,
								minWidth: 0
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: 12,
									color: text.secondary,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: summary
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Pill, {
								t,
								kind: pillKind
							})]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							transform: expanded ? "rotate(90deg)" : "none",
							transition: "transform .15s ease",
							flex: "none",
							color: text.tertiary,
							display: "inline-flex"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 14 })
					})]
				}), expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						marginTop: 12,
						display: "flex",
						flexDirection: "column",
						gap: 14,
						fontSize: 13
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderControls, {
							t,
							provider: p.name,
							draft,
							setValue,
							eff
						}),
						dirty && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 10,
								marginTop: 2,
								paddingTop: 10,
								borderTop: `1px solid ${surface.border}`
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: 12,
									color: text.secondary
								},
								children: t("prefsModified", { n: dirtyKeys.length })
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									marginLeft: "auto",
									display: "flex",
									alignItems: "center",
									gap: 8
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "ghost",
									onClick: handleCancel,
									disabled: saving,
									children: t("prefsCancel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "primary",
									onClick: handleSave,
									disabled: saving,
									children: saving ? t("prefsSaving") : t("prefsSave")
								})]
							})]
						}),
						!dirty && !isDef && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								justifyContent: "flex-end",
								marginTop: 2,
								paddingTop: 10,
								borderTop: `1px solid ${surface.border}`
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								onClick: handleResetToDefaults,
								disabled: saving,
								children: t("prefsRestore")
							})
						}),
						msg && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 12,
								color: msg.tone === "error" ? state.danger : state.success,
								textAlign: "right"
							},
							children: msg.text
						})
					]
				})]
			});
		}
		/** Per-provider control panels — fully i18n, no hardcoded Chinese. */
		function ProviderControls(props) {
			const { t, provider, draft, setValue, eff } = props;
			const raw = (key, fallback) => draft[key] ?? fallback;
			switch (provider) {
				case "exa": {
					const searchType = String(raw("searchType", "auto"));
					const group = searchType === "fast" || searchType === "instant" ? "speed" : searchType.startsWith("deep") ? "deep" : "auto";
					const maxAgeHours = raw("maxAgeHours", void 0);
					const freshness = maxAgeHours === 0 ? "live" : maxAgeHours === -1 ? "cache" : "auto";
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsExaModeLabel") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "grid",
									gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
									gap: 8
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
										selected: group === "auto",
										title: t("prefsExaAuto"),
										description: t("prefsExaAutoDesc"),
										badge: {
											label: t("defaultBadge"),
											tone: "brand"
										},
										onClick: () => setValue("searchType", "auto", "auto")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
										selected: group === "speed",
										title: t("prefsExaFast"),
										description: t("prefsExaFastDesc"),
										onClick: () => setValue("searchType", "fast", "auto")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
										selected: group === "deep",
										title: t("prefsExaDeep"),
										description: t("prefsExaDeepDesc"),
										onClick: () => setValue("searchType", "deep-lite", "auto")
									})
								]
							}),
							group === "speed" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 8,
									marginTop: 2
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 12,
										color: text.secondary
									},
									children: t("prefsSpeed")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Segmented, {
									options: [{
										value: "fast",
										label: t("prefsFast")
									}, {
										value: "instant",
										label: t("prefsInstant")
									}],
									value: String(raw("searchType", "fast")),
									onChange: (v) => setValue("searchType", v, "auto")
								})]
							}),
							group === "deep" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 8,
									marginTop: 2
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 12,
										color: text.secondary
									},
									children: t("prefsDepth")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Segmented, {
									options: [
										{
											value: "deep-lite",
											label: t("prefsDeepLite")
										},
										{
											value: "deep",
											label: t("prefsDeep")
										},
										{
											value: "deep-reasoning",
											label: t("prefsDeepReasoning")
										}
									],
									value: String(raw("searchType", "deep-lite")),
									onChange: (v) => setValue("searchType", v, "auto")
								})]
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsExaFreshnessLabel") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Segmented, {
								options: [
									{
										value: "auto",
										label: t("prefsFreshnessAuto")
									},
									{
										value: "live",
										label: t("prefsFreshnessLive")
									},
									{
										value: "cache",
										label: t("prefsFreshnessCache")
									}
								],
								value: freshness,
								onChange: (v) => {
									if (v === "auto") setValue("maxAgeHours", void 0, void 0);
									else if (v === "live") setValue("maxAgeHours", 0, void 0);
									else setValue("maxAgeHours", -1, void 0);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AdvancedDelay, {
								t,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
									label: t("prefsExaFreshnessLabel") + " (h)",
									hint: t("prefsExaMaxAgeHint"),
									value: typeof draft.maxAgeHours === "number" ? String(draft.maxAgeHours) : "",
									onChange: (v) => {
										const n = Number(v);
										if (v === "" || Number.isNaN(n)) setValue("maxAgeHours", void 0, void 0);
										else setValue("maxAgeHours", Math.round(n), void 0);
									}
								})
							})
						]
					})] });
				}
				case "tavily": {
					const autoParams = raw("autoParameters", false) === true;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsTavilyDepthLabel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "grid",
									gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
									gap: 8
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
										selected: !autoParams && raw("searchDepth", "basic") === "basic",
										title: t("prefsTavilyBasic"),
										description: t("prefsTavilyBasicDesc"),
										badge: {
											label: t("defaultBadge"),
											tone: "brand"
										},
										meta: "1 credit",
										disabled: autoParams,
										onClick: () => setValue("searchDepth", "basic", "basic")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
										selected: !autoParams && raw("searchDepth", "basic") === "advanced",
										title: t("prefsTavilyAdvanced"),
										description: t("prefsTavilyAdvancedDesc"),
										meta: "2 credits",
										disabled: autoParams,
										onClick: () => setValue("searchDepth", "advanced", "basic")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
										selected: !autoParams && raw("searchDepth", "basic") === "fast",
										title: t("prefsTavilyFast"),
										description: t("prefsTavilyFastDesc"),
										meta: "1 credit",
										disabled: autoParams,
										onClick: () => setValue("searchDepth", "fast", "basic")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
										selected: !autoParams && raw("searchDepth", "basic") === "ultra-fast",
										title: t("prefsTavilyUltraFast"),
										description: t("prefsTavilyUltraFastDesc"),
										meta: "1 credit",
										disabled: autoParams,
										onClick: () => setValue("searchDepth", "ultra-fast", "basic")
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 10
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
								checked: autoParams,
								onChange: (v) => setValue("autoParameters", v, false),
								label: t("prefsTavilyAutoParams")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 2
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 13,
										color: text.primary
									},
									children: t("prefsTavilyAutoParams")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 12,
										color: text.secondary
									},
									children: t("prefsTavilyAutoParamsDesc")
								})]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(AdvancedDelay, {
							t,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 6
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsTavilyChunksPerSource") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Segmented, {
									options: [
										{
											value: "auto",
											label: t("prefsAutoLabel")
										},
										{
											value: "1",
											label: "1"
										},
										{
											value: "2",
											label: "2"
										},
										{
											value: "3",
											label: "3"
										}
									],
									value: typeof draft.chunksPerSource === "number" ? String(draft.chunksPerSource) : "auto",
									onChange: (v) => {
										if (v === "auto") setValue("chunksPerSource", void 0, void 0);
										else setValue("chunksPerSource", Number(v), void 0);
									}
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 6
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsTavilyExtractDepth") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Segmented, {
									options: [{
										value: "basic",
										label: t("prefsExtractBasic")
									}, {
										value: "advanced",
										label: t("prefsExtractAdvanced")
									}],
									value: String(raw("fetchExtractDepth", "basic")),
									onChange: (v) => setValue("fetchExtractDepth", v, "basic")
								})]
							})]
						})
					] });
				}
				case "brave": {
					const pref = String(raw("endpointPreference", "auto"));
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsBraveModeLabel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "grid",
								gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
								gap: 8
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
									selected: pref === "auto",
									title: t("prefsBraveAuto"),
									description: t("prefsBraveAutoDesc"),
									badge: {
										label: t("defaultBadge"),
										tone: "brand"
									},
									onClick: () => setValue("endpointPreference", "auto", "auto")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
									selected: pref === "llm-context",
									title: t("prefsBraveLlmContext"),
									description: t("prefsBraveLlmContextDesc"),
									onClick: () => setValue("endpointPreference", "llm-context", "auto")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
									selected: pref === "web-search",
									title: t("prefsBraveWebSearch"),
									description: t("prefsBraveWebSearchDesc"),
									onClick: () => setValue("endpointPreference", "web-search", "auto")
								})
							]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(AdvancedDelay, {
						t,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsBraveThreshold") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Segmented, {
								options: [
									{
										value: "balanced",
										label: t("prefsBraveThresholdBalanced")
									},
									{
										value: "strict",
										label: t("prefsBraveThresholdStrict")
									},
									{
										value: "lenient",
										label: t("prefsBraveThresholdLenient")
									},
									{
										value: "off",
										label: t("prefsBraveThresholdOff")
									}
								],
								value: String(raw("contextThresholdMode", "balanced")),
								onChange: (v) => setValue("contextThresholdMode", v, "balanced")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsBraveTokenBudget") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Segmented, {
								options: [
									{
										value: "auto",
										label: t("prefsAutoLabel")
									},
									{
										value: "4000",
										label: "4K"
									},
									{
										value: "8000",
										label: "8K"
									},
									{
										value: "16000",
										label: "16K"
									}
								],
								value: typeof draft.contextTokenBudget === "number" ? String(draft.contextTokenBudget) : "auto",
								onChange: (v) => {
									if (v === "auto") setValue("contextTokenBudget", void 0, void 0);
									else setValue("contextTokenBudget", Number(v), void 0);
								}
							})]
						})]
					})] });
				}
				case "you": {
					const ext = String(raw("extractionMode", "highlights"));
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsYouResultsLabel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "grid",
								gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
								selected: ext === "highlights",
								title: t("prefsYouHighlights"),
								description: t("prefsYouHighlightsDesc"),
								badge: {
									label: t("defaultBadge"),
									tone: "brand"
								},
								onClick: () => setValue("extractionMode", "highlights", "highlights")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
								selected: ext === "none",
								title: t("prefsYouSummary"),
								description: t("prefsYouSummaryDesc"),
								onClick: () => setValue("extractionMode", "none", "highlights")
							})]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AdvancedDelay, {
						t,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 14,
								flexWrap: "wrap"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: t("prefsYouTimeoutSec"),
								value: typeof draft.fetchCrawlTimeoutSec === "number" ? String(draft.fetchCrawlTimeoutSec) : "",
								onChange: (v) => {
									const n = Number(v);
									if (v === "" || Number.isNaN(n)) setValue("fetchCrawlTimeoutSec", void 0, void 0);
									else setValue("fetchCrawlTimeoutSec", Math.round(n), void 0);
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: t("prefsYouFreshnessSec"),
								value: typeof draft.fetchMaxAgeSec === "number" ? String(draft.fetchMaxAgeSec) : "",
								onChange: (v) => {
									const n = Number(v);
									if (v === "" || Number.isNaN(n)) setValue("fetchMaxAgeSec", void 0, void 0);
									else setValue("fetchMaxAgeSec", Math.round(n), void 0);
								}
							})]
						})
					})] });
				}
				case "firecrawl": {
					const onlyMain = raw("fetchOnlyMainContent", true) !== false;
					const maxAge = raw("fetchMaxAgeMs", void 0);
					const cacheKind = maxAge === 0 ? "live" : maxAge === 864e5 ? "day" : maxAge === 6048e5 ? "week" : "auto";
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 10
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
							checked: onlyMain,
							onChange: (v) => setValue("fetchOnlyMainContent", v, true),
							label: t("prefsFirecrawlOnlyMain")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 2
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: 13,
									color: text.primary
								},
								children: t("prefsFirecrawlOnlyMain")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: 12,
									color: text.secondary
								},
								children: t("prefsFirecrawlOnlyMainDesc")
							})]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsPageCache") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Segmented, {
							options: [
								{
									value: "auto",
									label: t("prefsFreshnessAuto")
								},
								{
									value: "live",
									label: t("prefsFreshnessLive")
								},
								{
									value: "day",
									label: t("prefsFirecrawl1Day")
								},
								{
									value: "week",
									label: t("prefsFirecrawl7Days")
								}
							],
							value: cacheKind,
							onChange: (v) => {
								if (v === "auto") setValue("fetchMaxAgeMs", void 0, void 0);
								else if (v === "live") setValue("fetchMaxAgeMs", 0, void 0);
								else if (v === "day") setValue("fetchMaxAgeMs", 864e5, void 0);
								else setValue("fetchMaxAgeMs", 6048e5, void 0);
							}
						})]
					})] });
				}
				case "parallel": {
					const mode = String(raw("mode", "advanced"));
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsParallelQualityLabel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "grid",
								gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
								gap: 8
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
									selected: mode === "advanced",
									title: t("prefsParallelAdvanced"),
									description: t("prefsParallelAdvancedDesc"),
									badge: {
										label: t("defaultBadge"),
										tone: "brand"
									},
									onClick: () => setValue("mode", "advanced", "advanced")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
									selected: mode === "basic",
									title: t("prefsParallelBasic"),
									description: t("prefsParallelBasicDesc"),
									onClick: () => setValue("mode", "basic", "advanced")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
									selected: mode === "fast",
									title: t("prefsParallelFast"),
									description: t("prefsParallelFastDesc"),
									onClick: () => setValue("mode", "fast", "advanced")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
									selected: mode === "turbo",
									title: t("prefsParallelTurbo"),
									description: t("prefsParallelTurboDesc"),
									onClick: () => setValue("mode", "turbo", "advanced")
								})
							]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AdvancedDelay, {
						t,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsParallelCharsLabel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Segmented, {
								options: [
									{
										value: "auto",
										label: t("prefsAutoLabel")
									},
									{
										value: "10000",
										label: t("prefsParallelCharsCompact")
									},
									{
										value: "25000",
										label: t("prefsParallelCharsStandard")
									},
									{
										value: "50000",
										label: t("prefsParallelCharsMore")
									}
								],
								value: typeof draft.maxCharsTotal === "number" ? String(draft.maxCharsTotal) : "auto",
								onChange: (v) => {
									if (v === "auto") setValue("maxCharsTotal", void 0, void 0);
									else setValue("maxCharsTotal", Number(v), void 0);
								}
							})]
						})
					})] });
				}
				case "jina": {
					const engine = String(raw("fetchEngine", "auto"));
					const readerLm = raw("fetchReaderLmV2", false) === true;
					const cacheTolerance = raw("fetchCacheToleranceSec", void 0);
					const cacheKind = cacheTolerance === 0 ? "live" : cacheTolerance === 3600 ? "hour" : cacheTolerance === 86400 ? "day" : "auto";
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsJinaModeLabel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "grid",
									gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
									gap: 8
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
										selected: engine === "auto",
										title: t("prefsJinaModeAuto"),
										description: t("prefsJinaModeAutoDesc"),
										badge: {
											label: t("defaultBadge"),
											tone: "brand"
										},
										onClick: () => setValue("fetchEngine", "auto", "auto")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
										selected: engine === "curl",
										title: t("prefsJinaModeDirect"),
										description: t("prefsJinaModeDirectDesc"),
										onClick: () => setValue("fetchEngine", "curl", "auto")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
										selected: engine === "browser",
										title: t("prefsJinaModeBrowser"),
										description: t("prefsJinaModeBrowserDesc"),
										onClick: () => setValue("fetchEngine", "browser", "auto")
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 10
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
								checked: readerLm,
								onChange: (v) => setValue("fetchReaderLmV2", v, false),
								label: t("prefsJinaReaderLmLabel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 2
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 13,
										color: text.primary
									},
									children: t("prefsJinaReaderLmLabel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 12,
										color: text.secondary
									},
									children: t("prefsJinaReaderLmDesc")
								})]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, { children: t("prefsJinaCacheLabel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Segmented, {
								options: [
									{
										value: "auto",
										label: t("prefsJinaCacheAuto")
									},
									{
										value: "live",
										label: t("prefsJinaCacheLive")
									},
									{
										value: "hour",
										label: t("prefsJinaCacheHour")
									},
									{
										value: "day",
										label: t("prefsJinaCacheDay")
									}
								],
								value: cacheKind,
								onChange: (v) => {
									if (v === "auto") setValue("fetchCacheToleranceSec", void 0, void 0);
									else if (v === "live") setValue("fetchCacheToleranceSec", 0, void 0);
									else if (v === "hour") setValue("fetchCacheToleranceSec", 3600, void 0);
									else setValue("fetchCacheToleranceSec", 86400, void 0);
								}
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(AdvancedDelay, {
							t,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: t("prefsJinaMaxTokens"),
								hint: t("prefsJinaMaxTokensDesc"),
								value: typeof draft.fetchMaxTokens === "number" ? String(draft.fetchMaxTokens) : "",
								onChange: (v) => {
									const n = Number(v);
									if (v === "" || Number.isNaN(n)) setValue("fetchMaxTokens", void 0, void 0);
									else setValue("fetchMaxTokens", Math.round(n), void 0);
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: t("prefsJinaTokenBudget"),
								hint: t("prefsJinaTokenBudgetDesc"),
								value: typeof draft.fetchTokenBudget === "number" ? String(draft.fetchTokenBudget) : "",
								onChange: (v) => {
									const n = Number(v);
									if (v === "" || Number.isNaN(n)) setValue("fetchTokenBudget", void 0, void 0);
									else setValue("fetchTokenBudget", Math.round(n), void 0);
								}
							})]
						})
					] });
				}
				default: return null;
			}
		}
		function SectionLabel(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					fontSize: 12,
					fontWeight: 600,
					color: text.secondary
				},
				children: props.children
			});
		}
		function AdvancedDelay(props) {
			const [open, setOpen] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => setOpen(!open),
					style: {
						alignSelf: "flex-start",
						display: "inline-flex",
						alignItems: "center",
						gap: 4,
						padding: "2px 0",
						fontSize: 12,
						border: "none",
						background: "transparent",
						color: text.secondary,
						cursor: "pointer",
						fontFamily: "inherit"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							transform: open ? "rotate(90deg)" : "none",
							transition: "transform .15s ease",
							display: "inline-flex"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 12 })
					}), props.t("moreSettings")]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 10,
						padding: 8,
						borderRadius: 8,
						background: surface.layer1
					},
					children: props.children
				})]
			});
		}
		//#endregion
		//#region src/client/brand.ts
		function svgDataUri(svg) {
			return "data:image/svg+xml," + encodeURIComponent(svg);
		}
		const LOGOS = {
			exa: `<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>Exa</title><path clip-rule="evenodd" d="M3 0h19v1.791L13.892 12 22 22.209V24H3V0zm9.62 10.348l6.589-8.557H6.03l6.59 8.557zM5.138 3.935v7.17h5.52l-5.52-7.17zm5.52 8.96h-5.52v7.17l5.52-7.17zM6.03 22.21l6.59-8.557 6.589 8.557H6.03z" fill="#1F40ED" fill-rule="evenodd"></path></svg>`,
			tavily: `<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>Tavily</title><path d="M9.1.503l2.824 4.47a1.078 1.078 0 01-.911 1.655H9.858v6.692h-1.67V0c.35 0 .7.168.912.503z" fill="#8FBCFA"></path><path d="M4.453 4.974L7.277.503A1.07 1.07 0 018.189 0v13.32a2.633 2.633 0 00-1.67.48V6.628H5.364c-.85 0-1.366-.936-.912-1.654z" fill="#468BFF"></path><path d="M17.041 17.74h-7.028c.423-.457.67-1.049.7-1.67h12.956c0 .35-.168.7-.502.912l-4.472 2.823a1.078 1.078 0 01-1.654-.911v-1.155z" fill="#FDBB11"></path><path d="M18.695 12.334l4.47 2.824c.336.212.503.562.503.912H10.713a2.65 2.65 0 00-.493-1.67h6.822v-1.154c0-.85.935-1.366 1.653-.912z" fill="#F6D785"></path><path d="M4.394 19.605L.316 23.683a1.07 1.07 0 001 .29l5.158-1.165A1.078 1.078 0 007 20.994l-.816-.816 3.073-3.074a1.61 1.61 0 000-2.276l-.042-.043-4.82 4.82z" fill="#FF9A9D"></path><path d="M3.822 17.817l3.073-3.074a1.61 1.61 0 012.277 0l.042.043-4.818 4.819-4.08 4.079a1.07 1.07 0 01-.289-1l1.165-5.158A1.078 1.078 0 013.006 17l.816.817z" fill="#FE363B"></path></svg>`,
			brave: `<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>Brave</title><path d="M17.544 2.375c.017-.005 1.844-.5 2.712.361.872.872 1.588 1.642 1.588 1.642l-.565 1.38v-.003.006-.003L22 7.8c-.014.05-2.112 7.983-2.357 8.954-.488 1.924-.819 2.663-2.202 3.638a212.634 212.634 0 01-4.305 2.917c-.41.252-.92.691-1.383.691-.463 0-.974-.439-1.383-.691a213.099 213.099 0 01-4.306-2.917c-1.383-.975-1.72-1.714-2.2-3.632-.246-.977-2.35-8.904-2.364-8.96l.722-2.045-.566-1.383s.722-.764 1.594-1.63c.866-.872 2.712-.36 2.712-.36L8.066 0h7.373l2.105 2.375zm-5.797 12.557c-.138 0-1.04.318-1.762.691l-.457.234c-.487.253-.823.428-.956.506-.168.108-.066.306.09.414.15.103 2.195 1.684 2.394 1.865l.09.078c.186.168.432.391.607.391.174 0 .415-.223.607-.391l.084-.078c.2-.169 2.244-1.756 2.394-1.865.15-.108.258-.3.09-.408-.133-.084-.475-.253-.956-.506h-.006l-.457-.24c-.722-.373-1.623-.691-1.762-.691zm.006-11.276c-.35.02-.694.092-1.023.211l-.378.126c-.493.169-.969.331-1.21.331-.312 0-2.554-.428-2.584-.433 0 0-2.706 3.26-2.706 3.957 0 .577.228.805.504 1.07l.174.175 2.033 2.152.06.067c.204.204.5.498.29.998l-.043.102c-.228.535-.511 1.203-.15 1.876.384.716 1.046 1.19 1.467 1.118.42-.084 1.419-.601 1.78-.841.367-.229 1.52-1.19 1.521-1.551 0-.307-.829-.812-1.238-1.053l-.18-.12-.199-.12c-.367-.229-1.035-.644-1.047-.825-.018-.228-.017-.294.283-.853l.21-.379c.289-.487.602-1.029.536-1.426-.085-.433-.777-.685-1.36-.901l-.21-.078-.613-.229c-.583-.222-1.232-.463-1.34-.511-.145-.073-.11-.132.335-.174l.223-.025c.553-.06 1.582-.168 2.08-.03l.32.09c.564.145 1.25.337 1.316.445l.03.048c.067.09.109.145.037.53l-.121.607c-.15.806-.391 2.069-.421 2.351l-.012.115c-.042.312-.066.529.301.613.438.119.884.206 1.335.259.216 0 .824-.144 1.24-.24l.095-.025c.367-.078.343-.289.3-.602l-.011-.12c-.03-.282-.27-1.54-.42-2.345l-.122-.614c-.072-.384-.024-.439.036-.529l.03-.048c.067-.108.753-.294 1.318-.444l.318-.091c.5-.138 1.528-.03 2.081.03l.216.018c.451.048.493.108.343.18-.11.049-.758.29-1.341.512-.273.108-.547.21-.823.307-.583.216-1.275.468-1.36.907-.066.391.247.939.535 1.42l.21.379c.301.56.308.625.284.854-.012.18-.68.595-1.053.824l-.192.126-.181.108c-.41.247-1.238.758-1.238 1.059 0 .367 1.16 1.316 1.521 1.55.367.235 1.36.758 1.78.836.421.078 1.082-.396 1.467-1.112.36-.673.078-1.335-.15-1.876l-.042-.102c-.21-.5.084-.794.289-1.004l.065-.06 2.02-2.147.181-.181c.271-.265.505-.493.505-1.07 0-.698-2.706-3.957-2.706-3.957-.03.006-2.275.44-2.586.44l.007-.007c-.252 0-.722-.156-1.215-.337l-.379-.12c-.612-.21-1.02-.21-1.022-.21z" fill="url(#braveGradient)"></path><defs><linearGradient gradientUnits="userSpaceOnUse" id="braveGradient" x1="1.506" x2="22" y1="24.174" y2="24.174"><stop stop-color="#FF5601"></stop><stop offset=".5" stop-color="#FF4000"></stop><stop offset="1" stop-color="#FF1F01"></stop></linearGradient></defs></svg>`,
			you: `<svg width="65" height="65" viewBox="0 0 65 65" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M27.4941 1.22885C30.6309 -0.409588 34.3672 -0.409644 37.5039 1.22885L59.1709 12.5521C62.7539 14.4242 65 18.1405 65 22.1937V30.6312H50.0488C41.4318 30.6311 34.4492 23.629 34.4492 14.9886V7.81869H30.5488V14.9886C30.5488 23.6289 23.5662 30.631 14.9492 30.6312H7.79785V34.5413H14.9492C23.5662 34.5415 30.5488 41.5479 30.5488 50.1839V65.0003C29.4968 64.8058 28.4686 64.4554 27.4941 63.9496L5.8291 52.6204C2.24614 50.7505 3.91808e-05 47.032 0 42.9788V22.1956C8.82192e-05 18.1426 2.2462 14.4263 5.8291 12.5521L27.4941 1.22885ZM64.9971 34.5413V42.9788C64.9971 47.0321 62.751 50.7506 59.168 52.6204L37.5029 63.9496C36.5285 64.4532 35.5002 64.8058 34.4482 65.0003V50.1839H34.4463C34.4463 41.5479 41.429 34.5415 50.0459 34.5413H64.9971Z" fill="url(#youGradient)"/>
<defs>
<linearGradient id="youGradient" x1="65" y1="0" x2="-0.000328063" y2="65" gradientUnits="userSpaceOnUse">
<stop offset="0.15" stop-color="#A0A4EE"/>
<stop offset="0.8" stop-color="#596CED"/>
</linearGradient>
</defs>
</svg>`,
			firecrawl: `<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>Firecrawl</title><path d="M18.183 7.67c-.939.278-1.647.905-2.166 1.586-.11.146-.343.036-.299-.143.993-4.058-.318-7.432-4.407-9.092a.272.272 0 00-.368.317C12.803 7.76 4.98 7.135 5.969 15.55a.17.17 0 01-.266.159c-.37-.265-.784-.817-1.068-1.205a.17.17 0 00-.302.054A8.631 8.631 0 004 16.9a8.43 8.43 0 003.843 7.07c.133.086.303-.038.258-.189a4.533 4.533 0 01-.133-2.041c.097-.637.32-1.244.694-1.797 1.283-1.914 3.854-3.763 3.443-6.273-.026-.16.162-.264.281-.155 1.812 1.645 2.17 3.858 1.873 5.844-.026.172.192.264.302.129.277-.345.615-.647.983-.875a.17.17 0 01.25.088c.204.592.508 1.148.796 1.704a4.528 4.528 0 01.307 3.375.17.17 0 00.257.192A8.43 8.43 0 0021 16.9a8.746 8.746 0 00-.524-2.98c-.718-1.982-2.54-3.47-2.08-6.053a.17.17 0 00-.213-.195z" fill="#ff4d00"></path></svg>`,
			parallel: `<svg viewBox="0 0 274 273" xmlns="http://www.w3.org/2000/svg">
<path d="M270.322 106.744H195.65C195.85 107.919 196.013 109.112 196.176 110.305H77.3911C77.1733 111.878 76.9556 113.468 76.7741 115.041H1.6488C1.28587 117.391 0.959247 119.759 0.7052 122.163H76.0846C75.9575 123.735 75.8668 125.326 75.7761 126.898H197.791C197.846 128.073 197.9 129.266 197.936 130.459H273.225V126.663C272.735 119.867 271.773 113.215 270.322 106.744Z" fill="#1D1C1A"/>
<path d="M197.791 145.859H75.7761C75.8487 147.45 75.9575 149.022 76.0846 150.595H0.7052C0.959247 152.981 1.26773 155.349 1.6488 157.717H76.7741C76.9556 159.307 77.1552 160.88 77.3911 162.452H196.176C196.013 163.645 195.831 164.82 195.65 166.013H270.322C271.773 159.542 272.735 152.89 273.225 146.094V142.298H197.936C197.9 143.491 197.846 144.666 197.791 145.859Z" fill="#1D1C1A"/>
<path d="M192.42 181.431H81.1113C81.5105 183.022 81.946 184.594 82.3815 186.167H9.39746C10.3411 188.571 11.3572 190.939 12.4279 193.288H84.5409C85.0672 194.879 85.5934 196.452 86.1559 198.024H187.339C186.904 199.217 186.468 200.392 186.015 201.585H256.912C261.031 194.084 264.443 186.149 267.092 177.87H193.255C192.983 179.063 192.692 180.238 192.402 181.431H192.42Z" fill="#1D1C1A"/>
<path d="M179.337 217.003H94.2126C94.9929 218.594 95.8095 220.184 96.6442 221.739H30.1565C32.1344 224.179 34.185 226.547 36.3081 228.861H100.6C101.544 230.451 102.505 232.042 103.485 233.596H170.082C169.338 234.789 168.576 235.982 167.796 237.157H228.894C236.679 230.09 243.629 222.118 249.617 213.442H181.042C180.48 214.635 179.935 215.828 179.355 217.003H179.337Z" fill="#1D1C1A"/>
<path d="M156.4 252.557H117.15C118.474 254.166 119.817 255.738 121.196 257.293H73.7075C92.4707 267.017 113.774 272.585 136.366 272.639C136.512 272.639 136.639 272.639 136.766 272.639C136.893 272.639 137.038 272.639 137.165 272.639C165.582 272.548 191.966 263.836 213.796 248.978H159.231C158.287 250.171 157.343 251.364 156.382 252.539L156.4 252.557Z" fill="#1D1C1A"/>
<path d="M117.15 20.2002H156.4C157.362 21.3751 158.306 22.568 159.249 23.761H213.815C191.967 8.90316 165.6 0.190901 137.183 0.100525C137.038 0.100525 136.911 0.100525 136.784 0.100525C136.657 0.100525 136.512 0.100525 136.385 0.100525C113.775 0.172826 92.4893 5.72192 73.7261 15.4464H121.215C119.836 17.0009 118.493 18.5915 117.168 20.1821L117.15 20.2002Z" fill="#1D1C1A"/>
<path d="M94.213 55.7723H179.337C179.918 56.9471 180.48 58.1401 181.024 59.3331H249.599C243.611 50.657 236.661 42.6858 228.876 35.6184H167.778C168.558 36.7933 169.32 37.9862 170.064 39.1792H103.468C102.488 40.7517 101.526 42.3243 100.582 43.9149H36.2902C34.149 46.2105 32.0985 48.5783 30.1387 51.0365H96.6264C95.7917 52.6091 94.9933 54.1816 94.1948 55.7723H94.213Z" fill="#1D1C1A"/>
<path d="M81.1293 91.3261H192.438C192.729 92.501 193.019 93.6939 193.291 94.8869H267.128C264.479 86.6084 261.067 78.6734 256.948 71.1722H186.051C186.504 72.3471 186.94 73.5401 187.375 74.733H86.1921C85.6296 76.3056 85.0852 77.8781 84.5771 79.4687H12.464C11.3934 81.8004 10.3772 84.1683 9.43359 86.5904H82.4177C81.9822 88.1629 81.5467 89.7354 81.1474 91.3261H81.1293Z" fill="#1D1C1A"/>
</svg>`,
			jina: `<svg fill="#000000" fill-rule="evenodd" height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>Jina</title><path d="M6.608 21.416a4.608 4.608 0 100-9.217 4.608 4.608 0 000 9.217zM20.894 2.015c.614 0 1.106.492 1.106 1.106v9.002c0 5.13-4.148 9.309-9.217 9.37v-9.355l-.03-9.032c0-.614.491-1.106 1.106-1.106h7.158l-.123.015z"></path></svg>`,
			searxng: `<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>SearXNG</title><path d="M6.638 4.38a5.35 5.35 0 017.747 3.963 5.35 5.35 0 01-.56 3.284l-1.154-.61A4.044 4.044 0 007.237 5.54l-.6-1.158z" fill="#3050FF"></path><path clip-rule="evenodd" d="M9.13 0a9.13 9.13 0 017.992 13.546l6.803 6.515-3.4 3.551-6.853-6.562A9.13 9.13 0 119.13 0zm0 2.61a6.521 6.521 0 100 13.042 6.521 6.521 0 000-13.043z" fill="#3050FF" fill-rule="evenodd"></path></svg>`
		};
		const FALLBACK_COLORS = {
			exa: {
				bg: "#1A1A2E",
				letter: "E",
				label: "Exa"
			},
			tavily: {
				bg: "#4A6CF7",
				letter: "T",
				label: "Tavily"
			},
			brave: {
				bg: "#FB542B",
				letter: "B",
				label: "Brave"
			},
			you: {
				bg: "#06B6D4",
				letter: "Y",
				label: "You.com"
			},
			firecrawl: {
				bg: "#F97316",
				letter: "F",
				label: "Firecrawl"
			},
			parallel: {
				bg: "#8B5CF6",
				letter: "P",
				label: "Parallel"
			},
			jina: {
				bg: "#10B981",
				letter: "J",
				label: "Jina"
			},
			searxng: {
				bg: "#6B7280",
				letter: "S",
				label: "SearXNG"
			}
		};
		function makeFallbackSvg(bg, letter) {
			return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="${bg}"/><text x="12" y="16" text-anchor="middle" font-family="system-ui" font-weight="700" font-size="13" fill="#fff">${letter}</text></svg>`;
		}
		const PROVIDER_BRAND = {};
		for (const name of Object.keys(FALLBACK_COLORS)) if (LOGOS[name]) PROVIDER_BRAND[name] = {
			icon: svgDataUri(LOGOS[name]),
			label: FALLBACK_COLORS[name].label
		};
		else {
			const c = FALLBACK_COLORS[name];
			PROVIDER_BRAND[name] = {
				icon: svgDataUri(makeFallbackSvg(c.bg, c.letter)),
				label: c.label
			};
		}
		//#endregion
		//#region src/client/ProviderModal.tsx
		/**
		* dsh-web-tools — provider detail dialog (Modal).
		*
		* Compact, fixed-height layout: header/footer are sticky, body scrolls.
		* Overview (status + quota) compressed into one line; credentials collapsed
		* by default.
		* @module
		*/
		/** Quiet human source label (no "Official/Authoritative" tag stacking). */
		function quotaSourceLabel(t, source) {
			if (!source) return "";
			const key = `quotaSource${source[0].toUpperCase()}${source.slice(1)}`;
			const value = t(key);
			return value !== key ? value : t("quotaSource", { s: source });
		}
		/** Full rich quota display: progress bar, percentage, source, updated-ago, breakdown. */
		function QuotaSection(props) {
			const { quota, t, onRefresh } = props;
			const [refreshing, setRefreshing] = (0, react.useState)(false);
			const kind = quotaDisplayKind(quota);
			if (kind === "unavailable" || kind === "self_hosted") return null;
			const fraction = quotaFraction(quota);
			const label = quotaRemainingLabel(t, quota) || quotaSummary(t, quota) || "";
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
					gap: 6,
					borderTop: `1px solid ${surface.border}`,
					paddingTop: 12
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontWeight: 600,
								fontSize: 13,
								color: text.primary
							},
							children: t("quotaTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: 13,
									color: text.secondary,
									fontWeight: 500
								},
								children: label
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 12 }),
								onClick: () => void refresh(),
								disabled: refreshing,
								style: { padding: "2px 4px" },
								children: t("refreshQuota")
							})]
						})]
					}),
					fraction !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								flex: 1,
								height: 6,
								borderRadius: 3,
								background: surface.layer2,
								overflow: "hidden"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
								width: `${fraction * 100}%`,
								height: "100%",
								background: state.success,
								transition: "width .3s ease"
							} })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								fontSize: 11,
								fontWeight: 600,
								color: state.success
							},
							children: [Math.round(fraction * 100), "%"]
						})]
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
		/** Developer layer: raw provider-native parameters. Effective values are
		*  read-only; overrides are editable as JSON (parsed + saved through the
		*  Host's sanitize gate). */
		function DeveloperOptions(props) {
			const { t, p, onConfigChanged } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const [editing, setEditing] = (0, react.useState)(false);
			const [draft, setDraft] = (0, react.useState)("");
			const [parseError, setParseError] = (0, react.useState)("");
			const [saving, setSaving] = (0, react.useState)(false);
			const effective = p.options?.effective ?? {};
			const overrides = p.options?.overrides ?? {};
			const hasOverrides = Object.keys(overrides).length > 0;
			const jsonBox = {
				marginTop: 8,
				padding: "8px 10px",
				borderRadius: 8,
				background: surface.layer2,
				border: `1px solid ${surface.border}`,
				fontFamily: "var(--ds-font-family-code, ui-monospace, Menlo, Consolas, monospace)",
				fontSize: 12,
				lineHeight: 1.5,
				color: text.secondary,
				overflowX: "auto",
				whiteSpace: "pre-wrap",
				wordBreak: "break-word"
			};
			const startEdit = () => {
				setDraft(JSON.stringify(overrides, null, 2));
				setParseError("");
				setEditing(true);
			};
			const cancelEdit = () => {
				setEditing(false);
				setParseError("");
			};
			const saveEdit = async () => {
				let parsed;
				try {
					parsed = JSON.parse(draft);
				} catch {
					setParseError(t("developerParseError"));
					return;
				}
				if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) parsed = {};
				setSaving(true);
				setParseError("");
				try {
					await api.providerOptionsSet(p.name, parsed);
					onConfigChanged();
					setEditing(false);
				} catch (e) {
					setParseError(e instanceof Error ? e.message : String(e));
				} finally {
					setSaving(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					borderTop: `1px solid ${surface.border}`,
					paddingTop: 12,
					marginTop: 2
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					role: "button",
					tabIndex: 0,
					"aria-expanded": open,
					onClick: () => setOpen(!open),
					onKeyDown: (e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							setOpen(!open);
						}
					},
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						cursor: "pointer",
						outline: "none"
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								transform: open ? "rotate(90deg)" : "none",
								transition: "transform .15s ease",
								color: text.tertiary,
								display: "inline-flex",
								flex: "none"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 12 })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontWeight: 600,
								fontSize: 13,
								color: text.primary
							},
							children: t("developerOptions")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								color: text.tertiary,
								fontSize: 12
							},
							children: t("developerOptionsHint")
						})
					]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: 11,
							color: text.tertiary,
							marginTop: 10
						},
						children: t("developerEffective")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						style: jsonBox,
						children: JSON.stringify(effective, null, 2)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							marginTop: 10
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 11,
								color: text.tertiary
							},
							children: t("developerOverrides")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { marginLeft: "auto" },
							children: editing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								onClick: cancelEdit,
								disabled: saving,
								children: t("developerEditCancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "primary",
								onClick: () => void saveEdit(),
								disabled: saving,
								children: t("developerEditSave")
							})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "outline",
								onClick: startEdit,
								children: t("developerEdit")
							})
						})]
					}),
					editing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						value: draft,
						onChange: (e) => setDraft(e.target.value),
						rows: 6,
						spellCheck: false,
						style: {
							...jsonBox,
							resize: "vertical",
							outline: "none",
							color: text.primary
						}
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: 11,
							color: text.tertiary,
							marginTop: 4
						},
						children: t("developerEditHint")
					})] }) : hasOverrides ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						style: jsonBox,
						children: JSON.stringify(overrides, null, 2)
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: 12,
							color: text.tertiary,
							marginTop: 6
						},
						children: t("developerNoOverrides")
					}),
					parseError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: 12,
							color: state.danger,
							marginTop: 6
						},
						children: parseError
					})
				] })]
			});
		}
		function CredentialDisclosure(props) {
			const { t, p, onChanged, onError } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const keys = p.keys ?? [];
			const invalidCount = keys.filter((k) => !k.healthy).length;
			const allHealthy = keys.length > 0 && invalidCount === 0;
			const summaryText = keys.length === 0 ? t("notConfigured") : allHealthy ? t("keyReady") : t("keysSomeIssues", { n: invalidCount });
			const summaryColor = keys.length === 0 ? text.tertiary : allHealthy ? state.success : state.danger;
			const canOpen = p.keyWritable;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 6,
					borderTop: `1px solid ${surface.border}`,
					paddingTop: 12
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					role: "button",
					tabIndex: 0,
					"aria-expanded": open,
					onClick: () => canOpen && setOpen(!open),
					onKeyDown: (e) => {
						if ((e.key === "Enter" || e.key === " ") && canOpen) {
							e.preventDefault();
							setOpen(!open);
						}
					},
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						cursor: canOpen ? "pointer" : "default",
						outline: "none"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 6
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								transform: open ? "rotate(90deg)" : "none",
								transition: "transform .15s ease",
								color: text.tertiary,
								display: "inline-flex",
								flex: "none"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 12 })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontWeight: 600,
								fontSize: 13,
								color: text.primary
							},
							children: t("credentials")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: 12,
									fontWeight: allHealthy ? 400 : 600,
									color: summaryColor
								},
								children: summaryText
							}),
							keys.length === 0 && canOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								onClick: (e) => {
									e.stopPropagation();
									setOpen(true);
								},
								style: { fontSize: 11 },
								children: t("addKey")
							}),
							keys.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								onClick: (e) => {
									e.stopPropagation();
									setOpen(!open);
								},
								style: { fontSize: 11 },
								children: open ? t("collapse") : t("manage")
							})
						]
					})]
				}), open && p.keyWritable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						paddingLeft: 18,
						marginTop: 4
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CredentialList, {
						t,
						p,
						onChanged,
						onError
					})
				})]
			});
		}
		/** Key list body (same as before, extracted for clarity). Adding a key
		*  updates the config state but never auto-runs a paid search — the user
		*  clicks 测试连接 themselves. */
		function CredentialList(props) {
			const { t, p, onChanged, onError } = props;
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
				children: [keys.map((k) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
				}, k.id)), adding ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
				})]
			});
		}
		/** Connection settings (Base URL / custom endpoints) as a clean Settings Row. */
		function ConnectionSettingsDisclosure(props) {
			const { t, p, draftBaseUrl, setDraftBaseUrl, onBaseUrl } = props;
			const selfHosted = p.name === "searxng";
			const [open, setOpen] = (0, react.useState)(selfHosted);
			const isConfigured = !!p.baseUrl;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 6,
					borderTop: `1px solid ${surface.border}`,
					paddingTop: 12
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					role: "button",
					tabIndex: 0,
					"aria-expanded": open,
					onClick: () => setOpen(!open),
					onKeyDown: (e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							setOpen(!open);
						}
					},
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						cursor: "pointer",
						outline: "none"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 6
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								transform: open ? "rotate(90deg)" : "none",
								transition: "transform .15s ease",
								color: text.tertiary,
								display: "inline-flex",
								flex: "none"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 12 })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontWeight: 600,
								fontSize: 13,
								color: text.primary
							},
							children: t("connectionSettings")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 12,
							color: isConfigured ? "var(--dsw-alias-brand-primary)" : text.tertiary
						},
						children: isConfigured ? t("connectionConfigured") : t("connectionDefault")
					})]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 6,
						paddingLeft: 18,
						marginTop: 4
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						style: {
							fontSize: 12,
							color: text.secondary
						},
						children: t("serviceAddress")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 8,
							alignItems: "center"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: draftBaseUrl,
							onChange: (e) => setDraftBaseUrl(e.target.value),
							onKeyDown: (e) => {
								if (e.key === "Enter") {
									onBaseUrl(draftBaseUrl.trim());
									e.target.blur();
								}
							},
							onBlur: () => {
								if (draftBaseUrl.trim() !== (p.baseUrl ?? "")) onBaseUrl(draftBaseUrl.trim());
							},
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
						}), p.baseUrl && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: "ghost",
							onClick: () => {
								setDraftBaseUrl("");
								onBaseUrl("");
							},
							children: t("restoreDefaultUrl")
						})]
					})]
				})]
			});
		}
		function ProviderModal(props) {
			const { t, p, quota, testResult, busy, showPreferred, inChain, onClose, onToggle, onBaseUrl, onTest, onRefreshQuota, onConfigChanged } = props;
			const [localError, setLocalError] = (0, react.useState)("");
			const [draftBaseUrl, setDraftBaseUrl] = (0, react.useState)(p.baseUrl ?? "");
			const base = providerStatusOf(p, quota, inChain);
			const status = base === "ready" ? testOutcomeStatus(testResult) ?? base : base;
			const statusText = {
				ready: t("ready"),
				"rate-limited": t("rateLimited"),
				"auth-error": t("authError"),
				"unreachable": t("unreachable"),
				"not-configured": t("notConfigured"),
				"disabled": t("disabled"),
				"not-in-order": t("notInOrder")
			}[status];
			const statusState = status === "ready" ? "done" : status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "hollow";
			const statusColor = status === "ready" ? state.success : status === "auth-error" ? state.danger : status === "rate-limited" || status === "unreachable" ? state.warning : text.tertiary;
			const selfHosted = p.name === "searxng";
			const [refreshing, setRefreshing] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: `
        .wt-modal-dialog {
          width: 720px !important;
          max-height: min(760px, calc(100vh - 48px)) !important;
          display: flex !important;
          flex-direction: column !important;
        }
        .wt-modal-content {
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
        }
        @media (max-width: 760px) {
          .wt-modal-dialog { width: calc(100vw - 24px) !important; }
        }
      ` }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: p.label,
				closeLabel: t("close"),
				description: t(`capability.${p.name}`) || "",
				className: "wt-modal-dialog",
				contentClassName: "wt-modal-content",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
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
						gap: 14
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 10,
								flexWrap: "wrap"
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
								showPreferred && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: "var(--dsw-alias-brand-primary)",
										fontSize: 11,
										fontWeight: 600,
										border: "1px solid currentColor",
										borderRadius: 4,
										padding: "0 6px"
									},
									children: t("preferredProviderLabel")
								}),
								!inChain && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: text.tertiary,
										fontSize: 12
									},
									children: t("notInOrder")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										marginLeft: "auto",
										display: "flex",
										alignItems: "center",
										gap: 6
									},
									children: [statusState === "hollow" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": true,
										style: {
											width: 8,
											height: 8,
											borderRadius: "50%",
											border: `1.5px solid ${text.tertiary}`,
											flex: "none",
											boxSizing: "border-box"
										}
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
										state: statusState,
										size: 8
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											color: statusColor,
											fontWeight: 500,
											fontSize: 13
										},
										children: statusText
									})]
								})
							]
						}),
						quota && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaSection, {
							quota,
							t,
							onRefresh: onRefreshQuota
						}),
						!selfHosted && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CredentialDisclosure, {
							t,
							p,
							onChanged: onConfigChanged,
							onError: setLocalError
						}),
						(selfHosted || p.baseUrl !== void 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConnectionSettingsDisclosure, {
							t,
							p,
							draftBaseUrl,
							setDraftBaseUrl,
							onBaseUrl
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderPreferencesSection, {
							t,
							p,
							onConfigChanged
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DeveloperOptions, {
							t,
							p,
							onConfigChanged
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
			})] });
		}
		//#endregion
		//#region src/client/RoutingModal.tsx
		/**
		* dsh-web-tools — Routing dialog V2 (policy selector + source order).
		*
		* Two sections:
		*  1. 使用方式 (Routing policy): 3 radio rows for ordered / round-robin / random.
		*  2. 搜索源 (Search sources): draggable list with provider logos, SVG drag handle,
		*     clean remove button, and addable-sources area.
		*
		* Props accept currentPolicy (defaults to "ordered") and currentOrder (string[]).
		* onSave(order, policy) commits in one atomic Host call.
		* @module
		*/
		const POLICIES = [
			"ordered",
			"round-robin",
			"random"
		];
		/** 6-dot grip icon for drag handle. */
		function GripIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "12",
				height: "12",
				viewBox: "0 0 16 16",
				fill: "currentColor",
				style: {
					opacity: .45,
					flexShrink: 0
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "5",
						cy: "3",
						r: "1.5"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "11",
						cy: "3",
						r: "1.5"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "5",
						cy: "8",
						r: "1.5"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "11",
						cy: "8",
						r: "1.5"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "5",
						cy: "13",
						r: "1.5"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "11",
						cy: "13",
						r: "1.5"
					})
				]
			});
		}
		/** Close (×) icon for remove button. */
		function CloseIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "12",
				height: "12",
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
					x1: "4",
					y1: "4",
					x2: "12",
					y2: "12"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
					x1: "12",
					y1: "4",
					x2: "4",
					y2: "12"
				})]
			});
		}
		function RoutingModal(props) {
			const { t, providers, ordered, currentPolicy = "ordered", onClose, onSave } = props;
			const [draft, setDraft] = (0, react.useState)([...ordered]);
			const [policy, setPolicy] = (0, react.useState)(currentPolicy);
			const [showAdd, setShowAdd] = (0, react.useState)(false);
			const dragIndex = (0, react.useRef)(null);
			const [overIndex, setOverIndex] = (0, react.useState)(null);
			const providerOf = (name) => providers.find((p) => p.name === name);
			const enabledNames = new Set(providers.filter((p) => p.enabled).map((p) => p.name));
			const available = providers.filter((p) => p.enabled && !draft.includes(p.name)).map((p) => p.name);
			const reorder = (from, to) => {
				if (from === to || from < 0 || to < 0 || from >= draft.length || to >= draft.length) return;
				const next = [...draft];
				const [moved] = next.splice(from, 1);
				next.splice(to, 0, moved);
				setDraft(next);
			};
			const remove = (name) => {
				if (draft.length <= 1) return;
				setDraft(draft.filter((n) => n !== name));
			};
			const add = (name) => {
				setDraft([...draft, name]);
				setShowAdd(false);
			};
			const dirty = draft.join(",") !== ordered.join(",") || policy !== currentPolicy;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: t("routingLabel"),
				closeLabel: t("close"),
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
							children: t("routingMinOneSource")
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
								onSave(draft, policy);
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
						gap: 14
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 12,
								fontWeight: 600,
								color: text.secondary
							},
							children: t("routingPolicySection")
						}), POLICIES.map((p) => {
							const selected = policy === p;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								onClick: () => setPolicy(p),
								style: {
									display: "flex",
									alignItems: "center",
									gap: 10,
									padding: "8px 12px",
									borderRadius: 10,
									border: selected ? "1px solid var(--dsw-alias-brand-primary)" : `1px solid ${surface.border}`,
									background: selected ? "color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent)" : surface.layer1,
									cursor: "pointer",
									transition: "all .12s ease"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
									width: 16,
									height: 16,
									borderRadius: "50%",
									border: selected ? "5px solid var(--dsw-alias-brand-primary)" : `2px solid ${surface.border}`,
									boxSizing: "border-box",
									flexShrink: 0,
									transition: "all .12s ease"
								} }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										flexDirection: "column",
										gap: 1
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontSize: 13,
											fontWeight: selected ? 600 : 500,
											color: text.primary
										},
										children: t(`routingPolicy.${p}`)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontSize: 11,
											color: text.tertiary
										},
										children: t(`routingPolicyHint.${p}`)
									})]
								})]
							}, p);
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									fontSize: 12,
									fontWeight: 600,
									color: text.secondary
								},
								children: t("routingSourcesSection")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 4
								},
								children: draft.map((name, i) => {
									const p = providerOf(name);
									const ok = p !== void 0 && enabledNames.has(name);
									const isDefault = i === 0 && policy === "ordered";
									const isOver = overIndex === i && dragIndex.current !== null && dragIndex.current !== i;
									const brand = p ? PROVIDER_BRAND[p.name] : void 0;
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
											gap: 8,
											padding: "8px 10px",
											borderRadius: 10,
											background: isOver ? surface.hover : surface.layer1,
											border: `1px solid ${isOver ? "var(--dsw-alias-brand-primary)" : surface.border}`,
											opacity: ok ? 1 : .5,
											cursor: "grab"
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GripIcon, {}),
											brand && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
												src: brand.icon,
												alt: "",
												width: 18,
												height: 18,
												style: {
													borderRadius: 4,
													flexShrink: 0
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: {
													color: text.primary,
													fontWeight: isDefault ? 600 : 400,
													fontSize: 14,
													flex: 1
												},
												children: p?.label ?? name
											}),
											!ok && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: {
													color: state.danger,
													fontSize: 12
												},
												children: t("disabledLabel")
											}),
											isDefault && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: {
													color: "var(--dsw-alias-brand-primary)",
													fontSize: 11,
													fontWeight: 600,
													border: "1px solid currentColor",
													borderRadius: 4,
													padding: "0 6px",
													whiteSpace: "nowrap"
												},
												children: t("preferredProviderLabel")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												onClick: (e) => {
													e.stopPropagation();
													remove(name);
												},
												disabled: draft.length <= 1,
												"aria-label": t("removeFromChain"),
												style: {
													width: 22,
													height: 22,
													padding: 0,
													border: "none",
													background: "transparent",
													color: draft.length <= 1 ? "transparent" : text.tertiary,
													cursor: draft.length <= 1 ? "default" : "pointer",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													borderRadius: 3
												},
												children: draft.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CloseIcon, {})
											})
										]
									}, name);
								})
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
									const brand = p ? PROVIDER_BRAND[p.name] : void 0;
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
										children: [brand && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
											src: brand.icon,
											alt: "",
											width: 16,
											height: 16,
											style: {
												borderRadius: 3,
												flexShrink: 0
											}
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
								style: { padding: "4px 0" },
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "outline",
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
									onClick: () => setShowAdd(true),
									disabled: available.length === 0,
									children: t("addToChain") + " · " + t("routingAvailableSources")
								})
							})
						]
					})]
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
		*  Compact: logo, name, 首选/默认 state, status dot + text, chevron.
		*  No drag, no quota, no rank, no self-hosted label on the card. */
		function ProviderCard(props) {
			const { t, p, quota, testResult, inOrder, showPreferred, onClick } = props;
			const base = providerStatusOf(p, quota, inOrder);
			const status = base === "ready" ? testOutcomeStatus(testResult) ?? base : base;
			const statusText = {
				ready: t("ready"),
				"rate-limited": t("rateLimited"),
				"auth-error": t("authError"),
				"unreachable": t("unreachable"),
				"not-configured": t("notConfigured"),
				"disabled": t("disabled"),
				"not-in-order": t("notInOrder")
			}[status];
			const dotState = status === "ready" ? "done" : status === "rate-limited" || status === "unreachable" ? "warning" : status === "auth-error" ? "error" : "hollow";
			const statusColor = status === "ready" ? state.success : status === "auth-error" ? state.danger : status === "rate-limited" || status === "unreachable" ? state.warning : text.tertiary;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
					gap: 10,
					width: "100%",
					padding: "10px 14px",
					background: surface.layer1,
					border: `1px solid ${surface.border}`,
					borderRadius: 12,
					cursor: "pointer",
					fontFamily: "inherit",
					fontSize: 14,
					color: text.primary,
					textAlign: "left",
					boxSizing: "border-box"
				},
				onMouseEnter: (e) => {
					e.currentTarget.style.background = surface.hover;
				},
				onMouseLeave: (e) => {
					e.currentTarget.style.background = surface.layer1;
				},
				children: [
					PROVIDER_BRAND[p.name] && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						src: PROVIDER_BRAND[p.name].icon,
						alt: "",
						width: 24,
						height: 24,
						style: {
							borderRadius: 6,
							flex: "none"
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontWeight: 500,
							minWidth: 0,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							flex: "none"
						},
						children: p.label
					}),
					showPreferred && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: accentText(),
							fontSize: 11,
							fontWeight: 600,
							border: "1px solid currentColor",
							borderRadius: 4,
							padding: "0 6px",
							whiteSpace: "nowrap"
						},
						children: t("preferredProviderLabel")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							marginLeft: "auto",
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							flex: "none"
						},
						children: [dotState === "hollow" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": true,
							style: {
								width: 8,
								height: 8,
								borderRadius: "50%",
								border: `1.5px solid ${text.tertiary}`,
								flex: "none",
								boxSizing: "border-box"
							}
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
							state: dotState,
							size: 8
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								color: statusColor,
								fontSize: 12,
								whiteSpace: "nowrap"
							},
							children: statusText
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 14 })
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
			const loadToken = (0, react.useRef)(0);
			const mounted = (0, react.useRef)(true);
			const load = async () => {
				const token = ++loadToken.current;
				try {
					const cfg = await api.configGet();
					if (token !== loadToken.current) return;
					setConfig(cfg);
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
			new Set(config.providers.filter((p) => p.enabled).map((p) => p.name));
			const saveOrder = (ordered, policy = config.searchRoutingPolicy ?? "ordered") => {
				const next = ordered.filter((n, i) => ordered.indexOf(n) === i);
				api.routingSet(policy, next).then(() => load()).catch((e) => setError(e instanceof Error ? e.message : String(e)));
			};
			const renderedProviders = orderedProviders.map((name) => providerOf(name)).filter((x) => x !== void 0).concat(config.providers.filter((p) => !orderedProviders.includes(p.name)));
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
			const showPreferredFor = (name) => (config.searchRoutingPolicy ?? "ordered") === "ordered" && name === config.defaultProvider;
			const detailProvider = detailFor !== null ? providerOf(detailFor) : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 12,
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
									fontSize: 16,
									fontWeight: 500,
									lineHeight: "24px",
									color: text.primary
								},
								children: t("title")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									margin: "2px 0 0",
									fontSize: 14,
									lineHeight: "22px",
									color: text.tertiary
								},
								children: t("tagline")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								paddingTop: 2,
								flex: "none",
								flexWrap: "wrap",
								justifyContent: "flex-end"
							},
							children: [
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 8
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								gap: 8,
								padding: "10px 14px",
								borderRadius: 12,
								background: surface.layer1,
								border: `1px solid ${surface.border}`
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 8,
									minWidth: 0,
									overflow: "hidden"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontSize: 13,
											fontWeight: 500,
											color: text.primary,
											whiteSpace: "nowrap"
										},
										children: t("routingLabel")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { color: text.tertiary },
										children: "·"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontSize: 13,
											fontWeight: 500,
											color: text.primary,
											whiteSpace: "nowrap"
										},
										children: t(`routingPolicy.${config.searchRoutingPolicy ?? "ordered"}`)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { color: text.tertiary },
										children: "·"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontSize: 12,
											color: text.tertiary,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap"
										},
										children: orderedProviders.map((name) => providerOf(name)?.label ?? name).join((config.searchRoutingPolicy ?? "ordered") === "random" ? t("save") === "保存" ? "、" : ", " : " → ")
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, { size: 14 }),
								onClick: () => setRoutingOpen(true),
								children: t("routingConfigure")
							})]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								alignItems: "center"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								style: {
									margin: 0,
									fontSize: 14,
									fontWeight: 500,
									color: text.primary
								},
								children: t("providersLabel")
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 8
							},
							children: renderedProviders.map((p) => {
								const testResult = providerTestResults[p.name];
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderCard, {
									t,
									p,
									quota: quotas?.[p.name],
									testResult,
									inOrder: orderedProviders.includes(p.name),
									showPreferred: showPreferredFor(p.name),
									onClick: () => setDetailFor(p.name)
								}, p.name);
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						style: {
							fontSize: 13,
							borderTop: `1px solid ${surface.border}`,
							paddingTop: 12,
							marginTop: 4
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
							style: {
								cursor: "pointer",
								color: text.secondary,
								fontSize: 13,
								fontWeight: 500,
								padding: "4px 0"
							},
							children: t("diagnosticsAndMore")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 16,
								padding: "12px 0 0"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 10,
									flexWrap: "wrap"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										style: {
											color: text.secondary,
											fontSize: 13
										},
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
											Math.round(config.providerAttemptTimeoutMs / 1e3),
											"s)"
										]
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 8
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 13,
										fontWeight: 500,
										color: text.primary
									},
									children: t("testSearchTitle")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TestSearchBlock, {
									t,
									config,
									onError: (msg) => setError(msg)
								})]
							})]
						})]
					}),
					detailProvider && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderModal, {
						t,
						p: detailProvider,
						quota: quotas?.[detailProvider.name],
						testResult: providerTestResults[detailProvider.name],
						busy: !!busyProviders[detailProvider.name],
						showPreferred: showPreferredFor(detailProvider.name),
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
						currentPolicy: config.searchRoutingPolicy ?? "ordered",
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
		/** Locale namespace for the settings page. */
		const NS$1 = "dsh-web-tools";
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
				locale: NS$1,
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
  min-width: 0;
  flex: 0 0 auto;
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
/* visual states: only "no provider" reads as truly unavailable/dimmed. */
.wt-search-mode-trigger[data-unavailable="true"] {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
  opacity: 0.55;
}
.wt-search-mode-trigger:disabled {
  cursor: default;
}
/* loading/pending keep their normal colors (never grey out while reading). */
.wt-search-mode-trigger[data-loading="true"],
.wt-search-mode-trigger[data-pending="true"] {
  opacity: 1;
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
/* Mobile: mirror the DSH composer (its row is an anonymous size container).
   Below 460px hide the label and keep a 28px globe-only affordance. */
@container (max-width: 460px) {
  .wt-search-mode-trigger {
    width: 28px;
    padding: 0;
    justify-content: center;
    border-radius: 999px;
  }
  .wt-search-mode-label {
    display: none;
  }
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
			const loading = mode === void 0;
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
				"data-loading": loading || void 0,
				"data-pending": pending || void 0,
				"data-unavailable": !available || void 0,
				"aria-busy": loading || pending || void 0,
				"aria-pressed": required,
				"aria-label": label,
				title: available ? label : unavailableLabel,
				disabled: !available || loading || pending,
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
			tagline: "管理搜索源，并在当前搜索源不可用时继续尝试下一项。",
			enabledLabel: "已启用",
			disabledLabel: "已禁用",
			readySummary: "{total} 个 Provider 中 {n} 个可用",
			defaultProviderLabel: "首选",
			orderLabel: "搜索顺序",
			orderHint: "从上到下依次尝试；第一项为默认 Provider",
			editOrder: "编辑顺序",
			providersLabel: "搜索源",
			notInChain: "未加入搜索顺序",
			notInOrder: "未加入",
			notConfigured: "未配置",
			selfHosted: "自建部署",
			ready: "已就绪",
			rateLimited: "暂时不可用",
			authError: "密钥错误",
			unreachable: "无法连接",
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
			diagnosticsAndMore: "诊断与更多设置",
			searchPlaceholder: "输入查询…",
			search: "搜索",
			searching: "搜索中…",
			clearResult: "清空",
			resultCount: "{n} 个结果",
			attempt: "尝试",
			successOutcome: "成功",
			rateLimitedOutcome: "暂时不可用",
			authOutcome: "密钥错误",
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
			credentials: "API 密钥",
			keysConfigured: "正常",
			keysSomeIssues: "{n} 个异常",
			addKey: "+ 添加 API Key",
			addKeyPlaceholder: "输入 API Key…",
			cancel: "取消",
			add: "添加",
			removeKey: "移除",
			keyReady: "正常",
			keyAuthError: "密钥错误",
			keyNotConfigured: "未配置",
			keyWritableHint: "可写",
			baseUrlLabel: "服务地址",
			baseUrlDefault: "默认",
			baseUrlPlaceholder: "自定义服务地址（留空使用默认）",
			testConnection: "测试连接",
			testingConnection: "测试中…",
			testOk: "连接成功",
			testFail: "连接失败",
			advanced: "更多设置",
			attemptTimeoutLabel: "单个搜索源超时",
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
			"capability.exa": "搜索 · 网页读取",
			"capability.tavily": "搜索 · 网页提取",
			"capability.brave": "搜索",
			"capability.you": "搜索 · 网页读取",
			"capability.firecrawl": "搜索 · 网页读取",
			"capability.parallel": "搜索 · 网页提取",
			"capability.jina": "搜索 · 网页读取",
			"capability.searxng": "搜索 · 自建",
			connectionSettings: "连接设置",
			connectionDefault: "默认",
			connectionConfigured: "已配置",
			serviceAddress: "服务地址",
			restoreDefaultUrl: "恢复默认",
			enableSourceLabel: "启用此搜索源",
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
			searchModeUnavailable: "没有可用的搜索源",
			routingLabel: "搜索顺序",
			routingConfigure: "编辑",
			"routingPolicy.ordered": "优先顺序",
			"routingPolicy.round-robin": "轮流使用",
			"routingPolicy.random": "随机起点",
			"routingPolicyHint.ordered": "从第一项开始，不可用时继续尝试下一项。",
			"routingPolicyHint.round-robin": "每次查询从下一个搜索源开始。",
			"routingPolicyHint.random": "每次查询随机选择一个起始搜索源。",
			routingPolicySection: "使用方式",
			routingSourcesSection: "搜索源",
			routingAvailableSources: "可添加的搜索源",
			routingMinOneSource: "至少保留一个搜索源",
			preferredProviderLabel: "首选",
			disabled: "已停用",
			defaultBadge: "默认",
			adjustedBadge: "已调整",
			unsavedBadge: "未保存",
			restoreDefaults: "恢复默认偏好",
			prefsTitle: "搜索偏好",
			prefsDefault: "默认设置",
			prefsModified: "已修改 {n} 项",
			prefsRestore: "恢复默认",
			prefsCancel: "取消",
			prefsAdjusted: "已调整",
			prefsUnsaved: "未保存",
			prefsSave: "保存",
			prefsSaving: "保存中…",
			prefsSaved: "已保存",
			prefsSaveFailed: "保存失败",
			prefsRestored: "已恢复默认",
			prefsRestoreFailed: "恢复失败",
			moreSettings: "更多设置",
			prefsAutoLabel: "自动",
			prefsFast: "快速",
			prefsFastDesc: "减少等待时间",
			prefsInstant: "极速",
			prefsDeep: "深入",
			prefsDeepLite: "轻量",
			prefsDeepReasoning: "推理",
			prefsSpeed: "速度",
			prefsDepth: "深度",
			prefsExaModeLabel: "搜索方式",
			prefsExaAuto: "自动",
			prefsExaAutoDesc: "由 Exa 选择搜索方式",
			prefsExaFast: "快速响应",
			prefsExaFastDesc: "更低延迟，适合简单、明确问题",
			prefsExaDeep: "深度检索",
			prefsExaDeepDesc: "复杂问题 · 较慢",
			prefsExaFreshnessLabel: "内容新鲜度",
			prefsFreshnessAuto: "自动",
			prefsFreshnessLive: "始终刷新",
			prefsFreshnessCache: "仅缓存",
			prefsExaMaxAgeHint: "例如 24 = 优先使用 24 小时内的缓存",
			prefsTavilyDepthLabel: "搜索深度",
			prefsTavilyBasic: "标准",
			prefsTavilyBasicDesc: "日常搜索",
			prefsTavilyAdvanced: "深入",
			prefsTavilyAdvancedDesc: "更高相关性",
			prefsTavilyFast: "快速",
			prefsTavilyFastDesc: "更低延迟",
			prefsTavilyUltraFast: "极速",
			prefsTavilyUltraFastDesc: "最低延迟",
			prefsTavilyAutoParams: "自动调节",
			prefsTavilyAutoParamsDesc: "由 Tavily 根据查询调整参数，单次消耗可能变化",
			prefsTavilyChunksPerSource: "每个来源片段数",
			prefsTavilyExtractDepth: "网页提取",
			prefsExtractBasic: "基础",
			prefsExtractAdvanced: "深入",
			prefsBraveModeLabel: "结果方式",
			prefsBraveAuto: "自动",
			prefsBraveAutoDesc: "优先使用 LLM Context，不可用时继续使用 Web Search",
			prefsBraveLlmContext: "LLM Context",
			prefsBraveLlmContextDesc: "返回经过整理的相关内容",
			prefsBraveWebSearch: "Web Search",
			prefsBraveWebSearchDesc: "返回标准网页搜索结果",
			prefsBraveThreshold: "内容筛选",
			prefsBraveThresholdBalanced: "平衡",
			prefsBraveThresholdStrict: "严格",
			prefsBraveThresholdLenient: "宽松",
			prefsBraveThresholdOff: "关闭",
			prefsBraveTokenBudget: "上下文上限",
			prefsYouResultsLabel: "结果内容",
			prefsYouHighlights: "重点片段",
			prefsYouHighlightsDesc: "返回与查询更相关的内容片段",
			prefsYouSummary: "搜索摘要",
			prefsYouSummaryDesc: "返回基础搜索摘要",
			prefsYouTimeoutSec: "页面读取超时（秒）",
			prefsYouFreshnessSec: "页面缓存新鲜度（秒，0 = 每次刷新）",
			prefsFirecrawlOnlyMain: "只保留正文",
			prefsFirecrawlOnlyMainDesc: "忽略导航、页脚等非正文内容",
			prefsPageCache: "页面缓存",
			prefsFirecrawl1Day: "缓存 1 天",
			prefsFirecrawl7Days: "缓存 7 天",
			prefsParallelQualityLabel: "搜索质量",
			prefsParallelAdvanced: "深入",
			prefsParallelAdvancedDesc: "更适合复杂搜索",
			prefsParallelBasic: "标准",
			prefsParallelBasicDesc: "低延迟，适合明确问题",
			prefsParallelFast: "快速",
			prefsParallelFastDesc: "1 秒延迟预算内的高质量",
			prefsParallelTurbo: "极速",
			prefsParallelTurboDesc: "约 200ms 高吞吐",
			prefsParallelCharsLabel: "返回长度",
			prefsParallelCharsCompact: "精简",
			prefsParallelCharsStandard: "标准",
			prefsParallelCharsMore: "较多",
			prefsJinaModeLabel: "读取方式",
			prefsJinaModeAuto: "自动读取",
			prefsJinaModeAutoDesc: "由 Jina 选择最佳读取方式",
			prefsJinaModeDirect: "直接读取",
			prefsJinaModeDirectDesc: "直接读取页面，通常更快",
			prefsJinaModeBrowser: "浏览器",
			prefsJinaModeBrowserDesc: "完整加载页面，适合动态内容",
			prefsJinaReaderLmLabel: "高质量转换",
			prefsJinaReaderLmDesc: "使用 ReaderLM-v2 处理页面内容，会增加 token 消耗。",
			prefsJinaCacheLabel: "页面缓存",
			prefsJinaCacheAuto: "自动",
			prefsJinaCacheLive: "每次刷新",
			prefsJinaCacheHour: "1 小时",
			prefsJinaCacheDay: "1 天",
			prefsJinaMaxTokens: "返回上限",
			prefsJinaMaxTokensDesc: "限制返回内容的最大 token 数。",
			prefsJinaTokenBudget: "预算上限",
			prefsJinaTokenBudgetDesc: "页面超过该预算时停止请求。",
			developerOptions: "调试信息",
			developerOptionsHint: "（原生参数）",
			developerEffective: "当前生效值",
			developerOverrides: "自定义覆盖",
			developerNoOverrides: "没有覆盖项。",
			developerEdit: "编辑",
			developerEditSave: "保存",
			developerEditCancel: "取消",
			developerParseError: "JSON 格式错误",
			manage: "管理",
			collapse: "收起"
		};
		/** en page copy, checked complete against the zh key set. */
		const enDict = {
			nav: "Web Search",
			title: "Web Search",
			tagline: "Manage search sources and keep trying the next one when the current is unavailable.",
			enabledLabel: "Enabled",
			disabledLabel: "Disabled",
			readySummary: "{n} of {total} providers ready",
			defaultProviderLabel: "Preferred",
			orderLabel: "Search order",
			orderHint: "Providers are tried from top to bottom; the first is the default",
			editOrder: "Edit order",
			providersLabel: "Search sources",
			notInChain: "Not in search chain",
			notConfigured: "Not configured",
			selfHosted: "Self-hosted",
			ready: "Ready",
			rateLimited: "Unavailable",
			authError: "Key error",
			unreachable: "Unreachable",
			quotaCredits: "{r} / {l} credits",
			quotaRequests: "{r} requests{l}",
			quotaUsd: "${amount} used",
			quotaUsdRemaining: "${amount} remaining",
			quotaTokens: "{n} tokens",
			updatedJustNow: "Updated just now",
			updatedAgo: "Updated {mins} min ago",
			refreshQuota: "Refresh quota",
			quotaTitle: "Usage",
			resetOn: "Resets on {d}",
			usage: "Usage",
			testSearchTitle: "Test Search",
			diagnosticsAndMore: "Diagnostics & more settings",
			searchPlaceholder: "Enter a query…",
			search: "Search",
			searching: "Searching…",
			clearResult: "Clear",
			resultCount: "{n} result(s)",
			attempt: "Attempt",
			successOutcome: "Success",
			rateLimitedOutcome: "Unavailable",
			authOutcome: "Key error",
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
			credentials: "API Key",
			keysConfigured: "{n} key(s) · all healthy",
			keysSomeIssues: "{n} key(s) · some issues",
			addKey: "+ Add API key",
			addKeyPlaceholder: "Paste an API key…",
			cancel: "Cancel",
			add: "Add",
			removeKey: "Remove",
			keyReady: "Ready",
			keyAuthError: "Key error",
			keyNotConfigured: "Not configured",
			keyWritableHint: "writable",
			baseUrlLabel: "Service URL",
			baseUrlDefault: "Default",
			baseUrlPlaceholder: "Custom service URL (leave empty for default)",
			testConnection: "Test connection",
			testingConnection: "Testing…",
			testOk: "Connected",
			testFail: "Connection failed",
			advanced: "More settings",
			attemptTimeoutLabel: "Per-source timeout",
			attemptTimeoutHint: "How long one source may run before switching to the next",
			seconds: "{n} seconds",
			save: "Save",
			saved: "Saved",
			saving: "Saving…",
			close: "Close",
			loading: "Loading Web Search configuration…",
			webToolsError: "Web Search",
			proxyDegradedTitle: "Proxy unavailable",
			proxyDegradedBody: "A system proxy is configured, but undici (the proxy dependency) was not found — requests will go out directly, so proxy-dependent providers may time out. Run `pnpm install` in the profile directory and restart.",
			"capability.exa": "Search · Web read",
			"capability.tavily": "Search · Web extract",
			"capability.brave": "Search",
			"capability.you": "Search · Web read",
			"capability.firecrawl": "Search · Web read",
			"capability.parallel": "Search · Web extract",
			"capability.jina": "Search · Web read",
			"capability.searxng": "Search · Self-hosted",
			connectionSettings: "Connection settings",
			connectionDefault: "Default",
			connectionConfigured: "Configured",
			serviceAddress: "Service URL",
			restoreDefaultUrl: "Restore default",
			enableSourceLabel: "Enable this search source",
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
			searchModeUnavailable: "No search provider available",
			routingLabel: "Search order",
			routingConfigure: "Edit",
			"routingPolicy.ordered": "Priority order",
			"routingPolicy.round-robin": "Round-robin",
			"routingPolicy.random": "Random start",
			"routingPolicyHint.ordered": "Start from the first source and try the next when unavailable.",
			"routingPolicyHint.round-robin": "Start each query from the next source in turn.",
			"routingPolicyHint.random": "Pick a random starting source for each query.",
			routingPolicySection: "Routing policy",
			routingSourcesSection: "Search sources",
			routingAvailableSources: "Addable sources",
			routingMinOneSource: "Keep at least one search source",
			preferredProviderLabel: "Preferred",
			disabled: "Disabled",
			notInOrder: "Not in order",
			defaultBadge: "Default",
			adjustedBadge: "Adjusted",
			unsavedBadge: "Unsaved",
			restoreDefaults: "Restore default preferences",
			prefsTitle: "Search preferences",
			prefsDefault: "Default",
			prefsModified: "{n} item(s) modified",
			prefsRestore: "Restore defaults",
			prefsCancel: "Cancel",
			prefsAdjusted: "Customized",
			prefsUnsaved: "Unsaved",
			prefsSave: "Save",
			prefsSaving: "Saving…",
			prefsSaved: "Saved",
			prefsSaveFailed: "Save failed",
			prefsRestored: "Defaults restored",
			prefsRestoreFailed: "Restore failed",
			moreSettings: "More settings",
			prefsAutoLabel: "Auto",
			prefsFast: "Fast",
			prefsFastDesc: "Lower latency",
			prefsInstant: "Instant",
			prefsDeep: "Deep",
			prefsDeepLite: "Lite",
			prefsDeepReasoning: "Reasoning",
			prefsSpeed: "Speed",
			prefsDepth: "Depth",
			prefsExaModeLabel: "Search mode",
			prefsExaAuto: "Auto Select",
			prefsExaAutoDesc: "Best choice for most searches",
			prefsExaFast: "Fast response",
			prefsExaFastDesc: "Lower latency, good for simple queries",
			prefsExaDeep: "Deep search",
			prefsExaDeepDesc: "Complex queries · slower",
			prefsExaFreshnessLabel: "Content freshness",
			prefsFreshnessAuto: "Auto",
			prefsFreshnessLive: "Always fetch",
			prefsFreshnessCache: "Cache only",
			prefsExaMaxAgeHint: "e.g. 24 = prefer content cached within 24 hours",
			prefsTavilyDepthLabel: "Search depth",
			prefsTavilyBasic: "Basic",
			prefsTavilyBasicDesc: "General purpose",
			prefsTavilyAdvanced: "Advanced",
			prefsTavilyAdvancedDesc: "Higher relevance",
			prefsTavilyFast: "Fast",
			prefsTavilyFastDesc: "Lower latency",
			prefsTavilyUltraFast: "Ultra-fast",
			prefsTavilyUltraFastDesc: "Lowest latency",
			prefsTavilyAutoParams: "Auto-tune",
			prefsTavilyAutoParamsDesc: "Tavily adjusts parameters per query; cost may vary",
			prefsTavilyChunksPerSource: "Chunks per source",
			prefsTavilyExtractDepth: "Web extract",
			prefsExtractBasic: "Basic",
			prefsExtractAdvanced: "Advanced",
			prefsBraveModeLabel: "Result mode",
			prefsBraveAuto: "Auto",
			prefsBraveAutoDesc: "Prefer LLM Context, fall back to Web Search",
			prefsBraveLlmContext: "LLM Context",
			prefsBraveLlmContextDesc: "Curated content for LLM ingestion",
			prefsBraveWebSearch: "Web Search",
			prefsBraveWebSearchDesc: "Standard web search results",
			prefsBraveThreshold: "Content filter",
			prefsBraveThresholdBalanced: "Balanced",
			prefsBraveThresholdStrict: "Strict",
			prefsBraveThresholdLenient: "Lenient",
			prefsBraveThresholdOff: "Off",
			prefsBraveTokenBudget: "Context token budget",
			prefsYouResultsLabel: "Result content",
			prefsYouHighlights: "Highlights",
			prefsYouHighlightsDesc: "Passages most relevant to query",
			prefsYouSummary: "Snippet summary",
			prefsYouSummaryDesc: "Basic snippet summaries",
			prefsYouTimeoutSec: "Page crawl timeout (seconds)",
			prefsYouFreshnessSec: "Page cache freshness (seconds, 0 = always live)",
			prefsFirecrawlOnlyMain: "Main content only",
			prefsFirecrawlOnlyMainDesc: "Ignore navigation, footers and non-essential content",
			prefsPageCache: "Page cache",
			prefsFirecrawl1Day: "Cache 1 day",
			prefsFirecrawl7Days: "Cache 7 days",
			prefsParallelQualityLabel: "Search quality",
			prefsParallelAdvanced: "Deep",
			prefsParallelAdvancedDesc: "Suited for complex search queries",
			prefsParallelBasic: "Basic",
			prefsParallelBasicDesc: "Low latency for direct questions",
			prefsParallelFast: "Fast",
			prefsParallelFastDesc: "High quality within ~1s latency budget",
			prefsParallelTurbo: "Turbo",
			prefsParallelTurboDesc: "~200ms high-throughput search",
			prefsParallelCharsLabel: "Return length",
			prefsParallelCharsCompact: "Compact",
			prefsParallelCharsStandard: "Standard",
			prefsParallelCharsMore: "More",
			prefsJinaModeLabel: "Reader engine",
			prefsJinaModeAuto: "Auto reader",
			prefsJinaModeAutoDesc: "Let Jina choose the best reader engine",
			prefsJinaModeDirect: "Direct read",
			prefsJinaModeDirectDesc: "Direct read, typically faster",
			prefsJinaModeBrowser: "Browser",
			prefsJinaModeBrowserDesc: "Full page load, suitable for dynamic content",
			prefsJinaReaderLmLabel: "High quality conversion",
			prefsJinaReaderLmDesc: "Use ReaderLM-v2 to process page content; may increase token consumption.",
			prefsJinaCacheLabel: "Page cache",
			prefsJinaCacheAuto: "Auto",
			prefsJinaCacheLive: "Always fetch",
			prefsJinaCacheHour: "1 hour",
			prefsJinaCacheDay: "1 day",
			prefsJinaMaxTokens: "Return limit",
			prefsJinaMaxTokensDesc: "Max tokens in returned content.",
			prefsJinaTokenBudget: "Budget limit",
			prefsJinaTokenBudgetDesc: "Stop request when the page exceeds this budget.",
			developerOptions: "Debug Info",
			developerOptionsHint: "(Native parameters)",
			developerEffective: "Effective values",
			developerOverrides: "Custom overrides",
			developerNoOverrides: "No overrides.",
			developerEdit: "Edit",
			developerEditSave: "Save",
			developerEditCancel: "Cancel",
			developerParseError: "Invalid JSON",
			manage: "Manage",
			collapse: "Collapse"
		};
		/** Register the Settings page. */
		var SectionErrorBoundary = class extends react.Component {
			state = { error: null };
			static getDerivedStateFromError(error) {
				return { error };
			}
			componentDidCatch(error, info) {
				console.error("[dsh-web-tools] WebToolsSection render error", error, info);
			}
			render() {
				if (this.state.error !== null) return react.createElement("div", { style: {
					padding: 12,
					color: "#e5484d",
					fontFamily: "ui-monospace, monospace",
					fontSize: 12,
					whiteSpace: "pre-wrap",
					lineHeight: 1.5
				} }, "[dsh-web-tools] 页面渲染失败:\n" + (this.state.error.stack ?? String(this.state.error)));
				return this.props.children;
			}
		};
		function SectionWithBoundary(props) {
			return react.createElement(SectionErrorBoundary, null, react.createElement(WebToolsSection, props));
		}
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh: zhDict,
				en: enDict
			}));
			const t = ctx.locale.bind(NS);
			registerSettingsSection(ctx, t, SectionWithBoundary, {
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