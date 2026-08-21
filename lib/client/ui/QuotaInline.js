import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-web-tools — QuotaInline & QuotaCard: unified quota display primitives with tabular numbers.
 * @module
 */
import { text, surface, state as stateColor } from "../theme.js";
import {} from "../api.js";
import { quotaFraction, quotaTier, quotaDisplayKind } from "../logic.js";
import { Button, IconRefreshOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";
import { useState } from "react";
export function formatQuotaNumbers(q) {
    if (!q || !q.supported)
        return { main: "" };
    if (q.limit !== undefined && q.limit === 0 && q.remaining === undefined) {
        return { main: "按量计费" };
    }
    if (q.unit === "usd_cents") {
        if (q.remaining !== undefined) {
            return { main: `$${(q.remaining / 100).toFixed(2)}`, unit: "余额" };
        }
        if (q.used !== undefined) {
            return { main: `$${(q.used / 100).toFixed(2)}`, unit: "已消耗" };
        }
    }
    if (q.unit === "tokens" && q.remaining !== undefined) {
        if (q.remaining >= 1_000_000) {
            return { main: `${(q.remaining / 1_000_000).toFixed(2)}M`, unit: "tokens" };
        }
        if (q.remaining >= 1_000) {
            return { main: `${(q.remaining / 1_000).toFixed(1)}k`, unit: "tokens" };
        }
        return { main: q.remaining.toLocaleString(), unit: "tokens" };
    }
    if (q.unit === "credits" && q.remaining !== undefined) {
        const lim = q.limit !== undefined && q.limit > 0 ? ` / ${q.limit.toLocaleString()}` : "";
        return { main: `${q.remaining.toLocaleString()}${lim}`, unit: "积分" };
    }
    if (q.unit === "requests" && q.remaining !== undefined) {
        const lim = q.limit !== undefined && q.limit > 0 ? ` / ${q.limit.toLocaleString()}` : "";
        return { main: `${q.remaining.toLocaleString()}${lim}`, unit: "次" };
    }
    if (q.remaining !== undefined) {
        const lim = q.limit !== undefined && q.limit > 0 ? ` / ${q.limit.toLocaleString()}` : "";
        return { main: `${q.remaining.toLocaleString()}${lim}` };
    }
    return { main: "" };
}
export function QuotaInline(props) {
    const { quota } = props;
    if (!quota || !quota.supported)
        return null;
    const { main, unit } = formatQuotaNumbers(quota);
    if (!main)
        return null;
    const fraction = quotaFraction(quota);
    const tier = quotaTier(fraction);
    const barColor = tier === "danger" ? stateColor.danger : tier === "warn" ? stateColor.warning : text.tertiary;
    return (_jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 8, flex: "none" }, children: [_jsxs("div", { style: { display: "inline-flex", alignItems: "baseline", gap: 4 }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: 500, color: text.secondary, fontVariantNumeric: "tabular-nums" }, children: main }), unit && _jsx("span", { style: { fontSize: 11, color: text.tertiary }, children: unit })] }), fraction !== undefined && (_jsx("div", { style: { width: 64, height: 4, borderRadius: 2, background: surface.layer2, overflow: "hidden", flex: "none" }, children: _jsx("div", { style: { width: `${Math.round(fraction * 100)}%`, height: "100%", background: barColor, transition: "width .2s ease" } }) }))] }));
}
export function QuotaCard(props) {
    const { quota, t, onRefresh } = props;
    const [refreshing, setRefreshing] = useState(false);
    const kind = quotaDisplayKind(quota);
    if (kind === "unavailable" || kind === "self_hosted")
        return null;
    const { main, unit } = formatQuotaNumbers(quota);
    const fraction = quotaFraction(quota);
    const tier = quotaTier(fraction);
    const barColor = tier === "danger" ? stateColor.danger : tier === "warn" ? stateColor.warning : "var(--dsw-alias-brand-primary)";
    const sourceMap = {
        response_header: "按请求计费 · 已同步",
        api: "按量配额 · 官方同步",
        dashboard: "控制台同步",
        local_estimate: "本地估算",
        self_hosted: "自建部署",
    };
    const sourceName = sourceMap[quota.source] ?? quota.source;
    const ago = quota.fetchedAt !== undefined
        ? (quota.fetchedAt > Date.now() - 60_000 ? "刚刚更新" : `${Math.max(1, Math.round((Date.now() - quota.fetchedAt) / 60_000))} 分钟前`)
        : undefined;
    const refresh = async () => {
        setRefreshing(true);
        try {
            onRefresh();
        }
        finally {
            setTimeout(() => setRefreshing(false), 600);
        }
    };
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: 10, background: surface.layer1, border: `1px solid ${surface.border}` }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: 600, color: text.tertiary }, children: "\u989D\u5EA6" }), _jsx("button", { type: "button", onClick: () => void refresh(), disabled: refreshing, title: "\u5237\u65B0\u989D\u5EA6", style: {
                            background: "transparent",
                            border: "none",
                            cursor: refreshing ? "not-allowed" : "pointer",
                            padding: 2,
                            borderRadius: 4,
                            color: text.tertiary,
                            display: "inline-flex",
                            alignItems: "center",
                        }, children: _jsx("span", { style: { display: "inline-flex", transform: refreshing ? "rotate(180deg)" : "none", transition: "transform .5s ease" }, children: _jsx(IconRefreshOutline16, { size: 13 }) }) })] }), _jsxs("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 6 }, children: [_jsx("span", { style: { fontSize: 18, fontWeight: 600, color: text.primary, fontVariantNumeric: "tabular-nums" }, children: main }), unit && _jsx("span", { style: { fontSize: 12, color: text.tertiary }, children: unit })] }), fraction !== undefined && (_jsxs("span", { style: { fontSize: 12, fontWeight: 600, color: text.secondary, fontVariantNumeric: "tabular-nums" }, children: [Math.round(fraction * 100), "%"] }))] }), fraction !== undefined && (_jsx("div", { style: { width: "100%", height: 5, borderRadius: 3, background: surface.layer2, overflow: "hidden" }, children: _jsx("div", { style: { width: `${Math.round(fraction * 100)}%`, height: "100%", background: barColor, transition: "width .3s ease" } }) })), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: text.tertiary }, children: [_jsx("span", { children: sourceName }), ago && _jsxs("span", { children: ["\u00B7 ", ago] }), quota.breakdown && Object.keys(quota.breakdown).length > 0 && (_jsxs("span", { children: ["\u00B7 \u6D88\u8017: ", Object.entries(quota.breakdown).map(([k, v]) => `${k} ${v}`).join(" ")] }))] })] }));
}
