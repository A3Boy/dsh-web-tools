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
}): import("react").JSX.Element;
