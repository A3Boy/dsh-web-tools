import { type QuotaView } from "../api.ts";
import { type TFunc } from "../logic.ts";
export declare function formatQuotaNumbers(q?: QuotaView, t?: TFunc): {
    main: string;
    unit?: string;
};
export declare function QuotaInline(props: {
    quota?: QuotaView;
    providerName?: string;
    t?: TFunc;
}): import("react").JSX.Element | null;
export declare function QuotaCard(props: {
    quota?: QuotaView;
    providerName?: string;
    t: TFunc;
    onRefresh: () => void;
    /** Render inside a host SettingsGroup: drop the card chrome (border/radius/bg). */
    embedded?: boolean;
}): import("react").JSX.Element;
