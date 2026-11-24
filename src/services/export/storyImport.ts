/**
 * @module services/export/storyImport
 * Parses `.json` and EllipsisProse `.epub` bundles and persists stories, images, and MP3 scene audio.
 */

import { migrateStoryToSequences } from '@/domain/lifecycle';
import { ensureJSZip, type JSZipArchive } from '@/services/documents';
import {
    audioStore as defaultAudioStore,
    imageStore as defaultImageStore,
    storyStore as defaultStoryStore,
    type AudioStore,
    type ImageStore,
    type StoryStore
} from '@/services/storage';

export interface ImportedAudioManifestEntry {
    href?: string;
    durationSec?: number;
    textHash?: string;
    cueCount?: number;
    cueTimeline?: unknown[] | null;
}

export interface ParsedStoryImportPayload {
    story: Record<string, unknown>;
    images: Record<string, string> | null;
    zipInstance: JSZipArchive | null;
    audioManifest: Record<string, ImportedAudioManifestEntry> | null;
}

export interface ConfirmOverwriteParams {
    existingStoryId: string;
    mergedStory: Record<string, unknown>;
}

export interface PersistImportedStoryOptions {
    confirmOverwrite: (params: ConfirmOverwriteParams) => Promise<boolean>;
    storyStore?: Pick<StoryStore, 'loadStory' | 'saveStory'>;
    imageStore?: Pick<ImageStore, 'saveImage' | 'getImage'>;
    audioStore?: Pick<AudioStore, 'deleteStoryAudio' | 'saveSceneAudio' | 'getSceneAudio'>;
    onAfterAudioImport?: (storyId: string) => Promise<void> | void;
}

export interface PersistImportedStoryResult {
    storyId: string;
    story: Record<string, unknown>;
    coverUrl: string | null;
    importedAudioCount: number;
    totalDraftedScenes: number;
    firstSceneCoord: { seqIdx: number; sceneIdx: number };
}

function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (typeof e.target?.result === 'string') {
                resolve(e.target.result);
            } else {
                reject(new Error('Invalid file format.'));
            }
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read import file.'));
        reader.readAsText(file);
    });
}

/** Parses an uploaded `.epub` or `.json` story file into structured story, image, and audio manifest payloads. */
export async function parseStoryImportFile(file: File): Promise<ParsedStoryImportPayload> {
    if (file.name.endsWith('.epub')) {
        const JSZip = await ensureJSZip();
        const zip = new JSZip();
        let zipInstance: JSZipArchive;
        try {
            const fileBuffer = await file.arrayBuffer();
            zipInstance = await zip.loadAsync(fileBuffer);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Error parsing EPUB: ${msg}`, { cause: error });
        }

        const storyFile = zipInstance.file('META-INF/story.json');
        if (!storyFile) {
            throw new Error(
                'This EPUB was not exported from EllipsisProse or is missing database info.'
            );
        }

        const jsonText = await storyFile.async('text');
        const dbData = JSON.parse(jsonText) as {
            story?: Record<string, unknown>;
            images?: Record<string, string> | null;
            audioManifest?: Record<string, ImportedAudioManifestEntry> | null;
        } | null;

        if (!dbData || !dbData.story || typeof dbData.story !== 'object') {
            throw new Error('Invalid story database info inside EPUB.');
        }

        return {
            story: dbData.story,
            images: dbData.images || null,
            zipInstance,
            audioManifest: dbData.audioManifest || null
        };
    }

    const rawText = await readFileAsText(file);
    let imported: unknown;
    try {
        imported = JSON.parse(rawText);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Import error: ${msg}`, { cause: error });
    }

    if (
        !imported ||
        typeof imported !== 'object' ||
        Array.isArray(imported) ||
        Object.keys(imported).length === 0
    ) {
        throw new Error('Invalid file format.');
    }

    return {
        story: imported as Record<string, unknown>,
        images: null,
        zipInstance: null,
        audioManifest: null
    };
}

