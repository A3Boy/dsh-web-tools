/**
 * dsh-web-tools — unified V6 styles and CSS adoption.
 *
 * All styles inherit DSH `--dsw-alias-*` theme tokens. This module injects a
 * single, stable `<style>` tag into document.head so the client plugin
 * maintains exact V6 pixel specs without polluting JSX with inline styles.
 * @module
 */
/** Inject the stylesheet once (idempotent, HMR-safe). */
export declare function adoptWebToolsStyles(): void;
