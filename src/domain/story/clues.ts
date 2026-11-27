/**
 * @module domain/story/clues
 * Secret Vault normalization, per-scene behavioral clue directives, and secret reveal triggers.
 */

import type { SecretEntry, SeriesSecretFields, Story } from '@/types';
import { fairPlayLedgerForVaultSecret, isRevealDueThisBook } from '@/domain/series/secrets';

export interface ClueScheduleItem {
    sequence_number: number;
    scene_number?: number;
    behavioral_directive: string;
    benign_reason: string;
    seeded_in_prose: boolean;
}

export interface NormalizedSecretEntry extends SecretEntry {
    id: string;
    title: string;
    category: 'plot_mystery' | 'dramatic_irony' | 'character_concealment' | 'red_herring';
    truth: string;
    cover_story: {
        public_belief: string;
        character_masks: Record<string, Record<string, string>>;
    };
    known_by_characters: string[];
    concealed_from_characters: string[];
    reader_status: 'aware' | 'blind';
    reveal_anchor: {
        act_number: number;
        sequence_number: number;
        scene_number?: number;
        scene_hint: string;
        trigger_condition?: string;
    };
    status: string;
    clue_schedule: ClueScheduleItem[];
}

export interface NormalizeSecretVaultOptions {
    majorSurprisesAndTwists?: string;
    characterArcs?: Array<{ char_id?: string }>;
    incitingIncident?: string;
}

export interface ActiveClueDirective {
    secret_id: string | undefined;
    title: string | undefined;
    directive: unknown;
    reason: string;
}

export interface SecretRevealDirective {
    secret_id: string | undefined;
    title: string | undefined;
    truth: string | undefined;
    category: unknown;
    trigger_condition: string;
}

function splitStringList(val: unknown): string[] {
    if (Array.isArray(val)) return val.map((x) => String(x));
    if (typeof val === 'string') {
        return val
            .split(/[,;\n]+/)
            .map((x) => x.trim())
            .filter(Boolean);
    }
    return [];
}

/** Series fields survive normalization; a secret without them stays a plain book-level secret. */
function pickSeriesSecretFields(s: Record<string, unknown>): SeriesSecretFields {
    const out: SeriesSecretFields = {};
    if (s.scope === 'series' || s.scope === 'book') out.scope = s.scope;
    if (Number.isFinite(Number(s.reveal_book)) && Number(s.reveal_book) > 0) out.reveal_book = Number(s.reveal_book);
    if (typeof s.parent_secret_id === 'string' && s.parent_secret_id) out.parent_secret_id = s.parent_secret_id;
    if (Number.isFinite(Number(s.layer)) && Number(s.layer) > 0) out.layer = Number(s.layer);
    return out;
}

/**
 * Normalizes or autonomously synthesizes the Secret Vault & Epistemic Ledger
 * from raw secrets or major plot twists.
 */
