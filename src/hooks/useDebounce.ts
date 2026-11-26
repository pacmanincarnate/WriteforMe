/**
 * @module hooks/useDebounce
 * Debounces rapidly changing values (such as search inputs) by a fixed delay.
 */

import { useEffect, useState } from 'react';
import { UI_DELAYS_MS } from '@/config';

export function useDebounce<T>(value: T, delay: number = UI_DELAYS_MS.searchDebounce): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}
