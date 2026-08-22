import type { UiFace } from "./registration.ts";
import { providerStatusOf, quotaSummary, outcomeLabel, type TFunc, type ProviderStatus } from "./logic.ts";
export type { TFunc, ProviderStatus };
export { providerStatusOf, quotaSummary, outcomeLabel };
/** Local switch (DSH primitives ship no toggle; role=switch keeps it accessible). */
export declare function Switch(props: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    disabled?: boolean;
}): import("react").JSX.Element;
interface SectionProps {
    t: TFunc;
    /** Page-language face for the independent language switch (see registration). */
    ui?: UiFace;
}
/** The page. */
export declare function WebToolsSection(props: SectionProps): import("react").JSX.Element;
