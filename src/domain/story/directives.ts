/**
 * @module domain/story/directives
 * Directive Agent action classification, written-prose protection boundaries,
 * target label formatting, and before/after diff previews.
 */

import type { Story } from '@/types';
import { actForSequence } from './structure';

export const DIRECTIVE_STRUCTURAL_ACTIONS: ReadonlySet<string> = new Set([
    'MODIFY_ACT',
    'MODIFY_SEQUENCE',
    'MODIFY_SCENE',
    'ADD_SCENE',
    'DELETE_SCENE',
    'ADD_SEQUENCE',
    'DELETE_SEQUENCE',
    'MOVE_SCENE',
    'REWRITE_PROSE'
]);

export const DIRECTIVE_PROSE_SAFE_ACTIONS: ReadonlySet<string> = new Set([
    'SURGICAL_PATCH_PROSE',
    'LINE_EDIT_PROSE'
]);

export interface DirectiveActionMeta {
    label: string;
    scopeBadge: string;
    category: 'mandate' | 'blueprint' | 'destructive' | 'prose' | 'entity' | string;
    targetMode: 'act' | 'sequence' | 'scene' | 'none';
    colorClass: string;
}

export interface DirectiveStoryStats {
    actCount: number;
    seqCount: number;
    plannedSceneCount: number;
    writtenSceneCount: number;
    undevelopedSeqCount: number;
    firstUnwrittenSeq: { seqIdx: number; number: number; title: string } | null;
    firstDevelopedSeq: { seqIdx: number; number: number; title: string } | null;
    latestWrittenRef: { seqIdx: number; sceneIdx: number; label: string } | null;
    firstCastName: string;
    hasOutline: boolean;
}

export interface DirectiveActionDiffItem {
    label: string;
    before: string;
    after: string;
    mode: 'append' | 'modify' | 'add' | 'remove';
}

export interface DirectiveActionInput {
    action_type?: string;
    target_act_idx?: number | string;
    target_sequence_idx?: number | string;
    target_seq_idx?: number | string;
    target_scene_idx?: number | string;
    target_character_id?: string;
    description?: string;
    details?: Record<string, unknown>;
    [key: string]: unknown;
}

