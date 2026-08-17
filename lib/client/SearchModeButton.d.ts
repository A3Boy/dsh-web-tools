/** Props the session-scoped seat supplies plus localized copy. */
interface Props {
    sessionId: string;
    label?: string;
    unavailableLabel?: string;
}
export declare function SearchModeButton({ sessionId, label, unavailableLabel, }: Props): import("react").JSX.Element;
export {};
