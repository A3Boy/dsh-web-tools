/**
 * dsh-web-tools — Provider brand map (client-only, no Host dependency).
 *
 * Real provider SVG logos inlined as data URIs to avoid bundler plugin
 * dependencies for SVG file imports. Falls back to colored-letter placeholder
 * when a provider has no dedicated logo.
 * @module
 */
export interface BrandEntry {
    /** Data URI of the SVG icon (24×24). */
    icon: string;
    label: string;
}
export declare const PROVIDER_BRAND: Record<string, BrandEntry>;