export const DIRECTIVE_ACTION_META: Record<string, DirectiveActionMeta> = {
    PERSIST_FUTURE_MANDATE: { label: 'Persist Future Mandate', scopeBadge: 'Future Mandate', category: 'mandate', targetMode: 'sequence', colorClass: 'bg-iris-tint text-iris-800 border-iris-edge' },
    MODIFY_ACT: { label: 'Modify Act', scopeBadge: 'Act Arc', category: 'blueprint', targetMode: 'act', colorClass: 'bg-azure-tint text-azure-800 border-azure-edge' },
    MODIFY_SEQUENCE: { label: 'Modify Sequence', scopeBadge: 'Sequence', category: 'blueprint', targetMode: 'sequence', colorClass: 'bg-iris-tint text-iris-800 border-iris-edge' },
    ADD_SEQUENCE: { label: 'Add Sequence', scopeBadge: 'Sequence', category: 'blueprint', targetMode: 'act', colorClass: 'bg-iris-tint text-iris-800 border-iris-edge' },
    DELETE_SEQUENCE: { label: 'Delete Sequence', scopeBadge: 'Destructive', category: 'destructive', targetMode: 'sequence', colorClass: 'bg-blush-tint text-blush-800 border-blush-edge' },
    MODIFY_SCENE: { label: 'Modify Scene Blueprint', scopeBadge: 'Scene Blueprint', category: 'blueprint', targetMode: 'scene', colorClass: 'bg-gold-tint text-gold-ink border-gold-edge' },
    ADD_SCENE: { label: 'Add Scene Blueprint', scopeBadge: 'New Scene', category: 'blueprint', targetMode: 'sequence', colorClass: 'bg-sage-tint text-sage-800 border-sage-edge' },
    DELETE_SCENE: { label: 'Delete Scene', scopeBadge: 'Destructive', category: 'destructive', targetMode: 'scene', colorClass: 'bg-blush-tint text-blush-800 border-blush-edge' },
    MOVE_SCENE: { label: 'Move Scene', scopeBadge: 'Scene Blueprint', category: 'blueprint', targetMode: 'scene', colorClass: 'bg-gold-tint text-gold-ink border-gold-edge' },
    SURGICAL_PATCH_PROSE: { label: 'Surgical Prose Patch', scopeBadge: 'Written Prose', category: 'prose', targetMode: 'scene', colorClass: 'bg-plum-tint text-plum-800 border-plum-edge' },
    LINE_EDIT_PROSE: { label: 'Line Edit Prose', scopeBadge: 'Written Prose', category: 'prose', targetMode: 'scene', colorClass: 'bg-orchid-tint text-orchid-800 border-orchid-edge' },
    REWRITE_PROSE: { label: 'Write / Rewrite Prose', scopeBadge: 'Written Prose', category: 'prose', targetMode: 'scene', colorClass: 'bg-tangerine-tint text-tangerine-800 border-tangerine-edge' },
    MODIFY_STORY_METADATA: { label: 'Modify Story Metadata', scopeBadge: 'Story Premise', category: 'entity', targetMode: 'none', colorClass: 'bg-purple-tint text-purple-800 border-purple-edge' },
    ADD_LORE: { label: 'Add Lore', scopeBadge: 'World Bible', category: 'entity', targetMode: 'none', colorClass: 'bg-purple-tint text-purple-800 border-purple-edge' },
    MODIFY_LORE: { label: 'Modify Lore', scopeBadge: 'World Bible', category: 'entity', targetMode: 'none', colorClass: 'bg-purple-tint text-purple-800 border-purple-edge' },
    ADD_SECRET: { label: 'Add Secret', scopeBadge: 'Secret Vault', category: 'entity', targetMode: 'none', colorClass: 'bg-purple-tint text-purple-800 border-purple-edge' },
    MODIFY_SECRET: { label: 'Modify Secret', scopeBadge: 'Secret Vault', category: 'entity', targetMode: 'none', colorClass: 'bg-purple-tint text-purple-800 border-purple-edge' },
    ADD_CHARACTER: { label: 'Add Character', scopeBadge: 'Cast & Arcs', category: 'entity', targetMode: 'none', colorClass: 'bg-teal-tint text-teal-800 border-teal-edge' },
    MODIFY_CHARACTER: { label: 'Modify Character', scopeBadge: 'Cast & Arcs', category: 'entity', targetMode: 'none', colorClass: 'bg-teal-tint text-teal-800 border-teal-edge' },
    DELETE_CHARACTER: { label: 'Delete Character', scopeBadge: 'Destructive', category: 'destructive', targetMode: 'none', colorClass: 'bg-blush-tint text-blush-800 border-blush-edge' },
    MODIFY_RELATIONSHIP: { label: 'Modify Relationship', scopeBadge: 'Dynamics', category: 'entity', targetMode: 'none', colorClass: 'bg-teal-tint text-teal-800 border-teal-edge' },
    MODIFY_CHARACTER_ARC: { label: 'Modify Character Arc', scopeBadge: 'Cast & Arcs', category: 'entity', targetMode: 'none', colorClass: 'bg-teal-tint text-teal-800 border-teal-edge' },
    ADD_CONTINUITY_FACT: { label: 'Add Continuity Fact', scopeBadge: 'Continuity', category: 'entity', targetMode: 'scene', colorClass: 'bg-azure-tint text-azure-800 border-azure-edge' },
    ADD_THREAD: { label: 'Add Narrative Thread', scopeBadge: 'Threads', category: 'entity', targetMode: 'none', colorClass: 'bg-azure-tint text-azure-800 border-azure-edge' },
    MODIFY_THREAD: { label: 'Modify Narrative Thread', scopeBadge: 'Threads', category: 'entity', targetMode: 'none', colorClass: 'bg-azure-tint text-azure-800 border-azure-edge' },
    DELETE_THREAD: { label: 'Delete Narrative Thread', scopeBadge: 'Destructive', category: 'destructive', targetMode: 'none', colorClass: 'bg-blush-tint text-blush-800 border-blush-edge' },
    ADD_PROPOSITION: { label: 'Add Epistemic Proposition', scopeBadge: 'Knowledge Graph', category: 'entity', targetMode: 'none', colorClass: 'bg-azure-tint text-azure-800 border-azure-edge' },
    MODIFY_EPISTEMIC_BELIEF: { label: 'Modify Epistemic Belief', scopeBadge: 'Knowledge Graph', category: 'entity', targetMode: 'none', colorClass: 'bg-azure-tint text-azure-800 border-azure-edge' }
};

