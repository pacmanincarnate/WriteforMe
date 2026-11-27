/**
 * @module hooks/useStoryImages
 * Cover, character portrait, scene illustration, and beat illustration state management,
 * IndexedDB hydration (`ImageStore`), ComfyUI/Gemini image configuration persistence,
 * AI prompt synthesis, and file upload / deletion handlers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
    DEFAULT_COMFY_CONFIG,
    DEFAULT_IMAGE_MODELS,
    DEFAULT_IMAGE_STYLES,
    DEFAULT_SERVICE_URLS,
    STORAGE_KEYS,
    type ImageStylePreset
} from '@/config';
import { formatSceneSummary, getSceneActiveCast, type ActiveCastMember } from '@/domain/story';
import {
    cleanImagePrompt,
    generateImage,
    type ComfyStatusInfo,
    type ComfyOptionsCatalog
} from '@/services/images';
import type { GeminiImageModelInfo, OpenRouterImageModelInfo } from '@/services/llm';
import { ImageStore } from '@/services/storage';
import type { CastMember, SceneBlueprint } from '@/types';
import { safeLocalStorageSet } from '@/utils';

export type LoadedImagesMap = {
    cover?: string | null;
    portraits?: Record<string, string>;
    [key: string]: unknown;
};

export interface UseStoryImagesParams {
    story: Record<string, unknown> | null | undefined;
    selectedSequence: number | null;
    selectedScene: number | null;
    apiKey?: string;
    openRouterKey?: string;
    getLlmKeys?: () => { apiKey: string; openRouterKey: string };
    callAI: (
        prompt: string,
        systemPrompt: string,
        isJson?: boolean,
        logName?: string,
        modelRoleOrSize?: string
    ) => Promise<string>;
    showToast: (message: string, variant?: 'success' | 'error' | 'info' | 'warning') => void;
    requestConfirm: (options: {
        title: string;
        message: string;
        confirmLabel?: string;
        danger?: boolean;
        onConfirm: () => void | Promise<void>;
    }) => void;
    notifyAlert?: (message: string) => void;
    imageStoreInstance?: ImageStore;
}

export interface UseStoryImagesResult {
    imageStore: ImageStore;
    imageProvider: string;
    setImageProvider: Dispatch<SetStateAction<string>>;
    imageModel: string;
    setImageModel: Dispatch<SetStateAction<string>>;
    geminiImageModelsList: GeminiImageModelInfo[];
    setGeminiImageModelsList: Dispatch<SetStateAction<GeminiImageModelInfo[]>>;
    openRouterImageModelsList: OpenRouterImageModelInfo[];
    setOpenRouterImageModelsList: Dispatch<SetStateAction<OpenRouterImageModelInfo[]>>;
    isFetchingImageModels: boolean;
    setIsFetchingImageModels: Dispatch<SetStateAction<boolean>>;
    imageApiKey: string;
    setImageApiKey: Dispatch<SetStateAction<string>>;
    comfyUrl: string;
    setComfyUrl: Dispatch<SetStateAction<string>>;
    comfyUnet: string;
    setComfyUnet: Dispatch<SetStateAction<string>>;
    comfyClip: string;
    setComfyClip: Dispatch<SetStateAction<string>>;
    comfyVae: string;
    setComfyVae: Dispatch<SetStateAction<string>>;
    comfyLora: string;
    setComfyLora: Dispatch<SetStateAction<string>>;
    comfyLoraStrength: number;
    setComfyLoraStrength: Dispatch<SetStateAction<number>>;
    comfySteps: number;
    setComfySteps: Dispatch<SetStateAction<number>>;
    comfyCfg: number;
    setComfyCfg: Dispatch<SetStateAction<number>>;
    comfySampler: string;
    setComfySampler: Dispatch<SetStateAction<string>>;
    comfyScheduler: string;
    setComfyScheduler: Dispatch<SetStateAction<string>>;
    comfyTimeoutSec: number;
    setComfyTimeoutSec: Dispatch<SetStateAction<number>>;
    comfyStatus: ComfyStatusInfo;
    setComfyStatus: Dispatch<SetStateAction<ComfyStatusInfo>>;
    comfyOptions: ComfyOptionsCatalog;
    setComfyOptions: Dispatch<SetStateAction<ComfyOptionsCatalog>>;
    comfyRefreshId: MutableRefObject<number>;
    customImageStyles: ImageStylePreset[];
    setCustomImageStyles: Dispatch<SetStateAction<ImageStylePreset[]>>;
    loadedImages: LoadedImagesMap;
    setLoadedImages: Dispatch<SetStateAction<LoadedImagesMap>>;
    portraitLoading: Record<string, boolean>;
    portraitReload: number;
    setPortraitReload: Dispatch<SetStateAction<number>>;
    loadingCover: boolean;
    loadingImages: Record<string, boolean>;
    newStyleName: string;
    setNewStyleName: Dispatch<SetStateAction<string>>;
    newStyleDesc: string;
    setNewStyleDesc: Dispatch<SetStateAction<string>>;
    callImageAPI: (prompt: string, aspectRatio?: string) => Promise<string>;
    generateCoverImage: () => Promise<void>;
    updateCharacterPortrait: (
        c: (Partial<CastMember> & Record<string, unknown>) | null | undefined,
        createDataUrl: () => Promise<string | null>,
        successMessage: string,
        errorPrefix: string
    ) => Promise<void>;
    generateCharacterPortrait: (
        c: (Partial<CastMember> & Record<string, unknown>) | null | undefined
    ) => Promise<void>;
    uploadCharacterPortrait: (
        c: (Partial<CastMember> & Record<string, unknown>) | null | undefined,
        file: File | null | undefined
    ) => Promise<void>;
    removeCharacterPortrait: (
        c: (Partial<CastMember> & Record<string, unknown>) | null | undefined
    ) => Promise<void>;
    deleteCoverImage: () => Promise<void>;
    handleCoverUpload: (event: ChangeEvent<HTMLInputElement>) => void;
    generateBeatImage: (seqIdx?: number, sceneIdx?: number, beatIdx?: number) => Promise<void>;
    deleteBeatImage: (seqIdx?: number, sceneIdx?: number, beatIdx?: number) => Promise<void>;
    generateSceneImage: (seqIdx?: number | null, sceneIdx?: number | null) => Promise<void>;
    deleteSceneImage: (seqIdx?: number | null, sceneIdx?: number | null) => Promise<void>;
}

/** Manages story cover, portrait, scene, and beat artwork generation, storage, and settings. */
export function useStoryImages({
    story,
    selectedSequence,
    selectedScene,
    apiKey = '',
    openRouterKey = '',
    getLlmKeys,
    callAI,
    showToast,
    requestConfirm,
    notifyAlert,
    imageStoreInstance
}: UseStoryImagesParams): UseStoryImagesResult {
    const imageStore = useMemo(
        () => imageStoreInstance || new ImageStore(),
        [imageStoreInstance]
    );
    if (typeof window !== 'undefined') {
        (window as unknown as { imageStore?: ImageStore }).imageStore = imageStore;
    }

    const raiseAlert = useCallback(
        (msg: string): void => {
            if (typeof notifyAlert === 'function') {
                notifyAlert(msg);
            } else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
                window.alert(msg);
            } else {
                showToast(msg, 'error');
            }
        },
        [notifyAlert, showToast]
    );

    const [imageProvider, setImageProvider] = useState(
        () => localStorage.getItem(STORAGE_KEYS.imageProvider) || 'gemini'
    );
    const [imageModel, setImageModel] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEYS.imageModel);
        if (saved && saved !== 'imagen-3.0-generate-002') return saved;
        return DEFAULT_IMAGE_MODELS.gemini;
    });
    const [geminiImageModelsList, setGeminiImageModelsList] = useState<GeminiImageModelInfo[]>(() => {
        try {
            const cached = sessionStorage.getItem(STORAGE_KEYS.geminiImageModelsCache);
            return cached ? (JSON.parse(cached) as GeminiImageModelInfo[]) : [];
        } catch {
            return [];
        }
    });
    const [openRouterImageModelsList, setOpenRouterImageModelsList] = useState<
        OpenRouterImageModelInfo[]
    >(() => {
        try {
            const cached = sessionStorage.getItem(STORAGE_KEYS.openRouterImageModelsCache);
            return cached ? (JSON.parse(cached) as OpenRouterImageModelInfo[]) : [];
        } catch {
            return [];
        }
    });
    const [isFetchingImageModels, setIsFetchingImageModels] = useState(false);
    const [imageApiKey, setImageApiKey] = useState(
        () => localStorage.getItem(STORAGE_KEYS.imageApiKey) || ''
    );
    const [comfyUrl, setComfyUrl] = useState(
        () => localStorage.getItem(STORAGE_KEYS.comfyUrl) || DEFAULT_SERVICE_URLS.comfyui
    );
    const [comfyUnet, setComfyUnet] = useState(
        () => localStorage.getItem(STORAGE_KEYS.comfyUnet) || ''
    );
    const [comfyClip, setComfyClip] = useState(
        () => localStorage.getItem(STORAGE_KEYS.comfyClip) || ''
    );
    const [comfyVae, setComfyVae] = useState(
        () => localStorage.getItem(STORAGE_KEYS.comfyVae) || ''
    );
    const [comfyLora, setComfyLora] = useState(
        () => localStorage.getItem(STORAGE_KEYS.comfyLora) || ''
    );
    const [comfyLoraStrength, setComfyLoraStrength] = useState(() =>
        Number(localStorage.getItem(STORAGE_KEYS.comfyLoraStrength) ?? DEFAULT_COMFY_CONFIG.loraStrength)
    );
    const [comfySteps, setComfySteps] = useState(() =>
        Number(localStorage.getItem(STORAGE_KEYS.comfySteps) ?? DEFAULT_COMFY_CONFIG.steps)
    );
    const [comfyCfg, setComfyCfg] = useState(() =>
        Number(localStorage.getItem(STORAGE_KEYS.comfyCfg) ?? DEFAULT_COMFY_CONFIG.cfg)
    );
    const [comfySampler, setComfySampler] = useState(
        () => localStorage.getItem(STORAGE_KEYS.comfySampler) || DEFAULT_COMFY_CONFIG.sampler
    );
    const [comfyScheduler, setComfyScheduler] = useState(
        () => localStorage.getItem(STORAGE_KEYS.comfyScheduler) || DEFAULT_COMFY_CONFIG.scheduler
    );
    const [comfyTimeoutSec, setComfyTimeoutSec] = useState(() =>
        Number(localStorage.getItem(STORAGE_KEYS.comfyTimeoutSec) ?? DEFAULT_COMFY_CONFIG.timeoutSec)
    );
    const [comfyStatus, setComfyStatus] = useState<ComfyStatusInfo>({
        online: false,
        version: '',
        device: '',
        error: ''
    });
    const [comfyOptions, setComfyOptions] = useState<ComfyOptionsCatalog>({
        unet: [],
        clip: [],
        vae: [],
        lora: [],
        sampler: [],
        scheduler: []
    });
    const comfyRefreshId = useRef(0);
    const [customImageStyles, setCustomImageStyles] = useState<ImageStylePreset[]>(() => {
        const saved = localStorage.getItem(STORAGE_KEYS.customImageStyles);
        return saved ? (JSON.parse(saved) as ImageStylePreset[]) : [];
    });

    const storyId = typeof story?.id === 'string' ? story.id : undefined;
    const storyRef = useRef(story);
    storyRef.current = story;
    const showToastRef = useRef(showToast);
    showToastRef.current = showToast;
    const [loadedImages, setLoadedImages] = useState<LoadedImagesMap>({});
    const [portraitLoading, setPortraitLoading] = useState<Record<string, boolean>>({});
    const [portraitReload, setPortraitReload] = useState(0);
    const portraitOperations = useRef(new Set<string>());
    const portraitRevisions = useRef(new Map<string, number>());
    const portraitStoryId = useRef<string | undefined>(storyId);
    portraitStoryId.current = storyId;
    const [loadingCover, setLoadingCover] = useState(false);
    const [loadingImages, setLoadingImages] = useState<Record<string, boolean>>({});
    const [newStyleName, setNewStyleName] = useState('');
    const [newStyleDesc, setNewStyleDesc] = useState('');

    // Persist Image Settings
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.imageProvider, imageProvider);
    }, [imageProvider]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.imageModel, imageModel);
    }, [imageModel]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.imageApiKey, imageApiKey);
    }, [imageApiKey]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.comfyUrl, comfyUrl);
    }, [comfyUrl]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.comfyUnet, comfyUnet);
    }, [comfyUnet]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.comfyClip, comfyClip);
    }, [comfyClip]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.comfyVae, comfyVae);
    }, [comfyVae]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.comfyLora, comfyLora);
    }, [comfyLora]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.comfyLoraStrength, comfyLoraStrength);
    }, [comfyLoraStrength]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.comfySteps, comfySteps);
    }, [comfySteps]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.comfyCfg, comfyCfg);
    }, [comfyCfg]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.comfySampler, comfySampler);
    }, [comfySampler]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.comfyScheduler, comfyScheduler);
    }, [comfyScheduler]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.comfyTimeoutSec, comfyTimeoutSec);
    }, [comfyTimeoutSec]);
    useEffect(() => {
        safeLocalStorageSet(STORAGE_KEYS.customImageStyles, customImageStyles);
    }, [customImageStyles]);

    // Load Cover Image from IndexedDB
    useEffect(() => {
        if (storyId) {
            imageStore
                .getImage(`cover_${storyId}`)
                .then((dataUrl) => {
                    setLoadedImages((prev) => ({ ...prev, cover: dataUrl }));
                })
                .catch((err) => console.error('Error loading cover image:', err));
        } else {
            setLoadedImages((prev) => {
                const copy = { ...prev };
                delete copy.cover;
                return copy;
            });
        }
    }, [storyId, imageStore]);

    // Clear portraits on story switches, then load cast portraits
    useEffect(() => {
        setLoadedImages((prev) => ({ ...prev, portraits: {} }));
        const pending: Record<string, boolean> = {};
        const curStory = storyRef.current;
        const castList = Array.isArray(curStory?.cast)
            ? (curStory.cast as Array<Record<string, unknown>>)
            : [];
        if (storyId) {
            castList.forEach((c) => {
                const cId = typeof c.id === 'string' || typeof c.id === 'number' ? String(c.id) : '';
                if (cId && portraitOperations.current.has(`portrait_${storyId}_${cId}`)) {
                    pending[cId] = true;
                }
            });
        }
        setPortraitLoading(pending);
    }, [storyId]);

    const portraitCastIds = JSON.stringify(
        (Array.isArray(story?.cast) ? (story.cast as Array<{ id?: unknown }>) : [])
            .map((c) => c.id)
            .filter((id) => id != null)
    );

    useEffect(() => {
        if (!storyId) return;
        let cancelled = false;
        const activeId = storyId;
        const ids = JSON.parse(portraitCastIds) as Array<string | number>;
        Promise.all(
            ids.map(async (id) => {
                const key = `portrait_${activeId}_${id}`;
                const revision = portraitRevisions.current.get(key) || 0;
                const dataUrl = await imageStore.getImage(key);
                return { id: String(id), key, revision, dataUrl };
            })
        )
            .then((results) => {
                if (cancelled || portraitStoryId.current !== activeId) return;
                setLoadedImages((prev) => {
                    if (cancelled || portraitStoryId.current !== activeId) return prev;
                    const portraits = { ...(prev.portraits || {}) };
                    results.forEach(({ id, key, revision, dataUrl }) => {
                        if (
                            portraitOperations.current.has(key) ||
                            revision !== (portraitRevisions.current.get(key) || 0)
                        ) {
                            return;
                        }
                        if (dataUrl) portraits[id] = dataUrl;
                        else delete portraits[id];
                    });
                    return { ...prev, portraits };
                });
            })
            .catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                if (!cancelled) {
                    showToastRef.current(`Failed to load character portraits: ${msg}`, 'error');
                }
            });
        return () => {
            cancelled = true;
        };
    }, [storyId, portraitCastIds, portraitReload, imageStore]);

    // Load Beat Images and Scene Illustration for active scene
    const beatsMap = (story?.beats || {}) as Record<string, unknown[] | undefined>;
    const activeBeatsKey = `${selectedSequence !== null && selectedSequence !== undefined ? selectedSequence : 0}-${selectedScene !== null && selectedScene !== undefined ? selectedScene : 0}`;
    const activeBeatsLength = Array.isArray(beatsMap[activeBeatsKey])
        ? beatsMap[activeBeatsKey]!.length
        : 0;

    useEffect(() => {
        if (storyId && selectedSequence !== null && selectedScene !== null) {
            const sId = `${selectedSequence}-${selectedScene}`;
            const curBeatsMap = (storyRef.current?.beats || {}) as Record<
                string,
                unknown[] | undefined
            >;
            const beats = Array.isArray(curBeatsMap[sId]) ? curBeatsMap[sId]! : [];

            const promises: Array<
                Promise<{ type: 'beat' | 'scene'; idx?: number; sId?: string; dataUrl: string | null }>
            > = beats.map((_, bi) => {
                const imgKey = `beat_${storyId}_${sId}_${bi}`;
                return imageStore
                    .getImage(imgKey)
                    .then((dataUrl) => ({ type: 'beat', idx: bi, dataUrl }));
            });

            const sceneImgPromise = imageStore
                .getImage(`scene_${storyId}_${sId}`)
                .then((dataUrl) => ({ type: 'scene' as const, sId, dataUrl }));
            promises.push(sceneImgPromise);

            Promise.all(promises)
                .then((results) => {
                    const newLoaded: Record<string, string> = {};
                    results.forEach((res) => {
                        if (!res.dataUrl) return;
                        if (res.type === 'beat' && res.idx !== undefined) {
                            newLoaded[`${sId}-${res.idx}`] = res.dataUrl;
                        } else if (res.type === 'scene' && res.sId) {
                            newLoaded[`scene_${res.sId}`] = res.dataUrl;
                        }
                    });
                    setLoadedImages((prev) => {
                        const cleared: LoadedImagesMap = {
                            cover: prev.cover,
                            portraits: prev.portraits
                        };
                        Object.keys(prev).forEach((k) => {
                            if (k.startsWith('scene_') && k !== `scene_${sId}`) {
                                cleared[k] = prev[k];
                            }
                        });
                        Object.keys(newLoaded).forEach((key) => {
                            cleared[key] = newLoaded[key];
                        });
                        return cleared;
                    });
                })
                .catch((err) => console.error('Error loading scene/beat images:', err));
        }
    }, [storyId, selectedSequence, selectedScene, activeBeatsLength, imageStore]);

    const callImageAPI = useCallback(
        (prompt: string, aspectRatio = '1:1'): Promise<string> => {
            const keys = getLlmKeys ? getLlmKeys() : { apiKey, openRouterKey };
            return generateImage(prompt, aspectRatio, {
                provider: imageProvider,
                model: imageModel,
                apiKey: imageApiKey,
                fallbackGeminiKey: keys.apiKey,
                fallbackOpenRouterKey: keys.openRouterKey,
                onModelMigrated: setImageModel,
                comfy: {
                    url: comfyUrl,
                    unet: comfyUnet,
                    clip: comfyClip,
                    vae: comfyVae,
                    lora: comfyLora,
                    loraStrength: comfyLoraStrength,
                    steps: comfySteps,
                    cfg: comfyCfg,
                    sampler: comfySampler,
                    scheduler: comfyScheduler,
                    timeoutSec: comfyTimeoutSec
                }
            });
        },
        [
            apiKey,
            comfyCfg,
            comfyClip,
            comfyLora,
            comfyLoraStrength,
            comfySampler,
            comfyScheduler,
            comfySteps,
            comfyTimeoutSec,
            comfyUnet,
            comfyUrl,
            comfyVae,
            getLlmKeys,
            imageApiKey,
            imageModel,
            imageProvider,
            openRouterKey
        ]
    );

    const generateCoverImage = useCallback(async () => {
        if (loadingCover || !story) return;
        setLoadingCover(true);
        try {
            const sysPrompt = `You are an expert graphic designer and book cover artist. Your task is to design a distinctive, professional book cover design concept.
You will take a novel's title, concept, status quo, inciting incident, and genre, and create a single highly detailed and symbolic image generation prompt for a book cover.
Focus on composition, central imagery, symbolic representations of the themes, lighting, and mood. The cover image should be designed for a vertical format.
Do not ask the image generator to print text on the cover (like the title or author name) to avoid scrambled AI text. Focus on the artwork itself.

## Input Schema Definition
You will receive the following novel information:
- Title: The novel title
- Genre: The genre
- Concept: The novel concept
- Status Quo: The world baseline
- Inciting Incident: The disruption

Output ONLY the raw image generation prompt itself. Do not include any intros or explanations. Wrap prompt text in standard envelope: <response><image_prompt>...</image_prompt></response>`;

            const styleObjRec = (story.style || {}) as Record<string, unknown>;
            const userPrompt = `NOVEL INFORMATION:
Title: ${String(story.title || 'Untitled Novel')}
Genre: ${String(styleObjRec.genre || 'Not specified')}
Concept: ${String(story.concept || 'Not specified')}
Status Quo: ${String(story.status_quo || 'Not specified')}
Inciting Incident: ${String(story.inciting_incident || 'Not specified')}

Please write a highly detailed and symbolic cover art image generation prompt. It must be optimized for a vertical aspect ratio. Describe the scene, layout, central motif, atmospheric colors, lighting, and symbolic imagery. Return ONLY the prompt text.

BEGIN GENERATING IMAGE PROMPT`;

            const promptBase = await callAI(
                userPrompt,
                sysPrompt,
                false,
                'Cover Image Prompt Agent',
                'dev'
            );

            const selectedStyleId = String(story.imageStyle || 'none');
            const combinedStyles = [...DEFAULT_IMAGE_STYLES, ...customImageStyles];
            const styleObj = combinedStyles.find((s) => s.id === selectedStyleId);
            const styleDescription = styleObj ? styleObj.description : '';
            const finalPrompt =
                cleanImagePrompt(promptBase) +
                (styleDescription ? `, ${styleDescription}` : '');

            const dataUrl = await callImageAPI(finalPrompt, '3:4');
            await imageStore.saveImage(`cover_${String(story.id)}`, dataUrl);
            setLoadedImages((prev) => ({ ...prev, cover: dataUrl }));
            showToast('Cover image generated successfully!');
        } catch (err) {
            console.error(err);
            const msg = err instanceof Error ? err.message : String(err);
            raiseAlert(`Cover Image Generation failed: ${msg}`);
        } finally {
            setLoadingCover(false);
        }
    }, [callAI, callImageAPI, customImageStyles, imageStore, loadingCover, raiseAlert, showToast, story]);

    const updateCharacterPortrait = useCallback(
        async (
            c: (Partial<CastMember> & Record<string, unknown>) | null | undefined,
            createDataUrl: () => Promise<string | null>,
            successMessage: string,
            errorPrefix: string
        ) => {
            if (!storyId || !c?.id) {
                showToast('A saved story and character are required for portraits.', 'error');
                return;
            }
            const activeId = storyId;
            const charId = String(c.id);
            const key = `portrait_${activeId}_${charId}`;
            if (portraitOperations.current.has(key)) return;
            portraitOperations.current.add(key);
            portraitRevisions.current.set(key, (portraitRevisions.current.get(key) || 0) + 1);
            setPortraitLoading((prev) => ({ ...prev, [charId]: true }));
            try {
                const dataUrl = await createDataUrl();
                if (dataUrl === null) await imageStore.deleteImage(key);
                else await imageStore.saveImage(key, dataUrl);
                if (portraitStoryId.current === activeId) {
                    setLoadedImages((prev) => {
                        if (portraitStoryId.current !== activeId) return prev;
                        const portraits = { ...(prev.portraits || {}) };
                        if (dataUrl === null) delete portraits[charId];
                        else portraits[charId] = dataUrl;
                        return { ...prev, portraits };
                    });
                    showToast(successMessage, 'success');
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                showToast(errorPrefix + msg, 'error');
            } finally {
                portraitOperations.current.delete(key);
                if (portraitStoryId.current === activeId) {
                    setPortraitLoading((prev) => {
                        if (portraitStoryId.current !== activeId) return prev;
                        const next = { ...prev };
                        delete next[charId];
                        return next;
                    });
                }
            }
        },
        [imageStore, showToast, storyId]
    );

    const generateCharacterPortrait = useCallback(
        async (c: (Partial<CastMember> & Record<string, unknown>) | null | undefined) =>
            updateCharacterPortrait(
                c,
                async () => {
                    const sysPrompt = `You are a character portrait artist. Write a detailed image generation prompt grounded in the supplied character's appearance, role and temperament.
Describe a waist-up, three-quarter view portrait, an expression that fits the character's temperament, and a plain softly lit background. Preserve any supplied physical traits. No text, no watermark.
Output only <response><image_prompt>...</image_prompt></response>.`;
                    const cDetails = (c?.details || {}) as Record<string, unknown>;
                    const characterInfo = [
                        'name',
                        'role',
                        'description',
                        'appearance',
                        'history',
                        'core_flaw',
                        'core_desire',
                        'vocal_cadence',
                        'voice_sample'
                    ]
                        .map((field) => `${field}: ${String(c?.[field] || cDetails[field] || 'Not specified')}`)
                        .join('\n');
                    const styleRec = (story?.style || {}) as Record<string, unknown>;
                    const userPrompt = `CHARACTER INFORMATION:
${characterInfo}
STORY GENRE: ${String(styleRec.genre || 'Not specified')}
STORY MOOD: ${String(styleRec.mood || 'Not specified')}
Create a waist-up, three-quarter view portrait prompt with an expression that fits this character's temperament, a plain softly lit background, no text, and no watermark.`;
                    const promptBase = await callAI(
                        userPrompt,
                        sysPrompt,
                        false,
                        'Character Portrait Prompt Agent',
                        'dev'
                    );
                    const selectedStyleId = String(story?.imageStyle || 'none');
                    const combinedStyles = [...DEFAULT_IMAGE_STYLES, ...customImageStyles];
                    const styleObj = combinedStyles.find((s) => s.id === selectedStyleId);
                    const styleDescription = styleObj ? styleObj.description : '';
                    const finalPrompt =
                        cleanImagePrompt(promptBase) +
                        (styleDescription ? `, ${styleDescription}` : '');
                    return callImageAPI(finalPrompt, '3:4');
                },
                `Portrait generated for ${c?.name || 'character'}.`,
                'Character portrait generation failed: '
            ),
        [callAI, callImageAPI, customImageStyles, story?.imageStyle, story?.style, updateCharacterPortrait]
    );

    const uploadCharacterPortrait = useCallback(
        async (
            c: (Partial<CastMember> & Record<string, unknown>) | null | undefined,
            file: File | null | undefined
        ) => {
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                showToast('Please select an image file.', 'error');
                return;
            }
            return updateCharacterPortrait(
                c,
                () =>
                    new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(String(reader.result || ''));
                        reader.onerror = () => reject(new Error('Failed to read the selected file.'));
                        reader.onabort = () => reject(new Error('Image upload was cancelled.'));
                        reader.readAsDataURL(file);
                    }),
                `Portrait uploaded for ${c?.name || 'character'}.`,
                'Character portrait upload failed: '
            );
        },
        [showToast, updateCharacterPortrait]
    );

    const removeCharacterPortrait = useCallback(
        async (c: (Partial<CastMember> & Record<string, unknown>) | null | undefined) =>
            updateCharacterPortrait(
                c,
                async () => null,
                `Portrait removed for ${c?.name || 'character'}.`,
                'Failed to remove character portrait: '
            ),
        [updateCharacterPortrait]
    );

    const deleteCoverImage = useCallback(async () => {
        requestConfirm({
            title: 'Remove Cover Image?',
            message: 'Are you sure you want to remove the cover illustration?',
            confirmLabel: 'Remove Cover',
            danger: true,
            onConfirm: async () => {
                try {
                    await imageStore.deleteImage(`cover_${String(story?.id)}`);
                    setLoadedImages((prev) => {
                        const copy = { ...prev };
                        delete copy.cover;
                        return copy;
                    });
                    showToast('Cover image removed.');
                } catch (err) {
                    console.error(err);
                    const msg = err instanceof Error ? err.message : String(err);
                    showToast(`Failed to delete cover image: ${msg}`, 'error');
                }
            }
        });
    }, [imageStore, requestConfirm, showToast, story?.id]);

    const handleCoverUpload = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                raiseAlert('Please select an image file.');
                return;
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = String(e.target?.result || '');
                try {
                    await imageStore.saveImage(`cover_${String(story?.id)}`, dataUrl);
                    setLoadedImages((prev) => ({ ...prev, cover: dataUrl }));
                    showToast('Cover image uploaded successfully!');
                    event.target.value = '';
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    raiseAlert(`Failed to save uploaded cover image: ${msg}`);
                }
            };
            reader.onerror = () => {
                raiseAlert('Failed to read the selected file.');
            };
            reader.readAsDataURL(file);
        },
        [imageStore, raiseAlert, showToast, story?.id]
    );

    const generateBeatImage = useCallback(
        async (seqIdx?: number, sceneIdx?: number, beatIdx?: number) => {
            let seq = seqIdx;
            let s = sceneIdx;
            let b = beatIdx;
            if (b === undefined && typeof seq === 'number' && typeof s === 'number') {
                b = s;
                s = seq;
                seq = selectedSequence !== null ? selectedSequence : 0;
            }
            if (seq === undefined || seq === null) {
                seq = selectedSequence !== null ? selectedSequence : 0;
            }
            if (s === undefined || s === null) s = selectedScene !== null ? selectedScene : 0;
            if (b === undefined) return;

            const sId = `${seq}-${s}`;
            const bId = `${sId}-${b}`;

            setLoadingImages((prev) => ({ ...prev, [bId]: true }));
            try {
                const scenesMap = (story?.scenes || {}) as Record<
                    string,
                    Array<SceneBlueprint & Record<string, unknown>>
                >;
                const scene = (scenesMap[`${seq}`] || [])[s];
                const curBeatsMap = (story?.beats || {}) as Record<
                    string,
                    Array<Record<string, unknown>>
                >;
                const beat = (curBeatsMap[sId] || [])[b];
                if (!beat || !scene) throw new Error('Beat not found.');

                const castArr = (story?.cast || []) as Array<CastMember & Record<string, unknown>>;
                const sceneCast = ((scene.cast_ids as string[] | undefined) || [])
                    .map((id) => castArr.find((c) => c.id === id))
                    .filter((c): c is CastMember & Record<string, unknown> => Boolean(c));
                const castInfo = sceneCast
                    .map(
                        (c) =>
                            `- ${c.name}: ${c.role || 'No role details'}. Core Desire: ${c.core_desire || 'Unknown'}. Core Flaw: ${c.core_flaw || 'Unknown'}.`
                    )
                    .join('\n');

                const sysPrompt = `You are a visual design agent. Your task is to take a narrative beat description and details about the characters present in the scene, and create a highly detailed, evocative, and specific image generation prompt.
Focus on describing the visual scene: composition, characters (appearance, clothing, expression, posture), setting, lighting, and mood.
Do not use buzzwords like "photorealistic", "ultra realistic", "8k", etc. Instead, write descriptive sentences that imply high quality and style.
Avoid long-winded meta-explanations.

## Input Schema Definition
You will receive the following context blocks:
- SCENE CONTEXT: Title and description of the scene.
- CHARACTERS PRESENT IN SCENE: Details of characters present.
- NARRATIVE BEAT TO VISUALIZE: Description and emotional subtext of the beat.

Output ONLY the raw image generation prompt itself. Do not include any intro or wrap in JSON. Wrap prompt text in standard envelope: <response><image_prompt>...</image_prompt></response>`;

                const userPrompt = `SCENE CONTEXT:
Title: ${String(scene.title || '')}
Blueprint Summary:
${formatSceneSummary(scene) || String(scene.scene_events || scene.objective || '')}

CHARACTERS PRESENT IN SCENE:
${castInfo}

NARRATIVE BEAT TO VISUALIZE:
Description: ${String(beat.description || '')}
Emotional Subtext: ${String(beat.emotional_shift || 'None')}

Please write a highly descriptive and specific image generation prompt focusing on the visual elements of this beat. Make it a single paragraph, rich in sensory details, character details, composition, and lighting. Do not include style-specific instructions, as a style will be appended later. Return ONLY the description.

BEGIN GENERATING IMAGE PROMPT`;

                const promptBase = await callAI(
                    userPrompt,
                    sysPrompt,
                    false,
                    'Beat Image Prompt Agent',
                    'dev'
                );

                const selectedStyleId = String(story?.imageStyle || 'none');
                const combinedStyles = [...DEFAULT_IMAGE_STYLES, ...customImageStyles];
                const styleObj = combinedStyles.find((st) => st.id === selectedStyleId);
                const styleDescription = styleObj ? styleObj.description : '';
                const finalPrompt =
                    cleanImagePrompt(promptBase) +
                    (styleDescription ? `, ${styleDescription}` : '');

                const dataUrl = await callImageAPI(finalPrompt, '1:1');
                await imageStore.saveImage(`beat_${String(story?.id)}_${sId}_${b}`, dataUrl);
                setLoadedImages((prev) => ({ ...prev, [bId]: dataUrl }));
                showToast(`Beat ${b + 1} image generated successfully!`);
            } catch (err) {
                console.error(err);
                const msg = err instanceof Error ? err.message : String(err);
                raiseAlert(`Beat Image Generation failed: ${msg}`);
            } finally {
                setLoadingImages((prev) => ({ ...prev, [bId]: false }));
            }
        },
        [
            callAI,
            callImageAPI,
            customImageStyles,
            imageStore,
            raiseAlert,
            selectedScene,
            selectedSequence,
            showToast,
            story?.beats,
            story?.cast,
            story?.id,
            story?.imageStyle,
            story?.scenes
        ]
    );

    const deleteBeatImage = useCallback(
        async (seqIdx?: number, sceneIdx?: number, beatIdx?: number) => {
            let seq = seqIdx;
            let s = sceneIdx;
            let b = beatIdx;
            if (b === undefined && typeof seq === 'number' && typeof s === 'number') {
                b = s;
                s = seq;
                seq = selectedSequence !== null ? selectedSequence : 0;
            }
            if (seq === undefined || seq === null) {
                seq = selectedSequence !== null ? selectedSequence : 0;
            }
            if (s === undefined || s === null) s = selectedScene !== null ? selectedScene : 0;
            if (b === undefined) return;
            const resolvedBeatIdx = b;
            requestConfirm({
                title: `Remove Image for Beat ${resolvedBeatIdx + 1}?`,
                message: 'Are you sure you want to remove this beat illustration?',
                confirmLabel: 'Remove Image',
                danger: true,
                onConfirm: async () => {
                    const sId = `${seq}-${s}`;
                    const bId = `${sId}-${resolvedBeatIdx}`;
                    try {
                        await imageStore.deleteImage(`beat_${String(story?.id)}_${sId}_${resolvedBeatIdx}`);
                        setLoadedImages((prev) => {
                            const copy = { ...prev };
                            delete copy[bId];
                            return copy;
                        });
                        showToast(`Beat ${resolvedBeatIdx + 1} image removed.`);
                    } catch (err) {
                        console.error(err);
                        const msg = err instanceof Error ? err.message : String(err);
                        showToast(`Failed to delete beat image: ${msg}`, 'error');
                    }
                }
            });
        },
        [imageStore, requestConfirm, selectedScene, selectedSequence, showToast, story?.id]
    );

    const generateSceneImage = useCallback(
        async (seqIdx?: number | null, sceneIdx?: number | null) => {
            const seq =
                seqIdx !== undefined && seqIdx !== null
                    ? seqIdx
                    : selectedSequence !== null
                      ? selectedSequence
                      : 0;
            const s =
                sceneIdx !== undefined && sceneIdx !== null
                    ? sceneIdx
                    : selectedScene !== null
                      ? selectedScene
                      : 0;
            const sId = `${seq}-${s}`;

            if (!storyId) {
                showToast(
                    'Please save your story project before generating illustrations.',
                    'error'
                );
                return;
            }

            const proseMap = (story?.prose || {}) as Record<
                string,
                { final?: string; draft?: string } | undefined
            >;
            const sceneProse = proseMap[sId];
            const proseText = String(sceneProse?.final || sceneProse?.draft || '').trim();
            if (!proseText) {
                showToast(
                    'Scene narrative prose is required to generate an illustration. Draft or write the scene first.',
                    'error'
                );
                return;
            }

            const sceneKey = `scene_${sId}`;
            setLoadingImages((prev) => ({ ...prev, [sceneKey]: true }));

            try {
                const scenesMap = (story?.scenes || {}) as Record<
                    string,
                    Array<SceneBlueprint & Record<string, unknown>>
                >;
                const scene = (scenesMap[`${seq}`] || [])[s];
                const sceneTitle = scene?.title || `Scene ${s + 1}`;
                const sceneDesc = scene
                    ? formatSceneSummary(scene) || 'No description provided'
                    : 'No description provided';

                const castArr = (story?.cast || []) as Array<
                    ActiveCastMember & Record<string, unknown>
                >;
                const resolvedCast = scene ? getSceneActiveCast(scene, castArr) : [];
                const sceneCast: Array<ActiveCastMember & Record<string, unknown>> =
                    resolvedCast.length > 0
                        ? (resolvedCast as Array<ActiveCastMember & Record<string, unknown>>)
                        : ((scene?.cast_ids as string[] | undefined) || [])
                              .map((id) => castArr.find((c) => c.id === id))
                              .filter(
                                  (c): c is ActiveCastMember & Record<string, unknown> => Boolean(c)
                              );
                const castInfo =
                    sceneCast.length > 0
                        ? sceneCast
                              .map(
                                  (c) =>
                                      `- ${c.name}: ${c.role || 'No role details'}. Visual traits: ${String(c.visual_description || c.appearance || 'Not specified')}.`
                              )
                              .join('\n')
                        : 'No specific cast defined for this scene.';

                const proseExcerpt =
                    proseText.length > 3500 ? `${proseText.slice(0, 3500)}...` : proseText;

                const sysPrompt = `You are a master cinematic concept artist and visual design agent for publishing. Your task is to analyze the narrative prose of a scene, along with the scene setting and characters, and create a highly detailed, evocative, cinematic image generation prompt capturing the scene's key dramatic climax or most visually striking moment.
Focus on describing the visual scene: composition, camera angle, character positioning, facial expressions, attire, environment/setting, atmosphere, dramatic lighting, color palette, and mood.
Do not use buzzwords like "photorealistic", "ultra realistic", "8k", or "trending on artstation". Instead, write vivid descriptive sentences that establish cinematic texture, depth, and emotional gravity.
Avoid long-winded meta-explanations.

## Input Schema Definition
You will receive:
- SCENE CONTEXT: Title, sequence, and narrative purpose.
- CHARACTERS PRESENT: Cast details and visual traits.
- SCENE NARRATIVE PROSE: The actual prose text from the manuscript.

Output ONLY the raw image generation prompt itself. Wrap the prompt text in standard envelope: <response><image_prompt>...</image_prompt></response>`;

                const userPrompt = `SCENE CONTEXT:
Title: ${sceneTitle}
Description: ${sceneDesc}

CHARACTERS IN SCENE:
${castInfo}

SCENE NARRATIVE PROSE:
${proseExcerpt}

Please craft a single, highly evocative and descriptive widescreen (16:9) cinematic concept art prompt that captures the dramatic peak and visual atmosphere of this scene. Focus on concrete visuals, environment details, character actions/expressions, and lighting. Do not include style-specific instructions as a global art style will be appended. Return ONLY the prompt wrapped in <response><image_prompt>...</image_prompt></response>.

BEGIN GENERATING IMAGE PROMPT`;

                const promptBase = await callAI(
                    userPrompt,
                    sysPrompt,
                    false,
                    'Scene Image Prompt Agent',
                    'dev'
                );

                const selectedStyleId = String(story?.imageStyle || 'none');
                const combinedStyles = [...DEFAULT_IMAGE_STYLES, ...customImageStyles];
                const styleObj = combinedStyles.find((st) => st.id === selectedStyleId);
                const styleDescription = styleObj ? styleObj.description : '';
                const finalPrompt =
                    cleanImagePrompt(promptBase) +
                    (styleDescription ? `, ${styleDescription}` : '');

                const dataUrl = await callImageAPI(finalPrompt, '16:9');
                await imageStore.saveImage(`scene_${storyId}_${sId}`, dataUrl);
                setLoadedImages((prev) => ({ ...prev, [sceneKey]: dataUrl }));
                showToast(`${sceneTitle} illustration generated successfully!`);
            } catch (err) {
                console.error(err);
                const msg = err instanceof Error ? err.message : String(err);
                raiseAlert(`Scene Illustration Generation failed: ${msg}`);
            } finally {
                setLoadingImages((prev) => ({ ...prev, [sceneKey]: false }));
            }
        },
        [
            callAI,
            callImageAPI,
            customImageStyles,
            imageStore,
            raiseAlert,
            selectedScene,
            selectedSequence,
            showToast,
            story?.cast,
            story?.imageStyle,
            story?.prose,
            story?.scenes,
            storyId
        ]
    );

    const deleteSceneImage = useCallback(
        async (seqIdx?: number | null, sceneIdx?: number | null) => {
            const seq =
                seqIdx !== undefined && seqIdx !== null
                    ? seqIdx
                    : selectedSequence !== null
                      ? selectedSequence
                      : 0;
            const s =
                sceneIdx !== undefined && sceneIdx !== null
                    ? sceneIdx
                    : selectedScene !== null
                      ? selectedScene
                      : 0;
            const sId = `${seq}-${s}`;
            const sceneKey = `scene_${sId}`;

            requestConfirm({
                title: 'Remove Scene Illustration?',
                message: 'Are you sure you want to remove the illustration for this scene?',
                confirmLabel: 'Remove Illustration',
                danger: true,
                onConfirm: async () => {
                    try {
                        await imageStore.deleteImage(`scene_${String(story?.id)}_${sId}`);
                        setLoadedImages((prev) => {
                            const copy = { ...prev };
                            delete copy[sceneKey];
                            return copy;
                        });
                        showToast('Scene illustration removed.');
                    } catch (err) {
                        console.error(err);
                        const msg = err instanceof Error ? err.message : String(err);
                        showToast(`Failed to delete scene illustration: ${msg}`, 'error');
                    }
                }
            });
        },
        [imageStore, requestConfirm, selectedScene, selectedSequence, showToast, story?.id]
    );

    return {
        imageStore,
        imageProvider,
        setImageProvider,
        imageModel,
        setImageModel,
        geminiImageModelsList,
        setGeminiImageModelsList,
        openRouterImageModelsList,
        setOpenRouterImageModelsList,
        isFetchingImageModels,
        setIsFetchingImageModels,
        imageApiKey,
        setImageApiKey,
        comfyUrl,
        setComfyUrl,
        comfyUnet,
        setComfyUnet,
        comfyClip,
        setComfyClip,
        comfyVae,
        setComfyVae,
        comfyLora,
        setComfyLora,
        comfyLoraStrength,
        setComfyLoraStrength,
        comfySteps,
        setComfySteps,
        comfyCfg,
        setComfyCfg,
        comfySampler,
        setComfySampler,
        comfyScheduler,
        setComfyScheduler,
        comfyTimeoutSec,
        setComfyTimeoutSec,
        comfyStatus,
        setComfyStatus,
        comfyOptions,
        setComfyOptions,
        comfyRefreshId,
        customImageStyles,
        setCustomImageStyles,
        loadedImages,
        setLoadedImages,
        portraitLoading,
        portraitReload,
        setPortraitReload,
        loadingCover,
        loadingImages,
        newStyleName,
        setNewStyleName,
        newStyleDesc,
        setNewStyleDesc,
        callImageAPI,
        generateCoverImage,
        updateCharacterPortrait,
        generateCharacterPortrait,
        uploadCharacterPortrait,
        removeCharacterPortrait,
        deleteCoverImage,
        handleCoverUpload,
        generateBeatImage,
        deleteBeatImage,
        generateSceneImage,
        deleteSceneImage
    };
}
