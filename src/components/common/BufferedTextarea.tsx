/**
 * @module components/common/BufferedTextarea
 * Eliminates typing latency by isolating keystrokes in local state and
 * debouncing parent state propagation (350ms or onBlur).
 */

import React, { useEffect, useRef, useState } from 'react';
import { UI_DELAYS_MS } from '@/config';

export interface BufferedTextareaProps {
    value?: string;
    onSave?: (next: string) => void;
    placeholder?: string;
    className?: string;
    rows?: number;
    debounceMs?: number;
    disabled?: boolean;
}

export const BufferedTextarea = React.memo(function BufferedTextarea({
    value = '',
    onSave,
    placeholder = '',
    className = '',
    rows = 2,
    debounceMs = UI_DELAYS_MS.textareaDebounce,
    disabled = false
}: BufferedTextareaProps) {
    const [localVal, setLocalVal] = useState(value || '');
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setLocalVal(value || '');
    }, [value]);

    useEffect(
        () => () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        },
        []
    );

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const next = e.target.value;
        setLocalVal(next);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            onSave?.(next);
        }, debounceMs);
    };

    const handleBlur = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (localVal !== value) {
            onSave?.(localVal);
        }
    };

    return (
        <textarea
            className={className}
            value={localVal}
            onChange={handleChange}
            onBlur={handleBlur}
            rows={rows}
            placeholder={placeholder}
            disabled={disabled}
        />
    );
});
