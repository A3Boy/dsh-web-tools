/**
 * dsh-web-tools — web-search mode selector mounted in `conversation.input.left`.
 *
 * One compact trigger plus a popover menu (the composer tool-picker pattern),
 * not three differently-shaped buttons. The mode lives in the HOST (single
 * source of truth, shared with the `/search` command); this control is a thin
 * read/write over `/web-tools/api/search-mode`.
 *
 * It revalidates against the Host so a change made elsewhere (slash command,
 * another tab) shows up here:
 *  - on mount / session change
 *  - every ~1s while the page is visible (paused when hidden)
 *  - immediately on window focus / visibility restore
 *  - never while an optimistic write is in flight (don't yank the UI back)
 *  - never overlapping the previous request (inFlight guard)
 *  - on a failed GET keep the last known state — a network error is NOT "auto"
 *
 * Picking a mode writes once and only updates the label: no toast, no extra
 * confirmation, and `onMouseDown` on the trigger keeps the composer caret.
 * @module
 */
import { useEffect, useRef, useState } from "react";
import { GlobeIcon, WifiOffIcon, RadioTowerIcon, ChevronDownIcon, CheckIcon } from "./lucide-icons.tsx";
import { api, type SearchMode } from "./api.ts";
import { searchModeCss, adoptSearchModeStyles } from "./SearchModeButton.css.ts";

/** Props the session-scoped seat supplies plus localized copy. */
interface Props {
  sessionId: string;
  /** Copy for one mode: the row name and the one-line explanation. */
  labels?: Record<SearchMode, string>;
  descriptions?: Record<SearchMode, string>;
  /** Heading inside the menu. */
  menuLabel?: string;
  /** Shown instead of a mode name when no search provider is usable. */
  unavailableLabel?: string;
}

/** The three modes in menu order: default, forced, disabled. */
const MODES: readonly SearchMode[] = ["auto", "required", "off"];

/** Revalidation cadence while the page is visible. */
const REVALIDATE_MS = 1000;

const DEFAULT_LABELS: Record<SearchMode, string> = {
  auto: "智能联网",
  required: "始终联网",
  off: "关闭联网",
};

const DEFAULT_DESCRIPTIONS: Record<SearchMode, string> = {
  auto: "根据问题需要自动决定是否搜索",
  required: "每轮对话至少进行一次联网查询",
  off: "不使用联网搜索和网页读取工具",
};

function ModeIcon(props: { mode: SearchMode }) {
  if (props.mode === "required") return <RadioTowerIcon size={16} />;
  if (props.mode === "off") return <WifiOffIcon size={16} />;
  return <GlobeIcon size={16} />;
}

export function SearchModeButton({
  sessionId,
  labels = DEFAULT_LABELS,
  descriptions = DEFAULT_DESCRIPTIONS,
  menuLabel = "联网模式",
  unavailableLabel = "没有可用的搜索源",
}: Props) {
  const [mode, setMode] = useState<SearchMode>();
  const [available, setAvailable] = useState(true);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  // Mount/session-change guard: a stale session's async response must never
  // write into the current session's UI.
  const generation = useRef(0);
  // Optimistic in-flight flag readable without rebuilding the interval.
  const pendingRef = useRef(false);
  // One GET at a time.
  const inFlight = useRef(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Inject the one-time stylesheet so the class names in the JSX resolve.
  useEffect(() => {
    adoptSearchModeStyles();
  }, []);

  // Revalidate against the Host: reconcile mode AND available. On failure keep
  // the last known state (a network error is not "auto"/"unavailable").
  const refresh = () => {
    if (inFlight.current) return;
    if (pendingRef.current) return; // don't clobber an optimistic write
    inFlight.current = true;
    const current = generation.current;
    void api
      .searchModeGet(sessionId)
      .then((view) => {
        if (generation.current !== current) return;
        setMode(view.mode);
        setAvailable(view.available);
      })
      .catch(() => {
        /* keep last known state */
      })
      .finally(() => {
        if (generation.current === current) inFlight.current = false;
      });
  };

  useEffect(() => {
    generation.current += 1;
    setMode(undefined);
    setOpen(false);
    refresh();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REVALIDATE_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
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

  // Close on outside pointer / Escape while the menu is open.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const node = wrapRef.current;
      if (node !== null && event.target instanceof Node && !node.contains(event.target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const loading = mode === undefined;
  const current: SearchMode = mode ?? "auto";

  const choose = async (next: SearchMode) => {
    setOpen(false);
    if (mode === undefined || pending || !available || next === mode) return;
    const currentGeneration = generation.current;
    const previous = mode;

    // Optimistic switch: the label flips immediately (no toast, no spinner).
    setPending(true);
    pendingRef.current = true;
    setMode(next);

    try {
      const view = await api.searchModeSet(sessionId, next);
      if (generation.current !== currentGeneration) return;
      setMode(view.mode);
      setAvailable(view.available);
    } catch {
      if (generation.current !== currentGeneration) return;
      setMode(previous); // rollback on failure
    } finally {
      if (generation.current === currentGeneration) {
        setPending(false);
        pendingRef.current = false;
      }
    }
  };

  const shownLabel = !available ? unavailableLabel : labels[current];

  return (
    <div className={searchModeCss.wrap} ref={wrapRef}>
      <button
        type="button"
        className={searchModeCss.trigger}
        data-mode={current}
        data-open={open || undefined}
        data-loading={loading || undefined}
        data-pending={pending || undefined}
        data-unavailable={!available || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={loading || pending || undefined}
        aria-label={shownLabel}
        title={open ? undefined : shownLabel}
        disabled={!available || loading || pending}
        onMouseDown={(event) => {
          // Keep the textarea caret: opening the menu must not steal compose focus.
          event.preventDefault();
        }}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={searchModeCss.icon} aria-hidden>
          <ModeIcon mode={current} />
        </span>
        <span className={searchModeCss.label}>{shownLabel}</span>
        <span className={searchModeCss.chevron} aria-hidden>
          <ChevronDownIcon size={16} />
        </span>
      </button>

      {open && (
        <div className={searchModeCss.menu} role="menu" aria-label={menuLabel}>
          <div className={searchModeCss.menuTitle}>{menuLabel}</div>
          {MODES.map((candidate) => {
            const selected = candidate === current;
            return (
              <button
                key={candidate}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={searchModeCss.item}
                data-mode={candidate}
                onClick={() => void choose(candidate)}
              >
                <span className={searchModeCss.itemIcon} aria-hidden>
                  <ModeIcon mode={candidate} />
                </span>
                <span className={searchModeCss.itemText}>
                  <span className={searchModeCss.itemLabel}>{labels[candidate]}</span>
                  <span className={searchModeCss.itemDescription}>{descriptions[candidate]}</span>
                </span>
                <span className={searchModeCss.itemCheck} aria-hidden>
                  {selected ? <CheckIcon size={16} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

