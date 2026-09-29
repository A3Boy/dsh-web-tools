export type IconAliasSpec = [oldName: string, newName: string, nominalSize: number];
export declare const ICON_ALIASES: readonly IconAliasSpec[];
export declare function patchPrimitivesIcons(target?: Record<string, any>): void;
