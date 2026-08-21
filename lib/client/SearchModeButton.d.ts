/** Props the session-scoped seat supplies plus localized copy. */
interface Props {
    sessionId: string;
    label?: string;
    unavailableLabel?: string;
    autoTooltip?: string;
    requiredTooltip?: string;
}
export declare function SearchModeButton({ sessionId, label, unavailableLabel, autoTooltip, requiredTooltip, }: Props): import("react").JSX.Element;
export {};
