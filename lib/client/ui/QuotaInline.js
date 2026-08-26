import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — QuotaInline & QuotaCard: unified quota display primitives
 * with tabular numbers, i18n, per-provider dashboard quicklinks, and an
 * `embedded` mode for use inside a SettingsGroup (no card-in-card).
 * @module
 */
import { text, surface, state as stateColor } from "../theme.js";
import {} from "../api.js";
import { quotaFraction, quotaTier } from "../logic.js";
import { IconRefreshOutline16, IconChevronRightOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";
import { useState } from "react";
import { dashboardOf, ExternalLinkIcon } from "../provider-ui-meta.js";
import { adoptWebToolsStyles } from "./styles.js";
function IconCard() {
    return (_jsxs("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "2", y: "3.5", width: "12", height: "9", rx: "1.5" }), _jsx("path", { d: "M2 6.5h12" }), _jsx("path", { d: "M4.5 10h2" })] }));
}
function IconConsole() {
    return (_jsxs("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "2", y: "3", width: "12", height: "10", rx: "1.5" }), _jsx("path", { d: "M5 6.5l2 1.5-2 1.5M9 9.5h2" })] }));
}
export function formatQuotaNumbers(q, t) {
    const fmt = (n) => n.toLocaleString();
    if (!q || !q.supported)
        return { main: "" };
    if (q.limit !== undefined && q.limit === 0 && q.remaining === undefined) {
        return { main: t ? t("quotaUnlimited") : "Pay-as-you-go" };
    }
    // Local-usage (metered) — Exa / Parallel with request count
    if (q.source === "local_estimate" && q.unit === "requests" && q.used !== undefined) {
        const label = t ? t("quotaMetered", { n: q.used }) : `${q.used} local requests`;
        return { main: label };
    }
    if (q.unit === "usd_cents") {
        const amount = ((q.remaining ?? q.used ?? 0) / 100).toFixed(2);
        if (q.remaining !== undefined)
            return { main: t ? `${t("quotaBalance")} $${amount}` : `Balance $${amount}` };
        if (q.used !== undefined)
            return { main: `$${amount}`, unit: t ? t("quotaUsedLabel") : "used" };
    }
    if (q.unit === "tokens" && q.remaining !== undefined) {
        if (q.remaining >= 1_000_000)
            return { main: `${(q.remaining / 1_000_000).toFixed(2)}M`, unit: "tokens" };
        if (q.remaining >= 1_000)
            return { main: `${(q.remaining / 1_000).toFixed(1)}k`, unit: "tokens" };
        return { main: fmt(q.remaining), unit: "tokens" };
    }
    if (q.unit === "credits" && q.remaining !== undefined) {
        const lim = q.limit !== undefined && q.limit > 0 ? ` / ${fmt(q.limit)}` : "";
        return { main: `${fmt(q.remaining)}${lim}`, unit: t ? t("quotaCreditsUnit") : "credits" };
    }
    if (q.unit === "requests" && q.remaining !== undefined) {
        const lim = q.limit !== undefined && q.limit > 0 ? ` / ${fmt(q.limit)}` : "";
        return { main: `${fmt(q.remaining)}${lim}`, unit: t ? t("quotaRequestsUnit") : "" };
    }
    if (q.remaining !== undefined) {
        const lim = q.limit !== undefined && q.limit > 0 ? ` / ${fmt(q.limit)}` : "";
        return { main: `${fmt(q.remaining)}${lim}` };
    }
    return { main: "" };
}
/** Shared refresh button for QuotaCard (rotates while refreshing). */
function RefreshButton(props) {
    const { refreshing, onRefresh, title } = props;
    return (_jsx("button", { type: "button", onClick: onRefresh, disabled: refreshing, title: title, style: {
            background: "transparent", border: "none", cursor: refreshing ? "not-allowed" : "pointer",
            padding: 2, borderRadius: 4, color: text.tertiary, display: "inline-flex", alignItems: "center",
        }, children: _jsx("span", { style: { display: "inline-flex", transform: refreshing ? "rotate(180deg)" : "none", transition: "transform .5s ease" }, children: _jsx(IconRefreshOutline16, { size: 13 }) }) }));
}
export function QuotaInline(props) {
    const { quota, providerName, t } = props;
    // Brave / Exa / Parallel are pay-as-you-go metered — show "按量计费" (fixed 220px slot alignment).
    const meteredNames = new Set(["brave", "exa", "parallel"]);
    if (meteredNames.has(providerName ?? "")) {
        return (_jsxs("div", { style: { width: 220, display: "grid", gridTemplateColumns: "minmax(0,1fr) 64px", alignItems: "center", justifyItems: "end" }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: 500, color: text.secondary, whiteSpace: "nowrap" }, children: t ? t("quotaMeteredPrefix") : "Pay-as-you-go" }), _jsx("div", { style: { width: 64 } })] }));
    }
    if (!quota || !quota.supported)
        return null;
    const { main, unit } = formatQuotaNumbers(quota, t);
    if (!main)
        return null;
    const fraction = quotaFraction(quota);
    const tier = quotaTier(fraction);
    const barColor = tier === "danger" ? stateColor.danger : tier === "warn" ? stateColor.warning : text.tertiary;
    return (_jsxs("div", { style: { width: 220, display: "grid", gridTemplateColumns: "minmax(0,1fr) 64px", alignItems: "center", justifyItems: "end", gap: 8, flex: "none" }, children: [_jsxs("div", { style: { display: "inline-flex", alignItems: "baseline", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: 500, color: text.secondary, fontVariantNumeric: "tabular-nums" }, children: main }), unit && _jsx("span", { style: { fontSize: 11, color: text.tertiary }, children: unit })] }), _jsx("div", { style: { width: 64, display: "flex", alignItems: "center", justifyContent: "flex-end" }, children: fraction !== undefined && (_jsx("div", { style: { width: 64, height: 4, borderRadius: 2, background: surface.layer2, overflow: "hidden", flex: "none" }, children: _jsx("div", { style: { width: `${Math.round(fraction * 100)}%`, height: "100%", background: barColor, transition: "width .2s ease" } }) })) })] }));
}
export function QuotaCard(props) {
    adoptWebToolsStyles();
    const { quota, providerName, t, onRefresh, embedded = false } = props;
    const [refreshing, setRefreshing] = useState(false);
    const dash = dashboardOf(providerName);
    const refresh = async () => {
        setRefreshing(true);
        try {
            onRefresh();
        }
        finally {
            setTimeout(() => setRefreshing(false), 600);
        }
    };
    // Brave / Exa / Parallel are pay-as-you-go metered — show clean rows without giant 18px text.
    const meteredNames = new Set(["brave", "exa", "parallel"]);
    if (meteredNames.has(providerName ?? "")) {
        const isLocalMetered = quota?.source === "local_estimate" && quota?.unit === "requests" && quota?.used !== undefined;
        return (_jsxs("div", { style: { display: "flex", flexDirection: "column" }, children: [_jsxs("div", { className: "dswt-settings-row", children: [_jsx("div", { className: "dswt-row-icon", children: _jsx(IconCard, {}) }), _jsx("div", { className: "dswt-row-main", children: _jsx("div", { className: "dswt-row-title", children: t("billingMethod") }) }), _jsx("div", { className: "dswt-row-trailing", children: _jsx("span", { style: { fontSize: 13, color: text.secondary }, children: t("quotaMeteredPrefix") }) })] }), isLocalMetered && (_jsxs("div", { className: "dswt-settings-row", children: [_jsx("div", { className: "dswt-row-main", children: _jsx("div", { className: "dswt-row-title", children: t("localUsage") }) }), _jsx("div", { className: "dswt-row-trailing", children: _jsx("span", { style: { fontSize: 13, color: text.secondary }, children: t("localUsageTimes", { n: quota.used }) }) })] })), dash && (_jsxs("a", { href: dash.url, target: "_blank", rel: "noreferrer", className: "dswt-settings-row clickable", children: [_jsx("div", { className: "dswt-row-icon", children: _jsx(IconConsole, {}) }), _jsx("div", { className: "dswt-row-main", children: _jsx("div", { className: "dswt-row-title", children: t("dashboardLabel") }) }), _jsx("div", { className: "dswt-row-trailing", children: _jsx("span", { style: { fontSize: 13, color: text.secondary }, children: t(dash.labelKey) }) }), _jsx("div", { className: "dswt-row-chevron", children: _jsx(IconChevronRightOutline14, { size: 14 }) })] }))] }));
    }
    // Fallback card when no quota snapshot or for dashboard-only providers
    if (!quota || !quota.supported || quota.source === "dashboard") {
        return (_jsx("div", { style: { display: "flex", flexDirection: "column" }, children: dash && (_jsxs("a", { href: dash.url, target: "_blank", rel: "noreferrer", className: "dswt-settings-row clickable", children: [_jsx("div", { className: "dswt-row-icon", children: _jsx(IconConsole, {}) }), _jsx("div", { className: "dswt-row-main", children: _jsx("div", { className: "dswt-row-title", children: t("dashboardLabel") }) }), _jsx("div", { className: "dswt-row-trailing", children: _jsx("span", { style: { fontSize: 13, color: text.secondary }, children: t(dash.labelKey) }) }), _jsx("div", { className: "dswt-row-chevron", children: _jsx(IconChevronRightOutline14, { size: 14 }) })] })) }));
    }
    const { main, unit } = formatQuotaNumbers(quota, t);
    const fraction = quotaFraction(quota);
    const tier = quotaTier(fraction);
    const barColor = tier === "danger" ? stateColor.danger : tier === "warn" ? stateColor.warning : "var(--dsw-alias-brand-primary)";
    const ago = quota.fetchedAt !== undefined
        ? (quota.fetchedAt > Date.now() - 60_000 ? t("updatedJustNow") : t("updatedAgo", { mins: Math.max(1, Math.round((Date.now() - quota.fetchedAt) / 60_000)) }))
        : undefined;
    const isUsdBalance = quota.unit === "usd_cents";
    return (_jsxs("div", { className: embedded ? "dswt-settings-row" : undefined, style: {
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: embedded ? "14px 16px" : "12px 14px",
            borderRadius: embedded ? undefined : 10,
            background: embedded ? undefined : surface.layer1,
            border: embedded ? undefined : `1px solid ${surface.border}`,
        }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: 600, color: text.tertiary }, children: isUsdBalance ? t("quotaBalance") : t("quotaTitle") }), fraction !== undefined && (_jsxs("span", { style: { fontSize: 12, fontWeight: 500, color: text.secondary, fontVariantNumeric: "tabular-nums" }, children: [Math.round(fraction * 100), "%"] }))] }), _jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 6, width: "100%" }, children: [_jsx("span", { style: { fontSize: 18, fontWeight: 600, color: text.primary, fontVariantNumeric: "tabular-nums" }, children: main }), unit && _jsx("span", { style: { fontSize: 12, color: text.tertiary }, children: unit })] }), fraction !== undefined && (_jsx("div", { style: { width: "100%", height: 5, borderRadius: 3, background: surface.layer2, overflow: "hidden" }, children: _jsx("div", { style: { width: `${Math.round(fraction * 100)}%`, height: "100%", background: barColor, transition: "width .3s ease" } }) })), _jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: text.tertiary, flexWrap: "wrap", gap: 6, paddingTop: 2, width: "100%" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [ago && _jsx("span", { children: ago }), _jsx(RefreshButton, { refreshing: refreshing, onRefresh: () => void refresh(), title: t("refreshQuota") })] }), dash && (_jsxs("a", { href: dash.url, target: "_blank", rel: "noreferrer", style: { color: "var(--dsw-alias-brand-primary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }, children: [_jsx("span", { children: t(dash.labelKey) }), _jsx(ExternalLinkIcon, { size: 12 })] }))] })] }));
}
