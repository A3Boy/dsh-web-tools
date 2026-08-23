/**
 * dsh-web-tools — Specialized Platform Source Types & Contracts.
 *
 * Specialized sources represent authenticated browser-based platform searchers
 * (e.g. Xiaohongshu, Twitter/X) distinct from general multi-tenant search engines.
 *
 * Core principles:
 * 1. Zero raw cookie storage on Host / React (Browser Session is sole authority).
 * 2. Transparent integration behind DSH standard web_search / web_fetch.
 * 3. Graceful degradation to general web fallback when disconnected or requested.
 *
 * @module
 */
export {};
