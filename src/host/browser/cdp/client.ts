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

  async connect(timeoutMs = 10000): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`WebSocket connection timeout to ${this.ws.url}`));
      }, timeoutMs);

      const onOpen = () => {
        clearTimeout(timer);
        this.ws.removeListener("error", onError);
        resolve();
      };

      const onError = (err: Error) => {
        clearTimeout(timer);
        this.ws.removeListener("open", onOpen);
        reject(err);
      };

      this.ws.once("open", onOpen);
      this.ws.once("error", onError);
    });
  }

  private setupSocketHandlers() {
    this.ws.on("message", (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString("utf8"));
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const req = this.pending.get(msg.id)!;
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
      for (const [id, req] of this.pending.entries()) {
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

      let timer: NodeJS.Timeout | undefined;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`CDP command ${method} (id=${id}) timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      let onAbort: (() => void) | undefined;
      if (signal) {
        onAbort = () => {
          if (timer) clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error("CDP command aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }

      this.pending.set(id, { resolve, reject, timer, onAbort, signal });

      const payload: Record<string, unknown> = { id, method, params };
      if (sessionId) {
        payload.sessionId = sessionId;
      }

      this.ws.send(JSON.stringify(payload), (err?: Error) => {
        if (err) {
          if (timer) clearTimeout(timer);
          if (signal && onAbort) signal.removeEventListener("abort", onAbort);
          this.pending.delete(id);
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
