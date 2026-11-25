/**
 * @module domain/story/customNarrativeModes
 * Rules for user-defined narrative modes (Settings → Narrative Modes): id normalisation, draft
 * validation, and cascading a renamed mode id through a story's scene blueprints.
 */

import { NARRATIVE_MODES, type NarrativeModeDefinition } from '@/config';
import type { SceneBlueprint } from '@/types';

export type CustomNarrativeModes = Record<string, NarrativeModeDefinition>;

export interface CustomModeDraft {
    id: string;
    context: string;
    prompt: string;
    icon: string;
}

export type CustomModeValidation =
    | { ok: true; mode: NarrativeModeDefinition }
    | { ok: false; error: string };

/** Mode ids are upper-case `A-Z`, digits and `_`; everything else is stripped. */
export function normalizeCustomModeId(rawId: string): string {
    return String(rawId || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '');
}

/**
 * Validates the Settings form for a custom mode. `editingModeId` is the id being edited (null
 * when adding); an edit may keep its own id but may not take another custom mode's, and no
 * custom mode may shadow a built-in one.
 */
export function validateCustomModeDraft(
    draft: CustomModeDraft,
    customModes: CustomNarrativeModes,
    editingModeId: string | null
): CustomModeValidation {
    const id = normalizeCustomModeId(draft.id);
    if (!id) return { ok: false, error: 'Please enter a valid Mode ID.' };
    if (NARRATIVE_MODES[id]) {
        return { ok: false, error: 'This Mode ID conflicts with a built-in narrative mode.' };
    }
    if (editingModeId) {
        if (id !== editingModeId && customModes[id]) {
            return { ok: false, error: 'Another custom narrative mode with this ID already exists.' };
        }
    } else if (customModes[id]) {
        return { ok: false, error: 'A narrative mode with this ID already exists.' };
    }
    if (!draft.context.trim()) {
        return { ok: false, error: 'Please enter a description context for the mode.' };
    }
    if (!draft.prompt.trim()) {
        return { ok: false, error: 'Please enter prompt instructions for the mode.' };
    }
    return {
        ok: true,
        mode: { id, context: draft.context.trim(), prompt: draft.prompt.trim(), icon: draft.icon }
    };
}

/** Replaces a custom mode, dropping `previousId` when the mode was renamed. */
export function upsertCustomMode(
    customModes: CustomNarrativeModes,
    mode: NarrativeModeDefinition,
    previousId: string | null = null
): CustomNarrativeModes {
    const next = { ...customModes };
    if (previousId && previousId !== mode.id) delete next[previousId];
    next[mode.id] = mode;
    return next;
}

export function removeCustomMode(customModes: CustomNarrativeModes, modeId: string): CustomNarrativeModes {
    const next = { ...customModes };
    delete next[modeId];
    return next;
}

/**
 * Points every scene that used narrative mode `fromId` at `toId`. Returns the same story when no
 * scene used it (or the story has no scenes).
 */
export function renameNarrativeModeInScenes<T extends { scenes?: Record<string, SceneBlueprint[]> }>(
    story: T,
    fromId: string,
    toId: string
): T {
    if (!story || !story.scenes) return story;
    let changed = false;
    const updatedScenes: Record<string, SceneBlueprint[]> = {};
    Object.keys(story.scenes).forEach((seqKey) => {
        const sceneList = (story.scenes as Record<string, SceneBlueprint[]>)[seqKey];
        if (Array.isArray(sceneList)) {
            updatedScenes[seqKey] = sceneList.map((scene) => {
                if (scene && scene.dominant_narrative_mode === fromId) {
                    changed = true;
                    return { ...scene, dominant_narrative_mode: toId };
                }
                return scene;
            });
        } else {
            updatedScenes[seqKey] = sceneList;
        }
    });
    return changed ? { ...story, scenes: updatedScenes } : story;
}
