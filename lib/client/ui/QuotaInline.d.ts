import { type QuotaView } from "../api.ts";
import { type TFunc } from "../logic.ts";
export declare function formatQuotaNumbers(q?: QuotaView, t?: TFunc): {
    main: string;
    unit?: string;
};
export declare function QuotaInline(props: {
    quota?: QuotaView;
    t?: TFunc;
}): import("react").JSX.Element;
export declare function QuotaCard(props: {
    quota?: QuotaView;
    providerName?: string;
    t: TFunc;
    onRefresh: () => void;
}): import("react").JSX.Element;
