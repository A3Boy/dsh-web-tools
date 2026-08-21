export declare function SettingsGroup(props: {
    title?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    style?: React.CSSProperties;
}): import("react").JSX.Element;
export declare function SettingsRow(props: {
    icon?: React.ReactNode;
    title: string;
    subtitle?: React.ReactNode;
    trailing?: React.ReactNode;
    chevron?: boolean;
    onClick?: () => void;
    isLast?: boolean;
    insetDivider?: boolean;
    disabled?: boolean;
}): import("react").JSX.Element;
