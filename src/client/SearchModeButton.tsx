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
import { useEffect, useRef, useState } from "react";
import { IconGlobeOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";
import { api, type SearchMode } from "./api.ts";
import { searchModeCss, adoptSearchModeStyles } from "./SearchModeButton.css.ts";

/** Props the session-scoped seat supplies plus localized copy. */
interface Props {
  sessionId: string;
  label?: string;
  unavailableLabel?: string;
}

/** Revalidation cadence while the page is visible. */
const REVALIDATE_MS = 1000;

export function SearchModeButton({
  sessionId,
  label = "联网搜索",
  unavailableLabel = "没有可用的搜索源",
}: Props) {
  const [mode, setMode] = useState<SearchMode>();
  const [available, setAvailable] = useState(true);
  const [pending, setPending] = useState(false);

  // Mount/session-change guard: a stale session's async response must never
  // write into the current session's UI.
  const generation = useRef(0);
  // Optimistic in-flight flag readable without rebuilding the interval.
  const pendingRef = useRef(false);
  // One GET at a time.
  const inFlight = useRef(false);

  // Inject the one-time stylesheet so the class names in the JSX resolve.
  useEffect(() => {
    adoptSearchModeStyles();
  }, []);

  // Revalidate against the Host: reconcile mode AND available. On failure keep
  // the last known state (a network error is not "auto"/"unavailable").
  const refresh = () => {
    if (inFlight.current) return;
    if (pendingRef.current) return; // don't clobber an optimistic toggle
    inFlight.current = true;
    const current = generation.current;
    api
      .searchModeGet(sessionId)
      .then((view) => {
        if (generation.current !== current) return;
        if (pendingRef.current) return;
        setMode(view.mode);
        setAvailable(view.available);
      })
      .catch(() => {
        /* keep last known state on transient host/network hiccup */
      })
      .finally(() => {
        if (generation.current === current) inFlight.current = false;
      });
  };

  // Mount / session change: reset, read immediately, then keep revalidating.
  useEffect(() => {
    generation.current += 1;
    setMode(undefined);
    setPending(false);
    pendingRef.current = false;
    inFlight.current = false;
    refresh();

    // Lightweight revalidation: only while the page is visible.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const required = mode === "required";

  const toggle = async () => {
    if (mode === undefined || pending || !available) return;
    const current = generation.current;
    const previous = mode;
    const next: SearchMode = previous === "required" ? "auto" : "required";

    // Optimistic flip: no visible round-trip delay, no second click while pending.
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
      setMode(previous); // rollback on failure
    } finally {
      if (generation.current === current) {
        setPending(false);
        pendingRef.current = false;
      }
    }
  };

  return (
    <button
      type="button"
      className={searchModeCss.trigger}
      data-active={required || undefined}
      aria-pressed={required}
      aria-label={label}
      title={available ? label : unavailableLabel}
      disabled={!available || mode === undefined || pending}
      onMouseDown={(event) => {
        // Keep the textarea caret: toggling a mode must not steal compose focus.
        event.preventDefault();
      }}
      onClick={() => {
        void toggle();
      }}
    >
      <span className={searchModeCss.icon} aria-hidden>
        <IconGlobeOutline14 size={14} />
      </span>
      <span className={searchModeCss.label}>{label}</span>
    </button>
  );
}
