import assert from "node:assert/strict";
import test from "node:test";
import { CdpPage } from "../src/host/browser/cdp/page.ts";
import type { CdpPageLease, NetworkCaptureOutcome } from "../src/host/browser/types.ts";

// ---------------------------------------------------------------------------
// Minimal fake CDP client that records sent commands and dispatches events.
// The real CdpClient.on() returns an unsubscribe function; we replicate that.
// ---------------------------------------------------------------------------
interface Listener {
  eventName: string;
  fn: (params: any, sessionId?: string) => void;
}
class FakeClient {
  readonly sent: Array<{ method: string; params: any; sessionId?: string }> = [];
  private listeners = new Map<string, Listener[]>();
  private nextId = 1;

  /** Pre-configured canned responses keyed by method name. */
  responses = new Map<string, any>();

  async send<T = any>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    _signal?: AbortSignal,
    _timeoutMs?: number,
  ): Promise<T> {
    this.sent.push({ method, params, sessionId });
    if (this.responses.has(method)) {
      return this.responses.get(method) as T;
    }
    // Unknown method → simulate a CDP error so callers can distinguish
    // "body-unavailable" from "invalid-json".
    throw new Error(`No canned response for CDP method "${method}"`);
  }

  on(eventName: string, listener: (params: any, sessionId?: string) => void): () => void {
    const entry: Listener = { eventName, fn: listener };
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, []);
    this.listeners.get(eventName)!.push(entry);
    return () => {
      const arr = this.listeners.get(eventName);
      if (arr) {
        const idx = arr.indexOf(entry);
        if (idx !== -1) arr.splice(idx, 1);
      }
    };
  }

  /** Dispatch an event to all registered listeners for that event name. */
  emit(eventName: string, params: any, sessionId?: string): void {
    const arr = this.listeners.get(eventName);
    if (arr) {
      for (const { fn } of arr) {
        try { fn(params, sessionId); } catch { /* no-op */ }
      }
    }
  }

  /** Number of active listeners for a given event. */
  listenerCount(eventName: string): number {
    return (this.listeners.get(eventName) || []).length;
  }
}

