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
import { IconRefreshOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";
import { useState } from "react";
import { dashboardOf, ExternalLinkIcon } from "../provider-ui-meta.js";
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
            return { main: `$${amount}` };
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
/** Outermost wrapper style: standalone card vs embedded (no card-in-card). */
function cardShell(embedded) {
    return embedded
        ? { display: "flex", flexDirection: "column", gap: 10, padding: "10px 14px" }
        : { display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: 10, background: surface.layer1, border: `1px solid ${surface.border}` };
}
export function QuotaInline(props) {
    const { quota, providerName, t } = props;
    // Brave has no quota endpoint: without a captured header snapshot the
    // honest state is "按量计费 · 首次搜索后同步" — never a fake number.
    const bravePendingSync = providerName === "brave" && !!quota && !quota.supported;
    if (bravePendingSync) {
        return (_jsx("span", { style: { fontSize: 12, color: text.tertiary, whiteSpace: "nowrap", flex: "none" }, children: t ? `${t("quotaMeteredPrefix")} · ${t("quotaBraveFirstSync")}` : `Pay-as-you-go · ${quota.note ?? ""}` }));
    }
    if (!quota || !quota.supported)
        return null;
    const { main, unit } = formatQuotaNumbers(quota, t);
    if (!main)
        return null;
    const fraction = quotaFraction(quota);
    const tier = quotaTier(fraction);
    const barColor = tier === "danger" ? stateColor.danger : tier === "warn" ? stateColor.warning : text.tertiary;
    return (_jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 8, flex: "none" }, children: [_jsxs("div", { style: { display: "inline-flex", alignItems: "baseline", gap: 4 }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: 500, color: text.secondary, fontVariantNumeric: "tabular-nums" }, children: main }), unit && _jsx("span", { style: { fontSize: 11, color: text.tertiary }, children: unit })] }), fraction !== undefined && (_jsx("div", { style: { width: 64, height: 4, borderRadius: 2, background: surface.layer2, overflow: "hidden", flex: "none" }, children: _jsx("div", { style: { width: `${Math.round(fraction * 100)}%`, height: "100%", background: barColor, transition: "width .2s ease" } }) }))] }));
}
export function QuotaCard(props) {
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
    // Brave pending-sync: no captured header snapshot yet → explicit prompt.
    const bravePendingSync = providerName === "brave" && !!quota && !quota.supported;
    // Fallback card when no quota snapshot or for dashboard-only providers
    if (!quota || !quota.supported || quota.source === "dashboard") {
        const isLocalMetered = providerName === "parallel" || providerName === "exa";
        const isBrave = bravePendingSync;
        return (_jsxs("div", { style: cardShell(embedded), children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: 600, color: text.tertiary }, children: isBrave ? t("quotaMeteredPrefix") : t("quotaTitle") }), _jsx(RefreshButton, { refreshing: refreshing, onRefresh: () => void refresh(), title: t("refreshQuota") })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [_jsx("span", { style: { fontSize: 13, color: text.secondary }, children: isBrave
                                ? t("quotaBraveFirstSync")
                                : isLocalMetered
                                    ? t("quotaSourceLocalEstimate")
                                    : t("quotaSourceDashboard") }), dash && (_jsxs("a", { href: dash.url, target: "_blank", rel: "noreferrer", style: { color: "var(--dsw-alias-brand-primary)", textDecoration: "none", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }, children: [_jsx("span", { children: t(dash.labelKey) }), _jsx(ExternalLinkIcon, { size: 12 })] }))] })] }));
    }
    const { main, unit } = formatQuotaNumbers(quota, t);
    const fraction = quotaFraction(quota);
    const tier = quotaTier(fraction);
    const barColor = tier === "danger" ? stateColor.danger : tier === "warn" ? stateColor.warning : "var(--dsw-alias-brand-primary)";
    const sourceKey = `quotaSource${quota.source[0].toUpperCase()}${quota.source.slice(1)}`;
    const sourceName = t(sourceKey);
    const ago = quota.fetchedAt !== undefined
        ? (quota.fetchedAt > Date.now() - 60_000 ? t("updatedJustNow") : t("updatedAgo", { mins: Math.max(1, Math.round((Date.now() - quota.fetchedAt) / 60_000)) }))
        : undefined;
    const isLocalMetered = quota.source === "local_estimate" && quota.unit === "requests" && quota.used !== undefined;
    return (_jsxs("div", { style: cardShell(embedded), children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: 600, color: text.tertiary }, children: isLocalMetered ? t("quotaLocalTitle") : t("quotaTitle") }), !isLocalMetered && _jsxs("span", { style: { fontSize: 11, color: text.tertiary }, children: ["\u00B7 ", sourceName] })] }), _jsx(RefreshButton, { refreshing: refreshing, onRefresh: () => void refresh(), title: t("refreshQuota") })] }), _jsxs("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 6 }, children: [_jsx("span", { style: { fontSize: 18, fontWeight: 600, color: text.primary, fontVariantNumeric: "tabular-nums" }, children: main }), unit && _jsx("span", { style: { fontSize: 12, color: text.tertiary }, children: unit })] }), fraction !== undefined && (_jsxs("span", { style: { fontSize: 12, fontWeight: 600, color: text.secondary, fontVariantNumeric: "tabular-nums" }, children: [Math.round(fraction * 100), "%"] }))] }), fraction !== undefined && (_jsx("div", { style: { width: "100%", height: 5, borderRadius: 3, background: surface.layer2, overflow: "hidden" }, children: _jsx("div", { style: { width: `${Math.round(fraction * 100)}%`, height: "100%", background: barColor, transition: "width .3s ease" } }) })), _jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: text.tertiary, flexWrap: "wrap", gap: 6, paddingTop: 2 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [ago && _jsx("span", { children: ago }), isLocalMetered && _jsxs("span", { children: ["\u00B7 ", t("quotaSourceLocalEstimate")] }), quota.breakdown && Object.keys(quota.breakdown).length > 0 && (_jsxs("span", { children: ["\u00B7 ", t("usage"), ": ", Object.entries(quota.breakdown).map(([k, v]) => `${k} ${v}`).join(" ")] }))] }), dash && (_jsxs("a", { href: dash.url, target: "_blank", rel: "noreferrer", style: { color: "var(--dsw-alias-brand-primary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }, children: [_jsx("span", { children: t(dash.labelKey) }), _jsx(ExternalLinkIcon, { size: 12 })] }))] })] }));
}
