export interface SegmentOption<T extends string = string> {
    value: T;
    label: string;
    title?: string;
}
interface Props<T extends string = string> {
    options: Array<SegmentOption<T>>;
    value: T;
    onChange: (value: T) => void;
    disabled?: boolean;
    size?: "sm" | "md";
}
export declare function SegmentedControl<T extends string = string>(props: Props<T>): import("react").JSX.Element;
export {};
