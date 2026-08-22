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
 * in ./i18n-dict.ts). The page follows the DSH UI language by default, and additionally
 * offers its own language selector (Follow system / 中文 / English) that is
 * persisted in the plugin's own config — it never changes the DSH-wide
 * language.
 * @module
 */
import { WebToolsSection } from "./WebToolsSection.js";
import { registerSettingsSection } from "./registration.js";
import { SearchModeButton } from "./SearchModeButton.js";
import { zhDict, enDict } from "./i18n-dict.js";
import { adoptWebToolsStyles } from "./ui/styles.js";
import * as React from "react";
import { useSyncExternalStore } from "react";
export { zhDict, enDict };
/** Locale namespace for this page's copy. */
export const NS = "dsh-web-tools";
/** Services required by this client plugin. */
export const inject = ["slots", "locale"];
/** Register the Settings page. */
class SectionErrorBoundary extends React.Component {
    state = { error: null };
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error("[dsh-web-tools] WebToolsSection render error", error, info);
    }
    render() {
        if (this.state.error !== null) {
            return React.createElement("div", { style: { padding: 12, color: "#e5484d", fontFamily: "ui-monospace, monospace", fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.5 } }, "[dsh-web-tools] 页面渲染失败:\n" + (this.state.error.stack ?? String(this.state.error)));
        }
        return this.props.children;
    }
}
function SectionWithBoundary(props) {
    return React.createElement(SectionErrorBoundary, null, React.createElement(WebToolsSection, props));
}
export function apply(ctx) {
    adoptWebToolsStyles();
    ctx.effect(() => ctx.locale.register(NS, {
        zh: zhDict,
        en: enDict,
    }));
    const t = ctx.locale.bind(NS);
    const ui = {
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
    const SearchModeControl = (props) => {
        useSyncExternalStore((cb) => ctx.locale.subscribe(cb), () => ctx.locale.getLocale().active);
        return React.createElement(SearchModeButton, {
            sessionId: props.sessionId,
            label: t("searchModeLabel"),
            unavailableLabel: t("searchModeUnavailable"),
            autoTooltip: t("searchModeTooltipAuto"),
            requiredTooltip: t("searchModeTooltipRequired"),
        });
    };
    ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
        name: "conversation.input.left",
        id: "dsh-web-tools-search-mode",
        order: 30,
        // Localized projected label follows the active locale without re-register.
        label: () => t("searchModeLabel"),
    }, SearchModeControl));
}
