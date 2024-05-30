import type { ComputedRef, DeepReadonly, ExtractPropTypes, Ref } from 'vue';

import { mixedProp, stringProp } from '@/utils';
import { extractComponentProps } from '@/components/utils';

export interface IAGHeadlessInput {
    id: string;
    name: ComputedRef<string | null>;
    label: ComputedRef<string | null>;
    description: ComputedRef<string | boolean | null>;
    value: ComputedRef<string | number | boolean | null>;
    errors: DeepReadonly<Ref<string[] | null>>;
    update(value: string | number | boolean | null): void;
}

export const inputProps = {
    name: stringProp(),
    label: stringProp(),
    description: stringProp(),
    modelValue: mixedProp<string | number | boolean>([String, Number, Boolean]),
};

export function useInputProps(): typeof inputProps {
    return inputProps;
}

export function extractInputProps<T extends ExtractPropTypes<typeof inputProps>>(
    props: T,
): Pick<T, keyof typeof inputProps> {
    return extractComponentProps(props, inputProps);
}
