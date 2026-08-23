/**
 * Unit & Integration tests for P7.1: Browser Bridge Server, Handshake & Pairing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BridgeHostServer } from "../src/host/sources/bridge-server.ts";
import { BridgeClient } from "../src/host/sources/bridge-client.ts";
import { createBridgeRequest } from "../src/host/sources/bridge-protocol.ts";

test("P7.1 BridgeHostServer: issues and verifies 60s one-time pairing ticket", () => {
  const server = new BridgeHostServer();
  const ticket = server.issuePairingTicket();
  assert.ok(ticket && ticket.length > 10);

  // First verification should succeed and issue a long-term bridgeKey
  const res1 = server.verifyHandshake(ticket);
  assert.equal(res1.success, true);
  assert.ok(res1.newBridgeKey && res1.newBridgeKey.length > 20);

  // Second verification with the same ticket should fail (one-time use)
  const res2 = server.verifyHandshake(ticket);
  assert.equal(res2.success, false);

  // Long-term bridgeKey should be verified successfully
  const res3 = server.verifyHandshake(undefined, res1.newBridgeKey);
  assert.equal(res3.success, true);

  // Unknown bridgeKey should fail
  const res4 = server.verifyHandshake(undefined, "invalid-key-12345");
  assert.equal(res4.success, false);
});

test("P7.1 BridgeHostServer: request/response correlation with mock websocket", async () => {
  const server = new BridgeHostServer();

  let sentPayload: string | null = null;
  const mockWs = {
    send(data: string) {
      sentPayload = data;
    },
    close() {},
  };

  server.attachConnection(mockWs);
  assert.equal(server.isConnected(), true);

  const req = createBridgeRequest("auth.status", { platform: "xiaohongshu" });

  const promise = server.sendRequest(req, 1000);
  assert.ok(sentPayload);
  const parsed = JSON.parse(sentPayload!);
  assert.equal(parsed.id, req.id);
  assert.equal(parsed.kind, "auth.status");

  // Simulate Extension responding with correlation id
  server.handleIncomingMessage(JSON.stringify({
    id: req.id,
    kind: "result",
    payload: { authenticated: true, accountLabel: "小红书用户A" },
  }));

  const result: any = await promise;
  assert.equal(result.authenticated, true);
  assert.equal(result.accountLabel, "小红书用户A");
});

test("P7.1 BridgeHostServer: request timeout handling", async () => {
  const server = new BridgeHostServer();
  const mockWs = { send() {}, close() {} };
  server.attachConnection(mockWs);

  const req = createBridgeRequest("test.timeout");
  await assert.rejects(
    async () => {
      await server.sendRequest(req, 50); // 50ms timeout
    },
    /timed out/i,
  );
});

test("P7.1 BridgeClient: probeStatus returns disconnected when bridge is offline", async () => {
  const server = new BridgeHostServer();
  const client = new BridgeClient(server);

  const status = await client.probeStatus("xiaohongshu");
  assert.equal(status.bridgeConnected, false);
  assert.equal(status.authenticated, false);
});

test("P7.1 BridgeClient: handles auth.changed push notification from extension", async () => {
  const server = new BridgeHostServer();
  const mockWs = { send() {}, close() {} };
  server.attachConnection(mockWs);

  server.handleIncomingMessage(JSON.stringify({
    id: "random-id",
    kind: "auth.changed",
    payload: {
      platform: "x",
      authenticated: true,
      accountLabel: "@sama",
      accountId: "123456",
    },
  }));

  const cached = server.getAccountInfo("x");
  assert.equal(cached?.accountLabel, "@sama");
  assert.equal(cached?.accountId, "123456");

  // Session logged out notification
  server.handleIncomingMessage(JSON.stringify({
    id: "random-id-2",
    kind: "auth.changed",
    payload: {
      platform: "x",
      authenticated: false,
    },
  }));

  assert.equal(server.getAccountInfo("x"), undefined);
});
