import { providerStatusOf, quotaSummary, outcomeLabel, type TFunc, type ProviderStatus } from "./logic.ts";
export type { TFunc, ProviderStatus };
export { providerStatusOf, quotaSummary, outcomeLabel };
/** Local switch (DSH primitives ship no toggle; role=switch keeps it accessible). */
export declare function Switch(props: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
}): import("react").JSX.Element;
interface SectionProps {
    t: TFunc;
}
/** The page. */
export declare function WebToolsSection(props: SectionProps): import("react").JSX.Element;
