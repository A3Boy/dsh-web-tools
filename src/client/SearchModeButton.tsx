/**
 * dsh-web-tools — "联网搜索" toggle button mounted in `conversation.input.left`.
 *
 * Renders a small always-visible per-session control: click toggles the
 * session's Search Mode between `auto` and `required`. The actual mode lives
 * in the HOST (survives refresh/session switch) — this component is a thin
 * read/write over `/web-tools/api/search-mode`.
 *
 * Agent-client React: no JSX beyond HMR/tsc compile, plain function component.
 * @module
 */
import { useEffect, useState } from "react";
import { api, type SearchMode } from "./api.ts";
import { accent, surface, text } from "./theme.ts";

/** Standard props the session-scoped `conversation.input.left` seat supplies. */
interface Props {
  sessionId: string;
}

/** The literal globe ("t") is not in the primitives set; use a small unicode. */
const GLOBE = "🌐";

export function SearchModeButton(props: Props) {
  const { sessionId } = props;
  const [mode, setMode] = useState<SearchMode | undefined>(undefined);
  // `available` is ONLY ever set from a Host response. A failed fetch (stale
  // host, momentary network) must NOT gray the button out as "no search
  // source" — that label is reserved for a Host-confirmed answer.
  const [available, setAvailable] = useState(true);

  // Read the host state on mount / session change (the button never guesses).
  useEffect(() => {
    let active = true;
    setMode(undefined);
    api
      .searchModeGet(sessionId)
      .then((v) => {
        if (!active) return;
        setMode(v.mode);
        setAvailable(v.available);
      })
      .catch(() => {
        // Unknown: keep the button usable rather than lie about availability.
        if (active) setMode("auto");
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  const required = mode === "required";
  const click = () => {
    const next: SearchMode = required ? "auto" : "required";
    api.searchModeSet(sessionId, next).then((v) => {
      setMode(v.mode);
      setAvailable(v.available);
    }).catch(() => {
      /* keep current on failure — UI never desyncs from Host */
    });
  };

  return (
    <button
      type="button"
      onClick={click}
      disabled={!available}
      title={available ? "联网搜索" : "没有可用的搜索源"}
      aria-pressed={required}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 8,
        border: required ? `1px solid ${accent.primary}` : `1px solid ${surface.border}`,
        background: required ? accent.primary : "transparent",
        color: required ? accent.text : text.secondary,
        cursor: available ? "pointer" : "not-allowed",
        opacity: available ? 1 : 0.45,
        padding: "3px 8px",
        fontSize: 12,
        lineHeight: 1,
        whiteSpace: "nowrap",
        transition: "background .15s ease, color .15s ease, border-color .15s ease",
      }}
    >
      <span aria-hidden>{GLOBE}</span>
      <span>{required ? "联网搜索" : "联网搜索"}</span>
    </button>
  );
}
