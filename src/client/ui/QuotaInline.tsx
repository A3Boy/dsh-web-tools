/**
 * dsh-web-tools — QuotaInline & QuotaCard: unified quota display primitives
 * with tabular numbers, i18n, per-provider dashboard quicklinks, and an
 * `embedded` mode for use inside a SettingsGroup (no card-in-card).
 * @module
 */
import { text, surface, state as stateColor } from "../theme.ts";
import { type QuotaView } from "../api.ts";
import { quotaFraction, quotaTier, type TFunc } from "../logic.ts";
import { IconRefreshOutline16, IconChevronRightOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";
import { useState } from "react";
import { dashboardOf, ExternalLinkIcon } from "../provider-ui-meta.tsx";
import { adoptWebToolsStyles } from "./styles.ts";

function IconCard() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="M2 6.5h12" />
      <path d="M4.5 10h2" />
    </svg>
  );
}

function IconConsole() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M5 6.5l2 1.5-2 1.5M9 9.5h2" />
    </svg>
  );
}

export function formatQuotaNumbers(q?: QuotaView, t?: TFunc): { main: string; unit?: string } {
  const fmt = (n: number) => n.toLocaleString();
  if (!q || !q.supported) return { main: "" };
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
    if (q.remaining !== undefined) return { main: t ? `${t("quotaBalance")} $${amount}` : `Balance $${amount}` };
    if (q.used !== undefined) return { main: `$${amount}`, unit: t ? t("quotaUsedLabel") : "used" };
  }
  if (q.unit === "tokens" && q.remaining !== undefined) {
    if (q.remaining >= 1_000_000) return { main: `${(q.remaining / 1_000_000).toFixed(2)}M`, unit: "tokens" };
    if (q.remaining >= 1_000) return { main: `${(q.remaining / 1_000).toFixed(1)}k`, unit: "tokens" };
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
function RefreshButton(props: { refreshing: boolean; onRefresh: () => void; title: string }) {
  const { refreshing, onRefresh, title } = props;
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      title={title}
      style={{
        background: "transparent", border: "none", cursor: refreshing ? "not-allowed" : "pointer",
        padding: 2, borderRadius: 4, color: text.tertiary, display: "inline-flex", alignItems: "center",
      }}
    >
      <span style={{ display: "inline-flex", transform: refreshing ? "rotate(180deg)" : "none", transition: "transform .5s ease" }}>
        <IconRefreshOutline16 size={13} />
      </span>
    </button>
  );
}

export function QuotaInline(props: { quota?: QuotaView; providerName?: string; t?: TFunc }) {
  const { quota, providerName, t } = props;

  // Brave / Exa / Parallel are pay-as-you-go metered — show "按量计费" (fixed 220px slot alignment).
  const meteredNames = new Set(["brave", "exa", "parallel"]);
  if (meteredNames.has(providerName ?? "")) {
    return (
      <div style={{ width: 220, display: "grid", gridTemplateColumns: "minmax(0,1fr) 64px", alignItems: "center", justifyItems: "end" }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: text.secondary, whiteSpace: "nowrap" }}>
          {t ? t("quotaMeteredPrefix") : "Pay-as-you-go"}
        </span>
        <div style={{ width: 64 }} />
      </div>
    );
  }

  if (!quota || !quota.supported) return null;

  const { main, unit } = formatQuotaNumbers(quota, t);
  if (!main) return null;

  const fraction = quotaFraction(quota);
  const tier = quotaTier(fraction);
  const barColor = tier === "danger" ? stateColor.danger : tier === "warn" ? stateColor.warning : text.tertiary;

  return (
    <div style={{ width: 220, display: "grid", gridTemplateColumns: "minmax(0,1fr) 64px", alignItems: "center", justifyItems: "end", gap: 8, flex: "none" }}>
      <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: text.secondary, fontVariantNumeric: "tabular-nums" }}>
          {main}
        </span>
        {unit && <span style={{ fontSize: 11, color: text.tertiary }}>{unit}</span>}
      </div>
      <div style={{ width: 64, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        {fraction !== undefined && (
          <div style={{ width: 64, height: 4, borderRadius: 2, background: surface.layer2, overflow: "hidden", flex: "none" }}>
            <div style={{ width: `${Math.round(fraction * 100)}%`, height: "100%", background: barColor, transition: "width .2s ease" }} />
          </div>
        )}
      </div>
    </div>
  );
}

