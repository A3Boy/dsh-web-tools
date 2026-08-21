import type { ProviderView, SearchRoutingPolicy } from "./api.ts";
import type { TFunc } from "./logic.ts";
interface Props {
    t: TFunc;
    /** All known providers (used for lookup). */
    providers: ProviderView[];
    /** Current ordered list [defaultProvider, ...fallbackOrder]. */
    ordered: string[];
    currentPolicy?: SearchRoutingPolicy;
    onClose: () => void;
    onSave: (ordered: string[], policy: SearchRoutingPolicy) => void;
}
export declare function RoutingModal(props: Props): import("react").JSX.Element;
export {};
