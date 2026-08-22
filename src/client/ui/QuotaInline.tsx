/**
 * dsh-web-tools — QuotaInline & QuotaCard: unified quota display primitives
 * with tabular numbers, i18n, per-provider dashboard quicklinks, and an
 * `embedded` mode for use inside a SettingsGroup (no card-in-card).
 * @module
 */
import { text, surface, state as stateColor } from "../theme.ts";
import { type QuotaView } from "../api.ts";
import { quotaFraction, quotaTier, type TFunc } from "../logic.ts";
import { IconRefreshOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";
import { useState } from "react";
import { dashboardOf, ExternalLinkIcon } from "../provider-ui-meta.tsx";

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
    if (q.remaining !== undefined) return { main: `$${amount}` };
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

/** Outermost wrapper style: standalone card vs embedded (no card-in-card). */
function cardShell(embedded: boolean): React.CSSProperties {
  return embedded
    ? { display: "flex", flexDirection: "column", gap: 10, padding: "10px 14px" }
    : { display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: 10, background: surface.layer1, border: `1px solid ${surface.border}` };
}

export function QuotaInline(props: { quota?: QuotaView; providerName?: string; t?: TFunc }) {
  const { quota, providerName, t } = props;

  // Brave is pay-as-you-go metered ($5/1k reqs) — always show "按量计费" (4 chars),
  // never misleading percentages or fake progress bars.
  if (providerName === "brave") {
    return (
      <span style={{ fontSize: 12, fontWeight: 500, color: text.secondary, whiteSpace: "nowrap", flex: "none" }}>
        {t ? t("quotaMeteredPrefix") : "Pay-as-you-go"}
      </span>
    );
  }

  if (!quota || !quota.supported) return null;

  const { main, unit } = formatQuotaNumbers(quota, t);
  if (!main) return null;

  const fraction = quotaFraction(quota);
  const tier = quotaTier(fraction);
  const barColor = tier === "danger" ? stateColor.danger : tier === "warn" ? stateColor.warning : text.tertiary;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: "none" }}>
      <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: text.secondary, fontVariantNumeric: "tabular-nums" }}>
          {main}
        </span>
        {unit && <span style={{ fontSize: 11, color: text.tertiary }}>{unit}</span>}
      </div>
      {fraction !== undefined && (
        <div style={{ width: 64, height: 4, borderRadius: 2, background: surface.layer2, overflow: "hidden", flex: "none" }}>
          <div style={{ width: `${Math.round(fraction * 100)}%`, height: "100%", background: barColor, transition: "width .2s ease" }} />
        </div>
      )}
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

  // Brave is pay-as-you-go metered ($5/1k reqs) — show "按量计费" unconditionally.
  if (providerName === "brave") {
    return (
      <div style={cardShell(embedded)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: text.tertiary }}>
            {t("quotaTitle")}
          </span>
          <RefreshButton refreshing={refreshing} onRefresh={() => void refresh()} title={t("refreshQuota")} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: text.primary }}>
            {t("quotaMeteredPrefix")}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: text.tertiary, flexWrap: "wrap", gap: 6, paddingTop: 2 }}>
          <span>· {t("quotaSourceResponseHeader")}</span>
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

  // Fallback card when no quota snapshot or for dashboard-only providers
  if (!quota || !quota.supported || quota.source === "dashboard") {
    const isLocalMetered = providerName === "parallel" || providerName === "exa";
    return (
      <div style={cardShell(embedded)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: text.tertiary }}>
            {t("quotaTitle")}
          </span>
          <RefreshButton refreshing={refreshing} onRefresh={() => void refresh()} title={t("refreshQuota")} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: text.secondary }}>
            {isLocalMetered
              ? t("quotaSourceLocalEstimate")
              : t("quotaSourceDashboard")}
          </span>
          {dash && (
            <a
              href={dash.url}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--dsw-alias-brand-primary)", textDecoration: "none", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <span>{t(dash.labelKey)}</span>
              <ExternalLinkIcon size={12} />
            </a>
          )}
        </div>
      </div>
    );
  }

  const { main, unit } = formatQuotaNumbers(quota, t);
  const fraction = quotaFraction(quota);
  const tier = quotaTier(fraction);
  const barColor = tier === "danger" ? stateColor.danger : tier === "warn" ? stateColor.warning : "var(--dsw-alias-brand-primary)";

  const sourceKey = `quotaSource${quota.source[0].toUpperCase()}${quota.source.slice(1)}` as const;
  const sourceName = t(sourceKey);

  const ago = quota.fetchedAt !== undefined
    ? (quota.fetchedAt > Date.now() - 60_000 ? t("updatedJustNow") : t("updatedAgo", { mins: Math.max(1, Math.round((Date.now() - quota.fetchedAt) / 60_000)) }))
    : undefined;

  const isLocalMetered = quota.source === "local_estimate" && quota.unit === "requests" && quota.used !== undefined;

  return (
    <div style={cardShell(embedded)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: text.tertiary }}>
            {isLocalMetered ? t("quotaLocalTitle") : t("quotaTitle")}
          </span>
          {!isLocalMetered && <span style={{ fontSize: 11, color: text.tertiary }}>· {sourceName}</span>}
        </div>
        <RefreshButton refreshing={refreshing} onRefresh={() => void refresh()} title={t("refreshQuota")} />
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: text.primary, fontVariantNumeric: "tabular-nums" }}>
            {main}
          </span>
          {unit && <span style={{ fontSize: 12, color: text.tertiary }}>{unit}</span>}
        </div>
        {fraction !== undefined && (
          <span style={{ fontSize: 12, fontWeight: 600, color: text.secondary, fontVariantNumeric: "tabular-nums" }}>
            {Math.round(fraction * 100)}%
          </span>
        )}
      </div>

      {fraction !== undefined && (
        <div style={{ width: "100%", height: 5, borderRadius: 3, background: surface.layer2, overflow: "hidden" }}>
          <div style={{ width: `${Math.round(fraction * 100)}%`, height: "100%", background: barColor, transition: "width .3s ease" }} />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: text.tertiary, flexWrap: "wrap", gap: 6, paddingTop: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {ago && <span>{ago}</span>}
          {isLocalMetered && <span>· {t("quotaSourceLocalEstimate")}</span>}
          {quota.breakdown && Object.keys(quota.breakdown).length > 0 && (
            <span>· {t("usage")}: {Object.entries(quota.breakdown).map(([k, v]) => `${k} ${v}`).join(" ")}</span>
          )}
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