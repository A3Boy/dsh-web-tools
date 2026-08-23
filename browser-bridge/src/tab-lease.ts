/**
 * dsh-web-tools — MV3 Tab Lease Scheduler.
 *
 * Distinguishes between:
 * 1. Login Tabs: foreground, user-facing, user interacts.
 * 2. Worker Tabs: ephemeral, active: false, strictly lifecycle-managed by the bridge.
 */

export interface TabLease {
  tabId: number;
  release(): Promise<void>;
}

export class TabLeaseManager {
  private activeLeases = new Set<number>();

  /**
   * Wait for tab to complete loading.
   */
  public async waitForTabComplete(tabId: number, timeoutMs = 15000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(); // Timed out waiting, attempt extraction anyway
      }, timeoutMs);

      const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);

      // In case it's already complete
      chrome.tabs.get(tabId).then((tab) => {
        if (tab?.status === "complete") {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }).catch(() => {});
    });
  }

  /**
   * Acquire a background worker tab for execution and wait for it to load.
   */
  public async acquireWorkerTab(url: string): Promise<TabLease> {
    const tab = await chrome.tabs.create({
      url,
      active: false,
    });

    if (!tab.id) {
      throw new Error("Failed to create background worker tab");
    }

    const tabId = tab.id;
    this.activeLeases.add(tabId);

    // Wait for the page load before letting scripts execute
    await this.waitForTabComplete(tabId);

    return {
      tabId,
      release: async () => {
        this.activeLeases.delete(tabId);
        try {
          await chrome.tabs.remove(tabId);
        } catch {
          // Tab might have been closed already by the user
        }
      },
    };
  }

  /**
   * Open or focus a foreground tab for user login.
   */
  public async openLoginTab(url: string): Promise<number> {
    const tab = await chrome.tabs.create({
      url,
      active: true,
    });
    return tab.id ?? 0;
  }

  /**
   * Cleanup all worker leases if service worker shuts down or errors occur.
   */
  public async cleanup(): Promise<void> {
    for (const tabId of this.activeLeases) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // Ignore
      }
    }
    this.activeLeases.clear();
  }
}
