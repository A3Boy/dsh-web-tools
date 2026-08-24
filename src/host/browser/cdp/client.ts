import { WebSocket } from "ws";
import { CdpError } from "./errors.ts";

export class CdpClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (val: any) => void;
      reject: (err: any) => void;
      timer?: NodeJS.Timeout;
      onAbort?: () => void;
      signal?: AbortSignal;
      settled?: boolean;
    }
  >();
  private eventListeners = new Map<
    string,
    Set<(params: unknown, sessionId?: string) => void>
  >();
  private closed = false;

  constructor(wsUrl: string | WebSocket) {
    if (typeof wsUrl === "string") {
      this.ws = new WebSocket(wsUrl);
      this.setupSocketHandlers();
    } else {
      this.ws = wsUrl;
      this.setupSocketHandlers();
    }
  }

  isClosed(): boolean {
    return this.closed || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING;
  }

  pendingCount(): number {
    return this.pending.size;
  }

  async connect(timeoutMs = 10000): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.ws.removeListener("open", onOpen);
        this.ws.removeListener("error", onError);
        this.ws.removeListener("close", onClose);
      };

      const onOpen = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const onError = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.close();
        reject(err);
      };

      const onClose = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.close();
        reject(new Error(`WebSocket closed before open: ${this.ws.url}`));
      };

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          this.close();
          reject(new Error(`WebSocket connection timeout to ${this.ws.url}`));
        }, timeoutMs);
      }

      this.ws.once("open", onOpen);
      this.ws.once("error", onError);
      this.ws.once("close", onClose);
    });
  }

  private setupSocketHandlers() {
    this.ws.on("message", (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString("utf8"));
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const req = this.pending.get(msg.id)!;
          if (req.settled) return;
          req.settled = true;
          this.pending.delete(msg.id);
          if (req.timer) clearTimeout(req.timer);
          if (req.signal && req.onAbort) {
            req.signal.removeEventListener("abort", req.onAbort);
          }

          if (msg.error) {
            req.reject(new CdpError(msg.error.code, msg.error.message));
          } else {
            req.resolve(msg.result);
          }
        } else if (msg.method) {
          const listeners = this.eventListeners.get(msg.method);
          if (listeners) {
            for (const listener of listeners) {
              try {
                listener(msg.params, msg.sessionId);
              } catch {
                // Ignore listener exceptions
              }
            }
          }
        }
      } catch {
        // Ignore unparseable message
      }
    });

    this.ws.on("close", () => {
      this.closed = true;
      for (const [id, req] of Array.from(this.pending.entries())) {
        this.pending.delete(id);
        if (req.settled) continue;
        req.settled = true;
        if (req.timer) clearTimeout(req.timer);
        if (req.signal && req.onAbort) {
          req.signal.removeEventListener("abort", req.onAbort);
        }
        req.reject(new Error("CDP WebSocket connection closed"));
      }
      this.pending.clear();
      const closeListeners = this.eventListeners.get("__cdp_close__");
      if (closeListeners) {
        for (const l of closeListeners) {
          try {
            l({});
          } catch {}
        }
      }
    });

    this.ws.on("error", () => {
      // WS error will trigger close or command failure
    });
  }

  send<T = any>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    signal?: AbortSignal,
    timeoutMs = 15000,
  ): Promise<T> {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("CDP WebSocket is not open"));
    }

    if (signal?.aborted) {
      return Promise.reject(new Error("CDP command aborted"));
    }

    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      let settled = false;

      let timer: NodeJS.Timeout | undefined;
      let onAbort: (() => void) | undefined;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (signal && onAbort) {
          signal.removeEventListener("abort", onAbort);
        }
        this.pending.delete(id);
      };

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(`CDP command ${method} (id=${id}) timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      if (signal) {
        onAbort = () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error("CDP command aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }

      this.pending.set(id, {
        resolve: (val) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(val);
        },
        reject: (err) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        },
        timer,
        onAbort,
        signal,
      });

      const payload: Record<string, unknown> = { id, method, params };
      if (sessionId) {
        payload.sessionId = sessionId;
      }

      this.ws.send(JSON.stringify(payload), (err?: Error) => {
        if (err) {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        }
      });
    });
  }

  on(
    eventName: string,
    listener: (params: any, sessionId?: string) => void,
  ): () => void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName)!.add(listener);
    return () => {
      const set = this.eventListeners.get(eventName);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.eventListeners.delete(eventName);
      }
    };
  }

  onClose(listener: () => void): () => void {
    return this.on("__cdp_close__", listener);
  }

  close(): void {
    this.closed = true;
    try {
      this.ws.close();
    } catch {
      // Ignore close errors
    }
  }
}
