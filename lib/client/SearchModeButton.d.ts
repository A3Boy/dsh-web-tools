import { type SearchMode } from "./api.ts";
/** Props the session-scoped seat supplies plus localized copy. */
interface Props {
    sessionId: string;
    /** Copy for one mode: the row name and the one-line explanation. */
    labels?: Record<SearchMode, string>;
    descriptions?: Record<SearchMode, string>;
    /** Heading inside the menu. */
    menuLabel?: string;
    /** Shown instead of a mode name when no search provider is usable. */
    unavailableLabel?: string;
}
export declare function SearchModeButton({ sessionId, labels, descriptions, menuLabel, unavailableLabel, }: Props): import("react").JSX.Element;
export {};
