/**
 * @module services/export/audioDramaTxtExport
 * Generates and downloads formatted Multi-Voice Audio Drama (.txt) scripts.
 */

import {
    getDeterministicVoiceSeed,
    getVoiceDescriptionForCharacter,
    type AudioStoryLike,
    type VoiceCastMember
} from '@/domain/audio';
import { actForSequence, parseActNumber } from '@/domain/story';
import type { ProseEntry, Sequence } from '@/types';

export interface ExportLegacyChapter {
    number?: number;
    title?: string;
}

export interface ExportLedgerFact extends Record<string, unknown> {
    key?: string;
    value?: string;
    category?: string;
    tracking_tag?: string;
    source_scene?: string;
}

export interface StoryExportInput extends AudioStoryLike {
    author?: string;
    chapters?: Record<string, ExportLegacyChapter[]> | ExportLegacyChapter[][];
    continuity_ledger?: ExportLedgerFact[];
    sequences?: Array<Sequence & { origIdx?: number }>;
}

export interface AudioDramaTxtBuildResult {
    content: string;
    filename: string;
    sceneCount: number;
}

function getChaptersForAct(
    chapters: StoryExportInput['chapters'],
    actIdx: number
): ExportLegacyChapter[] {
    if (!chapters) return [];
    if (Array.isArray(chapters)) {
        return Array.isArray(chapters[actIdx]) ? chapters[actIdx] : [];
    }
    const byNumKey = chapters[String(actIdx)];
    return Array.isArray(byNumKey) ? byNumKey : [];
}

function extractProseString(proseObj: ProseEntry | string | undefined): string {
    if (!proseObj) return '';
    if (typeof proseObj === 'string') return proseObj;
    return String(proseObj.final || proseObj.draft || '');
}

/** Builds a printable multi-voice Audio Drama script and returns script text, filename, and exported scene count. */
export function buildAudioDramaTxtScript(story: StoryExportInput): AudioDramaTxtBuildResult {
    const cleanTitle = story.title ? story.title.trim() : 'Untitled Audio Drama';
    const safeFilename =
        cleanTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'audio_drama';

    let output = '';
    output += `================================================================================\n`;
    output += `${cleanTitle.toUpperCase()} - AUDIO DRAMA SCRIPT\n`;
    output += `Format: Multi-Voice TTS (Studio TTS Syntax)\n`;
    if (story.concept) {
        output += `Concept: ${story.concept.trim()}\n`;
    }
    if (story.style?.genre) {
        output += `Genre: ${story.style.genre}\n`;
    }
    if (story.style?.mood) {
        output += `Tone & Mood: ${story.style.mood}\n`;
    }
    output += `Exported from EllipsisProse on ${new Date().toLocaleDateString()}\n`;
    output += `================================================================================\n\n`;

    // Dramatis Personae & Voice Profiles
    output += `--- DRAMATIS PERSONAE & VOICE PROFILES ---\n`;
    const narratorVoiceExport = getVoiceDescriptionForCharacter('Narrator', story);
    const narratorSeedExport = getDeterministicVoiceSeed('Narrator', story);
    output += `• Narrator (Dramatic Storyteller) [Seed #${narratorSeedExport}]: ${narratorVoiceExport}\n`;

    const castList = Array.isArray(story.cast) ? (story.cast as VoiceCastMember[]) : [];
    castList.forEach((c) => {
        if (!c || !c.name || c.name.toLowerCase() === 'narrator') return;
        const role = c.role || c.archetype || 'Character';
        const voice = getVoiceDescriptionForCharacter(c, story);
        const seed = getDeterministicVoiceSeed(c, story);
        output += `• ${c.name} (${role}) [Seed #${seed}]: ${voice}\n`;
    });
    output += `\n================================================================================\n\n`;

    let totalScenesExported = 0;
    const acts =
        Array.isArray(story.acts) && story.acts.length > 0
            ? story.acts
            : [{ number: 1, title: 'Act I' }];

    acts.forEach((act, actIdx) => {
        const actNum = parseActNumber(act.number, actIdx + 1);
        const actTitle = act.title ? act.title.trim() : '';
        const actHeading = actTitle ? `ACT ${actNum}: ${actTitle.toUpperCase()}` : `ACT ${actNum}`;

        const actChapters = getChaptersForAct(story.chapters, actIdx);
        const seqList: Array<Partial<Sequence> & { origIdx: number }> =
            story.sequences && story.sequences.length > 0
                ? story.sequences.map((seq, sIdx) => ({ ...seq, origIdx: sIdx }))
                : actChapters.map((ch, cIdx) => ({
                      number: ch.number || cIdx + 1,
                      title: ch.title || `Sequence ${cIdx + 1}`,
                      parent_act: actNum,
                      origIdx: cIdx
                  }));

        const actSequences = seqList.filter((seq) => {
            const pAct = parseActNumber(
                seq.parent_act,
                actForSequence(Number(seq.number) || seq.origIdx + 1)
            );
            return pAct === actNum;
        });

        const sequencesToUse = actSequences.length > 0 ? actSequences : seqList;

        sequencesToUse.forEach((sequence, seqInActIdx) => {
            const seqIdx = sequence.origIdx !== undefined ? sequence.origIdx : seqInActIdx;
            const rawSeqScenes =
                story.scenes?.[`${seqIdx}`] ||
                story.scenes?.[`${actIdx}-${seqIdx}`] ||
                story.scenes?.['0-0'] ||
                [];

            rawSeqScenes.forEach((scene, sceneIdx) => {
                const sId = `${seqIdx}-${sceneIdx}`;
                const proseObj = story.prose?.[sId] || story.prose?.[`${sId}-0`];
                const scriptText = extractProseString(proseObj);

                if (scriptText && scriptText.trim()) {
                    totalScenesExported++;
                    output += `\n################################################################################\n`;
                    output += `${actHeading} | SEQUENCE ${seqIdx + 1} | SCENE ${scene.number || sceneIdx + 1}: ${(scene.title || 'UNTITLED').toUpperCase()}\n`;
                    output += `################################################################################\n\n`;
                    output += `${scriptText.trim()}\n\n`;
                }
            });
        });
    });

    // Fallback if structured act/sequence loops did not catch drafted prose
    if (totalScenesExported === 0 && story.prose && Object.keys(story.prose).length > 0) {
        Object.keys(story.prose).forEach((sKey) => {
            const text = extractProseString(story.prose?.[sKey]);
            if (text && text.trim()) {
                totalScenesExported++;
                output += `\n--- SCENE ${sKey} ---\n\n${text.trim()}\n\n`;
            }
        });
    }

    return {
        content: output,
        filename: `${safeFilename}_audio_drama.txt`,
        sceneCount: totalScenesExported
    };
}

/** Builds and downloads the Audio Drama script `.txt` file if at least one scene has drafted prose. */
export function exportAudioDramaTxt(story: StoryExportInput): AudioDramaTxtBuildResult {
    const result = buildAudioDramaTxtScript(story);
    if (result.sceneCount === 0) {
        return result;
    }

    const blob = new Blob([result.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return result;
}
