/**
 * dsh-web-tools — localized page copy dictionaries (zh / en).
 *
 * Extracted into a pure ts module (no tsx / react components) so node:test
 * and pure unit test runners can import and test dictionaries without a JSX/TSX loader.
 * @module
 */
/** zh page copy (key-set source of truth). */
export declare const zhDict: Record<string, string>;
/** en page copy, checked complete against the zh key set. */
export declare const enDict: Record<string, string>;
