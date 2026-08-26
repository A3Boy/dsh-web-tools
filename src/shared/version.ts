/** Version shipped by this plugin build. Keep in sync with package.json. */
export const CURRENT_VERSION = "0.3.0";

export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.replace(/^v/i, "").split("-")[0].split(".").map((part) => Number(part) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}
