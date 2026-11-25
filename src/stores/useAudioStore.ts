/**
 * @module stores/useAudioStore
 * Zustand store for TTS playback state, voice auditioning, Audio Drama Studio rendering metadata,
 * and Audio Autopilot batch queue progress.
 */

import { create } from 'zustand';
import type { SceneAudioMeta, SequenceAudioMeta } from '@/services/storage';

export interface TtsPlayingSceneCoord {
    seqIdx: number;
    sceneIdx: number;
    title?: string;
}

export interface AudioStoreState {
    ttsStatus: string;
    ttsQueue: Array<Record<string, unknown>>;
    ttsCurrentChunkIndex: number;
    ttsIsMiniPlayerVisible: boolean;
    isAudioDramaModeActive: boolean;
    audioDramaActiveSpeaker: string | null;
    audioDramaActiveEmotion: string | null;
    isAuditioningVoice: boolean;
    auditioningTarget: string | null;
    availableSceneAudioMap: Record<string, SceneAudioMeta>;
    availableSequenceAudioMap: Record<string, SequenceAudioMeta>;
    isAudioAutopilotRunning: boolean;
    isAudioAutopilotQueued: boolean;
    audioAutopilotProgress: Record<string, unknown> | null;
    audioPlaybackScope: string;
    isPlayingMasterSceneMp3: boolean;
    ttsPlayingScene: TtsPlayingSceneCoord | null;
    ttsResolvedSource: string | null;
    isFollowingAudio: boolean;
}

export interface AudioStoreActions {
    setTtsStatus: (status: string) => void;
    setTtsQueue: (
        nextOrUpdater:
            | Array<Record<string, unknown>>
            | ((prev: Array<Record<string, unknown>>) => Array<Record<string, unknown>>)
    ) => void;
    setTtsCurrentChunkIndex: (idx: number) => void;
    setTtsIsMiniPlayerVisible: (visible: boolean) => void;
    setIsAudioDramaModeActive: (active: boolean) => void;
    setAudioDramaActiveSpeaker: (speaker: string | null) => void;
    setAudioDramaActiveEmotion: (emotion: string | null) => void;
    setIsAuditioningVoice: (auditioning: boolean) => void;
    setAuditioningTarget: (target: string | null) => void;
    setAvailableSceneAudioMap: (map: Record<string, SceneAudioMeta>) => void;
    setAvailableSequenceAudioMap: (map: Record<string, SequenceAudioMeta>) => void;
    setIsAudioAutopilotRunning: (running: boolean) => void;
    setIsAudioAutopilotQueued: (queued: boolean) => void;
    setAudioAutopilotProgress: (progress: Record<string, unknown> | null) => void;
    setAudioPlaybackScope: (scope: string) => void;
    setIsPlayingMasterSceneMp3: (playing: boolean) => void;
    setTtsPlayingScene: (scene: TtsPlayingSceneCoord | null) => void;
    setTtsResolvedSource: (source: string | null) => void;
    setIsFollowingAudio: (following: boolean) => void;
}

export type AudioStore = AudioStoreState & AudioStoreActions;

export const useAudioStore = create<AudioStore>((set) => ({
    ttsStatus: 'idle',
    ttsQueue: [],
    ttsCurrentChunkIndex: 0,
    ttsIsMiniPlayerVisible: false,
    isAudioDramaModeActive: false,
    audioDramaActiveSpeaker: null,
    audioDramaActiveEmotion: null,
    isAuditioningVoice: false,
    auditioningTarget: null,
    availableSceneAudioMap: {},
    availableSequenceAudioMap: {},
    isAudioAutopilotRunning: false,
    isAudioAutopilotQueued: false,
    audioAutopilotProgress: null,
    audioPlaybackScope: 'story',
    isPlayingMasterSceneMp3: false,
    ttsPlayingScene: null,
    ttsResolvedSource: null,
    isFollowingAudio: true,

    setTtsStatus: (status) => set({ ttsStatus: status }),
    setTtsQueue: (nextOrUpdater) =>
        set((state) => ({
            ttsQueue:
                typeof nextOrUpdater === 'function' ? nextOrUpdater(state.ttsQueue) : nextOrUpdater
        })),
    setTtsCurrentChunkIndex: (idx) => set({ ttsCurrentChunkIndex: idx }),
    setTtsIsMiniPlayerVisible: (visible) => set({ ttsIsMiniPlayerVisible: visible }),
    setIsAudioDramaModeActive: (active) => set({ isAudioDramaModeActive: active }),
    setAudioDramaActiveSpeaker: (speaker) => set({ audioDramaActiveSpeaker: speaker }),
    setAudioDramaActiveEmotion: (emotion) => set({ audioDramaActiveEmotion: emotion }),
    setIsAuditioningVoice: (auditioning) => set({ isAuditioningVoice: auditioning }),
    setAuditioningTarget: (target) => set({ auditioningTarget: target }),
    setAvailableSceneAudioMap: (map) => set({ availableSceneAudioMap: map }),
    setAvailableSequenceAudioMap: (map) => set({ availableSequenceAudioMap: map }),
    setIsAudioAutopilotRunning: (running) => set({ isAudioAutopilotRunning: running }),
    setIsAudioAutopilotQueued: (queued) => set({ isAudioAutopilotQueued: queued }),
    setAudioAutopilotProgress: (progress) => set({ audioAutopilotProgress: progress }),
    setAudioPlaybackScope: (scope) => set({ audioPlaybackScope: scope }),
    setIsPlayingMasterSceneMp3: (playing) => set({ isPlayingMasterSceneMp3: playing }),
    setTtsPlayingScene: (scene) => set({ ttsPlayingScene: scene }),
    setTtsResolvedSource: (source) => set({ ttsResolvedSource: source }),
    setIsFollowingAudio: (following) => set({ isFollowingAudio: following })
}));
