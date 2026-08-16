import type { ProviderView } from "./api.ts";
import type { TFunc } from "./logic.ts";
interface Props {
    t: TFunc;
    providers: ProviderView[];
    ordered: string[];
    onClose: () => void;
    onSave: (ordered: string[]) => void;
}
export declare function RoutingModal(props: Props): import("react").JSX.Element;
export {};