export function normalizeSecretVault(
    rawVault: unknown,
    { majorSurprisesAndTwists = '', characterArcs = [] }: NormalizeSecretVaultOptions = {}
): NormalizedSecretEntry[] {
    let secrets: NormalizedSecretEntry[] = [];
    if (Array.isArray(rawVault) && rawVault.length > 0) {
        secrets = rawVault.map((rawItem, idx) => {
            const s = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>;
            const id = (typeof s.id === 'string' && s.id) || `sec_${idx + 1}`;
            const title = (typeof s.title === 'string' && s.title) || `Narrative Secret ${idx + 1}`;
            const validCats = ['plot_mystery', 'dramatic_irony', 'character_concealment', 'red_herring'] as const;
            const category = validCats.includes(s.category as (typeof validCats)[number])
                ? (s.category as (typeof validCats)[number])
                : 'plot_mystery';
            const truth =
                (typeof s.truth === 'string' && s.truth) ||
                (typeof s.description === 'string' && s.description) ||
                title;

            const rawCover = s.cover_story && typeof s.cover_story === 'object'
                ? (s.cover_story as Record<string, unknown>)
                : null;
            const coverStory = {
                public_belief:
                    (typeof s.cover_story === 'string' ? s.cover_story.trim() : '') ||
                    (rawCover && typeof rawCover.public_belief === 'string' ? rawCover.public_belief.trim() : '') ||
                    (typeof s.public_cover_story === 'string' ? s.public_cover_story.trim() : '') ||
                    'Established baseline situation.',
                character_masks:
                    rawCover && rawCover.character_masks && typeof rawCover.character_masks === 'object'
                        ? (rawCover.character_masks as Record<string, Record<string, string>>)
                        : {}
            };
            const knownBy = splitStringList(s.known_by_characters ?? s.known_by);
            const concealedFrom = splitStringList(s.concealed_from_characters ?? s.concealed_from);
            const readerStatus: 'aware' | 'blind' = s.reader_status === 'aware' ? 'aware' : 'blind';

            const rawAnchor =
                s.reveal_anchor && typeof s.reveal_anchor === 'object'
                    ? (s.reveal_anchor as Record<string, unknown>)
                    : {};
            const explicitSceneNum = Number(rawAnchor.scene_number || s.reveal_target_scene || 0);
            const revealAnchor: NormalizedSecretEntry['reveal_anchor'] = {
                act_number: Number(rawAnchor.act_number || s.reveal_target_act || 3),
                sequence_number: Number(rawAnchor.sequence_number || s.reveal_target_sequence || 7),
                ...(explicitSceneNum > 0 ? { scene_number: explicitSceneNum } : {}),
                scene_hint:
                    (typeof rawAnchor.scene_hint === 'string' && rawAnchor.scene_hint) ||
                    (typeof s.reveal_scene_hint === 'string' && s.reveal_scene_hint) ||
                    'Climax confrontation',
                ...(typeof rawAnchor.trigger_condition === 'string' && rawAnchor.trigger_condition
                    ? { trigger_condition: rawAnchor.trigger_condition }
                    : {})
            };

            const rawClues = Array.isArray(s.clue_schedule)
                ? s.clue_schedule
                : Array.isArray(s.clues)
                  ? s.clues
                  : [];
            const clueSchedule: ClueScheduleItem[] = rawClues.slice(0, 3).map((rawClue, cIdx) => {
                const clue = (rawClue && typeof rawClue === 'object' ? rawClue : {}) as Record<string, unknown>;
                const clueSceneNum = Number(clue.scene_number || 0);
                return {
                    sequence_number: Number(clue.sequence_number || (cIdx === 0 ? 2 : 5)),
                    ...(clueSceneNum > 0 ? { scene_number: clueSceneNum } : {}),
                    behavioral_directive:
                        (typeof clue.behavioral_directive === 'string' && clue.behavioral_directive) ||
                        (typeof clue.directive === 'string' && clue.directive) ||
                        'Observe subtle physical hesitation or environmental anomaly.',
                    benign_reason:
                        (typeof clue.benign_reason === 'string' && clue.benign_reason) ||
                        (typeof clue.reason === 'string' && clue.reason) ||
                        'Plausible everyday circumstance.',
                    seeded_in_prose: Boolean(clue.seeded_in_prose)
                };
            });

            if (clueSchedule.length === 0) {
                clueSchedule.push(
                    {
                        sequence_number: 2,
                        behavioral_directive: `Notice subtle physical hesitation or protective positioning regarding: ${title}`,
                        benign_reason: 'Character is cautious and meticulous.',
                        seeded_in_prose: false
                    },
                    {
                        sequence_number: 5,
                        behavioral_directive: `Subtle behavioral anomaly or guarded reaction under pressure regarding: ${title}`,
                        benign_reason: 'Character is under situational stress.',
                        seeded_in_prose: false
                    }
                );
            }

            return {
                ...pickSeriesSecretFields(s),
                id,
                title,
                category,
                truth,
                cover_story: coverStory,
                known_by_characters: knownBy,
                concealed_from_characters: concealedFrom,
                reader_status: readerStatus,
                reveal_anchor: revealAnchor,
                status: (typeof s.status === 'string' && s.status) || 'dormant',
                clue_schedule: clueSchedule
            };
        });
    }

    if (secrets.length === 0 && majorSurprisesAndTwists && String(majorSurprisesAndTwists).trim().length > 10) {
        const textTwists = String(majorSurprisesAndTwists).trim();
        const twistChunks = textTwists
            .split(/\n{2,}|(?=(?:Reversal\s*\d+|Twist\s*\d+|^\s*[-*•]\s+))/i)
            .map((t) => t.trim())
            .filter((t) => t.length > 15);

        const chunksToUse = twistChunks.slice(0, 2);
        if (chunksToUse.length === 0) chunksToUse.push(textTwists);

        chunksToUse.forEach((chunk, i) => {
            const firstLine = chunk.split('\n')[0].replace(/^[-*•\d.:\s]+/, '').trim();
            const title =
                firstLine.length > 60
                    ? firstLine.slice(0, 57) + '...'
                    : firstLine || `Key Reversal ${i + 1}`;
            const primaryChar = characterArcs && characterArcs[i]?.char_id ? characterArcs[i].char_id! : 'Protagonist';
            secrets.push({
                id: `sec_${i + 1}`,
                title,
                category: i === 0 ? 'plot_mystery' : 'character_concealment',
                truth: chunk,
                cover_story: {
                    public_belief: 'The baseline reality believed by characters during early acts.',
                    character_masks: {
                        [primaryChar]: {
                            history_mask: 'Surface background before hidden revelations come to light.',
                            trait_mask: 'Outward focus on immediate objectives.'
                        }
                    }
                },
                known_by_characters: [],
                concealed_from_characters: [primaryChar],
                reader_status: 'blind',
                reveal_anchor: {
                    act_number: 3,
                    sequence_number: i === 0 ? 7 : 6,
                    scene_hint: 'Climactic turning point'
                },
                status: 'dormant',
                clue_schedule: [
                    {
                        sequence_number: 2,
                        behavioral_directive: `Demonstrate subtle physical caution or an unexplained check of surroundings without disclosing ${title}.`,
                        benign_reason: 'Heightened alertness to immediate mission requirements.',
                        seeded_in_prose: false
                    },
                    {
                        sequence_number: 5,
                        behavioral_directive:
                            'A brief slip of composure or anomalous physical detail hinting at tension under pressure.',
                        benign_reason: 'Fatigue and escalating external conflict.',
                        seeded_in_prose: false
                    }
                ]
            });
        });
    }

    return secrets;
}

