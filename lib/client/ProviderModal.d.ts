import { type ProviderView, type QuotaView, type TestProviderView } from "./api.ts";
import { type TFunc } from "./WebToolsSection.tsx";
interface Props {
    t: TFunc;
    p: ProviderView;
    quota?: QuotaView;
    testResult?: TestProviderView;
    busy: boolean;
    isDefault: boolean;
    inChain: boolean;
    onClose: () => void;
    onToggle: (enabled: boolean) => void;
    onBaseUrl: (url: string) => void;
    onTest: () => void;
    onRefreshQuota: () => void;
    /** Reload config after credential edits (key list changes). */
    onConfigChanged: () => void;
}
export declare function ProviderModal(props: Props): import("react").JSX.Element;
export {};
