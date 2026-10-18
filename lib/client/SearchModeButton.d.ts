/** Props the session-scoped seat supplies plus localized copy. */
interface Props {
    sessionId: string;
    label?: string;
    unavailableLabel?: string;
    autoTooltip?: string;
    requiredTooltip?: string;
    /** Label while web search is switched OFF for this session. */
    offLabel?: string;
    offTooltip?: string;
    /** Label while the turn is forced to research. */
    requiredLabel?: string;
}
export declare function SearchModeButton({ sessionId, label, unavailableLabel, autoTooltip, requiredTooltip, offLabel, offTooltip, requiredLabel, }: Props): import("react").JSX.Element;
export {};
