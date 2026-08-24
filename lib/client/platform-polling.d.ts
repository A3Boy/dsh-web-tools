import type { PlatformStatusResponse } from "../shared/platform-types.ts";
export declare function arePlatformStatusesEqual(a: PlatformStatusResponse | null, b: PlatformStatusResponse | null): boolean;
export declare function shouldPollPlatformStatus(isVisible: boolean, currentStatus: PlatformStatusResponse | null): boolean;
export declare function getPlatformPollIntervalMs(isVisible: boolean, currentStatus: PlatformStatusResponse | null): number;