/** Checks whether a structural directive action is blocked by the written-prose boundary. */
export function isActionBlockedByProtection(
    action: DirectiveActionInput,
    story: Partial<Story> & Record<string, unknown>,
    protectWrittenProse: boolean
): boolean {
    if (
        !protectWrittenProse ||
        DIRECTIVE_PROSE_SAFE_ACTIONS.has(action.action_type || '') ||
        !DIRECTIVE_STRUCTURAL_ACTIONS.has(action.action_type || '')
    ) {
        return false;
    }

    let latestWrittenSequence = -1;
    let latestWrittenScene = -1;
    const proseMap = (story.prose || {}) as Record<string, { final?: string } | undefined>;
    (story.sequences || []).forEach((_seq, seqIdx) => {
        (story.scenes?.[`${seqIdx}`] || []).forEach((_scene, sceneIdx) => {
            if (proseMap[`${seqIdx}-${sceneIdx}`]?.final) {
                latestWrittenSequence = seqIdx;
                latestWrittenScene = sceneIdx;
            }
        });
    });
    if (latestWrittenSequence === -1) return false;

    if (action.action_type === 'ADD_SEQUENCE') {
        const parentAct = Number(action.target_act_idx ?? 0) + 1;
        const sequences = story.sequences || [];
        const nextActIdx = sequences.findIndex(
            (seq, idx) => (seq.parent_act || actForSequence(idx + 1)) > parentAct
        );
        const insertIdx = action.details?.insert_at_idx;
        const targetIdx =
            insertIdx !== undefined && insertIdx !== null && insertIdx !== ''
                ? Number(insertIdx)
                : nextActIdx === -1
                  ? sequences.length
                  : nextActIdx;
        return targetIdx >= 0 && targetIdx <= latestWrittenSequence;
    }
    const targetSeq = parseInt(String(action.target_sequence_idx ?? action.target_seq_idx ?? 0), 10);
    let targetScene =
        action.action_type === 'ADD_SCENE'
            ? parseInt(
                  String(action.details?.insert_at_idx ?? story.scenes?.[`${targetSeq}`]?.length ?? 0),
                  10
              )
            : parseInt(String(action.target_scene_idx ?? 0), 10);
    const targetAct = parseInt(String(action.target_act_idx ?? 0), 10);
    const actOfLatestSeq = story.sequences?.[latestWrittenSequence]?.parent_act ?? -1;
    if (action.action_type === 'MODIFY_ACT') return targetAct > -1 && targetAct <= actOfLatestSeq;
    if (['MODIFY_SEQUENCE', 'DELETE_SEQUENCE'].includes(action.action_type || '')) {
        return targetSeq > -1 && targetSeq <= latestWrittenSequence;
    }
    if (action.action_type === 'MOVE_SCENE') {
        targetScene = Math.min(targetScene, Number(action.details?.to_idx ?? targetScene));
    }
    return (
        (targetSeq > -1 && targetSeq < latestWrittenSequence) ||
        (targetSeq === latestWrittenSequence && targetScene > -1 && targetScene <= latestWrittenScene)
    );
}

/** Returns UI presentation metadata for a directive action. */
export function getDirectiveActionScopeMeta(action: DirectiveActionInput = {}): DirectiveActionMeta {
    const base = DIRECTIVE_ACTION_META[action.action_type || ''] || {
        label: action.action_type || 'Unknown Action',
        scopeBadge: 'Action',
        category: 'blueprint',
        targetMode: 'scene',
        colorClass: 'bg-mist-100 text-ink-700 border-edge-strong'
    };
    if (action.action_type === 'PERSIST_FUTURE_MANDATE') {
        const pref = String(action.details?.target_scope || 'auto').trim().toLowerCase();
        const targetMode = pref === 'story_author_note' ? 'none' : pref === 'act' ? 'act' : 'sequence';
        return { ...base, targetMode };
    }
    return base;
}

