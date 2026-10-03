export declare function SettingsGroup(props: {
    title?: React.ReactNode;
    action?: React.ReactNode;
    children: React.ReactNode;
    style?: React.CSSProperties;
    dividers?: "none" | "inset" | "full";
}): import("react").JSX.Element;
export declare function SettingsRow(props: {
    icon?: React.ReactNode;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    trailing?: React.ReactNode;
    chevron?: boolean;
    onClick?: () => void;
    isLast?: boolean;
    insetDivider?: boolean;
    disabled?: boolean;
    /** Extra classes for the row element (e.g. responsive-wrap hooks). */
    className?: string;
    /** Extra classes for the trailing slot, where action controls live. */
    trailingClassName?: string;
}): import("react").JSX.Element;
