import type { CdpPageLease } from "../types.ts";
import { CdpClient } from "./client.ts";
import { NavigationTimeoutError, SelectorTimeoutError } from "./errors.ts";

export class CdpPage implements CdpPageLease {
  public readonly targetId: string;
  public readonly sessionId: string;
  private readonly client: CdpClient;
  private readonly onClose: () => Promise<void>;

  constructor(
    targetId: string,
    sessionId: string,
    client: CdpClient,
    onClose: () => Promise<void>,
  ) {
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.client = client;
    this.onClose = onClose;
  }

  async navigate(url: string, signal?: AbortSignal): Promise<void> {
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

  async close(): Promise<void> {
    await this.onClose();
  }
}