/** Computes manuscript development progress summary for the Directive Agent workspace. */
export function computeDirectiveStoryStats(
    story: Partial<Story> & Record<string, unknown> = {}
): DirectiveStoryStats {
    const acts = Array.isArray(story.acts) ? story.acts : [];
    const sequences = Array.isArray(story.sequences) ? story.sequences : [];
    const scenesMap = (story.scenes || {}) as Record<string, Array<{ number?: string | number; title?: string }>>;
    const proseMap = (story.prose || {}) as Record<string, { final?: string } | undefined>;
    let plannedSceneCount = 0;
    let writtenSceneCount = 0;
    let undevelopedSeqCount = 0;
    let firstUnwrittenSeq: DirectiveStoryStats['firstUnwrittenSeq'] = null;
    let firstDevelopedSeq: DirectiveStoryStats['firstDevelopedSeq'] = null;
    let latestWrittenRef: DirectiveStoryStats['latestWrittenRef'] = null;

    sequences.forEach((seq, sIdx) => {
        const seqScenes = Array.isArray(scenesMap[String(sIdx)]) ? scenesMap[String(sIdx)] : [];
        plannedSceneCount += seqScenes.length;
        if (seqScenes.length === 0) {
            undevelopedSeqCount++;
            if (!firstUnwrittenSeq) {
                firstUnwrittenSeq = {
                    seqIdx: sIdx,
                    number: seq.number || sIdx + 1,
                    title: seq.title || `Sequence ${sIdx + 1}`
                };
            }
        } else if (!firstDevelopedSeq) {
            firstDevelopedSeq = {
                seqIdx: sIdx,
                number: seq.number || sIdx + 1,
                title: seq.title || `Sequence ${sIdx + 1}`
            };
        }
        seqScenes.forEach((_sc, scIdx) => {
            if (String(proseMap[`${sIdx}-${scIdx}`]?.final || '').trim()) {
                writtenSceneCount++;
                latestWrittenRef = {
                    seqIdx: sIdx,
                    sceneIdx: scIdx,
                    label: `Scene ${seq.number || sIdx + 1}.${scIdx + 1}`
                };
            }
        });
    });

    return {
        actCount: acts.length,
        seqCount: sequences.length,
        plannedSceneCount,
        writtenSceneCount,
        undevelopedSeqCount,
        firstUnwrittenSeq,
        firstDevelopedSeq,
        latestWrittenRef,
        firstCastName: story.cast?.[0]?.name || '',
        hasOutline: acts.length > 0 || sequences.length > 0
    };
}

