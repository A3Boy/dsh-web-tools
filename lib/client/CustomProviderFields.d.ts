import type { TFunc } from "./WebToolsSection.tsx";
import { type CustomProviderDraft } from "../shared/custom-provider-types.ts";
export interface CustomProviderFieldsProps {
    t: TFunc;
    draft: CustomProviderDraft;
    credentialValue: string;
    basicPassword?: string;
    hasStoredCredential?: boolean;
    onChange: (patch: Partial<CustomProviderDraft>) => void;
    onCredentialChange: (value: string) => void;
    onBasicPasswordChange?: (value: string) => void;
}
export declare function CustomProviderFields(props: CustomProviderFieldsProps): import("react").JSX.Element;
