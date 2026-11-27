import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    useModelCatalog,
    useModelSearch,
    useReaderController,
    useStoryImages,
    type NanoGptCatalogEntry
} from '@/hooks';
import * as llmModule from '@/services/llm';
import type {
    OpenRouterCatalogModel,
    GeminiImageModelInfo,
    OpenRouterImageModelInfo
} from '@/services/llm';
import type { ComfyOptionsCatalog, ComfyStatusInfo } from '@/services/images';
import type { ImageStore } from '@/services/storage';
import type { ModelDescriptor } from '@/types';

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

async function flushMicrotasks(ticks = 6): Promise<void> {
    for (let i = 0; i < ticks; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
    }
}

describe('hooks Phase 6E-1 (useReaderController, useStoryImages, useModelCatalog)', () => {
    const mountedHooks: Array<{ unmount: () => void }> = [];

    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        while (mountedHooks.length > 0) {
            mountedHooks.pop()?.unmount();
        }
    });

    it('useModelSearch debounces query and filters OpenRouter catalog', async () => {
        const emptyGeminiList: string[] = [];
        const emptyNanoList: NanoGptCatalogEntry[] = [];
        const emptyAnthropicList: ModelDescriptor[] = [];
        const fetchGeminiModels = vi.fn(async () => undefined);
        const openRouterCatalog: OpenRouterCatalogModel[] = [
            {
                id: 'anthropic/claude-3.7-sonnet',
                name: 'Claude 3.7 Sonnet',
                description: '',
                contextLength: null,
                maxOutputTokens: null,
                reasoning: null,
                supportedParameters: null,
                pricing: null
            },
            {
                id: 'google/gemini-2.5-flash',
                name: 'Gemini 2.5 Flash',
                description: '',
                contextLength: null,
                maxOutputTokens: null,
                reasoning: null,
                supportedParameters: null,
                pricing: null
            }
        ];

        const hook = mountHook(() =>
            useModelSearch('Development', 'openrouter', {
                devProvider: 'openrouter',
                apiKey: '',
                openRouterKey: 'or-key',
                nanoGptKey: '',
                geminiModelsList: emptyGeminiList,
                openRouterModelsList: openRouterCatalog,
                nanoGptModelsList: emptyNanoList,
                anthropicModelsList: emptyAnthropicList,
                fetchGeminiModels
            })
        );
        mountedHooks.push(hook);

        await flushMicrotasks(40);
        expect(hook.current.results).toHaveLength(2);

        act(() => {
            hook.current.setQuery('claude');
        });
        await flushMicrotasks(40);

        expect(hook.current.results).toHaveLength(1);
        const first = hook.current.results[0];
        expect(typeof first === 'string' ? first : first.id).toBe('anthropic/claude-3.7-sonnet');
    });

    it('useStoryImages loads cover & deletes cover via ImageStore confirmation', async () => {
        const fakeStore = {
            getImage: vi.fn(async (key: string) =>
                key === 'cover_story_1' ? 'data:image/png;base64,AAA' : null
            ),
            saveImage: vi.fn(async () => undefined),
            deleteImage: vi.fn(async () => undefined)
        } as unknown as ImageStore;

        const testStory = { id: 'story_1', title: 'Test Book', cast: [], beats: {}, prose: {} };
        const callAI = vi.fn(async () => '');
        const showToast = vi.fn();
        const requestConfirm = vi.fn((cfg: { onConfirm: () => void | Promise<void> }) => {
            void cfg.onConfirm();
        });

        const hook = mountHook(() =>
            useStoryImages({
                story: testStory,
                selectedSequence: 0,
                selectedScene: 0,
                apiKey: '',
                openRouterKey: '',
                callAI,
                showToast,
                requestConfirm,
                imageStoreInstance: fakeStore
            })
        );
        mountedHooks.push(hook);

        await flushMicrotasks();
        expect(hook.current.loadedImages.cover).toBe('data:image/png;base64,AAA');

        await act(async () => {
            await hook.current.deleteCoverImage();
        });

        expect(requestConfirm).toHaveBeenCalledTimes(1);
        expect(fakeStore.deleteImage).toHaveBeenCalledWith('cover_story_1');
        expect(hook.current.loadedImages.cover).toBeUndefined();
    });

    it('useReaderController computes chapters/scenes, jumps chapters, and saves reading progress', () => {
        const setSelectedSequence = vi.fn();
        const setSelectedScene = vi.fn();
        const setView = vi.fn();
        const setIsSidebarOpen = vi.fn();
        const showToast = vi.fn();
        const setIsFollowingAudio = vi.fn();
        const setReturnToAudioNonce = vi.fn();
        const ttsStatusRef = { current: 'idle' };
        const ttsPlayingSceneRef = { current: null };
        const isFollowingAudioRef = { current: true };

        const testStory = {
            id: 'story_reader',
            sequences: [
                { id: 1, number: 1, title: 'Harbor' },
                { id: 2, number: 2, title: 'Signal' }
            ],
            scenes: {
                '0': [{ id: '1.1', title: 'Dock' }],
                '1': [{ id: '2.1', title: 'Tower' }]
            },
            prose: {
                '0-0': { final: 'Cold rain fell across the pier.' },
                '1-0': { final: 'A faint carrier tone pulsed through the headset.' }
            }
        };

        const hook = mountHook(() =>
            useReaderController({
                activeStoryId: 'story_reader',
                story: testStory,
                selectedSequence: 0,
                setSelectedSequence,
                selectedScene: 0,
                setSelectedScene,
                view: 'reader',
                setView,
                theme: 'light',
                setIsSidebarOpen,
                showToast,
                ttsStatusRef,
                ttsPlayingSceneRef,
                setIsFollowingAudio,
                isFollowingAudioRef,
                setReturnToAudioNonce
            })
        );
        mountedHooks.push(hook);

        expect(hook.current.storyChapters).toHaveLength(2);
        expect(hook.current.flatStoryScenes).toHaveLength(2);
        expect(hook.current.currentChapter?.title).toBe('Harbor');

        act(() => {
            hook.current.jumpToReaderChapter(1, 0, 'next', false);
        });

        expect(setSelectedSequence).toHaveBeenCalledWith(1);
        expect(setSelectedScene).toHaveBeenCalledWith(0);
        expect(hook.current.readingProgress.sequenceIndex).toBe(1);
        const saved = localStorage.getItem('ellipsisprose_reader_progress_story_reader');
        expect(saved).toContain('"sequenceIndex":1');
    });

    it('useModelCatalog probes KoboldCPP status and resolves effective model config', async () => {
        vi.spyOn(llmModule, 'checkKoboldCPPStatus').mockResolvedValue({
            online: true,
            model: 'llama-3.1-8b-Q4',
            error: null
        });

        const testStory = { id: 's1' };
        const storyRef = { current: testStory };
        const emptyGeminiImgList: GeminiImageModelInfo[] = [];
        const emptyOpenRouterImgList: OpenRouterImageModelInfo[] = [];
        const comfyRefreshId = { current: 0 };
        const setCurrentPipelineStep = vi.fn();
        const setPromptLog = vi.fn();
        const showToast = vi.fn();
        const logPipelineDelay = vi.fn();
        const setGeminiImageModelsList = vi.fn();
        const setOpenRouterImageModelsList = vi.fn();
        const setIsFetchingImageModels = vi.fn();
        const setComfyStatus = vi.fn<(s: ComfyStatusInfo | ((prev: ComfyStatusInfo) => ComfyStatusInfo)) => void>();
        const setComfyOptions = vi.fn<(o: ComfyOptionsCatalog | ((prev: ComfyOptionsCatalog) => ComfyOptionsCatalog)) => void>();
        const setComfyUnet = vi.fn();
        const setComfyClip = vi.fn();
        const setComfyVae = vi.fn();

        const hook = mountHook(() =>
            useModelCatalog({
                view: 'setup',
                story: testStory,
                storyRef,
                setCurrentPipelineStep,
                setPromptLog,
                showToast,
                logPipelineDelay,
                imageProvider: 'gemini',
                imageApiKey: '',
                geminiImageModelsList: emptyGeminiImgList,
                setGeminiImageModelsList,
                openRouterImageModelsList: emptyOpenRouterImgList,
                setOpenRouterImageModelsList,
                setIsFetchingImageModels,
                comfyUrl: 'http://127.0.0.1:8188',
                setComfyStatus,
                setComfyOptions,
                setComfyUnet,
                setComfyClip,
                setComfyVae,
                comfyRefreshId
            })
        );
        mountedHooks.push(hook);

        await act(async () => {
            await hook.current.checkKoboldStatus();
        });

        expect(hook.current.koboldStatus).toBe('connected');
        expect(hook.current.koboldLoadedModel).toBe('llama-3.1-8b-Q4');
        expect(hook.current.getEffectiveModelConfig('dev').provider).toBe('gemini');
    });

    it('useModelCatalog auto-fetches and caches OpenRouter text-to-image models without an API key', async () => {
        sessionStorage.clear();
        const liveOpenRouterImgModels: OpenRouterImageModelInfo[] = [
            {
                id: 'black-forest-labs/flux.2-pro',
                name: 'Black Forest Labs: FLUX.2 Pro',
                description: 'FLUX.2 Pro',
                modality: 'text+image->image',
                costLabel: '$7.32/1M img tok',
                costDetail: 'Image output: $7.32/1M tokens',
                isFree: false
            }
        ];
        const fetchCatalogSpy = vi
            .spyOn(llmModule, 'fetchOpenRouterImageModelsCatalog')
            .mockResolvedValue(liveOpenRouterImgModels);

        const testStory = { id: 's2' };
        const storyRef = { current: testStory };
        const emptyGeminiImgList: GeminiImageModelInfo[] = [];
        const emptyOpenRouterImgList: OpenRouterImageModelInfo[] = [];
        const comfyRefreshId = { current: 0 };
        const setGeminiImageModelsList = vi.fn();
        const setOpenRouterImageModelsList = vi.fn();
        const setIsFetchingImageModels = vi.fn();

        const hook = mountHook(() =>
            useModelCatalog({
                view: 'settings',
                story: testStory,
                storyRef,
                setCurrentPipelineStep: vi.fn(),
                setPromptLog: vi.fn(),
                showToast: vi.fn(),
                logPipelineDelay: vi.fn(),
                imageProvider: 'openrouter',
                imageApiKey: '',
                geminiImageModelsList: emptyGeminiImgList,
                setGeminiImageModelsList,
                openRouterImageModelsList: emptyOpenRouterImgList,
                setOpenRouterImageModelsList,
                setIsFetchingImageModels,
                comfyUrl: 'http://127.0.0.1:8188',
                setComfyStatus: vi.fn(),
                setComfyOptions: vi.fn(),
                setComfyUnet: vi.fn(),
                setComfyClip: vi.fn(),
                setComfyVae: vi.fn(),
                comfyRefreshId
            })
        );
        mountedHooks.push(hook);

        await flushMicrotasks();

        expect(fetchCatalogSpy).toHaveBeenCalledWith('');
        expect(setOpenRouterImageModelsList).toHaveBeenCalledWith(liveOpenRouterImgModels);
        expect(sessionStorage.getItem('ellipsisprose_openrouter_image_models_cache')).toContain(
            'black-forest-labs/flux.2-pro'
        );
    });
});
