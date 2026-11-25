/**
 * @module hooks/useLogDetailModal
 * State of the prompt-log detail dialog (Phase 6E-3). `openLogDetailModal` accepts the call
 * forms the views use; the content is built by `@/domain/story/logDetail`.
 */

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
    CLOSED_LOG_DETAIL_MODAL,
    buildLogDetailModal,
    resolveLogDetailRequest,
    type LogDetailEntry,
    type LogDetailModalState
} from '@/domain/story';

export interface UseLogDetailModalParams {
    /** Current pipeline log, searched when the dialog is opened by log id. */
    promptLog: ReadonlyArray<LogDetailEntry | null | undefined>;
}

export interface UseLogDetailModalResult {
    logModalState: LogDetailModalState;
    setLogModalState: Dispatch<SetStateAction<LogDetailModalState>>;
    /** `(type, entry)`, `(entry, type)` or `(typeOrId, id)`; does nothing when no entry matches. */
    openLogDetailModal: (typeOrEntry: unknown, maybeEntry?: unknown) => void;
}

export function useLogDetailModal({ promptLog }: UseLogDetailModalParams): UseLogDetailModalResult {
    const [logModalState, setLogModalState] = useState<LogDetailModalState>(CLOSED_LOG_DETAIL_MODAL);

    const openLogDetailModal = (typeOrEntry: unknown, maybeEntry?: unknown): void => {
        const request = resolveLogDetailRequest(typeOrEntry, maybeEntry, promptLog);
        if (!request) return;
        setLogModalState(buildLogDetailModal(request.type, request.entry));
    };

    return { logModalState, setLogModalState, openLogDetailModal };
}
