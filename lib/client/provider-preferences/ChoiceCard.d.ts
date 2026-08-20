export interface ChoiceCardProps {
    selected: boolean;
    title: string;
    description?: string;
    /** Badge text e.g. "推荐", "已自定义". Rendered as Pill. */
    badge?: string;
    /** Meta text e.g. "1 credit", "~1s". Rendered as tertiary small text. */
    meta?: string;
    warning?: string;
    disabled?: boolean;
    onClick: () => void;
}
export declare function ChoiceCard(props: ChoiceCardProps): import("react").JSX.Element;
