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
import { WebToolsSection } from "./WebToolsSection.tsx";
import { registerSettingsSection, type UiFace } from "./registration.ts";
import { SearchModeButton } from "./SearchModeButton.tsx";
import * as React from "react";
import { useSyncExternalStore } from "react";

/** Locale namespace for this page's copy. */
export const NS = "dsh-web-tools";

/** Services required by this client plugin. */
export const inject = ["slots", "locale"];

/** zh page copy (key-set source of truth). */
export const zhDict: Record<string, string> = {
  nav: "网页搜索",
  title: "网页搜索",
  tagline: "配置多个搜索服务，并在 Provider 不可用时按设定顺序继续搜索。",
  enabledLabel: "已启用",
  disabledLabel: "已禁用",
  readySummary: "{total} 个 Provider 中 {n} 个可用",
  defaultProviderLabel: "推荐",
  orderLabel: "搜索顺序",
  orderHint: "从上到下依次尝试；第一项为默认 Provider",
  editOrder: "编辑顺序",
  providersLabel: "搜索源",
  notInChain: "未加入搜索顺序",
  notConfigured: "未配置",
  selfHosted: "自建部署",
  ready: "已连接",
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
  quotaTitle: "使用额度",
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
  keysConfigured: "{n} 把 API Key 已配置",
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
  searchModeUnavailable: "没有可用的搜索源",
  // --- 搜索策略（UX V2） ---
  strategyLabel: "搜索模式",
  strategyHint: "系统会自动选择合适搜索源",
  strategyRecommended: "推荐",
  strategyRecommendedDesc: "自动选择最佳搜索源",
  strategyFast: "快速",
  strategyFastDesc: "优先速度",
  strategyQuality: "精准",
  strategyQualityDesc: "优先质量",
  strategyCheap: "节省",
  strategyCheapDesc: "优先减少额度消耗",
  strategyCustom: "自定义",
  strategyCustomDesc: "自己调整顺序",
  // --- 开发者设置（UX V2） ---
  developerOptions: "开发者设置",
  developerOptionsHint: "Provider 原生参数（仅高级用户）",
  developerEffective: "当前生效值",
  developerOverrides: "自定义覆盖",
  developerNoOverrides: "无自定义覆盖，全部使用推荐值",
};

/** en page copy, checked complete against the zh key set. */
export const enDict: Record<string, string> = {
  nav: "Web Search",
  title: "Web Search",
  tagline: "Use multiple search providers with automatic fallback in a fixed order.",
  enabledLabel: "Enabled",
  disabledLabel: "Disabled",
  readySummary: "{n} of {total} providers ready",
  defaultProviderLabel: "Recommended",
  orderLabel: "Search order",
  orderHint: "Providers are tried from top to bottom; the first is the default",
  editOrder: "Edit order",
  providersLabel: "Search sources",
  notInChain: "Not in search chain",
  notConfigured: "Not configured",
  selfHosted: "Self-hosted",
  ready: "Connected",
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
  credentials: "API Keys",
  keysConfigured: "{n} API key(s) configured",
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
  searchModeUnavailable: "No search provider available",
  // --- Search strategies (UX V2) ---
  strategyLabel: "Search Mode",
  strategyHint: "The system picks the best search source automatically",
  strategyRecommended: "Recommended",
  strategyRecommendedDesc: "Auto-select the best search source",
  strategyFast: "Fast",
  strategyFastDesc: "Prioritize speed",
  strategyQuality: "Precise",
  strategyQualityDesc: "Prioritize quality",
  strategyCheap: "Efficient",
  strategyCheapDesc: "Prioritize low quota usage",
  strategyCustom: "Custom",
  strategyCustomDesc: "Adjust the order yourself",
  // --- Developer settings (UX V2) ---
  developerOptions: "Developer Options",
  developerOptionsHint: "Provider-native parameters (advanced users only)",
  developerEffective: "Effective values",
  developerOverrides: "Custom overrides",
  developerNoOverrides: "No custom overrides — using recommended values",
};

/** Register the Settings page. */
class SectionErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[dsh-web-tools] WebToolsSection render error", error, info);
  }
  render() {
    if (this.state.error !== null) {
      return React.createElement(
        "div",
        { style: { padding: 12, color: "#e5484d", fontFamily: "ui-monospace, monospace", fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.5 } },
        "[dsh-web-tools] 页面渲染失败:\n" + (this.state.error.stack ?? String(this.state.error)),
      );
    }
    return this.props.children;
  }
}

function SectionWithBoundary(props: Record<string, unknown>) {
  return React.createElement(SectionErrorBoundary, null, React.createElement(WebToolsSection, props as never));
}

export function apply(ctx: any) {
  ctx.effect(() =>
    ctx.locale.register(NS, {
      zh: zhDict,
      en: enDict,
    }),
  );

  const t = ctx.locale.bind(NS);

  const ui: UiFace = {
    getActiveLocale: () => ctx.locale.getLocale().active,
    subscribeLocale: (fn) => ctx.locale.subscribe(fn),
    zhDict,
    enDict,
  };

  registerSettingsSection(ctx, t, SectionWithBoundary, ui);

  // "联网搜索" per-session toggle — a small always-visible control at the left
  // end of the composer tool row (official `conversation.input.left` seat).
  // Session-scoped: the seat supplies `sessionId` as a standard prop. Because
  // this slot exposes no `inject`, a thin wrapper forwards the sessionId along
  // with locale-localized copy (re-renders when the page language flips).
  const SearchModeControl = (props: { sessionId: string }) => {
    useSyncExternalStore(
      (cb) => ctx.locale.subscribe(cb),
      () => ctx.locale.getLocale().active,
    );
    return React.createElement(SearchModeButton, {
      sessionId: props.sessionId,
      label: t("searchModeLabel"),
      unavailableLabel: t("searchModeUnavailable"),
    });
  };

  ctx.slots.inject("conversation.input.left", () =>
    ctx.slots.register(
      {
        name: "conversation.input.left",
        id: "dsh-web-tools-search-mode",
        order: 30,
        // Localized projected label follows the active locale without re-register.
        label: () => t("searchModeLabel"),
      },
      SearchModeControl,
    ),
  );
}
