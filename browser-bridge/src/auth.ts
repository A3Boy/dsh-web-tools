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
   * Check if Xiaohongshu session is present across root and subdomains.
   */
  public async checkXiaohongshu(): Promise<AccountSummary> {
    try {
      // 1. Try URL match
      let cookie = await chrome.cookies.get({
        url: "https://www.xiaohongshu.com",
        name: "web_session",
      });

      // 2. Try domain wildcard match if URL match was empty
      if (!cookie || !cookie.value) {
        const list = await chrome.cookies.getAll({
          domain: "xiaohongshu.com",
          name: "web_session",
        });
        if (list && list.length > 0) {
          cookie = list[0];
        }
      }

      if (!cookie || !cookie.value) {
        return { authenticated: false };
      }

      return {
        authenticated: true,
        accountLabel: "小红书账号 (已连接)",
      };
    } catch {
      return { authenticated: false };
    }
  }

  /**
   * Check if Twitter / X session is present across root and subdomains.
   */
  public async checkX(): Promise<AccountSummary> {
    try {
      let authToken = await chrome.cookies.get({
        url: "https://x.com",
        name: "auth_token",
      });
      let ct0 = await chrome.cookies.get({
        url: "https://x.com",
        name: "ct0",
      });

      if (!authToken?.value) {
        const list = await chrome.cookies.getAll({ domain: "x.com", name: "auth_token" });
        if (list && list.length > 0) authToken = list[0];
      }
      if (!ct0?.value) {
        const list = await chrome.cookies.getAll({ domain: "x.com", name: "ct0" });
        if (list && list.length > 0) ct0 = list[0];
      }

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
   * Register cookie change listener to notify Host when user logs in OR logs out.
   */
  public listenCookieChanges(onChanged: (platform: "xiaohongshu" | "x", authenticated: boolean) => void): () => void {
    const listener = (changeInfo: chrome.cookies.CookieChangeInfo) => {
      const { cookie, removed } = changeInfo;
      const dom = cookie.domain || "";

      if (dom.includes("xiaohongshu.com") && cookie.name === "web_session") {
        onChanged("xiaohongshu", !removed && Boolean(cookie.value));
      } else if ((dom.includes("x.com") || dom.includes("twitter.com")) && (cookie.name === "auth_token" || cookie.name === "ct0")) {
        // When auth_token or ct0 changes, check if both exist
        this.checkX().then((res) => {
          onChanged("x", res.authenticated);
        }).catch(() => {});
      }
    };

    chrome.cookies.onChanged.addListener(listener);
    return () => chrome.cookies.onChanged.removeListener(listener);
  }
}
