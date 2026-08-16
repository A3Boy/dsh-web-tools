/**
 * dsh-web-tools — structural service faces for the Host plugin.
 *
 * A third-party plugin resolves outside the DSH monorepo's single cordis
 * instance, so the upstream `declare module` augmentations do not reliably
 * reach this Context. Following the proven `dsh-better-sidebar` pattern, we
 * restate the runtime shapes we touch as structural mirrors. Node-free types
 * only (shared with the client graph).
 * @module
 */
export {};
