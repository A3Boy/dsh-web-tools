/**
 * dsh-web-tools — Pairing Relay Content Script for DSH Web UI.
 *
 * Injected strictly into loopback origins (http://localhost/*, http://127.0.0.1/*).
 * Listens for window.postMessage from DSH Web UI and relays pairing tickets
 * to the background service worker via chrome.runtime.sendMessage.
 */

window.addEventListener("message", (event) => {
  // Ensure message comes from same window and origin
  if (event.source !== window || event.origin !== window.location.origin) return;

  const data = event.data;
  if (data && data.type === "DSH_WEB_TOOLS_BRIDGE_PAIR") {
    const { ticket, port } = data;
    if (ticket) {
      chrome.runtime.sendMessage({
        type: "DSH_BRIDGE_CONNECT",
        ticket,
        port: port || (window.location.port ? Number(window.location.port) : 3080),
      }).then((res) => {
        window.postMessage({ type: "DSH_WEB_TOOLS_BRIDGE_PAIR_ACK", ok: true, res }, window.location.origin);
      }).catch((err) => {
        window.postMessage({ type: "DSH_WEB_TOOLS_BRIDGE_PAIR_ACK", ok: false, error: String(err) }, window.location.origin);
      });
    }
  }
});
