/**
 * dsh-web-tools — MV3 Extension Service Worker Bridge.
 *
 * Maintains WebSocket connection to localhost DSH Host, implements 20s keepalive,
 * and handles dispatch for platform search and fetch.
 */

import type { BridgeHostMessage, BridgeExtensionMessage, ExtensionResultMessage, ExtensionErrorMessage } from "./protocol.js";
import { TabLeaseManager } from "./tab-lease.js";
import { BrowserAuthManager } from "./auth.js";
import { parseXhsSearchDom, parseXhsNoteDetailDom } from "./sites/xiaohongshu.js";
import { buildXSearchUrl, parseXTweetDom } from "./sites/x.js";

let ws: WebSocket | null = null;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
const tabLeaseManager = new TabLeaseManager();
const authManager = new BrowserAuthManager();

const EXTENSION_VERSION = "0.2.0";

// Listen for cookie invalidation and push notice to Host
authManager.listenCookieChanges((platform) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const notice: BridgeExtensionMessage = {
      id: crypto.randomUUID(),
      kind: "auth.changed",
      payload: {
        platform,
        authenticated: false,
        error: "Session expired or logged out in browser",
      },
    };
    ws.send(JSON.stringify(notice));
  }
});

function startKeepAlive() {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  // Chrome 116+ keepalive: send ping every 20s to prevent MV3 SW dormancy
  keepAliveTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id: crypto.randomUUID(), kind: "ping" }));
    }
  }, 20000);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

/**
 * Handle incoming command from Host
 */
