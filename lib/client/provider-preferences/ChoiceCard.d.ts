export interface ChoiceCardBadge {
    label: string;
    tone?: "brand" | "neutral" | "warning";
}
export interface ChoiceCardProps {
    selected: boolean;
    title: string;
    description?: string;
    /** Badge text e.g. "默认", or structured badge object with semantic tone. */
    badge?: string | ChoiceCardBadge;
    /** Fallback semantic tone when badge is passed as a string. */
    badgeTone?: "brand" | "neutral" | "warning";
    /** Meta text e.g. "1 credit", "~1s". Rendered as tertiary small text. */
    meta?: string;
    warning?: string;
    disabled?: boolean;
    onClick: () => void;
}
export declare function ChoiceCard(props: ChoiceCardProps): import("react").JSX.Element;
