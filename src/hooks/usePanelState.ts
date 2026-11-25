/**
 * @module hooks/usePanelState
 * Plain UI state for two panels, extracted from the legacy shell in Phase 7:
 *   - `usePipelineViewState`: the Pipeline view (inspected step, layout modes, live work
 *     indicator, audio autopilot progress, log filter).
 *   - `useRagPanelState`: the RAG index status and the RAG inspector's test query.
 * State only; the pipeline and the index are driven from `@/pipeline` and the shell.
 */

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

type Setter<T> = Dispatch<SetStateAction<T>>;

export interface UsePipelineViewStateResult {
    inspectedStepId: string | null;
    setInspectedStepId: Setter<string | null>;
    /** 'detailed' or a compact layout. */
    pipelineViewMode: string;
    setPipelineViewMode: Setter<string>;
    /** 'stage' (Novel Control Center) | 'audio' (Audio Production) | 'graph' (Technical Flowchart) */
    pipelineDisplayMode: string;
    setPipelineDisplayMode: Setter<string>;
    /** What the pipeline is working on right now, for the live indicator. */
    activePipelineWork: unknown;
    setActivePipelineWork: Setter<unknown>;
    audioAutopilotProgress: unknown;
    setAudioAutopilotProgress: Setter<unknown>;
    logFilter: string;
    setLogFilter: Setter<string>;
}

export function usePipelineViewState(): UsePipelineViewStateResult {
    const [inspectedStepId, setInspectedStepId] = useState<string | null>(null);
    const [pipelineViewMode, setPipelineViewMode] = useState('detailed');
    const [pipelineDisplayMode, setPipelineDisplayMode] = useState('stage');
    const [activePipelineWork, setActivePipelineWork] = useState<unknown>(null);
    const [audioAutopilotProgress, setAudioAutopilotProgress] = useState<unknown>(null);
    const [logFilter, setLogFilter] = useState('all');
    return {
        inspectedStepId,
        setInspectedStepId,
        pipelineViewMode,
        setPipelineViewMode,
        pipelineDisplayMode,
        setPipelineDisplayMode,
        activePipelineWork,
        setActivePipelineWork,
        audioAutopilotProgress,
        setAudioAutopilotProgress,
        logFilter,
        setLogFilter
    };
}

export interface UseRagPanelStateResult {
    /** 'idle' | 'indexing' | 'ready' */
    ragStatus: string;
    setRagStatus: Setter<string>;
    isRebuildingRag: boolean;
    setIsRebuildingRag: Setter<boolean>;
    ragTestQuery: string;
    setRagTestQuery: Setter<string>;
    ragTestResults: unknown[];
    setRagTestResults: Setter<unknown[]>;
    ragTestLoading: boolean;
    setRagTestLoading: Setter<boolean>;
}

export function useRagPanelState(): UseRagPanelStateResult {
    const [ragStatus, setRagStatus] = useState('idle');
    const [isRebuildingRag, setIsRebuildingRag] = useState(false);
    const [ragTestQuery, setRagTestQuery] = useState('');
    const [ragTestResults, setRagTestResults] = useState<unknown[]>([]);
    const [ragTestLoading, setRagTestLoading] = useState(false);
    return {
        ragStatus,
        setRagStatus,
        isRebuildingRag,
        setIsRebuildingRag,
        ragTestQuery,
        setRagTestQuery,
        ragTestResults,
        setRagTestResults,
        ragTestLoading,
        setRagTestLoading
    };
}
