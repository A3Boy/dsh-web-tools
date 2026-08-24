import type { PlatformStatusResponse } from "../shared/platform-types.ts";

export function arePlatformStatusesEqual(
  a: PlatformStatusResponse | null,
  b: PlatformStatusResponse | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const aPlatforms = a.platforms;
  const bPlatforms = b.platforms;
  if (!aPlatforms || !bPlatforms) return false;

  const aKeys = Object.keys(aPlatforms).sort();
  const bKeys = Object.keys(bPlatforms).sort();
  if (aKeys.length !== bKeys.length) return false;

  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i] as keyof typeof aPlatforms;
    if (key !== bKeys[i]) return false;
    const pa = aPlatforms[key];
    const pb = bPlatforms[key];
    if (!pa || !pb) return false;

    if (
      pa.id !== pb.id ||
      pa.enabled !== pb.enabled ||
      pa.runtimeAvailable !== pb.runtimeAvailable ||
      pa.runtimeState !== pb.runtimeState ||
      pa.authenticated !== pb.authenticated ||
      pa.sessionEstablished !== pb.sessionEstablished ||
      pa.account?.handle !== pb.account?.handle ||
      pa.account?.name !== pb.account?.name ||
      pa.lastError !== pb.lastError
    ) {
      return false;
    }
  }

  return true;
}

export function shouldPollPlatformStatus(
  isVisible: boolean,
  currentStatus: PlatformStatusResponse | null,
): boolean {
  if (!isVisible) return false;
  if (!currentStatus) return true;

  const platforms = Object.values(currentStatus.platforms || {});
  // If any platform is starting, or has sessionEstablished without authentication (ongoing verify), poll frequently
  const isAnyPending = platforms.some(
    (p) => p.runtimeState === "starting" || (p.sessionEstablished && !p.authenticated),
  );
  return isAnyPending;
}

export function getPlatformPollIntervalMs(
  isVisible: boolean,
  currentStatus: PlatformStatusResponse | null,
): number {
  if (!isVisible) return 0; // stop polling when hidden
  if (!currentStatus) return 2000;

  const platforms = Object.values(currentStatus.platforms || {});
  const isAnyPending = platforms.some(
    (p) => p.runtimeState === "starting" || (p.sessionEstablished && !p.authenticated),
  );
  if (isAnyPending) return 2000;

  // Steady state: check on visibility change or low frequency 30s
  return 30000;
}
