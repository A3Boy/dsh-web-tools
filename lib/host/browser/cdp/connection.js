import http from "node:http";
export async function fetchWebSocketDebuggerUrl(port, deadlineMs = 10000, signal) {
    const startTime = Date.now();
    const endpoint = `http://127.0.0.1:${port}/json/version`;
    while (Date.now() - startTime < deadlineMs) {
        if (signal?.aborted) {
            throw new Error("Aborted while waiting for CDP endpoint");
        }
        try {
            const res = await new Promise((resolve, reject) => {
                const req = http.get(endpoint, { timeout: 1000 }, (resp) => {
                    if (resp.statusCode && resp.statusCode >= 400) {
                        return reject(new Error(`HTTP ${resp.statusCode}`));
                    }
                    let data = "";
                    resp.on("data", (chunk) => (data += chunk));
                    resp.on("end", () => resolve(data));
                });
                req.on("error", reject);
                req.on("timeout", () => {
                    req.destroy();
                    reject(new Error("HTTP request timed out"));
                });
                if (signal) {
                    signal.addEventListener("abort", () => {
                        req.destroy();
                        reject(new Error("Aborted while waiting for CDP endpoint"));
                    }, { once: true });
                }
            });
            const parsed = JSON.parse(res);
            if (parsed && typeof parsed.webSocketDebuggerUrl === "string") {
                return parsed.webSocketDebuggerUrl;
            }
        }
        catch {
            // Retry after interval
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Timeout (${deadlineMs}ms) waiting for CDP /json/version on 127.0.0.1:${port}`);
}