/** Migrates, resolves ID collisions, and persists an imported story with its images and EPUB audio tracks. */
export async function persistImportedStory(
    payload: ParsedStoryImportPayload,
    options: PersistImportedStoryOptions
): Promise<PersistImportedStoryResult> {
    const targetStoryStore = options.storyStore ?? defaultStoryStore;
    const targetImageStore = options.imageStore ?? defaultImageStore;
    const targetAudioStore = options.audioStore ?? defaultAudioStore;

    const defaultStory: Record<string, unknown> = {
        title: 'Untitled Story',
        writing_mode: 'novel',
        concept: '',
        status_quo: '',
        inciting_incident: '',
        themes: '',
        style: { genre: '', mood: '', writing_guide: '' },
        threads: [],
        lore: [],
        cast: [],
        acts: [],
        sequences: [],
        scenes: {},
        beats: {},
        prose: {},
        continuity_ledger: [],
        relationships: {},
        graph_edges: [],
        generation_ranges: null
    };

    const migratedStory = migrateStoryToSequences(payload.story);
    const mergedStory: Record<string, unknown> = {
        ...defaultStory,
        ...migratedStory,
        continuity_ledger: Array.isArray(migratedStory?.continuity_ledger)
            ? migratedStory.continuity_ledger
            : []
    };

    const oldId = typeof mergedStory.id === 'string' && mergedStory.id ? mergedStory.id : undefined;
    let newId = oldId || `story_${Date.now()}`;

    // Collision check
    if (oldId) {
        const existingStory = await targetStoryStore.loadStory(oldId);
        if (existingStory) {
            const overwrite = await options.confirmOverwrite({
                existingStoryId: oldId,
                mergedStory
            });
            if (!overwrite) {
                newId = `story_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                mergedStory.id = newId;
                const dateStr = new Date().toISOString().slice(0, 10);
                const originalTitle =
                    typeof mergedStory.title === 'string' && mergedStory.title
                        ? mergedStory.title
                        : 'Untitled Story';
                mergedStory.title = `${originalTitle} (Imported ${dateStr})`;
            } else {
                try {
                    await targetAudioStore.deleteStoryAudio(newId);
                } catch {
                    // Ignore non-fatal audio cleanup failure before overwrite
                }
            }
        }
    }

    // Save the story
    await targetStoryStore.saveStory(newId, mergedStory);

    // Import images if provided
    if (payload.images && typeof payload.images === 'object') {
        for (const key of Object.keys(payload.images)) {
            let targetKey = key;
            if (oldId && newId !== oldId) {
                if (key.startsWith(`cover_${oldId}`)) {
                    targetKey = `cover_${newId}`;
                } else if (key.startsWith(`beat_${oldId}_`)) {
                    targetKey = key.replace(`beat_${oldId}_`, `beat_${newId}_`);
                } else if (key.startsWith(`portrait_${oldId}_`)) {
                    targetKey = key.replace(`portrait_${oldId}_`, `portrait_${newId}_`);
                } else if (key.startsWith(`scene_${oldId}_`)) {
                    targetKey = key.replace(`scene_${oldId}_`, `scene_${newId}_`);
                }
            }
            const dataUrl = payload.images[key];
            if (dataUrl) {
                await targetImageStore.saveImage(targetKey, dataUrl);
            }
        }
    }

    // Import scene audio MP3s if present (EPUB 3.0 packaging)
    let importedAudioCount = 0;
    if (payload.zipInstance) {
        try {
            const manifestToUse =
                payload.audioManifest && typeof payload.audioManifest === 'object'
                    ? payload.audioManifest
                    : {};

            for (const [sKey, aMeta] of Object.entries(manifestToUse)) {
                const parts = sKey.split('-');
                if (parts.length === 2) {
                    const sSeq = parseInt(parts[0], 10);
                    const sScene = parseInt(parts[1], 10);
                    const targetHref = aMeta?.href || `Audio/scene_${sSeq}_${sScene}.mp3`;
                    const fullZipPath = targetHref.startsWith('OEBPS/')
                        ? targetHref
                        : `OEBPS/${targetHref}`;
                    const audioFile =
                        payload.zipInstance.file(fullZipPath) || payload.zipInstance.file(targetHref);
                    if (audioFile) {
                        const rawBuffer = await audioFile.async('arraybuffer');
                        const mp3Blob = new Blob([rawBuffer], { type: 'audio/mpeg' });
                        await targetAudioStore.saveSceneAudio({
                            storyId: newId,
                            seqIdx: sSeq,
                            sceneIdx: sScene,
                            blob: mp3Blob,
                            mimeType: 'audio/mpeg',
                            durationSec: aMeta?.durationSec || 0,
                            textHash: aMeta?.textHash || '',
                            cueCount:
                                (Array.isArray(aMeta?.cueTimeline) && aMeta.cueTimeline.length) ||
                                aMeta?.cueCount ||
                                0,
                            cueTimeline: Array.isArray(aMeta?.cueTimeline) ? aMeta.cueTimeline : null
                        });
                        importedAudioCount++;
                    }
                }
            }

            // Fallback scan for any OEBPS/Audio/scene_*.mp3 not listed in manifest
            const audioZipFiles = payload.zipInstance.file(/^OEBPS\/Audio\/scene_\d+_\d+\.mp3$/i);
            if (Array.isArray(audioZipFiles)) {
                for (const aFile of audioZipFiles) {
                    const match = aFile.name.match(/scene_(\d+)_(\d+)\.mp3$/i);
                    if (match) {
                        const sSeq = parseInt(match[1], 10);
                        const sScene = parseInt(match[2], 10);
                        const existing = await targetAudioStore.getSceneAudio(newId, sSeq, sScene);
                        if (!existing) {
                            const rawBuffer = await aFile.async('arraybuffer');
                            const mp3Blob = new Blob([rawBuffer], { type: 'audio/mpeg' });
                            await targetAudioStore.saveSceneAudio({
                                storyId: newId,
                                seqIdx: sSeq,
                                sceneIdx: sScene,
                                blob: mp3Blob,
                                mimeType: 'audio/mpeg',
                                durationSec: 0,
                                textHash: '',
                                cueCount: 0,
                                cueTimeline: null
                            });
                            importedAudioCount++;
                        }
                    }
                }
            }

            await options.onAfterAudioImport?.(newId);
        } catch (audioImportErr) {
            console.warn('Failed to extract scene audio from EPUB:', audioImportErr);
        }
    }

    let coverUrl: string | null;
    try {
        coverUrl = await targetImageStore.getImage(`cover_${newId}`);
    } catch {
        coverUrl = null;
    }

    const proseMap =
        mergedStory.prose && typeof mergedStory.prose === 'object'
            ? (mergedStory.prose as Record<string, unknown>)
            : {};
    const proseEntries = Object.keys(proseMap)
        .filter((k) => {
            const p = proseMap[k];
            const txt =
                typeof p === 'string'
                    ? p
                    : p && typeof p === 'object'
                      ? String(
                            (p as { final?: unknown; draft?: unknown }).final ||
                                (p as { final?: unknown; draft?: unknown }).draft ||
                                ''
                        )
                      : '';
            return Boolean(txt && txt.trim());
        })
        .sort((a, b) => {
            const [aq, as] = a.split('-').map(Number);
            const [bq, bs] = b.split('-').map(Number);
            return aq !== bq ? aq - bq : as - bs;
        });

    const totalDraftedScenes = proseEntries.length;
    const firstEntry = proseEntries[0] || '0-0';
    const [startSeq, startSc] = firstEntry.split('-').map((n) => parseInt(n, 10) || 0);

    return {
        storyId: newId,
        story: mergedStory,
        coverUrl,
        importedAudioCount,
        totalDraftedScenes,
        firstSceneCoord: { seqIdx: startSeq, sceneIdx: startSc }
    };
}
