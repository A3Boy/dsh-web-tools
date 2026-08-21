import type { SearchStrategy } from "./provider-presets.ts";
import type { TFunc } from "./logic.ts";
interface Props {
    t: TFunc;
    current: SearchStrategy;
    onApply: (strategy: SearchStrategy) => void;
    disabled?: boolean;
}
export declare function SearchStrategyCard(props: Props): import("react").JSX.Element;
export {};