async function handleHostMessage(msg: BridgeHostMessage): Promise<void> {
  if (msg.kind === "ping") {
    ws?.send(JSON.stringify({ id: msg.id, kind: "pong" }));
    return;
  }

  if (msg.kind === "auth.status") {
    const { platform } = (msg as any).payload;
    const account = platform === "xiaohongshu"
      ? await authManager.checkXiaohongshu()
      : await authManager.checkX();

    const res: ExtensionResultMessage = {
      id: msg.id,
      kind: "result",
      payload: account,
    };
    ws?.send(JSON.stringify(res));
    return;
  }

  if (msg.kind === "auth.connect") {
    const { platform } = (msg as any).payload;
    const url = platform === "xiaohongshu"
      ? "https://creator.xiaohongshu.com/"
      : "https://x.com/i/flow/login";

    await tabLeaseManager.openLoginTab(url);

    const res: ExtensionResultMessage = {
      id: msg.id,
      kind: "result",
      payload: { status: "login_opened", url },
    };
    ws?.send(JSON.stringify(res));
    return;
  }

  if (msg.kind === "source.search") {
    const { platform, query, maxResults = 10 } = (msg as any).payload;
    if (platform === "xiaohongshu") {
      let lease;
      try {
        const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}&source=web_search_result_notes`;
        lease = await tabLeaseManager.acquireWorkerTab(searchUrl);

        // Execute extraction script inside the target page tab
        const executionResults = await chrome.scripting.executeScript({
          target: { tabId: lease.tabId },
          func: () => {
            // Evaluated in tab DOM context
            const sections = Array.from(document.querySelectorAll("section.note-item, section:has(a[href*='/search_result/']), section:has(a[href*='/explore/'])"));
            return sections.map((sec) => {
              const linkEl = sec.querySelector("a[href*='/search_result/'], a[href*='/explore/']") as HTMLAnchorElement | null;
              const href = linkEl?.getAttribute("href") ?? "";
              const fullUrl = href.startsWith("http") ? href : `https://www.xiaohongshu.com${href.startsWith("/") ? "" : "/"}${href}`;
              const titleEl = sec.querySelector(".footer .title, .title, a.title, .name") as HTMLElement | null;
              const authorEl = sec.querySelector(".author, .name, .user-name") as HTMLElement | null;
              const likeEl = sec.querySelector(".like-wrapper .count, .count") as HTMLElement | null;
              return {
                url: fullUrl,
                title: titleEl?.textContent?.trim() || "小红书笔记",
                author: authorEl?.textContent?.trim(),
                likesText: likeEl?.textContent?.trim(),
              };
            });
          },
        });

        const rawList = executionResults?.[0]?.result ?? [];
        const sources = rawList.slice(0, maxResults).map((item: any) => ({
          url: item.url,
          title: item.title,
          snippet: item.author ? `作者: ${item.author}${item.likesText ? ` | 👍 ${item.likesText}` : ""}` : undefined,
        }));

        ws?.send(JSON.stringify({
          id: msg.id,
          kind: "result",
          payload: { sources },
        }));
      } catch (err: unknown) {
        ws?.send(JSON.stringify({
          id: msg.id,
          kind: "error",
          error: { code: "SEARCH_FAILED", message: err instanceof Error ? err.message : String(err) },
        }));
      } finally {
        if (lease) await lease.release();
      }
      return;
    } else if (platform === "x") {
      let lease;
      try {
        const searchUrl = buildXSearchUrl(query);
        lease = await tabLeaseManager.acquireWorkerTab(searchUrl);

        const executionResults = await chrome.scripting.executeScript({
          target: { tabId: lease.tabId },
          func: () => {
            const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
            return articles.map((art) => {
              const linkEl = art.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
              const href = linkEl?.getAttribute("href") ?? "";
              const fullUrl = href.startsWith("http") ? href : `https://x.com${href.startsWith("/") ? "" : "/"}${href}`;
              const textEl = art.querySelector('[data-testid="tweetText"]');
              const text = textEl?.textContent?.trim() || "";
              const userNameEl = art.querySelector('[data-testid="User-Name"]');
              const authorText = userNameEl?.textContent || "";
              const handleMatch = authorText.match(/@([a-zA-Z0-9_]+)/);
              const authorHandle = handleMatch ? `@${handleMatch[1]}` : undefined;
              const author = authorText.split("@")[0]?.trim() || authorHandle;
              const likeEl = art.querySelector('[data-testid="like"]');
              return {
                url: fullUrl,
                text,
                author,
                authorHandle,
                likes: likeEl?.textContent?.trim(),
              };
            });
          },
        });

        const rawList = executionResults?.[0]?.result ?? [];
        const sources = rawList.slice(0, maxResults).map((item: any) => ({
          url: item.url,
          title: item.author ? `${item.author}${item.authorHandle ? ` (${item.authorHandle})` : ""}: ${item.text.slice(0, 80)}...` : item.text.slice(0, 80),
          snippet: item.text,
        }));

        ws?.send(JSON.stringify({
          id: msg.id,
          kind: "result",
          payload: { sources },
        }));
      } catch (err: unknown) {
        ws?.send(JSON.stringify({
          id: msg.id,
          kind: "error",
          error: { code: "SEARCH_FAILED", message: err instanceof Error ? err.message : String(err) },
        }));
      } finally {
        if (lease) await lease.release();
      }
      return;
    }
  }

  if (msg.kind === "source.fetch") {
    const { platform, url } = (msg as any).payload;
    if (platform === "xiaohongshu") {
      let lease;
      try {
        lease = await tabLeaseManager.acquireWorkerTab(url);
        const executionResults = await chrome.scripting.executeScript({
          target: { tabId: lease.tabId },
          func: () => {
            const container = document.querySelector("#noteContainer, .note-container, .note-detail-mask");
            const titleEl = (container ?? document).querySelector("#detail-title, .title, .note-content .title");
            const descEl = (container ?? document).querySelector("#detail-desc, .desc, .note-text, .content");
            const authorEl = (container ?? document).querySelector(".username, .author-name, .user-name");
            const dateEl = (container ?? document).querySelector(".date, .publish-date");
            return {
              title: titleEl?.textContent?.trim(),
              text: descEl?.textContent?.trim(),
              author: authorEl?.textContent?.trim(),
              publishedAt: dateEl?.textContent?.trim(),
            };
          },
        });

        const res = executionResults?.[0]?.result ?? {};
        ws?.send(JSON.stringify({
          id: msg.id,
          kind: "result",
          payload: {
            url,
            title: res.title,
            text: res.text,
            author: res.author,
            publishedAt: res.publishedAt,
          },
        }));
      } catch (err: unknown) {
        ws?.send(JSON.stringify({
          id: msg.id,
          kind: "error",
          error: { code: "FETCH_FAILED", message: err instanceof Error ? err.message : String(err) },
        }));
      } finally {
        if (lease) await lease.release();
      }
      return;
    } else if (platform === "x") {
      let lease;
      try {
        lease = await tabLeaseManager.acquireWorkerTab(url);
        const executionResults = await chrome.scripting.executeScript({
          target: { tabId: lease.tabId },
          func: () => {
            const mainTweet = document.querySelector('article[data-testid="tweet"]');
            const textEl = mainTweet?.querySelector('[data-testid="tweetText"]');
            const userNameEl = mainTweet?.querySelector('[data-testid="User-Name"]');
            const timeEl = mainTweet?.querySelector("time");
            return {
              text: textEl?.textContent?.trim(),
              author: userNameEl?.textContent?.trim(),
              publishedAt: timeEl?.getAttribute("datetime") || timeEl?.textContent?.trim(),
            };
          },
        });

        const res = executionResults?.[0]?.result ?? {};
        ws?.send(JSON.stringify({
          id: msg.id,
          kind: "result",
          payload: {
            url,
            title: res.author ? `${res.author} on X` : "Tweet",
            text: res.text,
            author: res.author,
            publishedAt: res.publishedAt,
          },
        }));
      } catch (err: unknown) {
        ws?.send(JSON.stringify({
          id: msg.id,
          kind: "error",
          error: { code: "FETCH_FAILED", message: err instanceof Error ? err.message : String(err) },
        }));
      } finally {
        if (lease) await lease.release();
      }
      return;
    }
  }

  // Fallback / unhandled
  const errRes: ExtensionErrorMessage = {
    id: msg.id,
    kind: "error",
    error: {
      code: "UNSUPPORTED_COMMAND",
      message: `Unknown command: ${(msg as any).kind}`,
    },
  };
  ws?.send(JSON.stringify(errRes));
}

/**
 * Connect to DSH Local WebSocket Server
 */
export async function connectToHost(port: number = 3080, ticket?: string): Promise<void> {
  const stored = await chrome.storage.local.get(["bridgeKey", "dshPort"]);
  const activePort = port || stored.dshPort || 3080;
  const bridgeKey = stored.bridgeKey;

  const url = `ws://127.0.0.1:${activePort}/web-tools/bridge/ws`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    startKeepAlive();
    // Send hello handshake
    const hello: BridgeExtensionMessage = {
      id: crypto.randomUUID(),
      kind: "hello",
      payload: {
        ticket,
        bridgeKey,
        extensionVersion: EXTENSION_VERSION,
      },
    };
    ws?.send(JSON.stringify(hello));
  };

  ws.onmessage = async (event) => {
    try {
      const msg: BridgeHostMessage = JSON.parse(event.data);
      await handleHostMessage(msg);
    } catch {
      // Malformed message
    }
  };

  ws.onclose = () => {
    stopKeepAlive();
    ws = null;
  };
}
