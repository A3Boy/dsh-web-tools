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

// Listen for cookie changes (login / logout) and push notice to Host
authManager.listenCookieChanges((platform, authenticated) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const notice: BridgeExtensionMessage = {
      id: crypto.randomUUID(),
      kind: "auth.changed",
      payload: {
        platform,
        authenticated,
        accountLabel: authenticated ? (platform === "xiaohongshu" ? "小红书账号 (已连接)" : "X 用户 (已连接)") : undefined,
        error: authenticated ? undefined : "Session expired or logged out in browser",
      },
    };
    ws.send(JSON.stringify(notice));
  }
});

async function broadcastInitialAuthState() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const xhs = await authManager.checkXiaohongshu();
  const x = await authManager.checkX();

  if (xhs.authenticated) {
    ws.send(JSON.stringify({
      id: crypto.randomUUID(),
      kind: "auth.changed",
      payload: { platform: "xiaohongshu", authenticated: true, accountLabel: xhs.accountLabel },
    }));
  }
  if (x.authenticated) {
    ws.send(JSON.stringify({
      id: crypto.randomUUID(),
      kind: "auth.changed",
      payload: { platform: "x", authenticated: true, accountLabel: x.accountLabel },
    }));
  }
}

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
    const { platform, query, maxResults = 10, hints } = (msg as any).payload;
    if (platform === "xiaohongshu") {
      let lease;
      try {
        const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}&source=web_search_result_notes`;
        lease = await tabLeaseManager.acquireWorkerTab(searchUrl);

        // Execute extraction script with incremental scrolling inside the target page tab
        const executionResults = await chrome.scripting.executeScript({
          target: { tabId: lease.tabId },
          func: async (limit: number) => {
            const results: Array<{ url: string; title: string; author?: string; likesText?: string }> = [];
            const seen = new Set<string>();

            const collect = () => {
              const sections = Array.from(document.querySelectorAll("section.note-item, section:has(a[href*='/search_result/']), section:has(a[href*='/explore/'])"));
              for (const sec of sections) {
                const linkEl = sec.querySelector("a[href*='/search_result/'], a[href*='/explore/']") as HTMLAnchorElement | null;
                const href = linkEl?.getAttribute("href") ?? "";
                if (!href) continue;
                const fullUrl = href.startsWith("http") ? href : `https://www.xiaohongshu.com${href.startsWith("/") ? "" : "/"}${href}`;
                if (seen.has(fullUrl)) continue;
                seen.add(fullUrl);

                const titleEl = sec.querySelector(".footer .title, .title, a.title, .name") as HTMLElement | null;
                const authorEl = sec.querySelector(".author, .name, .user-name") as HTMLElement | null;
                const likeEl = sec.querySelector(".like-wrapper .count, .count") as HTMLElement | null;

                results.push({
                  url: fullUrl,
                  title: titleEl?.textContent?.trim() || "小红书笔记",
                  author: authorEl?.textContent?.trim(),
                  likesText: likeEl?.textContent?.trim(),
                });
              }
            };

            collect();

            // Incremental scroll if more results are requested
            let scrolls = 0;
            while (results.length < limit && scrolls < 5) {
              window.scrollBy(0, window.innerHeight * 1.5);
              await new Promise((r) => setTimeout(r, 800));
              const prevLen = results.length;
              collect();
              if (results.length === prevLen) break;
              scrolls++;
            }

            return results.slice(0, limit);
          },
          args: [maxResults],
        });

        const rawList = executionResults?.[0]?.result ?? [];
        const sources = rawList.map((item: any) => ({
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
        const searchUrl = buildXSearchUrl(query, undefined, hints);
        lease = await tabLeaseManager.acquireWorkerTab(searchUrl);

        const executionResults = await chrome.scripting.executeScript({
          target: { tabId: lease.tabId },
          func: async (limit: number) => {
            const results: Array<{ url: string; text: string; author?: string; authorHandle?: string; likes?: string }> = [];
            const seen = new Set<string>();

            const collect = () => {
              const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
              for (const art of articles) {
                const linkEl = art.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
                const href = linkEl?.getAttribute("href") ?? "";
                if (!href) continue;
                const fullUrl = href.startsWith("http") ? href : `https://x.com${href.startsWith("/") ? "" : "/"}${href}`;
                if (seen.has(fullUrl)) continue;
                seen.add(fullUrl);

                const textEl = art.querySelector('[data-testid="tweetText"]');
                const text = textEl?.textContent?.trim() || "";
                const userNameEl = art.querySelector('[data-testid="User-Name"]');
                const authorText = userNameEl?.textContent || "";
                const handleMatch = authorText.match(/@([a-zA-Z0-9_]+)/);
                const authorHandle = handleMatch ? `@${handleMatch[1]}` : undefined;
                const author = authorText.split("@")[0]?.trim() || authorHandle;
                const likeEl = art.querySelector('[data-testid="like"]');

                results.push({
                  url: fullUrl,
                  text,
                  author,
                  authorHandle,
                  likes: likeEl?.textContent?.trim(),
                });
              }
            };

            collect();

            let scrolls = 0;
            while (results.length < limit && scrolls < 5) {
              window.scrollBy(0, window.innerHeight * 1.5);
              await new Promise((r) => setTimeout(r, 800));
              const prevLen = results.length;
              collect();
              if (results.length === prevLen) break;
              scrolls++;
            }

            return results.slice(0, limit);
          },
          args: [maxResults],
        });

        const rawList = executionResults?.[0]?.result ?? [];
        const sources = rawList.map((item: any) => ({
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

class ConnectionAttempt {
  public promise: Promise<void>;
  private resolve!: () => void;
  private reject!: (err: Error) => void;
  private pendingHelloId: string | null = null;
  private timer: any = null;
  private socket: WebSocket | null = null;
  private isSettled = false;

  constructor(public port: number, public ticket?: string, public bridgeKey?: string) {
    this.promise = new Promise<void>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }

  public async start(): Promise<void> {
    const url = `ws://127.0.0.1:${this.port}/web-tools/bridge/ws`;
    const socket = new WebSocket(url);
    this.socket = socket;
    ws = socket;

    this.timer = setTimeout(() => {
      this.fail(new Error("Handshake timeout after 8000ms"), true);
    }, 8000);

    socket.onopen = () => {
      startKeepAlive();
      this.pendingHelloId = crypto.randomUUID();
      const hello: BridgeExtensionMessage = {
        id: this.pendingHelloId,
        kind: "hello",
        payload: {
          ticket: this.ticket,
          bridgeKey: this.bridgeKey,
          extensionVersion: EXTENSION_VERSION,
        },
      };
      socket.send(JSON.stringify(hello));
    };

    socket.onmessage = async (event) => {
      try {
        const msg: any = JSON.parse(event.data);

        // Strict Hello matching: msg.id MUST match pendingHelloId
        if (msg.kind === "result" && msg.id === this.pendingHelloId && msg.payload?.paired) {
          this.succeed(msg.payload.bridgeKey);
          return;
        }

        if (msg.kind === "error" && msg.id === this.pendingHelloId) {
          this.fail(new Error(msg.error?.message ?? "Handshake rejected by Host"), true);
          return;
        }

        await handleHostMessage(msg);
      } catch {
        // Ignore malformed frame
      }
    };

    socket.onclose = () => {
      this.fail(new Error("WebSocket closed before handshake"), false);
      stopKeepAlive();
      if (ws === socket) {
        ws = null;
      }
      currentAttempt = null;

      // Auto-reconnect after 3s ONLY if already paired with a valid bridgeKey
      setTimeout(() => {
        reconnectFromStorage().catch(() => {});
      }, 3000);
    };

    socket.onerror = () => {
      this.fail(new Error("WebSocket connection error"), true);
    };
  }

  public cancel(): void {
    this.fail(new Error("Connection attempt preempted by new pairing ticket"), true);
  }

  private async succeed(newBridgeKey?: string): Promise<void> {
    if (this.isSettled) return;
    this.isSettled = true;
    clearTimeout(this.timer);

    const toSave: Record<string, any> = { dshPort: this.port };
    if (newBridgeKey) {
      toSave.bridgeKey = newBridgeKey;
    }
    await chrome.storage.local.set(toSave);

    this.resolve();
    currentAttempt = null;
    await broadcastInitialAuthState();
  }

  private fail(err: Error, closeSocket: boolean): void {
    if (this.isSettled) return;
    this.isSettled = true;
    clearTimeout(this.timer);
    if (closeSocket && this.socket) {
      try { this.socket.close(); } catch {}
    }
    this.reject(err);
    currentAttempt = null;
  }
}

let currentAttempt: ConnectionAttempt | null = null;

/**
 * Reconnect to DSH Host only if a durable pairing bridgeKey already exists.
 */
export async function reconnectFromStorage(): Promise<void> {
  const stored = await chrome.storage.local.get(["bridgeKey", "dshPort"]);
  if (!stored.bridgeKey) {
    // Unpaired extension must NOT spam unauthenticated handshakes
    return;
  }
  return connectToHost(stored.dshPort, undefined);
}

/**
 * Connect to DSH Local WebSocket Server and await verified handshake.
 */
export async function connectToHost(port?: number, ticket?: string): Promise<void> {
  // If a ticket is provided for pairing, it takes precedence over any pending idle reconnect
  if (ticket && currentAttempt) {
    currentAttempt.cancel();
    currentAttempt = null;
  } else if (currentAttempt) {
    return currentAttempt.promise;
  }

  const stored = await chrome.storage.local.get(["bridgeKey", "dshPort"]);
  const activePort = port || stored.dshPort || 3080;
  const bridgeKey = stored.bridgeKey;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    try { ws.close(); } catch {}
    ws = null;
  }

  const attempt = new ConnectionAttempt(activePort, ticket, bridgeKey);
  currentAttempt = attempt;
  void attempt.start();
  return attempt.promise;
}

// Listen for messages from pairing-relay content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "DSH_BRIDGE_CONNECT") {
    const { port, ticket } = message;
    connectToHost(port, ticket)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async sendResponse
  }
});

// Auto-connect on Service Worker boot & startup ONLY if already paired
chrome.runtime.onStartup.addListener(() => {
  reconnectFromStorage().catch(() => {});
});
reconnectFromStorage().catch(() => {});
