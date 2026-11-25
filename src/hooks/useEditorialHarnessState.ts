/**
 * @module hooks/useEditorialHarnessState
 * State of the Autonomous Editorial Harness panel: run progress, the open tab and scene scope,
 * the two persisted options (deep LLM review, run on Autopilot) and the inspector tool form.
 * State only; the harness itself is orchestrated in `@/pipeline`. Extracted from the legacy shell
 * in Phase 7.
 */

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { usePersistedBoolean } from './usePersistedBoolean';

export const EDITORIAL_DEEP_LLM_STORAGE_KEY = 'ellipsisprose_editorial_deep_llm';
export const EDITORIAL_AUTOPILOT_STORAGE_KEY = 'ellipsisprose_editorial_autopilot';

type Setter<T> = Dispatch<SetStateAction<T>>;

/** 'overview' | 'telemetry' | 'tribunal' | 'waves' | 'tools' */
export type EditorialHarnessTab = string;

export interface EditorialToolArgs {
    scene_id: string;
    pattern: string;
    query: string;
    character_id: string;
    topic_or_entity_id: string;
    [key: string]: unknown;
}

export const DEFAULT_EDITORIAL_TOOL_NAME = 'inspect_narrative_hierarchy';
export const DEFAULT_EDITORIAL_TOOL_ARGS: EditorialToolArgs = {
    scene_id: 'sc_0_0',
    pattern: '',
    query: '',
    character_id: '',
    topic_or_entity_id: ''
};

export interface UseEditorialHarnessStateResult {
    isRunningEditorialHarness: boolean;
    setIsRunningEditorialHarness: Setter<boolean>;
    editorialHarnessPhase: string;
    setEditorialHarnessPhase: Setter<string>;
    editorialHarnessProgress: number;
    setEditorialHarnessProgress: Setter<number>;
    editorialHarnessTab: EditorialHarnessTab;
    setEditorialHarnessTab: Setter<EditorialHarnessTab>;
    /** A scene id, or 'ALL' for the whole manuscript. */
    editorialScopeSceneId: string;
    setEditorialScopeSceneId: Setter<string>;
    /** Persisted; off unless the user turned it on. */
    editorialUseDeepLLM: boolean;
    setEditorialUseDeepLLM: Setter<boolean>;
    /** Persisted; on unless the user turned it off. */
    enableEditorialHarnessAutopilot: boolean;
    setEnableEditorialHarnessAutopilot: Setter<boolean>;
    editorialToolName: string;
    setEditorialToolName: Setter<string>;
    editorialToolArgs: EditorialToolArgs;
    setEditorialToolArgs: Setter<EditorialToolArgs>;
    editorialToolOutput: unknown;
    setEditorialToolOutput: Setter<unknown>;
}

export function useEditorialHarnessState(): UseEditorialHarnessStateResult {
    const [isRunningEditorialHarness, setIsRunningEditorialHarness] = useState(false);
    const [editorialHarnessPhase, setEditorialHarnessPhase] = useState('');
    const [editorialHarnessProgress, setEditorialHarnessProgress] = useState(0);
    const [editorialHarnessTab, setEditorialHarnessTab] = useState<EditorialHarnessTab>('overview');
    const [editorialScopeSceneId, setEditorialScopeSceneId] = useState('ALL');
    const [editorialUseDeepLLM, setEditorialUseDeepLLM] = usePersistedBoolean(
        EDITORIAL_DEEP_LLM_STORAGE_KEY,
        false,
        'editorial deep LLM'
    );
    const [enableEditorialHarnessAutopilot, setEnableEditorialHarnessAutopilot] = usePersistedBoolean(
        EDITORIAL_AUTOPILOT_STORAGE_KEY,
        true,
        'editorial autopilot'
    );
    const [editorialToolName, setEditorialToolName] = useState(DEFAULT_EDITORIAL_TOOL_NAME);
    const [editorialToolArgs, setEditorialToolArgs] = useState<EditorialToolArgs>({ ...DEFAULT_EDITORIAL_TOOL_ARGS });
    const [editorialToolOutput, setEditorialToolOutput] = useState<unknown>(null);

    return {
        isRunningEditorialHarness,
        setIsRunningEditorialHarness,
        editorialHarnessPhase,
        setEditorialHarnessPhase,
        editorialHarnessProgress,
        setEditorialHarnessProgress,
        editorialHarnessTab,
        setEditorialHarnessTab,
        editorialScopeSceneId,
        setEditorialScopeSceneId,
        editorialUseDeepLLM,
        setEditorialUseDeepLLM,
        enableEditorialHarnessAutopilot,
        setEnableEditorialHarnessAutopilot,
        editorialToolName,
        setEditorialToolName,
        editorialToolArgs,
        setEditorialToolArgs,
        editorialToolOutput,
        setEditorialToolOutput
    };
}
