import { SessionManager } from "./session-manager.js";
export * from "./types.js";
export * from "./locator.js";
export * from "./paths.js";
export * from "./port.js";
export * from "./profile-store.js";
export * from "./state-store.js";
export * from "./process-manager.js";
export * from "./session-manager.js";
export * from "./cdp/client.js";
export * from "./cdp/connection.js";
export * from "./cdp/page.js";
export * from "./cdp/errors.js";
export function createNativeBrowserRuntime(browserChoice = "auto", baseDirOverride, idleShutdownMs) {
    return new SessionManager(browserChoice, baseDirOverride, idleShutdownMs);
}
