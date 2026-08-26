export function buildXhsNoteUrl(id, xsecToken) {
    const cleanId = (id || "").trim();
    const u = new URL(`/explore/${encodeURIComponent(cleanId)}`, "https://www.xiaohongshu.com");
    if (xsecToken) {
        u.searchParams.set("xsec_token", xsecToken);
        u.searchParams.set("xsec_source", "pc_feed");
    }
    return u.toString();
}
export function buildXhsSearchUrl(keyword) {
    const clean = keyword.trim();
    const u = new URL("/search_result", "https://www.xiaohongshu.com");
    u.searchParams.set("keyword", clean);
    u.searchParams.set("source", "web_search_result_notes");
    return u.toString();
}
