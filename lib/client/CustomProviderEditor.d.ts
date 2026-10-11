import { type ProviderView } from "./api.ts";
import type { TFunc } from "./WebToolsSection.tsx";
export interface CustomProviderEditorProps {
    open: boolean;
    onClose: () => void;
    provider?: ProviderView;
    onSaved: (sourceId: string, addToOrder: boolean) => Promise<void> | void;
    onDeleted?: (sourceId: string) => Promise<void> | void;
    t: TFunc;
}
export declare function CustomProviderEditor(props: CustomProviderEditorProps): import("react").JSX.Element | null;
