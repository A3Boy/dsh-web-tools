export function extractVisibleXhsSearch() {
    function parseCount(text) {
        if (!text)
            return undefined;
        const clean = text.trim().replace(/,/g, "");
        if (/^\d+$/.test(clean))
            return parseInt(clean, 10);
        const wanMatch = clean.match(/^([\d.]+)\s*[万wW]$/);
        if (wanMatch)
            return Math.round(parseFloat(wanMatch[1]) * 10000);
        const kMatch = clean.match(/^([\d.]+)\s*[kK]$/);
        if (kMatch)
            return Math.round(parseFloat(kMatch[1]) * 1000);
        return undefined;
    }
    const results = [];
    const noteElements = Array.from(document.querySelectorAll("section.note-item"));
    for (const el of noteElements) {
        const linkEl = el.querySelector("a.cover") || el.querySelector("a[href*='/search_result/']") || el.querySelector("a[href*='/explore/']");
        if (!linkEl)
            continue;
        const href = linkEl.getAttribute("href") || "";
        if (!href)
            continue;
        const fullUrl = href.startsWith("http") ? href : `https://www.xiaohongshu.com${href}`;
        const idMatch = href.match(/\/(?:search_result|explore)\/([a-zA-Z0-9]+)/);
        const id = idMatch ? idMatch[1] : href;
        const titleEl = el.querySelector(".title span") || el.querySelector(".footer .title") || el.querySelector(".title");
        const title = titleEl ? (titleEl.textContent || "").trim() : "";
        const authorEl = el.querySelector(".author-wrapper .name") || el.querySelector(".author .name") || el.querySelector(".name");
        const authorName = authorEl ? (authorEl.textContent || "").trim() : undefined;
        const authorLinkEl = el.querySelector(".author-wrapper a.author") || el.querySelector(".author a");
        const authorHref = authorLinkEl ? authorLinkEl.getAttribute("href") : undefined;
        const authorUrl = authorHref ? (authorHref.startsWith("http") ? authorHref : `https://www.xiaohongshu.com${authorHref}`) : undefined;
        const likeEl = el.querySelector(".like-wrapper .count") || el.querySelector(".count");
        const likes = likeEl ? parseCount(likeEl.textContent || "") : undefined;
        const imgEl = el.querySelector("img.cover") || el.querySelector("img");
        const coverImage = imgEl ? (imgEl.getAttribute("src") || imgEl.getAttribute("data-src") || undefined) : undefined;
        if (title || id) {
            results.push({
                id,
                title: title || "无标题笔记",
                url: fullUrl,
                snippet: title,
                authorName,
                authorUrl,
                likes,
                coverImage,
            });
        }
    }
    return results;
}
export function extractXhsNoteDetail() {
    const isSecurity = Boolean(document.querySelector(".security-verify") ||
        document.querySelector("#security-verify") ||
        document.title.includes("验证码") ||
        document.title.includes("安全验证"));
    if (isSecurity) {
        return { isBlocked: true };
    }
    const titleEl = document.querySelector("#detail-title") || document.querySelector(".title");
    const title = titleEl ? (titleEl.textContent || "").trim() : undefined;
    const descEl = document.querySelector("#detail-desc") || document.querySelector(".desc") || document.querySelector(".content");
    const text = descEl ? (descEl.textContent || "").trim() : undefined;
    const authorEl = document.querySelector(".author-container .name") || document.querySelector(".author .name");
    const authorName = authorEl ? (authorEl.textContent || "").trim() : undefined;
    const authorLinkEl = document.querySelector(".author-container a") || document.querySelector(".author a");
    const authorHref = authorLinkEl ? authorLinkEl.getAttribute("href") : undefined;
    const authorUrl = authorHref ? (authorHref.startsWith("http") ? authorHref : `https://www.xiaohongshu.com${authorHref}`) : undefined;
    const dateEl = document.querySelector(".date") || document.querySelector(".bottom-container .date");
    const publishedAt = dateEl ? (dateEl.textContent || "").trim() : undefined;
    const imgElements = Array.from(document.querySelectorAll(".note-slider img, .media-container img, .carousel img"));
    const images = imgElements
        .map((img) => img.getAttribute("src") || img.getAttribute("data-src") || "")
        .filter(Boolean);
    return {
        title,
        text,
        authorName,
        authorUrl,
        publishedAt,
        images: images.length > 0 ? images : undefined,
        isBlocked: false,
    };
}
