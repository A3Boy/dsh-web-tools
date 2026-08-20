/**
 * dsh-web-tools — Provider brand map (client-only, no Host dependency).
 *
 * Local SVG icons for each provider. Inlined as data URIs to avoid bundler
 * plugin dependencies for SVG imports. Falls back to letter when unavailable.
 * @module
 */

export interface BrandEntry {
  /** Data URI of the SVG icon (24×24). */
  icon: string;
  label: string;
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const COLORS: Record<string, { bg: string; letter: string; label: string }> = {
  exa:       { bg: "#1A1A2E", letter: "E", label: "Exa" },
  tavily:    { bg: "#4A6CF7", letter: "T", label: "Tavily" },
  brave:     { bg: "#FB542B", letter: "B", label: "Brave" },
  you:       { bg: "#06B6D4", letter: "Y", label: "You.com" },
  firecrawl: { bg: "#F97316", letter: "F", label: "Firecrawl" },
  parallel:  { bg: "#8B5CF6", letter: "P", label: "Parallel" },
  jina:      { bg: "#10B981", letter: "J", label: "Jina" },
  searxng:   { bg: "#6B7280", letter: "S", label: "SearXNG" },
};

function makeSvg(bg: string, letter: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="${bg}"/><text x="12" y="16" text-anchor="middle" font-family="system-ui" font-weight="700" font-size="13" fill="#fff">${letter}</text></svg>`;
}

export const PROVIDER_BRAND: Record<string, BrandEntry> = {};
for (const [name, c] of Object.entries(COLORS)) {
  PROVIDER_BRAND[name] = { icon: svgDataUri(makeSvg(c.bg, c.letter)), label: c.label };
}