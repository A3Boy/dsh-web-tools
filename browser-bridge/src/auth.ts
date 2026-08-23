/**
 * dsh-web-tools — MV3 Browser Auth State Monitor.
 *
 * Checks cookies via `chrome.cookies` without exposing raw cookie secrets to Host.
 */

export interface AccountSummary {
  authenticated: boolean;
  accountLabel?: string;
  accountId?: string;
  avatarUrl?: string;
}

export class BrowserAuthManager {
  /**
   * Check if Xiaohongshu session is present.
   */
  public async checkXiaohongshu(): Promise<AccountSummary> {
    try {
      const cookie = await chrome.cookies.get({
        url: "https://www.xiaohongshu.com",
        name: "web_session",
      });

      if (!cookie || !cookie.value) {
        return { authenticated: false };
      }

      // Quick check passed, perform lightweight verification via creator profile if needed
      return {
        authenticated: true,
        accountLabel: "小红书账号 (已连接)",
      };
    } catch {
      return { authenticated: false };
    }
  }

  /**
   * Check if Twitter / X session is present.
   */
  public async checkX(): Promise<AccountSummary> {
    try {
      const authToken = await chrome.cookies.get({
        url: "https://x.com",
        name: "auth_token",
      });
      const ct0 = await chrome.cookies.get({
        url: "https://x.com",
        name: "ct0",
      });

      if (!authToken?.value || !ct0?.value) {
        return { authenticated: false };
      }

      return {
        authenticated: true,
        accountLabel: "X 用户 (已连接)",
      };
    } catch {
      return { authenticated: false };
    }
  }

  /**
   * Register cookie change listener to notify Host when user logs out.
   */
  public listenCookieChanges(onInvalidated: (platform: "xiaohongshu" | "x") => void): () => void {
    const listener = (changeInfo: chrome.cookies.CookieChangeInfo) => {
      const { cookie, removed } = changeInfo;
      if (removed) {
        if (cookie.domain.includes("xiaohongshu.com") && cookie.name === "web_session") {
          onInvalidated("xiaohongshu");
        } else if (cookie.domain.includes("x.com") && (cookie.name === "auth_token" || cookie.name === "ct0")) {
          onInvalidated("x");
        }
      }
    };

    chrome.cookies.onChanged.addListener(listener);
    return () => chrome.cookies.onChanged.removeListener(listener);
  }
}