/** Formats a human-readable target summary pill for a proposed directive action card. */
export function resolveDirectiveTargetLabel(
    action: DirectiveActionInput = {},
    story: Partial<Story> & Record<string, unknown> = {}
): string {
    const type = action.action_type || '';
    const d = action.details || {};
    const actIdx = parseInt(String(action.target_act_idx ?? 0), 10) || 0;
    const seqIdx = parseInt(String(action.target_sequence_idx ?? action.target_seq_idx ?? 0), 10) || 0;
    const sceneIdx = parseInt(String(action.target_scene_idx ?? 0), 10) || 0;

    if (type === 'MODIFY_STORY_METADATA') {
        return story?.title ? `Story · ${story.title}` : 'Story Premise & Metadata';
    }
    if (['ADD_CHARACTER', 'MODIFY_CHARACTER', 'DELETE_CHARACTER'].includes(type)) {
        return `Cast · ${d.name || action.target_character_id || 'Character'}`;
    }
    if (type === 'MODIFY_CHARACTER_ARC') {
        return `Arc · ${d.char_id || d.name || action.target_character_id || 'Character'}`;
    }
    if (type === 'MODIFY_RELATIONSHIP') {
        return `Dynamic · ${d.relationship_key || [d.from_name, d.to_name].filter(Boolean).join(' -> ') || 'Pair'}`;
    }
    if (['ADD_THREAD', 'MODIFY_THREAD', 'DELETE_THREAD'].includes(type)) {
        return `Thread ${d.thread_id ? `${d.thread_id} · ` : ''}${d.name || d.thread_id || 'Subplot'}`;
    }
    if (['ADD_SECRET', 'MODIFY_SECRET'].includes(type)) {
        return `Secret · ${d.title || d.secret_id || 'Vault Entry'}`;
    }
    if (['ADD_LORE', 'MODIFY_LORE'].includes(type)) return `Lore · ${d.topic || 'Archive Entry'}`;
    if (type === 'ADD_CONTINUITY_FACT') return `Fact · ${d.key || 'Canon Detail'}`;
    if (['ADD_PROPOSITION', 'MODIFY_EPISTEMIC_BELIEF'].includes(type)) {
        return `Epistemic · ${d.holder_id || d.proposition_id || d.id || 'Belief'}`;
    }
    if (type === 'PERSIST_FUTURE_MANDATE') {
        const pref = String(d.target_scope || 'auto').toLowerCase();
        const seq = story?.sequences?.[seqIdx];
        const act = story?.acts?.[actIdx];
        if ((pref === 'sequence' || pref === 'auto') && seq) {
            const hasScenes = (story?.scenes?.[String(seqIdx)] || []).length > 0;
            return `Seq ${seq.number || seqIdx + 1}: ${seq.title || 'Sequence'}${hasScenes ? '' : ' · Undeveloped'}`;
        }
        if ((pref === 'act' || pref === 'auto') && act) {
            return `Act ${act.number || actIdx + 1}: ${act.title || 'Act'}`;
        }
        return "Story Author's Note (Global)";
    }
    if (type === 'MODIFY_ACT' || type === 'ADD_SEQUENCE') {
        const act = story?.acts?.[actIdx];
        return act ? `Act ${act.number || actIdx + 1}: ${act.title || 'Act'}` : `Act ${actIdx + 1}`;
    }
    if (['MODIFY_SEQUENCE', 'DELETE_SEQUENCE', 'ADD_SCENE'].includes(type)) {
        const seq = story?.sequences?.[seqIdx];
        const seqNum = seq?.number || seqIdx + 1;
        if (type === 'ADD_SCENE') {
            const seqScenes = story?.scenes?.[String(seqIdx)] || [];
            const posRaw = d.insert_at_idx;
            const posLabel =
                posRaw === '' || posRaw === undefined || posRaw === null
                    ? `end (#${seqScenes.length + 1})`
                    : `pos ${Number(posRaw) + 1}`;
            return `Seq ${seqNum} · Insert @ ${posLabel}`;
        }
        return seq ? `Seq ${seqNum}: ${seq.title || 'Sequence'}` : `Seq ${seqNum}`;
    }
    const scene = story?.scenes?.[String(seqIdx)]?.[sceneIdx];
    const proseEntry = (story?.prose as Record<string, { final?: string }> | undefined)?.[`${seqIdx}-${sceneIdx}`];
    const hasProse = Boolean(String(proseEntry?.final || '').trim());
    const baseScene = scene
        ? `Scene ${scene.number || `${seqIdx + 1}.${sceneIdx + 1}`}: ${scene.title || 'Untitled'}`
        : `Seq ${seqIdx + 1} · Scene ${sceneIdx + 1}`;
    return hasProse ? `${baseScene} · Drafted` : baseScene;
}