const GENERIC_REVEAL_HINTS = new Set([
    '',
    'climax confrontation',
    'climactic turning point'
]);

/**
 * Shared predicate determining whether `(seqNum, sceneNum)` is the exact scheduled
 * reveal point for `sec`. Used by both prompt directive injection and post-scene
 * `secret_vault` state transition so secrets are never marked `revealed` prematurely.
 */
export function isSecretRevealScene(
    sec: Partial<NormalizedSecretEntry> & Record<string, unknown>,
    seqNum: number | string = 1,
    sceneNum: number | string = 1,
    sceneObj: Record<string, unknown> = {},
    totalScenesInSeq = 0
): boolean {
    if (!sec || sec.status === 'revealed') return false;
    const anchor = (
        sec.reveal_anchor && typeof sec.reveal_anchor === 'object' ? sec.reveal_anchor : {}
    ) as Record<string, unknown>;
    const targetSeq = Number(anchor.sequence_number || sec.reveal_target_sequence || 7);
    if (targetSeq !== Number(seqNum)) return false;

    const explicitSceneNum = Number(anchor.scene_number || sec.reveal_target_scene || 0);
    if (explicitSceneNum > 0) {
        return Number(sceneNum) === explicitSceneNum;
    }

    const rawHint = String(anchor.scene_hint || '').trim().toLowerCase();
    if (/^\d+$/.test(rawHint)) {
        return Number(sceneNum) === Number(rawHint);
    }
    if (rawHint && !GENERIC_REVEAL_HINTS.has(rawHint)) {
        const titleMatch = String(sceneObj.title || '').toLowerCase().includes(rawHint);
        const numberMatch = String(sceneObj.number || '').toLowerCase().endsWith('.' + rawHint);
        if (titleMatch || numberMatch) return true;
    }

    if (totalScenesInSeq > 0) {
        return Number(sceneNum) >= totalScenesInSeq;
    }
    return Number(sceneNum) >= 2 || Number(seqNum) === 8;
}

