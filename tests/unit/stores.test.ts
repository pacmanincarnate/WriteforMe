import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    hydrateAllStoresFromStorage,
    STORE_PROMPT_LOG_CAP,
    useAudioStore,
    usePipelineStore,
    useSettingsStore,
    useStoryStore,
    useUiStore
} from '@/stores';

describe('Phase 5C: Typed Zustand 5 stores and storage hydration', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        document.documentElement.classList.remove('dark');
        document.documentElement.removeAttribute('data-theme');
        usePipelineStore.setState({
            loading: false,
            loadingStep: '',
            currentPipelineStep: null,
            inspectedStepId: null,
            generatingSceneKey: null,
            promptLog: []
        });
        hydrateAllStoresFromStorage();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('hydrates settings from localStorage and migrates deprecated imageModel & ttsDevice values', () => {
        localStorage.setItem('ellipsisprose_theme', 'dark');
        localStorage.setItem('ellipsisprose_api_provider', 'codex');
        localStorage.setItem('ellipsisprose_image_model', 'imagen-3.0-generate-002');
        localStorage.setItem(
            'ellipsisprose_reader_settings',
            JSON.stringify({ ttsDevice: 'auto', fontSize: 19 })
        );

        hydrateAllStoresFromStorage();

        const settings = useSettingsStore.getState();
        expect(settings.theme).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(settings.embeddingProvider).toBe('gemini');
        expect(settings.imageModel).toBe('gemini-3.1-flash-image');
        expect(settings.readerSettings.ttsDevice).toBe('wasm');
        expect(settings.readerSettings.fontSize).toBe(19);
    });

    it('toggles theme on DOM + storage and keeps Audio Drama pipelineTier/backend synchronized', () => {
        const store = useSettingsStore.getState();
        expect(store.theme).toBe('light');

        store.toggleTheme();
        expect(useSettingsStore.getState().theme).toBe('dark');
        expect(localStorage.getItem('ellipsisprose_theme')).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

        store.toggleTheme();
        expect(useSettingsStore.getState().theme).toBe('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');

        store.updateAudioDramaSetting('pipelineTier', 2);
        expect(useSettingsStore.getState().audioDramaSettings.backend).toBe('breeze');
        store.updateAudioDramaSetting('backend', 'system');
        expect(useSettingsStore.getState().audioDramaSettings.pipelineTier).toBe(0);

        store.updateSetting('geminiModel', 'gemini-2.5-pro', 'ellipsisprose_gemini_model');
        expect(store.getModelSettingsSnapshot().geminiModel).toBe('gemini-2.5-pro');
        expect(localStorage.getItem('ellipsisprose_gemini_model')).toBe('gemini-2.5-pro');
        expect(store.getThinkingSettingsSnapshot().thinkingBudgetWriting).toBeTypeOf('number');
    });

    it('manages UI navigation, inspector/sidebar toggles, and confirm/form modal promises', async () => {
        const ui = useUiStore.getState();
        ui.setView('pipeline');
        expect(useUiStore.getState().view).toBe('pipeline');
        expect(ui.isAutopilotProtectedView('pipeline')).toBe(true);
        expect(ui.isAutopilotProtectedView('reader')).toBe(true);
        expect(ui.isAutopilotProtectedView('setup')).toBe(false);

        ui.toggleInspectorMode();
        expect(useUiStore.getState().isInspectorMode).toBe(true);
        expect(localStorage.getItem('ellipsisprose_inspector_mode')).toBe('true');

        ui.setIsSidebarOpen(true);
        ui.toggleSidebarCollapsed();
        expect(useUiStore.getState().isSidebarOpen).toBe(true);
        expect(useUiStore.getState().isSidebarCollapsed).toBe(true);
        expect(localStorage.getItem('ellipsisprose_sidebar_collapsed')).toBe('true');

        const confirmSpy = vi.fn();
        const confirmPromise = useUiStore.getState().requestConfirm({
            title: 'Delete Scene?',
            message: 'Cannot undo',
            secondaryLabel: 'Archive',
            onConfirm: confirmSpy
        });
        expect(useUiStore.getState().confirmModalState.isOpen).toBe(true);
        useUiStore.getState().confirmModalState.onConfirm?.();
        await expect(confirmPromise).resolves.toBe(true);
        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(useUiStore.getState().confirmModalState.isOpen).toBe(false);

        const secondaryPromise = useUiStore.getState().requestConfirm({
            title: 'Branch?',
            message: 'Pick option',
            secondaryLabel: 'Side Branch'
        });
        useUiStore.getState().confirmModalState.onSecondary?.();
        await expect(secondaryPromise).resolves.toBe('secondary');

        const cancelPromise = useUiStore.getState().requestConfirm({
            title: 'Cancel test',
            message: 'Cancel'
        });
        useUiStore.getState().confirmModalState.onCancel?.();
        await expect(cancelPromise).resolves.toBe(false);

        const formPromise = useUiStore.getState().openFormModal({
            title: 'Rename Chapter',
            fields: [{ name: 'title', label: 'Title' }]
        });
        expect(useUiStore.getState().formModalState.isOpen).toBe(true);
        useUiStore.getState().formModalState.onSubmit?.({ title: 'Act II' });
        await expect(formPromise).resolves.toEqual({ title: 'Act II' });
        expect(useUiStore.getState().formModalState.isOpen).toBe(false);

        const canceledFormPromise = useUiStore.getState().openFormModal({
            title: 'Canceled',
            fields: [{ name: 'title', label: 'Title' }]
        });
        useUiStore.getState().formModalState.onCancel?.();
        await expect(canceledFormPromise).resolves.toBeNull();
    });

    it('synchronously returns next story from setStory and hydrates activeStoryId from storage', () => {
        const returned = useStoryStore.getState().setStory((prev) => ({
            ...prev,
            title: 'Glass Harbor'
        }));
        expect(returned.title).toBe('Glass Harbor');
        expect(useStoryStore.getState().story.title).toBe('Glass Harbor');

        localStorage.setItem('ellipsisprose_active_story_id', 'story_imported_42');
        useStoryStore.getState().hydrateFromStorage();
        expect(useStoryStore.getState().activeStoryId).toBe('story_imported_42');
        expect(useStoryStore.getState().story.id).toBe('story_imported_42');
    });

    it('logs all 6 pipeline / Audio Drama events newest-first and caps promptLog at STORE_PROMPT_LOG_CAP', () => {
        const p = usePipelineStore.getState();

        p.logPipelineDelay('Draft Cooldown', 1500, 'Rate limit buffer');
        p.logPipelineValidation('Sequence Review (Attempt 2/4)', true, ['Check A passed'], '1.20');
        p.logPipelineValidation('Prose Gate', false, 'Too short', '0.50');
        p.logPipelineError('Act Agent (Attempt 1/3)', 'Timeout reached', 'HTTP 504');
        p.logAudioDramaPipelineStageStart('tts_cast', 'Casting Voices', { castCount: 3 });
        p.logAudioDramaPipelineStageComplete('tts_cast', 'Casting Voices', { durationSec: 4.5 });
        p.logAudioDramaPipelineStageError('tts_render', 'Rendering Cue', new Error('Worker died'), {
            cueId: 7
        });

        const logs = usePipelineStore.getState().promptLog;
        expect(logs).toHaveLength(7);
        expect(logs[0].function).toBe('[Audio Drama ERROR] Rendering Cue');
        expect(logs[0].status).toBe('error');
        expect(logs[1].function).toBe('[Audio Drama] Casting Voices');
        expect(logs[1].status).toBe('success');
        expect(logs[1].durationSec).toBe(4.5);
        expect(logs[2].status).toBe('running');
        expect(logs[3].isError).toBe(true);
        expect(logs[3].pipelineAttempt).toBe(1);
        expect(logs[3].pipelineMaxAttempts).toBe(3);
        expect(logs[4].status).toBe('validation_failed');
        expect(logs[5].status).toBe('success');
        expect(logs[5].pipelineAttempt).toBe(2);
        expect(logs[5].pipelineMaxAttempts).toBe(4);
        expect(logs[6].isDelay).toBe(true);

        for (let i = 0; i < STORE_PROMPT_LOG_CAP + 15; i += 1) {
            p.logPipelineDelay(`Delay ${i}`, 100);
        }
        expect(usePipelineStore.getState().promptLog).toHaveLength(STORE_PROMPT_LOG_CAP);
        expect(usePipelineStore.getState().promptLog[0].function).toBe(
            `Delay ${STORE_PROMPT_LOG_CAP + 14}`
        );
    });

    it('updates Audio store playback, queue updaters, and scene/sequence audio maps', () => {
        const audio = useAudioStore.getState();
        audio.setTtsStatus('playing');
        audio.setTtsQueue([{ id: 'c1', text: 'Line 1' }]);
        audio.setTtsQueue((prev) => [...prev, { id: 'c2', text: 'Line 2' }]);
        audio.setIsAudioAutopilotRunning(true);
        audio.setIsFollowingAudio(false);
        audio.setAvailableSceneAudioMap({
            '0-0': {
                id: 's1:0-0',
                storyId: 's1',
                seqIdx: 0,
                sceneIdx: 0,
                sceneId: '0-0',
                hasCueTimeline: true,
                durationSec: 42
            }
        });
        audio.setAvailableSequenceAudioMap({
            '0': {
                id: 's1:seq:0',
                storyId: 's1',
                seqIdx: 0,
                includedSceneIndices: [0],
                totalScenesInStructure: 1,
                sceneHashes: { '0-0': 'abc' },
                durationSec: 42
            }
        });

        const state = useAudioStore.getState();
        expect(state.ttsStatus).toBe('playing');
        expect(state.ttsQueue).toHaveLength(2);
        expect(state.isAudioAutopilotRunning).toBe(true);
        expect(state.isFollowingAudio).toBe(false);
        expect(state.availableSceneAudioMap['0-0']?.durationSec).toBe(42);
        expect(state.availableSequenceAudioMap['0']?.totalScenesInStructure).toBe(1);
    });
});
