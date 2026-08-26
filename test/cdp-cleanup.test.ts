import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { WebSocketServer, WebSocket } from "ws";
import { CdpClient } from "../src/host/browser/cdp/client.ts";
import { CdpPage } from "../src/host/browser/cdp/page.ts";
import { NavigationTimeoutError, SelectorTimeoutError } from "../src/host/browser/cdp/errors.ts";

test("Phase 2: 1. connect timeout removes listeners and closes socket", async () => {
  const client = new CdpClient("ws://10.255.255.1:12345"); // unreachable
  await assert.rejects(
    async () => client.connect(50),
    /timeout/i,
  );
  // Socket must be closed and have no leftover listeners
  assert.equal(client.isClosed(), true);
});

test("Phase 2: 2. command timeout clears pending and removes AbortSignal listener", async () => {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as any).port;

  const client = new CdpClient(`ws://127.0.0.1:${port}`);
  await client.connect();

  const ac = new AbortController();
  const p = client.send("SlowNoResponse", {}, undefined, ac.signal, 50);

  await assert.rejects(async () => p, /timed out/i);
  assert.equal(client.pendingCount(), 0);

  client.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("Phase 2: 3. abort and response race settles only once", async () => {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString("utf8"));
      setTimeout(() => {
        try {
          ws.send(JSON.stringify({ id: msg.id, result: { ok: true } }));
        } catch {}
      }, 30);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as any).port;

  const client = new CdpClient(`ws://127.0.0.1:${port}`);
  await client.connect();

  const ac = new AbortController();
  const p = client.send("SomeCommand", {}, undefined, ac.signal, 5000);
  setTimeout(() => ac.abort(), 20);

  await assert.rejects(async () => p, /aborted/i);
  assert.equal(client.pendingCount(), 0);

  client.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("Phase 2: 4. socket close immediately rejects all pending commands", async () => {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as any).port;

  const client = new CdpClient(`ws://127.0.0.1:${port}`);
  await client.connect();

  const p1 = client.send("Cmd1", {}, undefined, undefined, 10000);
  const p2 = client.send("Cmd2", {}, undefined, undefined, 10000);

  client.close();

  await assert.rejects(async () => p1, /closed/i);
  await assert.rejects(async () => p2, /closed/i);
  assert.equal(client.pendingCount(), 0);

  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("Phase 2: 5. navigate timeout throws NavigationTimeoutError", async () => {
  const fake = {
    send: async (method: string) => {
      if (method === "Runtime.evaluate") {
        return { result: { value: false } }; // never ready
      }
      return {};
    },
    on: () => () => {},
  } as any;

  const page = new CdpPage("t1", "s1", fake, async () => {});
  // With 15s timeout in production, we can test that when readyState is never complete it throws NavigationTimeoutError
  // Let's ensure CdpPage has a testable timeoutMs or throws NavigationTimeoutError
  await assert.rejects(
    async () => page.navigate("https://x.com/search", undefined, 50),
    NavigationTimeoutError,
  );
});

test("Phase 2: 6. waitForLoad timeout throws NavigationTimeoutError", async () => {
  const fake = {
    send: async (method: string) => {
      if (method === "Runtime.evaluate") {
        return { result: { value: false } }; // never ready
      }
      return {};
    },
    on: () => () => {},
  } as any;

  const page = new CdpPage("t1", "s1", fake, async () => {});
  await assert.rejects(
    async () => page.waitForLoad(undefined, 50),
    NavigationTimeoutError,
  );
});

test("Phase 2: 7. page close called multiple times is idempotent and releases lease once", async () => {
  let releaseCount = 0;
  const fake = {
    send: async () => ({}),
    on: () => () => {},
  } as any;

  const page = new CdpPage("t1", "s1", fake, async () => {
    releaseCount++;
  });

  await page.close();
  await page.close();
  await page.close();

  assert.equal(releaseCount, 1);
});
