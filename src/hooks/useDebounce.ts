/**
 * @module hooks/useDebounce
 * Debounces rapidly changing values (such as search inputs) by a fixed delay.
 */

import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay = 300): T {
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