export function QuotaCard(props: {
  quota?: QuotaView;
  providerName?: string;
  t: TFunc;
  onRefresh: () => void;
  /** Render inside a host SettingsGroup: drop the card chrome (border/radius/bg). */
  embedded?: boolean;
}) {
  adoptWebToolsStyles();
  const { quota, providerName, t, onRefresh, embedded = false } = props;
  const [refreshing, setRefreshing] = useState(false);
  const dash = dashboardOf(providerName);

  const refresh = async () => {
    setRefreshing(true);
    try {
      onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 600);
    }
  };

  // Brave / Exa / Parallel are pay-as-you-go metered — show clean rows without giant 18px text.
  const meteredNames = new Set(["brave", "exa", "parallel"]);
  if (meteredNames.has(providerName ?? "")) {
    const isLocalMetered = quota?.source === "local_estimate" && quota?.unit === "requests" && quota?.used !== undefined;
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div className="dswt-settings-row">
          <div className="dswt-row-icon"><IconCard /></div>
          <div className="dswt-row-main">
            <div className="dswt-row-title">{t("billingMethod")}</div>
          </div>
          <div className="dswt-row-trailing">
            <span style={{ fontSize: 13, color: text.secondary }}>{t("quotaMeteredPrefix")}</span>
          </div>
        </div>
        {isLocalMetered && (
          <div className="dswt-settings-row">
            <div className="dswt-row-main">
              <div className="dswt-row-title">{t("localUsage")}</div>
            </div>
            <div className="dswt-row-trailing">
              <span style={{ fontSize: 13, color: text.secondary }}>{t("localUsageTimes", { n: quota!.used! })}</span>
            </div>
          </div>
        )}
        {dash && (
          <a
            href={dash.url}
            target="_blank"
            rel="noreferrer"
            className="dswt-settings-row clickable"
          >
            <div className="dswt-row-icon"><IconConsole /></div>
            <div className="dswt-row-main">
              <div className="dswt-row-title">{t("dashboardLabel")}</div>
            </div>
            <div className="dswt-row-trailing">
              <span style={{ fontSize: 13, color: text.secondary }}>{t(dash.labelKey)}</span>
            </div>
            <div className="dswt-row-chevron">
              <IconChevronRightOutline14 size={14} />
            </div>
          </a>
        )}
      </div>
    );
  }

  // Fallback card when no quota snapshot or for dashboard-only providers
  if (!quota || !quota.supported || quota.source === "dashboard") {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        {dash && (
          <a
            href={dash.url}
            target="_blank"
            rel="noreferrer"
            className="dswt-settings-row clickable"
          >
            <div className="dswt-row-icon"><IconConsole /></div>
            <div className="dswt-row-main">
              <div className="dswt-row-title">{t("dashboardLabel")}</div>
            </div>
            <div className="dswt-row-trailing">
              <span style={{ fontSize: 13, color: text.secondary }}>{t(dash.labelKey)}</span>
            </div>
            <div className="dswt-row-chevron">
              <IconChevronRightOutline14 size={14} />
            </div>
          </a>
        )}
      </div>
    );
  }

  const { main, unit } = formatQuotaNumbers(quota, t);
  const fraction = quotaFraction(quota);
  const tier = quotaTier(fraction);
  const barColor = tier === "danger" ? stateColor.danger : tier === "warn" ? stateColor.warning : "var(--dsw-alias-brand-primary)";

  const ago = quota.fetchedAt !== undefined
    ? (quota.fetchedAt > Date.now() - 60_000 ? t("updatedJustNow") : t("updatedAgo", { mins: Math.max(1, Math.round((Date.now() - quota.fetchedAt) / 60_000)) }))
    : undefined;

  const isUsdBalance = quota.unit === "usd_cents";

  return (
    <div
      className={embedded ? "dswt-settings-row" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: embedded ? "14px 16px" : "12px 14px",
        borderRadius: embedded ? undefined : 10,
        background: embedded ? undefined : surface.layer1,
        border: embedded ? undefined : `1px solid ${surface.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: text.tertiary }}>
          {isUsdBalance ? t("quotaBalance") : t("quotaTitle")}
        </span>
        {fraction !== undefined && (
          <span style={{ fontSize: 12, fontWeight: 500, color: text.secondary, fontVariantNumeric: "tabular-nums" }}>
            {Math.round(fraction * 100)}%
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 6, width: "100%" }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: text.primary, fontVariantNumeric: "tabular-nums" }}>
          {main}
        </span>
        {unit && <span style={{ fontSize: 12, color: text.tertiary }}>{unit}</span>}
      </div>

      {fraction !== undefined && (
        <div style={{ width: "100%", height: 5, borderRadius: 3, background: surface.layer2, overflow: "hidden" }}>
          <div style={{ width: `${Math.round(fraction * 100)}%`, height: "100%", background: barColor, transition: "width .3s ease" }} />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: text.tertiary, flexWrap: "wrap", gap: 6, paddingTop: 2, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {ago && <span>{ago}</span>}
          <RefreshButton refreshing={refreshing} onRefresh={() => void refresh()} title={t("refreshQuota")} />
        </div>
        {dash && (
          <a
            href={dash.url}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--dsw-alias-brand-primary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <span>{t(dash.labelKey)}</span>
            <ExternalLinkIcon size={12} />
          </a>
        )}
      </div>
    </div>
  );
}