// ---------------------------------------------------------------------------
// Helper: create a CdpPage backed by a FakeClient.
// ---------------------------------------------------------------------------
function makePage(fake: FakeClient, targetId = "t1", sessionId = "s1"): CdpPageLease {
  return new CdpPage(targetId, sessionId, fake as any, async () => {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("beginJsonCapture: calls Network.enable on the correct session", async () => {
  const fake = new FakeClient();
  const page = makePage(fake);
  fake.responses.set("Network.enable", {});

  const handle = await page.beginJsonCapture({ urlIncludes: "/SearchTimeline" });
  handle.cancel();

  const enableCalls = fake.sent.filter((s) => s.method === "Network.enable");
  assert.equal(enableCalls.length, 1);
  assert.equal(enableCalls[0].sessionId, "s1");
});

test("CdpPage input helpers use browser-level CDP text, key, and mouse events", async () => {
  const fake = new FakeClient();
  const page = makePage(fake);
  fake.responses.set("Input.insertText", {});
  fake.responses.set("Input.dispatchKeyEvent", {});
  fake.responses.set("Input.dispatchMouseEvent", {});
  fake.responses.set("Runtime.evaluate", { result: { value: { x: 10, y: 20 }, type: "object" } });

  await page.insertText("DeepSeek Harness");
  await page.pressKey("Enter");
  assert.equal(await page.click(".search-icon"), true);

  assert.equal(fake.sent.filter((entry) => entry.method === "Input.insertText").length, 1);
  assert.deepEqual(
    fake.sent.filter((entry) => entry.method === "Input.dispatchKeyEvent").map((entry) => entry.params.type),
    ["keyDown", "keyUp"],
  );
  assert.deepEqual(
    fake.sent.filter((entry) => entry.method === "Input.dispatchMouseEvent").map((entry) => entry.params.type),
    ["mouseMoved", "mousePressed", "mouseReleased"],
  );
});

test("beginJsonCapture: captures a matching response", async () => {
  const fake = new FakeClient();
  const page = makePage(fake);
  fake.responses.set("Network.enable", {});
  fake.responses.set("Network.getResponseBody", {
    body: '{"results":[{"id":"123"}]}',
    base64Encoded: false,
  });

  const handle = await page.beginJsonCapture({ urlIncludes: "/SearchTimeline", timeoutMs: 3000 });

  // Simulate SearchTimeline request being fired
  fake.emit("Network.responseReceived", {
    requestId: "req1",
    response: { url: "https://x.com/i/api/graphql/abc/SearchTimeline", status: 200 },
  }, "s1");

  // Simulate the response body being fully loaded
  fake.emit("Network.loadingFinished", { requestId: "req1" }, "s1");

  const outcome = await handle.wait();
  assert.equal(outcome.state, "captured");
  if (outcome.state === "captured") {
    assert.deepEqual(outcome.json, { results: [{ id: "123" }] });
    assert.equal(outcome.url, "https://x.com/i/api/graphql/abc/SearchTimeline");
    assert.equal(outcome.status, 200);
  }
});

test("beginJsonCapture: ignores events from other sessions", async () => {
  const fake = new FakeClient();
  const page = makePage(fake, "t1", "s1");
  fake.responses.set("Network.enable", {});

  const handle = await page.beginJsonCapture({ urlIncludes: "/SearchTimeline", timeoutMs: 200 });

  // Same requestId but from a DIFFERENT session — must be ignored
  fake.emit("Network.responseReceived", {
    requestId: "req1",
    response: { url: "https://x.com/i/api/graphql/abc/SearchTimeline", status: 200 },
  }, "s2"); // ← wrong session

  fake.emit("Network.loadingFinished", { requestId: "req1" }, "s2"); // ← wrong session

  const outcome = await handle.wait();
  assert.equal(outcome.state, "timeout", "Different session must not trigger capture");
});

test("beginJsonCapture: times out when no matching response arrives", async () => {
  const fake = new FakeClient();
  const page = makePage(fake);
  fake.responses.set("Network.enable", {});

  const handle = await page.beginJsonCapture({ urlIncludes: "/SearchTimeline", timeoutMs: 100 });
  const outcome = await handle.wait();
  assert.equal(outcome.state, "timeout");
});

test("beginJsonCapture: resolves invalid-json when body is not valid JSON", async () => {
  const fake = new FakeClient();
  const page = makePage(fake);
  fake.responses.set("Network.enable", {});
  fake.responses.set("Network.getResponseBody", {
    body: "this is not json",
    base64Encoded: false,
  });

  const handle = await page.beginJsonCapture({ urlIncludes: "/SearchTimeline", timeoutMs: 500 });

  fake.emit("Network.responseReceived", {
    requestId: "req1",
    response: { url: "https://x.com/i/api/graphql/abc/SearchTimeline", status: 200 },
  }, "s1");

  fake.emit("Network.loadingFinished", { requestId: "req1" }, "s1");

  const outcome = await handle.wait();
  assert.equal(outcome.state, "invalid-json");
});

test("beginJsonCapture: resolves body-unavailable when getResponseBody throws", async () => {
  const fake = new FakeClient();
  const page = makePage(fake);
  fake.responses.set("Network.enable", {});

  // getResponseBody will throw because there's no response configured for it
  const handle = await page.beginJsonCapture({ urlIncludes: "/SearchTimeline", timeoutMs: 500 });

  fake.emit("Network.responseReceived", {
    requestId: "req1",
    response: { url: "https://x.com/i/api/graphql/abc/SearchTimeline", status: 200 },
  }, "s1");

  fake.emit("Network.loadingFinished", { requestId: "req1" }, "s1");

  const outcome = await handle.wait();
  assert.equal(outcome.state, "body-unavailable");
});

test("beginJsonCapture: abort signal cancels pending capture", async () => {
  const fake = new FakeClient();
  const page = makePage(fake);
  fake.responses.set("Network.enable", {});
  const ac = new AbortController();

  const handle = await page.beginJsonCapture({ urlIncludes: "/SearchTimeline", timeoutMs: 3000, signal: ac.signal });
  ac.abort();

  const outcome = await handle.wait();
  assert.equal(outcome.state, "aborted");
});

test("CdpPage: navigate triggers validateNavigation guard before sending CDP command", async () => {
  const fake = new FakeClient();
  let validatedUrl = "";
  const page = new CdpPage("t1", "s1", fake as any, async () => {}, (url) => {
    validatedUrl = url;
    if (!url.startsWith("https://x.com/")) {
      throw new Error("Disallowed URL: " + url);
    }
  });

  // Valid navigation
  fake.responses.set("Page.enable", {});
  fake.responses.set("Runtime.enable", {});
  fake.responses.set("Page.navigate", {});
  fake.responses.set("Runtime.evaluate", { result: { value: true } });

  await page.navigate("https://x.com/search?q=test");
  assert.equal(validatedUrl, "https://x.com/search?q=test");

  // Invalid navigation throws before CDP calls
  await assert.rejects(
    async () => {
      await page.navigate("https://evil.com");
    },
    /Disallowed URL: https:\/\/evil.com/,
  );
});

test("beginJsonCapture: cancel removes listeners", async () => {
  const fake = new FakeClient();
  const page = makePage(fake);
  fake.responses.set("Network.enable", {});

  const handle = await page.beginJsonCapture({ urlIncludes: "/SearchTimeline", timeoutMs: 3000 });
  const respCountBefore = fake.listenerCount("Network.responseReceived");
  const loadCountBefore = fake.listenerCount("Network.loadingFinished");
  assert.equal(respCountBefore, 1);
  assert.equal(loadCountBefore, 1);

  handle.cancel();

  // After cancel, listeners should be removed
  const respCountAfter = fake.listenerCount("Network.responseReceived");
  const loadCountAfter = fake.listenerCount("Network.loadingFinished");
  assert.equal(respCountAfter, 0);
  assert.equal(loadCountAfter, 0);
});

test("beginJsonCapture: base64-encoded body is decoded", async () => {
  const fake = new FakeClient();
  const page = makePage(fake);
  fake.responses.set("Network.enable", {});
  const b64 = Buffer.from('{"ok":true}', "utf8").toString("base64");
  fake.responses.set("Network.getResponseBody", {
    body: b64,
    base64Encoded: true,
  });

  const handle = await page.beginJsonCapture({ urlIncludes: "/SearchTimeline", timeoutMs: 500 });

  fake.emit("Network.responseReceived", {
    requestId: "req1",
    response: { url: "https://x.com/i/api/graphql/abc/SearchTimeline", status: 200 },
  }, "s1");

  fake.emit("Network.loadingFinished", { requestId: "req1" }, "s1");

  const outcome = await handle.wait();
  assert.equal(outcome.state, "captured");
  if (outcome.state === "captured") {
    assert.deepEqual(outcome.json, { ok: true });
  }
});

test("beginJsonCapture: first matching response wins (multiple requests)", async () => {
  const fake = new FakeClient();
  const page = makePage(fake);
  fake.responses.set("Network.enable", {});
  fake.responses.set("Network.getResponseBody", {
    body: '{"first":true}',
    base64Encoded: false,
  });

  const handle = await page.beginJsonCapture({ urlIncludes: "/SearchTimeline", timeoutMs: 1000 });

  // First request
  fake.emit("Network.responseReceived", {
    requestId: "req1",
    response: { url: "https://x.com/i/api/graphql/abc/SearchTimeline?cursor=A", status: 200 },
  }, "s1");
  fake.emit("Network.loadingFinished", { requestId: "req1" }, "s1");

  // Second request (should be ignored since already settled)
  fake.emit("Network.responseReceived", {
    requestId: "req2",
    response: { url: "https://x.com/i/api/graphql/abc/SearchTimeline?cursor=B", status: 200 },
  }, "s1");
  fake.emit("Network.loadingFinished", { requestId: "req2" }, "s1");

  const outcome = await handle.wait();
  assert.equal(outcome.state, "captured");
  if (outcome.state === "captured") {
    assert.deepEqual(outcome.json, { first: true });
  }
});
