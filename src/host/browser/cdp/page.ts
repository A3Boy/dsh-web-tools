import type { CdpPageLease, JsonCaptureHandle, NetworkCaptureOptions, NetworkCaptureOutcome } from "../types.ts";
import { CdpClient } from "./client.ts";
import { NavigationTimeoutError, SelectorTimeoutError } from "./errors.ts";

export class CdpPage implements CdpPageLease {
  public readonly targetId: string;
  public readonly sessionId: string;
  private readonly client: CdpClient;
  private readonly onClose: () => Promise<void>;
  private readonly validateNavigation?: (url: string) => void;

  constructor(
    targetId: string,
    sessionId: string,
    client: CdpClient,
    onClose: () => Promise<void>,
    validateNavigation?: (url: string) => void,
  ) {
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.client = client;
    this.onClose = onClose;
    this.validateNavigation = validateNavigation;
  }

  async navigate(url: string, signal?: AbortSignal): Promise<void> {
    this.validateNavigation?.(url);

    await this.client.send("Page.enable", {}, this.sessionId, signal);
    await this.client.send("Runtime.enable", {}, this.sessionId, signal);

    // Send the navigation command but don't wait for Page.loadEventFired
    // (SPA pages like XHS may not fire it reliably on re-used sessions).
    await this.client.send("Page.navigate", { url }, this.sessionId, signal, 30000);

    // Poll for a usable readyState (handles SPA that never fires loadEventFired)
    const start = Date.now();
    const timeoutMs = 15000;
    while (Date.now() - start < timeoutMs) {
      if (signal?.aborted) throw new Error("navigate aborted");
      try {
        const ready = await this.evaluate<boolean>("document.readyState === 'complete' || document.readyState === 'interactive'");
        if (ready) return;
      } catch {
        // Page context may not be ready yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    // Timeout, but don't throw — the page may still be usable
  }

  async waitForLoad(signal?: AbortSignal): Promise<void> {
    // Check if document.readyState is complete
    const isComplete = await this.evaluate<boolean>(
      "document.readyState === 'complete'",
      signal,
    );
    if (isComplete) return;

    const start = Date.now();
    const timeoutMs = 15000;
    while (Date.now() - start < timeoutMs) {
      if (signal?.aborted) throw new Error("waitForLoad aborted");
      const ready = await this.evaluate<boolean>(
        "document.readyState === 'complete'",
        signal,
      );
      if (ready) return;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async waitForSelector(
    selector: string,
    timeoutMs = 15000,
    signal?: AbortSignal,
  ): Promise<void> {
    const start = Date.now();
    const expr = `Boolean(document.querySelector(${JSON.stringify(selector)}))`;

    while (Date.now() - start < timeoutMs) {
      if (signal?.aborted) throw new Error("waitForSelector aborted");
      const found = await this.evaluate<boolean>(expr, signal);
      if (found) return;
      await new Promise((r) => setTimeout(r, 250));
    }

    throw new SelectorTimeoutError(selector, timeoutMs);
  }

  async evaluate<T>(expression: string, signal?: AbortSignal): Promise<T> {
    const res = await this.client.send<{
      result: { value: T; type: string };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    }>(
      "Runtime.evaluate",
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
      },
      this.sessionId,
      signal,
    );

    if (res.exceptionDetails) {
      const desc =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        "Evaluation exception";
      throw new Error(`Runtime.evaluate failed: ${desc}`);
    }

    return res.result?.value;
  }

  async call<T>(
    fn: (...args: any[]) => T,
    args: unknown[] = [],
    signal?: AbortSignal,
  ): Promise<T> {
    const fnSource = fn.toString();
    const serializedArgs = JSON.stringify(args);
    const expression = `(${fnSource})(...${serializedArgs})`;
    return this.evaluate<T>(expression, signal);
  }

  async scrollBy(pixels: number, signal?: AbortSignal): Promise<void> {
    await this.evaluate(`window.scrollBy({ top: ${pixels}, behavior: 'smooth' })`, signal);
    await new Promise((r) => setTimeout(r, 400));
  }

  /**
   * Install a JSON network capture BEFORE navigation, scoped to THIS page
   * session (flattened sessions on the same browser must never leak into each
   * other). Flow: Network.enable → responseReceived (match url substring) →
   * loadingFinished (same requestId) → Network.getResponseBody → JSON.parse.
   */
  async beginJsonCapture(options: NetworkCaptureOptions): Promise<JsonCaptureHandle> {
    const { urlIncludes, timeoutMs = 6000, signal } = options;

    // Enable the Network domain on this page session BEFORE any navigation —
    // X's SPA fires SearchTimeline immediately after the page boots, so a late
    // Network.enable misses the request entirely.
    await this.client.send("Network.enable", {}, this.sessionId, signal);

    let settled: NetworkCaptureOutcome | null = null;
    let resolveWait: ((outcome: NetworkCaptureOutcome) => void) | null = null;
    let timer: NodeJS.Timeout | undefined;
    const cleanupFns: Array<() => void> = [];

    const latestForRequest = new Map<string, { url: string; status: number }>();

    const settle = (outcome: NetworkCaptureOutcome) => {
      if (settled) return;
      settled = outcome;
      if (timer) clearTimeout(timer);
      for (const fn of cleanupFns) fn();
      if (resolveWait) {
        const r = resolveWait;
        resolveWait = null;
        r(outcome);
      }
    };

    const unsubResponse = this.client.on(
      "Network.responseReceived",
      (params: any, eventSessionId?: string) => {
        if (settled) return;
        if (eventSessionId !== this.sessionId) return;
        const url: string = params?.response?.url || "";
        if (!url.includes(urlIncludes)) return;
        latestForRequest.set(params?.requestId, {
          url,
          status: params?.response?.status ?? 0,
        });
      },
    );
    cleanupFns.push(unsubResponse);

    const unsubLoading = this.client.on(
      "Network.loadingFinished",
      async (params: any, eventSessionId?: string) => {
        if (settled) return;
        if (eventSessionId !== this.sessionId) return;
        const requestId: string = params?.requestId;
        if (!requestId || !latestForRequest.has(requestId)) return;

        const matched = latestForRequest.get(requestId)!;
        let outcome: NetworkCaptureOutcome;
        try {
          const body = await this.client.send<{ body: string; base64Encoded: boolean }>(
            "Network.getResponseBody",
            { requestId },
            this.sessionId,
            signal,
          );
          const raw = body.base64Encoded
            ? Buffer.from(body.body, "base64").toString("utf8")
            : body.body;
          try {
            outcome = { state: "captured", json: JSON.parse(raw), url: matched.url, status: matched.status };
          } catch {
            outcome = { state: "invalid-json" };
          }
        } catch {
          outcome = { state: "body-unavailable" };
        }
        settle(outcome);
      },
    );
    cleanupFns.push(unsubLoading);

    if (timeoutMs > 0) {
      timer = setTimeout(() => settle({ state: "timeout" }), timeoutMs);
    }

    if (signal) {
      if (signal.aborted) {
        settle({ state: "aborted" });
      } else {
        const onAbort = () => settle({ state: "aborted" });
        signal.addEventListener("abort", onAbort, { once: true });
        cleanupFns.push(() => signal.removeEventListener("abort", onAbort));
      }
    }

    return {
      wait: () =>
        new Promise<NetworkCaptureOutcome>((resolve) => {
          if (settled) return resolve(settled);
          resolveWait = resolve;
        }),
      cancel: () => settle({ state: "timeout" }),
    };
  }

  async close(): Promise<void> {
    await this.onClose();
  }
}
