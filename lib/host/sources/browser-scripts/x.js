export function extractVisibleXTweets() {
    function parseMetric(text) {
        if (!text)
            return undefined;
        const clean = text.trim().replace(/,/g, "");
        const matchNumber = clean.match(/([\d.]+)\s*([kKmM]?)/);
        if (!matchNumber)
            return undefined;
        const val = parseFloat(matchNumber[1]);
        const unit = matchNumber[2].toLowerCase();
        if (unit === "k")
            return Math.round(val * 1000);
        if (unit === "m")
            return Math.round(val * 1000000);
        return Math.round(val);
    }
    const results = [];
    const articles = Array.from(document.querySelectorAll("article[data-testid='tweet']"));
    for (const article of articles) {
        const timeEl = article.querySelector("time");
        const linkEl = timeEl ? timeEl.closest("a") : article.querySelector("a[href*='/status/']");
        if (!linkEl)
            continue;
        const href = linkEl.getAttribute("href") || "";
        const idMatch = href.match(/status\/(\d+)/);
        const id = idMatch ? idMatch[1] : href;
        const fullUrl = href.startsWith("http") ? href : `https://x.com${href}`;
        const textEl = article.querySelector("[data-testid='tweetText']");
        const text = textEl ? (textEl.textContent || "").trim() : "";
        const userEl = article.querySelector("[data-testid='User-Name']");
        let authorName;
        let authorHandle;
        if (userEl) {
            const userText = userEl.textContent || "";
            const handleMatch = userText.match(/@([a-zA-Z0-9_]+)/);
            if (handleMatch) {
                authorHandle = `@${handleMatch[1]}`;
            }
            const nameParts = userText.split("@");
            if (nameParts[0]) {
                authorName = nameParts[0].trim();
            }
        }
        const publishedAt = timeEl ? timeEl.getAttribute("datetime") || undefined : undefined;
        const likeBtn = article.querySelector("[data-testid='like']");
        const retweetBtn = article.querySelector("[data-testid='retweet']");
        const replyBtn = article.querySelector("[data-testid='reply']");
        const likes = likeBtn ? parseMetric(likeBtn.getAttribute("aria-label") || likeBtn.textContent || "") : undefined;
        const retweets = retweetBtn ? parseMetric(retweetBtn.getAttribute("aria-label") || retweetBtn.textContent || "") : undefined;
        const replies = replyBtn ? parseMetric(replyBtn.getAttribute("aria-label") || replyBtn.textContent || "") : undefined;
        const photoEls = Array.from(article.querySelectorAll("[data-testid='tweetPhoto'] img"));
        const mediaUrls = photoEls.map((img) => img.getAttribute("src") || "").filter(Boolean);
        if (text || id) {
            results.push({
                id,
                url: fullUrl,
                text,
                authorName,
                authorHandle,
                publishedAt,
                likes,
                retweets,
                replies,
                mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
            });
        }
    }
    return results;
}