/** Retrieves active, lean behavioral clue directives for a specific sequence/scene. */
export function getActiveClueDirectivesForScene(
    story: Partial<Story> | null | undefined,
    seqNum: number | string = 1,
    sceneNum: number | string = 1
): ActiveClueDirective[] {
    if (!story || !Array.isArray(story.secret_vault)) return [];
    const directives: ActiveClueDirective[] = [];

    story.secret_vault.forEach((sec) => {
        if (sec.status === 'revealed') return;
        const clues = Array.isArray(sec.clue_schedule) ? (sec.clue_schedule as Array<Record<string, unknown>>) : [];
        clues.forEach((clue) => {
            const explicitClueScene = Number(clue.scene_number || 0);
            const sceneMatches = explicitClueScene > 0 ? explicitClueScene === Number(sceneNum) : true;
            if (Number(clue.sequence_number) === Number(seqNum) && sceneMatches && !clue.seeded_in_prose) {
                directives.push({
                    secret_id: sec.id,
                    title: sec.title,
                    directive: clue.behavioral_directive,
                    reason:
                        (typeof clue.benign_reason === 'string' && clue.benign_reason) ||
                        'Everyday routine circumstance.'
                });
            }
        });
    });

    return directives;
}

/** Tells the reveal scene which clues from earlier books it has to pay off. */
function withFairPlayLedger(trigger: string, ledger: string): string {
    return ledger ? `${trigger}. The reveal must pay off these clues already on the page: ${ledger}` : trigger;
}

/** Checks whether the current scene is the scheduled reveal point for any secret. */
export function getSecretRevealDirectiveForScene(
    story: Partial<Story> | null | undefined,
    seqNum: number | string = 1,
    sceneNum: number | string = 1,
    sceneObj: Record<string, unknown> = {},
    totalScenesInSeq = 0
): SecretRevealDirective | null {
    if (!story || !Array.isArray(story.secret_vault)) return null;

    const seqIdxKey = String(Math.max(0, Number(seqNum) - 1));
    const scenesMap = story.scenes as Record<string, unknown[]> | undefined;
    const seqScenes = scenesMap && Array.isArray(scenesMap[seqIdxKey]) ? scenesMap[seqIdxKey] : [];
    const resolvedTotalScenes = totalScenesInSeq > 0 ? totalScenesInSeq : seqScenes.length;

    for (const sec of story.secret_vault) {
        // A series secret held for a later book is never revealed here.
        if (!isRevealDueThisBook(sec, story.series?.book_number)) continue;
        const secRec = sec as Partial<NormalizedSecretEntry> & Record<string, unknown>;
        if (isSecretRevealScene(secRec, seqNum, sceneNum, sceneObj, resolvedTotalScenes)) {
            const anchor = (sec.reveal_anchor || {}) as Record<string, unknown>;
            return {
                secret_id: sec.id,
                title: sec.title,
                truth: sec.truth,
                category: sec.category,
                trigger_condition: withFairPlayLedger(
                    String(anchor.trigger_condition || anchor.scene_hint || 'Direct confrontation or discovery'),
                    fairPlayLedgerForVaultSecret(story, sec)
                )
            };
        }
    }

    return null;
}
