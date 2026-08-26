declare module "ws" {
  import { EventEmitter } from "node:events";

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    static readonly CLOSED: number;
    static readonly CLOSING: number;
    static readonly CONNECTING: number;

    readyState: number;
    url: string;

    constructor(address: string | URL);
    send(data: any, cb?: (err?: Error) => void): void;
    close(code?: number, data?: string | Buffer): void;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: any);
    close(cb?: (err?: Error) => void): void;
  }
}
