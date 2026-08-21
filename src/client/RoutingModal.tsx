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
import { useRef, useState } from "react";
import { Button, IconChevronRightOutline14, IconPlusOutline16, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ProviderView, SearchRoutingPolicy } from "./api.ts";
import { text, surface, state as stateColor } from "./theme.ts";
import { PROVIDER_BRAND } from "./brand.ts";
import type { TFunc } from "./logic.ts";

interface Props {
  t: TFunc;
  /** All known providers (used for lookup). */
  providers: ProviderView[];
  /** Current ordered list [defaultProvider, ...fallbackOrder]. */
  ordered: string[];
  currentPolicy?: SearchRoutingPolicy;
  onClose: () => void;
  onSave: (ordered: string[], policy: SearchRoutingPolicy) => void;
}

const POLICIES: SearchRoutingPolicy[] = ["ordered", "round-robin", "random"];

/** 6-dot grip icon for drag handle. */
function GripIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.45, flexShrink: 0 }}>
      <circle cx="5" cy="3" r="1.5" />
      <circle cx="11" cy="3" r="1.5" />
      <circle cx="5" cy="8" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="13" r="1.5" />
      <circle cx="11" cy="13" r="1.5" />
    </svg>
  );
}

/** Close (×) icon for remove button. */
function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}

export function RoutingModal(props: Props) {
  const { t, providers, ordered, currentPolicy = "ordered", onClose, onSave } = props;
  const [draft, setDraft] = useState<string[]>([...ordered]);
  const [policy, setPolicy] = useState<SearchRoutingPolicy>(currentPolicy);
  const [showAdd, setShowAdd] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const providerOf = (name: string) => providers.find((p) => p.name === name);
  const enabledNames = new Set(providers.filter((p) => p.enabled).map((p) => p.name));
  const available = providers.filter((p) => p.enabled && !draft.includes(p.name)).map((p) => p.name);

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
  };

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= draft.length || to >= draft.length) return;
    const next = [...draft];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDraft(next);
  };

  const remove = (name: string) => {
    if (draft.length <= 1) return;
    setDraft(draft.filter((n) => n !== name));
  };

  const add = (name: string) => {
    setDraft([...draft, name]);
    setShowAdd(false);
  };

  const dirty = draft.join(",") !== ordered.join(",") || policy !== currentPolicy;

  return (
    <Modal
      open
      onClose={onClose}
      title={t("routingLabel")}
      closeLabel={t("close")}
      footer={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: text.tertiary, fontSize: 12, marginRight: "auto" }}>{t("routingMinOneSource")}</span>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button variant="primary" disabled={!dirty} onClick={() => { onSave(draft, policy); onClose(); }}>
            {t("save")}
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Section 1: 使用方式 (policy selector) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: text.secondary }}>{t("routingPolicySection")}</div>
          {POLICIES.map((p) => {
            const selected = policy === p;
            return (
              <div
                key={p}
                onClick={() => setPolicy(p)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: selected ? "1px solid var(--dsw-alias-brand-primary)" : `1px solid ${surface.border}`,
                  background: selected ? "color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent)" : surface.layer1,
                  cursor: "pointer",
                  transition: "all .12s ease",
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: selected ? "5px solid var(--dsw-alias-brand-primary)" : `2px solid ${surface.border}`,
                    boxSizing: "border-box",
                    flexShrink: 0,
                    transition: "all .12s ease",
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: selected ? 600 : 500, color: text.primary }}>
                    {t(`routingPolicy.${p}`)}
                  </span>
                  <span style={{ fontSize: 11, color: text.tertiary }}>
                    {t(`routingPolicyHint.${p}`)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Section 2: 搜索源 (sources order) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: text.secondary }}>{t("routingSourcesSection")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {draft.map((name, i) => {
              const p = providerOf(name);
              const ok = p !== undefined && enabledNames.has(name);
              const isDefault = i === 0 && policy === "ordered";
              const isOver = overIndex === i && dragIndex.current !== null && dragIndex.current !== i;
              const brand = p ? PROVIDER_BRAND[p.name] : undefined;
              return (
                <div
                  key={name}
                  draggable
                  onDragStart={(e) => { dragIndex.current = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", name); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overIndex !== i) setOverIndex(i); }}
                  onDragLeave={() => { if (overIndex === i) setOverIndex(null); }}
                  onDrop={(e) => { e.preventDefault(); const from = dragIndex.current; dragIndex.current = null; setOverIndex(null); if (from !== null) reorder(from, i); }}
                  onDragEnd={() => { dragIndex.current = null; setOverIndex(null); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 10,
                    background: isOver ? surface.hover : surface.layer1,
                    border: `1px solid ${isOver ? "var(--dsw-alias-brand-primary)" : surface.border}`,
                    opacity: ok ? 1 : 0.5,
                    cursor: "grab",
                  }}
                >
                  <GripIcon />
                  {brand && <img src={brand.icon} alt="" width={18} height={18} style={{ borderRadius: 4, flexShrink: 0 }} />}
                  <span style={{ color: text.primary, fontWeight: isDefault ? 600 : 400, fontSize: 14, flex: 1 }}>
                    {p?.label ?? name}
                  </span>
                  {!ok && <span style={{ color: stateColor.danger, fontSize: 12 }}>{t("disabledLabel")}</span>}
                  {isDefault && (
                    <span style={{ color: "var(--dsw-alias-brand-primary)", fontSize: 11, fontWeight: 600, border: "1px solid currentColor", borderRadius: 4, padding: "0 6px", whiteSpace: "nowrap" }}>
                      {t("preferredProviderLabel")}
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(name); }}
                    disabled={draft.length <= 1}
                    aria-label={t("removeFromChain")}
                    style={{
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
                      borderRadius: 3,
                    }}
                  >
                    {draft.length > 1 && <CloseIcon />}
                  </button>
                </div>
              );
            })}
          </div>

          {draft.length === 0 && <span style={{ color: text.tertiary, fontSize: 13, padding: "8px 4px" }}>{t("notConfigured")}</span>}

          {/* 可添加的搜索源 */}
          {showAdd ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 4px" }}>
              {available.length === 0 ? (
                <span style={{ color: text.tertiary, fontSize: 13 }}>{t("noAvailableProviders")}</span>
              ) : (
                available.map((name) => {
                  const p = providerOf(name);
                  const brand = p ? PROVIDER_BRAND[p.name] : undefined;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => add(name)}
                      style={{
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
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = surface.hover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {brand && <img src={brand.icon} alt="" width={16} height={16} style={{ borderRadius: 3, flexShrink: 0 }} />}
                      <span>{p?.label ?? name}</span>
                    </button>
                  );
                })
              )}
              <span style={{ marginTop: 4 }}>
                <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>{t("cancel")}</Button>
              </span>
            </div>
          ) : (
            <div style={{ padding: "4px 0" }}>
              <Button size="sm" variant="outline" icon={<IconPlusOutline16 size={14} />} onClick={() => setShowAdd(true)} disabled={available.length === 0}>
                {t("addToChain") + " · " + t("routingAvailableSources")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}