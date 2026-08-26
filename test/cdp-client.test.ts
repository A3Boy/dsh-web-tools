import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { WebSocketServer, WebSocket } from "ws";
import { CdpClient } from "../src/host/browser/cdp/client.ts";
import { CdpError } from "../src/host/browser/cdp/errors.ts";

test("CdpClient: handles request/response correlation, events, and errors", async () => {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString("utf8"));
      if (msg.method === "Target.createTarget") {
        ws.send(JSON.stringify({ id: msg.id, result: { targetId: "target-123" } }));
      } else if (msg.method === "Runtime.evaluate" && msg.params?.expression === "throwError") {
        ws.send(
          JSON.stringify({
            id: msg.id,
            error: { code: -32000, message: "Server Evaluation Failed" },
          }),
        );
      } else if (msg.method === "TriggerEvent") {
        ws.send(
          JSON.stringify({
            method: "Page.loadEventFired",
            params: { timestamp: 12345 },
            sessionId: msg.sessionId,
          }),
        );
        ws.send(JSON.stringify({ id: msg.id, result: { ok: true } }));
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as any).port;

  const client = new CdpClient(`ws://127.0.0.1:${port}`);
  await client.connect();

  // 1. Correlated response
  const targetRes = await client.send<{ targetId: string }>("Target.createTarget");
  assert.equal(targetRes.targetId, "target-123");

  // 2. CDP Error response
  await assert.rejects(
    async () => client.send("Runtime.evaluate", { expression: "throwError" }),
    CdpError,
  );

  // 3. Event listener
  let eventReceived = false;
  const off = client.on("Page.loadEventFired", (params) => {
    if (params.timestamp === 12345) {
      eventReceived = true;
    }
  });

  await client.send("TriggerEvent", {}, "session-abc");
  assert.ok(eventReceived);
  off();

  // 4. Socket close cleanup rejects pending
  const pendingPromise = client.send("NeverEndingCommand", {}, undefined, undefined, 5000);
  client.close();
  await assert.rejects(async () => pendingPromise, /CDP WebSocket connection closed/i);

  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("CdpClient: AbortSignal rejects immediately", async () => {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as any).port;

  const client = new CdpClient(`ws://127.0.0.1:${port}`);
  await client.connect();

  const controller = new AbortController();
  const p = client.send("SlowCommand", {}, undefined, controller.signal, 10000);
  controller.abort();

  await assert.rejects(async () => p, /CDP command aborted/i);

  client.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
