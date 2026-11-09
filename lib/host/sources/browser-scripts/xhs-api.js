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
export async function xhsSearchNotesViaApi(options) {
    const w = window;
    let signer = w._webmsxyw;
    // The signer lives in the site's app bundle; on a cold page it can appear a
    // few seconds after readyState=complete. Poll briefly instead of failing.
    for (let i = 0; typeof signer !== "function" && i < 25; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        signer = window._webmsxyw;
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
        ext_flags: [],
        image_formats: ["jpg", "webp", "avif"],
    };
    let signed;
    try {
        signed = signer(uri, payload);
    }
    catch {
        return { ok: false, error: "sign-failed", items: [] };
    }
    const xs = signed?.["X-s"] ?? signed?.xs;
    const xt = signed?.["X-t"] ?? signed?.xt;
    if (!xs || xt === undefined) {
        return { ok: false, error: "sign-failed", items: [] };
    }
    let response;
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
    }
    catch (err) {
        return { ok: false, error: "network", items: [] };
    }
    if (!response.ok) {
        return { ok: false, status: response.status, error: "http-error", items: [] };
    }
    let json;
    try {
        json = await response.json();
    }
    catch {
        return { ok: false, status: response.status, error: "bad-payload", items: [] };
    }
    // The site wraps everything in { success, code, data }. A risk-control
    // response has success=false and no data.items, which the caller treats as
    // "this channel is unusable right now" and falls back to the UI flow.
    const data = json?.data ?? json;
    const items = Array.isArray(data?.items) ? data.items : [];
    return {
        ok: json?.success !== false && response.ok,
        status: response.status,
        ...(typeof json?.code === "number" ? { code: json.code } : {}),
        items,
        searchId,
        hasMore: data?.has_more === true,
    };
}
