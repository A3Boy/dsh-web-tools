/**
 * In-page Xiaohongshu search API call.
 *
 * IMPORTANT: this function is stringified and evaluated inside the signed-in
 * page (see `CdpPageLease.call`). It must therefore be fully self-contained:
 * no imports, no closures over module scope. Types are erased at compile time.
 *
 * Why not scrape the search UI? The UI flow (type → submit → scroll × 6) costs
 * 15-25s and is the main trigger for the slider challenge. The site's own web
 * client calls `POST /api/sns/web/v1/search/notes` signed by the obfuscated
 * `window._webmsxyw` helper that it installs — calling it from the page uses
 * the existing session, needs no paid API and returns JSON (including the
 * `xsec_token` that a later note fetch requires).
 */

export interface XhsApiSearchOptions {
  keyword: string;
  page?: number;
  pageSize?: number;
  /** `general` | `time_descending` | `popularity_descending` */
  sort?: string;
  /** 0 = all, 1 = video, 2 = image+text */
  noteType?: number;
}

export interface XhsApiSearchResult {
  ok: boolean;
  status?: number;
  /** `signer-unavailable` | `sign-failed` | `http-error` | `bad-payload` | `network` */
  error?: string;
  /** Site-level code from the JSON envelope (e.g. -100 = risk control). */
  code?: number;
  items: Array<Record<string, any>>;
  searchId?: string;
  hasMore?: boolean;
}

export async function xhsSearchNotesViaApi(options: XhsApiSearchOptions): Promise<XhsApiSearchResult> {
  const w = window as any;
  let signer = w._webmsxyw;
  // The signer lives in the site's app bundle; on a cold page it can appear a
  // few seconds after readyState=complete. Poll briefly instead of failing.
  for (let i = 0; typeof signer !== "function" && i < 25; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    signer = (window as any)._webmsxyw;
  }
  if (typeof signer !== "function") {
    return { ok: false, error: "signer-unavailable", items: [] };
  }

  const uri = "/api/sns/web/v1/search/notes";
  const now = Date.now();
  // search_id: (timestamp << 64) + random, base36 — same shape the site uses.
  const searchId = ((BigInt(now) << BigInt(64)) + BigInt(Math.ceil(0x7ffffffe * Math.random()))).toString(36);

  const payload = {
    keyword: options.keyword,
    page: options.page ?? 1,
    page_size: options.pageSize ?? 20,
    search_id: searchId,
    sort: options.sort ?? "general",
    note_type: options.noteType ?? 0,
    ext_flags: [] as unknown[],
    image_formats: ["jpg", "webp", "avif"],
  };

  let signed: any;
  try {
    signed = signer(uri, payload);
  } catch {
    return { ok: false, error: "sign-failed", items: [] };
  }
  const xs = signed?.["X-s"] ?? signed?.xs;
  const xt = signed?.["X-t"] ?? signed?.xt;
  if (!xs || xt === undefined) {
    return { ok: false, error: "sign-failed", items: [] };
  }

  let response: Response;
  try {
    response = await fetch(uri, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json;charset=UTF-8",
        "x-s": String(xs),
        "x-t": String(xt),
      },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    return { ok: false, error: "network", items: [] };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, error: "http-error", items: [] };
  }

  let json: any;
  try {
    json = await response.json();
  } catch {
    return { ok: false, status: response.status, error: "bad-payload", items: [] };
  }

  // The site wraps everything in { success, code, data }. A risk-control
  // response has success=false and no data.items, which the caller treats as
  // "this channel is unusable right now" and falls back to the UI flow.
  const data = json?.data ?? json;
  const items: Array<Record<string, any>> = Array.isArray(data?.items) ? data.items : [];
  return {
    ok: json?.success !== false && response.ok,
    status: response.status,
    ...(typeof json?.code === "number" ? { code: json.code } : {}),
    items,
    searchId,
    hasMore: data?.has_more === true,
  };
}

export interface XhsApiDetailOptions {
  noteId: string;
  xsecToken?: string;
  xsecSource?: string;
}

export interface XhsApiDetailResult {
  ok: boolean;
  status?: number;
  error?: string;
  code?: number;
  note?: Record<string, any>;
}

export async function xhsGetNoteDetailViaApi(options: XhsApiDetailOptions): Promise<XhsApiDetailResult> {
  const w = window as any;
  let signer = w._webmsxyw;
  for (let i = 0; typeof signer !== "function" && i < 25; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    signer = (window as any)._webmsxyw;
  }
  if (typeof signer !== "function") {
    return { ok: false, error: "signer-unavailable" };
  }

  const uri = "/api/sns/web/v1/feed";
  const payload: Record<string, any> = {
    source_note_id: options.noteId,
    image_formats: ["jpg", "webp", "avif"],
    extra: { ab_impression_id: "" },
    xsec_source: options.xsecSource || "pc_search",
  };
  if (options.xsecToken) {
    payload.xsec_token = options.xsecToken;
  }

  let signed: any;
  try {
    signed = signer(uri, payload);
  } catch {
    return { ok: false, error: "sign-failed" };
  }
  const xs = signed?.["X-s"] ?? signed?.xs;
  const xt = signed?.["X-t"] ?? signed?.xt;
  if (!xs || xt === undefined) {
    return { ok: false, error: "sign-failed" };
  }

  let response: Response;
  try {
    response = await fetch(uri, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json;charset=UTF-8",
        "x-s": String(xs),
        "x-t": String(xt),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: "network" };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, error: "http-error" };
  }

  let json: any;
  try {
    json = await response.json();
  } catch {
    return { ok: false, status: response.status, error: "bad-payload" };
  }

  const data = json?.data ?? json;
  const items = Array.isArray(data?.items) ? data.items : [];
  const target = items.find((it: any) => {
    const card = it?.note_card ?? it;
    const id = card?.note_id ?? card?.noteId ?? card?.id ?? it?.id;
    return id === options.noteId;
  }) || items[0];

  const noteCard = target?.note_card ?? target;
  if (!noteCard || !target) {
    return {
      ok: false,
      status: response.status,
      code: json?.code,
      error: json?.msg || "empty-data",
    };
  }

  return {
    ok: json?.success !== false,
    status: response.status,
    code: json?.code,
    note: noteCard,
  };
}
