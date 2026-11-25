import { act, useEffect, type MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    checkStoredSceneAudioFreshness,
    collectSpeakerAliases,
    extractSceneProseText,
    useAudioProduction,
    useVoiceManagement,
    type AudioStoryRecord,
    type SharedTtsQueueItem
} from '@/hooks';
import { computeSceneProseHash } from '@/domain/audio';

interface MountedHook<T> {
    current: T;
    unmount: () => void;
}

function mountHook<T>(useHookFn: () => T): MountedHook<T> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const state = { current: undefined as unknown as T };

    function Harness(): null {
        const value = useHookFn();
        useEffect(() => {
            state.current = value;
        });
        state.current = value;
        return null;
    }

    act(() => {
        root.render(<Harness />);
    });

    return {
        get current() {
            return state.current;
        },
        unmount() {
            act(() => {
                root.unmount();
            });
            container.remove();
        }
    };
}

const makeRef = <T,>(value: T): MutableRefObject<T> => ({ current: value });

const castStory: AudioStoryRecord = {
    id: 'story-audio-1',
    title: 'Audio Test',
    cast: [
        { id: 'c1', name: 'Dr. Elena Voss', aliases: ['The Doctor'] },
        { id: 'c2', name: 'Marcus', aliases: [] }
    ],
    prose: {
        '0-0': { final: '  Elena opened the door.  ' },
        '0-1': 'Plain string prose'
    },
    sequences: [{ number: 1, title: 'One' }],
    scenes: { 0: [{ title: 'A' }, { title: 'B' }] }
};

describe('hooks Phase 6E-2 (useVoiceManagement, useAudioProduction)', () => {
    const mounted: Array<{ unmount: () => void }> = [];

    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        while (mounted.length) mounted.pop()?.unmount();
    });

    it('collects narrator and honorific-stripped speaker aliases', () => {
        const narrator = collectSpeakerAliases('Narrator', castStory);
        expect(narrator.canonicalSpeaker).toBe('NARRATOR');
        expect(narrator.aliases).toEqual(['Narrator', 'NARRATOR']);

        const doctor = collectSpeakerAliases('Dr. Elena Voss', castStory);
        expect(doctor.canonicalSpeaker).toBe('Dr. Elena Voss');
        expect(doctor.aliases).toEqual(
            expect.arrayContaining(['Dr. Elena Voss', 'The Doctor', 'Elena Voss', 'Elena', 'Voss'])
        );
    });

    it('extracts scene prose and evaluates stored audio freshness', () => {
        expect(extractSceneProseText(castStory, 0, 0)).toBe('Elena opened the door.');
        expect(extractSceneProseText(castStory, 0, 1)).toBe('Plain string prose');
        expect(extractSceneProseText(castStory, 5, 5)).toBe('');

        expect(checkStoredSceneAudioFreshness(null, 'x')).toEqual({
            fresh: false,
            reason: 'missing'
        });
        const prose = 'Elena opened the door.';
        const hash = computeSceneProseHash(prose);
        expect(checkStoredSceneAudioFreshness({ textHash: hash }, prose).fresh).toBe(true);
        expect(checkStoredSceneAudioFreshness({ textHash: 'deadbeef' }, prose)).toEqual({
            fresh: false,
            reason: 'prose_changed'
        });
        expect(
            checkStoredSceneAudioFreshness(
                { textHash: hash, updatedAt: 100 },
                prose,
                { ...castStory, audio_cast_updated_at: 200 }
            )
        ).toEqual({ fresh: false, reason: 'voice_changed' });
    });

    it('persists Audio Drama settings and tier mapping via useVoiceManagement', () => {
        const params = {
            story: castStory,
            storyRef: makeRef<AudioStoryRecord | null>(castStory),
            setStory: vi.fn(),
            getLlmKeys: () => ({ apiKey: '', openRouterKey: '' }),
            showToast: vi.fn(),
            requestConfirm: vi.fn(),
            openEditModal: vi.fn(),
            ttsQueueRef: makeRef<SharedTtsQueueItem[]>([]),
            setTtsQueueAndRefRef: makeRef(vi.fn()),
            ttsWorkerRef: makeRef(null),
            ttsStatusRef: makeRef('idle'),
            isTtsBusyOrPlayingRef: makeRef(false),
            stopTtsPlaybackRef: makeRef(vi.fn()),
            getOrCreateTtsWorkerRef: makeRef(() => null),
            initTtsEngineRef: makeRef(async () => true),
            availableSceneAudioMapRef: makeRef({}),
            setAvailableSceneAudioMapRef: makeRef(vi.fn()),
            setAvailableSequenceAudioMapRef: makeRef(vi.fn()),
            refreshAvailableSceneAudioRef: makeRef(async () => {})
        };
        const hook = mountHook(() => useVoiceManagement(params));
        mounted.push(hook);

        act(() => {
            hook.current.updateAudioDramaSetting('backend', 'kokoro');
        });
        expect(hook.current.audioDramaSettings.backend).toBe('kokoro');
        expect(hook.current.audioDramaSettings.pipelineTier).toBe(1);
        const saved = JSON.parse(
            localStorage.getItem('ellipsisprose_audio_drama_settings') || '{}'
        ) as { backend?: string };
        expect(saved.backend).toBe('kokoro');
    });

    it('computes scene audio status and toggles Audio Autopilot via useAudioProduction', async () => {
        const stableStory = { ...castStory, id: '' };
        const showToast = vi.fn();
        const setLoading = vi.fn();
        const params = {
            story: stableStory,
            storyRef: makeRef<AudioStoryRecord | null>(stableStory),
            setStory: vi.fn(),
            selectedSequence: 0,
            selectedScene: 0,
            audioDramaSettings: { backend: 'system' } as never,
            audioDramaSettingsRef: makeRef({ backend: 'system' } as never),
            getLlmKeys: () => ({ apiKey: '', openRouterKey: '' }),
            showToast,
            requestConfirm: vi.fn(),
            setLoading,
            setLoadingStep: vi.fn(),
            continuousAutopilot: false,
            ttsWorkerRef: makeRef(null),
            ttsQueueRef: makeRef<SharedTtsQueueItem[]>([]),
            stopTtsPlaybackRef: makeRef(vi.fn()),
            availableSceneAudioMapRef: makeRef({}),
            audioAutopilotProgress: null,
            setAudioAutopilotProgress: vi.fn()
        };
        const hook = mountHook(() => useAudioProduction(params));
        mounted.push(hook);

        expect(hook.current.getSceneAudioStatus(0, 0)).toEqual({ status: 'none', meta: null });
        expect(hook.current.storyAudioSummary).toEqual({
            readyCount: 0,
            staleCount: 0,
            totalDrafted: 2,
            totalScenes: 2
        });

        await act(async () => {
            hook.current.handleToggleAudioAutopilot();
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
        expect(setLoading).toHaveBeenCalledWith(true);
        expect(showToast).toHaveBeenCalledWith(
            'Audio Autopilot: Scene 1.1 error: Cannot generate scene audio without an active story ID.',
            'warning'
        );
        expect(hook.current.isAudioAutopilotRunning).toBe(false);
    });
});