/** Builds a concise before -> after preview list for any directive action card. */
export function buildDirectiveActionPreview(
    action: DirectiveActionInput = {},
    story: Partial<Story> & Record<string, unknown> = {}
): DirectiveActionDiffItem[] {
    const type = action.action_type || '';
    const d = action.details || {};
    const actIdx = parseInt(String(action.target_act_idx ?? 0), 10) || 0;
    const seqIdx = parseInt(String(action.target_sequence_idx ?? action.target_seq_idx ?? 0), 10) || 0;
    const sceneIdx = parseInt(String(action.target_scene_idx ?? 0), 10) || 0;
    const trunc = (val: unknown, limit = 130): string => {
        const rec = typeof val === 'object' && val !== null ? (val as Record<string, unknown>) : null;
        const str = rec
            ? rec.start_state || rec.end_state
                ? `${rec.start_state || ''} -> ${rec.end_state || ''}`
                : JSON.stringify(val)
            : String(val ?? '').trim();
        if (!str) return '(empty)';
        return str.length > limit ? `${str.slice(0, limit - 3)}...` : str;
    };
    const diffs: DirectiveActionDiffItem[] = [];

    if (type === 'PERSIST_FUTURE_MANDATE') {
        const label = String(d.mandate_label || '').trim();
        const text = String(d.mandate_text || d.instructions || d.description || action.description || '').trim();
        const pref = String(d.target_scope || 'auto').toLowerCase();
        const seq = story?.sequences?.[seqIdx];
        const act = story?.acts?.[actIdx];
        let containerName = "Story Author's Note";
        let existing: unknown = story?.author_note || '';
        if ((pref === 'sequence' || pref === 'auto') && seq) {
            containerName = `Sequence ${seq.number || seqIdx + 1} Description`;
            existing = seq.description || seq.summary || '';
        } else if ((pref === 'act' || pref === 'auto') && act) {
            containerName = `Act ${act.number || actIdx + 1} Mandate`;
            existing = act.act_mandate || act.description || '';
        }
        const trimmedExisting = String(existing || '').trim();
        diffs.push({
            label: containerName,
            before:
                trimmedExisting.length > 130
                    ? `...${trimmedExisting.slice(-127)}`
                    : trimmedExisting || '(empty)',
            after: `+ - DIRECTIVE MANDATE${label ? ` (${label})` : ''}: ${trunc(text, 180)}`,
            mode: 'append'
        });
    } else if (type === 'MODIFY_SCENE') {
        const existing = ((story?.scenes?.[String(seqIdx)]?.[sceneIdx] || {}) as Record<string, unknown>);
        const checks: Array<[string, string]> = [
            ['title', 'Title'],
            ['pov_character', 'POV'],
            ['setting', 'Setting'],
            ['dominant_narrative_mode', 'Mode'],
            ['objective', 'Objective'],
            ['scene_events', 'Events'],
            ['value_shift', 'Value Shift'],
            ['the_hinge_moment', 'Hinge Moment'],
            ['exit_hook', 'Exit Hook']
        ];
        checks.forEach(([key, label]) => {
            if (
                d[key] !== undefined &&
                String(d[key]).trim() !== '' &&
                trunc(d[key], 999) !== trunc(existing[key], 999)
            ) {
                diffs.push({ label, before: trunc(existing[key]), after: trunc(d[key]), mode: 'modify' });
            }
        });
        if (diffs.length === 0 && d.instructions) {
            diffs.push({
                label: 'Revision Note',
                before: '',
                after: trunc(d.instructions, 160),
                mode: 'add'
            });
        }
    } else if (type === 'ADD_SCENE') {
        const seqScenes = story?.scenes?.[String(seqIdx)] || [];
        const idxRaw = d.insert_at_idx;
        const posText =
            idxRaw === '' || idxRaw === undefined || idxRaw === null
                ? `End of Sequence ${seqIdx + 1} (Position ${seqScenes.length + 1})`
                : Number(idxRaw) <= 0
                  ? `Beginning of Sequence ${seqIdx + 1} (Before Scene 1)`
                  : `After Scene ${Math.min(Number(idxRaw), seqScenes.length)} (${seqScenes[Math.min(Number(idxRaw), seqScenes.length) - 1]?.title || 'Scene'})`;
        diffs.push({ label: 'Placement', before: '', after: posText, mode: 'add' });
        if (d.title) {
            diffs.push({
                label: 'New Scene',
                before: '',
                after: `${d.title}${d.pov_character ? ` · POV: ${d.pov_character}` : ''}`,
                mode: 'add'
            });
        }
        if (d.objective || d.scene_events) {
            diffs.push({
                label: 'Blueprint',
                before: '',
                after: trunc(d.objective || d.scene_events, 150),
                mode: 'add'
            });
        }
    } else if (type === 'DELETE_SCENE') {
        const existing = story?.scenes?.[String(seqIdx)]?.[sceneIdx];
        diffs.push({
            label: 'Remove Scene',
            before: existing
                ? `Scene ${existing.number || `${seqIdx + 1}.${sceneIdx + 1}`}: ${existing.title || 'Untitled'}`
                : `Scene ${seqIdx + 1}.${sceneIdx + 1}`,
            after: '',
            mode: 'remove'
        });
    } else if (type === 'MOVE_SCENE') {
        const seqScenes = story?.scenes?.[String(seqIdx)] || [];
        const existing = seqScenes[sceneIdx];
        const toIdx = parseInt(String(d.to_idx ?? sceneIdx), 10);
        diffs.push({
            label: 'Reorder',
            before: `${existing?.title || `Scene ${sceneIdx + 1}`} (Position ${sceneIdx + 1})`,
            after: `Position ${Number.isFinite(toIdx) ? toIdx + 1 : sceneIdx + 1} in Sequence ${seqIdx + 1}`,
            mode: 'modify'
        });
    } else if (['SURGICAL_PATCH_PROSE', 'LINE_EDIT_PROSE', 'REWRITE_PROSE'].includes(type)) {
        if (d.find_text || d.replace_text) {
            diffs.push({
                label: 'Text Patch',
                before: trunc(d.find_text, 120),
                after: trunc(d.replace_text, 120),
                mode: 'modify'
            });
        } else if (d.instructions) {
            diffs.push({
                label: type === 'REWRITE_PROSE' ? 'Rewrite Plan' : 'Patch Goal',
                before: '',
                after: trunc(d.instructions, 160),
                mode: 'add'
            });
        }
    } else if (['MODIFY_SEQUENCE', 'ADD_SEQUENCE'].includes(type)) {
        const existing =
            type === 'MODIFY_SEQUENCE'
                ? ((story?.sequences?.[seqIdx] || {}) as Record<string, unknown>)
                : {};
        (
            [
                ['title', 'Title'],
                ['sequence_function', 'Function'],
                ['dramatic_question', 'Dramatic Question'],
                ['description', 'Description']
            ] as const
        ).forEach(([k, lbl]) => {
            if (d[k] !== undefined && String(d[k]).trim() !== '') {
                diffs.push({
                    label: lbl,
                    before: type === 'ADD_SEQUENCE' ? '' : trunc(existing[k]),
                    after: trunc(d[k]),
                    mode: type === 'ADD_SEQUENCE' ? 'add' : 'modify'
                });
            }
        });
    } else if (type === 'DELETE_SEQUENCE') {
        const seq = story?.sequences?.[seqIdx];
        diffs.push({
            label: 'Remove Sequence',
            before: seq ? `Seq ${seq.number || seqIdx + 1}: ${seq.title || 'Untitled'}` : `Sequence ${seqIdx + 1}`,
            after: '',
            mode: 'remove'
        });
    } else if (['ADD_THREAD', 'MODIFY_THREAD', 'DELETE_THREAD'].includes(type)) {
        const threads = (Array.isArray(story?.threads) ? story.threads : []) as Array<
            Record<string, unknown>
        >;
        const existing = threads.find(
            (t) =>
                t.id === d.thread_id ||
                (d.name && String(t.name || '').toLowerCase() === String(d.name).toLowerCase())
        );
        if (type === 'DELETE_THREAD') {
            diffs.push({
                label: 'Remove Thread',
                before: existing ? `${existing.id}: ${existing.name}` : String(d.thread_id || d.name || 'Thread'),
                after: '',
                mode: 'remove'
            });
        } else {
            diffs.push({
                label: 'Thread',
                before: type === 'MODIFY_THREAD' && existing ? trunc(existing.description) : '',
                after: `${d.name || d.thread_id || 'Thread'}${d.description ? ` — ${trunc(d.description, 120)}` : ''}`,
                mode: type === 'ADD_THREAD' ? 'add' : 'modify'
            });
        }
    } else if (
        ['ADD_CHARACTER', 'MODIFY_CHARACTER', 'DELETE_CHARACTER', 'MODIFY_CHARACTER_ARC'].includes(type)
    ) {
        const key = d.char_id || d.name || action.target_character_id || 'Character';
        if (type === 'DELETE_CHARACTER') {
            diffs.push({ label: 'Remove Character', before: String(key), after: '', mode: 'remove' });
        } else {
            const summary = [d.role, d.core_flaw, d.lie_believed, d.truth_needed, d.description]
                .filter(Boolean)
                .map((x) => trunc(x, 80))
                .join(' · ');
            diffs.push({
                label: type === 'MODIFY_CHARACTER_ARC' ? 'Arc Update' : 'Profile',
                before: type === 'ADD_CHARACTER' ? '' : `${key}`,
                after: summary || trunc(action.description),
                mode: type === 'ADD_CHARACTER' ? 'add' : 'modify'
            });
        }
    } else if (['ADD_SECRET', 'MODIFY_SECRET'].includes(type)) {
        diffs.push({
            label: 'Secret',
            before: type === 'MODIFY_SECRET' ? String(d.title || d.secret_id || 'Secret') : '',
            after: `${d.title || 'Secret'}${d.truth ? ` — ${trunc(d.truth, 110)}` : ''}`,
            mode: type === 'ADD_SECRET' ? 'add' : 'modify'
        });
    }

    return diffs.slice(0, 4);
}
