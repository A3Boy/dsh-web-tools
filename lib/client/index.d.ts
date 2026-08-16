/** Locale namespace for this page's copy. */
export declare const NS = "dsh-web-tools";
/** Services required by this client plugin. */
export declare const inject: string[];
/** zh page copy (key-set source of truth). */
export declare const zhDict: Record<string, string>;
/** en page copy, checked complete against the zh key set. */
export declare const enDict: Record<string, string>;
/** Register the Settings page. */
export declare function apply(ctx: any): void;
