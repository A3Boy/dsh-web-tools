type TFunc = (key: string, ...args: unknown[]) => string;
interface Props {
    t: TFunc;
    p: {
        name: string;
        label: string;
        options?: {
            overrides: Record<string, unknown>;
            effective: Record<string, unknown>;
            customized: boolean;
            isDefault: boolean;
        };
    };
    onConfigChanged: () => Promise<void> | void;
}
export declare function ProviderPreferencesSection(props: Props): import("react").JSX.Element;
export {};
