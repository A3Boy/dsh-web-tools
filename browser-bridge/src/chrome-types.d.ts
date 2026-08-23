/** Chrome Extension global typing stub for building without extra devDependencies */
declare namespace chrome {
  export namespace tabs {
    export interface Tab {
      id?: number;
      url?: string;
      status?: string;
      active?: boolean;
    }
    export function create(props: { url?: string; active?: boolean }): Promise<Tab>;
    export function remove(tabId: number): Promise<void>;
    export function get(tabId: number): Promise<Tab>;
    export const onUpdated: {
      addListener(callback: (tabId: number, changeInfo: { status?: string }, tab: Tab) => void): void;
      removeListener(callback: (tabId: number, changeInfo: { status?: string }, tab: Tab) => void): void;
    };
  }

  export namespace scripting {
    export interface InjectionResult<T = any> {
      result: T;
    }
    export function executeScript<T = any>(props: {
      target: { tabId: number };
      func: (...args: any[]) => T;
      args?: any[];
    }): Promise<InjectionResult<T>[]>;
  }

  export namespace cookies {
    export interface Cookie {
      name: string;
      value: string;
      domain: string;
      path: string;
    }
    export interface CookieChangeInfo {
      removed: boolean;
      cookie: Cookie;
      cause: string;
    }
    export function get(details: { url: string; name: string }): Promise<Cookie | null>;
    export const onChanged: {
      addListener(callback: (changeInfo: CookieChangeInfo) => void): void;
      removeListener(callback: (changeInfo: CookieChangeInfo) => void): void;
    };
  }

  export namespace storage {
    export interface StorageArea {
      get(keys?: string | string[] | Record<string, any>): Promise<Record<string, any>>;
      set(items: Record<string, any>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    export const local: StorageArea;
  }
}
