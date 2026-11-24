/**
 * @module domain/story/progress
 * Human-readable pipeline step translators, audio production & novel completion
 * estimators, and recent story artifact selectors.
 */

import type { CastMember, Story } from '@/types';
import { TTS_PIPELINE_TIERS } from '@/config';
import { LENGTH_CONTROL, computeSequenceLengthPlan } from './length';
import { actForSequence, parseActNumber } from './structure';

export const AUDIO_PRODUCTION_STAGE_ORDER: readonly string[] = [
    'parsing',
    'casting',
    'synthesis',
    'mastering',
    'archiving'
];

export interface HumanLoadingStepStatus {
    phaseNumber: number;
    phaseLabel: string;
    humanHeadline: string;
    subtext: string;
    progressPct: number;
    isEditorial: boolean;
    audioStageId?: string;
}

export interface SequenceProgressItem {
    index: number;
    number: number;
    actNumber: number;
    title: string;
    isWoven: boolean;
    plannedScenes: number;
    estimatedScenes: number;
    completedScenes: number;
    draftedOnlyScenes: number;
    wordsWritten: number;
    pct: number;
    status: 'complete' | 'in_progress' | 'planned' | 'pending' | string;
}

export interface PhaseProgressItem {
    pct: number;
    status: 'complete' | 'in_progress' | 'pending' | 'skipped';
    label: string;
}

export interface NovelProgressEstimate {
    overallPct: number;
    phases: Record<number, PhaseProgressItem>;
    sequences: SequenceProgressItem[];
    plannedTotalScenes: number;
    estimatedTotalScenes: number;
    isSceneCountEstimated: boolean;
    completedScenes: number;
    draftedOnlyScenes: number;
    wordsWritten: number;
    targetWords: number;
    castCount: number;
    interviewedCount: number;
    actsCount: number;
    seqCount: number;
    wovenSeqCount: number;
    editorialDone: boolean;
    enableEditorialHarness: boolean;
    nextUp: Record<string, unknown>;
}

/** Formats seconds cleanly as `0s`, `45s`, `3m 05s`, or `1h 04m`. */
export function formatAudioDuration(seconds: number | string | null | undefined): string {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (total <= 0) return '0s';
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, '0')}m`;
    if (mins > 0) return `${mins}m ${String(secs).padStart(2, '0')}s`;
    return `${secs}s`;
}

/** Formats a byte count cleanly in KB or MB. */
export function formatBytesCompact(bytes: number | string | null | undefined): string {
    const b = Math.max(0, Number(bytes) || 0);
    if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

/** Maps raw audio job stage keys/messages onto the canonical 5-stage pipeline labels. */
export function mapAudioStageToCanonical(rawStage = '', rawMessage = ''): string {
    const st = String(rawStage || '').toLowerCase();
    const msg = String(rawMessage || '').toLowerCase();
    if (st === 'done') return 'done';
    if (
        st === 'saving' ||
        st === 'archiving' ||
        msg.includes('offline store') ||
        msg.includes('offline audio library') ||
        msg.includes('indexeddb')
    ) {
        return 'archiving';
    }
    if (
        st === 'encoding' ||
        st === 'audiomastering' ||
        st === 'audio_mastering' ||
        msg.includes('mastering') ||
        msg.includes('encoding') ||
        msg.includes('128kbps') ||
        msg.includes('lufs')
    ) {
        return 'mastering';
    }
    if (st === 'synthesizing' || st === 'chunk_synthesis' || msg.includes('synthesizing') || msg.includes('chunk')) {
        return 'synthesis';
    }
    if (
        st === 'voice_tournaments' ||
        st === 'voice_alignment' ||
        msg.includes('voice') ||
        msg.includes('master voice') ||
        msg.includes('calibrat')
    ) {
        return 'casting';
    }
    if (st === 'parsing_turns' || st === 'rendering' || msg.includes('parsing') || msg.includes('script')) {
        return 'parsing';
    }
    return 'synthesis';
}

/** Translates raw pipeline log strings into human-readable phase labels and progress estimates. */
export function translateLoadingStepToHuman(
    rawStep: string | null | undefined,
    _story?: unknown,
    activeWork: { sceneLabel?: string; characterName?: string } | null = null
): HumanLoadingStepStatus {
    void _story;
    const stepStr = String(rawStep || '').trim();
    if (!stepStr) {
        return {
            phaseNumber: 0,
            phaseLabel: 'Creation Stage Idle',
            humanHeadline: 'Narrative Pipeline Ready',
            subtext: 'Commission a new story or continue drafting',
            progressPct: 0,
            isEditorial: false
        };
    }

    const lower = stepStr.toLowerCase();

    if (
        lower.includes('audio') ||
        lower.includes('tts') ||
        lower.includes('voice') ||
        lower.includes('synthesiz') ||
        lower.includes('parsing_turns') ||
        lower.includes('voice_tournaments') ||
        lower.includes('voice_alignment') ||
        lower.includes('chunk_synthesis') ||
        lower.includes('audiomastering') ||
        lower.includes('audio_mastering') ||
        lower.includes('encoding') ||
        lower.includes('master mp3') ||
        lower.includes('offline store') ||
        lower.includes('offline audio')
    ) {
        let audioStageId = 'synthesis';
        let headline = 'Synthesizing Multi-Voice Audio Drama';
        let progressPct = 55;
        if (lower.includes('parsing') || lower.includes('script') || lower.includes('dialogue cue')) {
            audioStageId = 'parsing';
            headline = 'Parsing Audio Script & Dialogue Cues';
            progressPct = 12;
        } else if (
            lower.includes('voice_tournaments') ||
            lower.includes('voice_alignment') ||
            lower.includes('calibrat') ||
            lower.includes('master voice') ||
            lower.includes('voice profiles')
        ) {
            audioStageId = 'casting';
            headline = 'Calibrating Character Master Voices';
            progressPct = 28;
        } else if (
            lower.includes('encoding') ||
            lower.includes('mastering') ||
            lower.includes('128kbps') ||
            lower.includes('audiomastering') ||
            lower.includes('audio_mastering')
        ) {
            audioStageId = 'mastering';
            headline = 'Mastering Broadcast Audio Timeline';
            progressPct = 86;
        } else if (
            lower.includes('saving') ||
            lower.includes('archiving') ||
            lower.includes('offline store') ||
            lower.includes('offline audio')
        ) {
            audioStageId = 'archiving';
            headline = 'Archiving Offline Scene Audio';
            progressPct = 96;
        } else if (lower.includes('synthesiz') || lower.includes('chunk')) {
            audioStageId = 'synthesis';
            headline = 'Synthesizing Multi-Voice Performance';
            progressPct = 60;
        }

        return {
            phaseNumber: 6,
            phaseLabel: 'Audio Drama Production',
            humanHeadline: headline,
            subtext: stepStr.replace(/^audio\s*(?:autopilot|drama)?\s*(?:\[[^\]]+\])?\s*:?\s*/i, ''),
            progressPct,
            isEditorial: false,
            audioStageId
        };
    }

    if (
        lower.includes('editorial') ||
        lower.includes('surgical') ||
        lower.includes('banned') ||
        lower.includes('polish') ||
        lower.includes('reviewing') ||
        lower.includes('tribunal') ||
        lower.includes('blind reader') ||
        lower.includes('continuity auditor') ||
        lower.includes('voice dna')
    ) {
        let headline = 'Editorial Quality & Polish';
        if (lower.includes('surgical')) headline = 'Surgical Editor: Word Choice & Rhythm';
        else if (lower.includes('continuity auditor') || lower.includes('active state')) {
            headline = 'Continuity Audit: Facts & Timeline';
        } else if (lower.includes('sensory') || lower.includes('melody')) {
            headline = 'Sensory & Melodic Refinement';
        } else if (lower.includes('tribunal')) headline = 'Tribunal: Multi-Angle Quality Review';
        else if (lower.includes('blind reader')) headline = 'Layer 0: First-Impression Read';

        return {
            phaseNumber: 5,
            phaseLabel: 'Phase 5 of 5 · Editorial Polish',
            humanHeadline: headline,
            subtext: stepStr.replace(/^(?:editorial\s*harness|surgical\s*editor|tier\s*\d+\.\d+)\s*:?\s*/i, ''),
            progressPct: 85,
            isEditorial: true
        };
    }

    if (
        lower.includes('drafting') ||
        lower.includes('writing') ||
        lower.includes('prose') ||
        lower.includes('scene') ||
        lower.includes('beat') ||
        lower.includes('bridge') ||
        lower.includes('agentic writer') ||
        lower.includes('swain') ||
        lower.includes('handoff')
    ) {
        let headline = activeWork?.sceneLabel
            ? `Drafting Scene ${activeWork.sceneLabel}`
            : 'Drafting Manuscript Scene';
        if (lower.includes('beat')) headline = 'Choreographing Scene Beats';
        else if (lower.includes('bridge')) headline = 'Drafting Seamless Bridge Scene';
        else if (lower.includes('agentic')) {
            headline = activeWork?.sceneLabel
                ? `Composing Scene ${activeWork.sceneLabel}`
                : 'Authorial Prose Composition';
        } else if (lower.includes('archiving scene') || lower.includes('6.4')) {
            headline = 'Archiving Scene Memory';
        }

        return {
            phaseNumber: 4,
            phaseLabel: 'Phase 4 of 5 · Drafting Manuscript',
            humanHeadline: headline,
            subtext: stepStr.replace(/^(?:tier\s*\d+\.\d+|agentic writer|autopilot)\s*:?\s*/i, ''),
            progressPct: 65,
            isEditorial: false
        };
    }

    if (
        lower.includes('act') ||
        lower.includes('sequence') ||
        lower.includes('weaving') ||
        lower.includes('blueprint') ||
        lower.includes('structure') ||
        lower.includes('structuring') ||
        lower.includes('planning scenes')
    ) {
        let headline = 'Architecting Narrative Structure';
        if (lower.includes('weaving') || lower.includes('sequence')) headline = 'Weaving Dramatic Sequences';
        else if (lower.includes('act planner') || lower.includes('2.1')) headline = 'Structuring Act Milestones';
        else if (lower.includes('planning scenes')) headline = 'Planning Scene Blueprints';
        else if (lower.includes('compressor')) headline = 'Act Compressor: Distilling Lore';

        return {
            phaseNumber: 3,
            phaseLabel: 'Phase 3 of 5 · Story Architecture',
            humanHeadline: headline,
            subtext: stepStr.replace(/^(?:tier\s*\d+\.\d+|autopilot)\s*:?\s*/i, ''),
            progressPct: 45,
            isEditorial: false
        };
    }

    if (
        lower.includes('cast') ||
        lower.includes('character') ||
        lower.includes('interview') ||
        lower.includes('lore') ||
        lower.includes('world') ||
        lower.includes('rag') ||
        lower.includes('rsi')
    ) {
        let headline = 'Developing Cast & World Bible';
        if (lower.includes('interview')) {
            headline = activeWork?.characterName
                ? `Interviewing ${activeWork.characterName}`
                : 'Conducting Deep Character Interview';
        } else if (lower.includes('rag') || lower.includes('indexing')) headline = 'Indexing World Lore Memory';
        else if (lower.includes('rsi')) headline = 'Retroactive Lore Integration';

        return {
            phaseNumber: 2,
            phaseLabel: 'Phase 2 of 5 · Cast & World',
            humanHeadline: headline,
            subtext: stepStr.replace(/^(?:tier\s*\d+\.\d+|autopilot)\s*:?\s*/i, ''),
            progressPct: 25,
            isEditorial: false
        };
    }

    if (
        lower.includes('concept') ||
        lower.includes('arc') ||
        lower.includes('premise') ||
        lower.includes('thesis') ||
        lower.includes('bible') ||
        lower.includes('macro') ||
        lower.includes('theme') ||
        lower.includes('initializing')
    ) {
        return {
            phaseNumber: 1,
            phaseLabel: 'Phase 1 of 5 · Concept & Arc',
            humanHeadline: 'Forging Concept & Thematic Arc',
            subtext: stepStr.replace(/^(?:tier\s*\d+\.\d+|autopilot)\s*:?\s*/i, ''),
            progressPct: 12,
            isEditorial: false
        };
    }

    return {
        phaseNumber: 3,
        phaseLabel: 'Autonomous Story Generation',
        humanHeadline: 'Developing Story Elements',
        subtext: stepStr,
        progressPct: 50,
        isEditorial: false
    };
}

/**
 * Estimates overall novel completion %, per-phase percentages, per-sequence breakdown,
 * and the deterministic "Next Up" autopilot target.
 */
export function computeNovelProgressEstimate(
    story: (Partial<Story> & Record<string, unknown>) | null | undefined,
    opts: {
        enableEditorialHarness?: boolean;
        isRunningEditorialHarness?: boolean;
        editorialHarnessProgress?: number;
    } = {}
): NovelProgressEstimate {
    const enableEditorialHarness = opts?.enableEditorialHarness !== false;
    const isRunningEditorialHarness = Boolean(opts?.isRunningEditorialHarness);
    const editorialHarnessProgress = Number(opts?.editorialHarnessProgress) || 0;

    const defaultTargetWords = LENGTH_CONTROL.DEFAULT_TARGET_WORDS || 80000;
    const targetWords = Math.max(
        10000,
        parseInt(String(story?.target_word_count || ''), 10) || defaultTargetWords
    );

    const emptySequences: SequenceProgressItem[] = Array.from({ length: 8 }, (_, sq) => ({
        index: sq,
        number: sq + 1,
        actNumber: actForSequence(sq + 1),
        title: `Sequence ${sq + 1}`,
        isWoven: false,
        plannedScenes: 0,
        estimatedScenes: 3,
        completedScenes: 0,
        draftedOnlyScenes: 0,
        wordsWritten: 0,
        pct: 0,
        status: 'pending'
    }));

    if (!story || typeof story !== 'object') {
        return {
            overallPct: 0,
            phases: {
                1: { pct: 0, status: 'pending', label: 'Pending' },
                2: { pct: 0, status: 'pending', label: 'Pending' },
                3: { pct: 0, status: 'pending', label: 'Pending' },
                4: { pct: 0, status: 'pending', label: 'Pending' },
                5: { pct: 0, status: 'pending', label: 'Pending' }
            },
            sequences: emptySequences,
            plannedTotalScenes: 0,
            estimatedTotalScenes: emptySequences.reduce((sum, s) => sum + s.estimatedScenes, 0),
            isSceneCountEstimated: true,
            completedScenes: 0,
            draftedOnlyScenes: 0,
            wordsWritten: 0,
            targetWords,
            castCount: 0,
            interviewedCount: 0,
            actsCount: 0,
            seqCount: 0,
            wovenSeqCount: 0,
            editorialDone: false,
            enableEditorialHarness,
            nextUp: {
                phase: 1,
                elementType: 'story',
                title: 'Initialize Story Bible & Cast',
                detail: 'Tier 0.1 Concept Development & Tier 0.2 Cast Interviews'
            }
        };
    }

    const cast =
        Array.isArray(story.cast) && story.cast.length > 0
            ? story.cast
            : Array.isArray(story.characters)
              ? story.characters
              : [];
    const acts = Array.isArray(story.acts) ? story.acts : [];
    const sequences = Array.isArray(story.sequences) ? story.sequences : [];
    const scenesMap = (story.scenes || {}) as Record<string, Array<Record<string, unknown>>>;
    const proseMap = (story.prose || {}) as Record<string, unknown>;

    const bibleInitDone = Boolean(
        story.status_quo ||
            story.heart_of_the_dilemma ||
            cast.length > 0 ||
            acts.length > 0 ||
            sequences.length > 0
    );
    const arcDone = Boolean(story.core_thematic_argument);
    const phase1Pct = (bibleInitDone ? 50 : 0) + (arcDone ? 50 : 0);

    const interviewedCount = cast.filter((c) =>
        Boolean(c && (c.voice_sample || c.details?.deep_profile || c.sample_dialogue))
    ).length;
    const phase2Pct =
        cast.length === 0 ? 0 : Math.min(100, Math.round(30 + (interviewedCount / cast.length) * 70));

    const sequenceBreakdown: SequenceProgressItem[] = [];
    let plannedTotalScenes = 0;
    let estimatedTotalScenes = 0;
    let totalCompletedScenes = 0;
    let totalDraftedOnlyScenes = 0;
    let wordsWritten = 0;
    let wovenSeqCount = 0;

    for (let sq = 0; sq < 8; sq++) {
        const seqObj = sequences[sq] || null;
        const rawScenes = scenesMap[`${sq}`] || scenesMap[sq] || [];
        const sceneList = Array.isArray(rawScenes) ? rawScenes : [];
        const isWoven = sceneList.length > 0;
        if (isWoven) wovenSeqCount++;

        const actNumber = parseActNumber(seqObj?.parent_act, actForSequence(sq + 1));

        let seqEstimatedScenes = sceneList.length;
        if (!isWoven) {
            try {
                const plan = computeSequenceLengthPlan(story, sq);
                seqEstimatedScenes = Math.max(2, Number(plan?.idealScenes) || 3);
            } catch {
                seqEstimatedScenes = 3;
            }
        }

        let seqCompleted = 0;
        let seqDraftedOnly = 0;
        let seqWords = 0;
        sceneList.forEach((_, scIdx) => {
            const proseObj = proseMap[`${sq}-${scIdx}`];
            if (!proseObj) return;
            if (typeof proseObj === 'string') {
                const trimmed = proseObj.trim();
                if (trimmed) {
                    seqCompleted++;
                    seqWords += trimmed.split(/\s+/).filter(Boolean).length;
                }
            } else if (typeof proseObj === 'object') {
                const rec = proseObj as Record<string, unknown>;
                const finalStr = typeof rec.final === 'string' ? rec.final.trim() : '';
                const draftStr = typeof rec.draft === 'string' ? rec.draft.trim() : '';
                if (finalStr) {
                    seqCompleted++;
                    seqWords += finalStr.split(/\s+/).filter(Boolean).length;
                } else if (draftStr) {
                    seqDraftedOnly++;
                    seqWords += draftStr.split(/\s+/).filter(Boolean).length;
                }
            }
        });

        plannedTotalScenes += sceneList.length;
        estimatedTotalScenes += seqEstimatedScenes;
        totalCompletedScenes += seqCompleted;
        totalDraftedOnlyScenes += seqDraftedOnly;
        wordsWritten += seqWords;

        const seqPct = isWoven
            ? Math.min(100, Math.round(((seqCompleted + seqDraftedOnly * 0.5) / sceneList.length) * 100))
            : 0;
        const seqStatus =
            isWoven && seqCompleted >= sceneList.length
                ? 'complete'
                : seqCompleted > 0 || seqDraftedOnly > 0
                  ? 'in_progress'
                  : isWoven
                    ? 'planned'
                    : 'pending';

        sequenceBreakdown.push({
            index: sq,
            number: seqObj?.number || sq + 1,
            actNumber,
            title: seqObj?.title || `Sequence ${sq + 1}`,
            isWoven,
            plannedScenes: sceneList.length,
            estimatedScenes: seqEstimatedScenes,
            completedScenes: seqCompleted,
            draftedOnlyScenes: seqDraftedOnly,
            wordsWritten: seqWords,
            pct: seqPct,
            status: seqStatus
        });
    }

    const actsRatio = Math.min(acts.length, 3) / 3;
    const seqsRatio = Math.min(sequences.length, 8) / 8;
    const phase3Pct = Math.min(100, Math.round(actsRatio * 20 + seqsRatio * 27 + (wovenSeqCount / 8) * 53));

    const isSceneCountEstimated = wovenSeqCount < 8;
    const sceneUnits = totalCompletedScenes + totalDraftedOnlyScenes * 0.5;
    const phase4Pct =
        estimatedTotalScenes > 0 ? Math.min(100, Math.round((sceneUnits / estimatedTotalScenes) * 100)) : 0;

    const eh = story.editorial_harness as Record<string, unknown> | undefined;
    const editorialDone = Boolean(eh?.autopilotCompleted || eh?.completedAt || eh?.summary);
    const phase5Pct = editorialDone
        ? 100
        : isRunningEditorialHarness
          ? Math.max(5, Math.min(99, Math.round(editorialHarnessProgress)))
          : 0;

    const weights = {
        p1: 5,
        p2: 5,
        p3: 15,
        p4: enableEditorialHarness ? 65 : 75,
        p5: enableEditorialHarness ? 10 : 0
    };

    const hasAnyWork = Boolean(
        bibleInitDone ||
            arcDone ||
            cast.length > 0 ||
            acts.length > 0 ||
            sequences.length > 0 ||
            plannedTotalScenes > 0 ||
            totalCompletedScenes > 0 ||
            totalDraftedOnlyScenes > 0 ||
            editorialDone
    );

    let overallPct = hasAnyWork
        ? Math.min(
              100,
              Math.round(
                  (phase1Pct * weights.p1 +
                      phase2Pct * weights.p2 +
                      phase3Pct * weights.p3 +
                      phase4Pct * weights.p4 +
                      phase5Pct * weights.p5) /
                      100
              )
          )
        : 0;

    if (
        wovenSeqCount >= 8 &&
        plannedTotalScenes > 0 &&
        totalCompletedScenes >= plannedTotalScenes &&
        (!enableEditorialHarness || editorialDone)
    ) {
        overallPct = 100;
    }

    let nextUp: Record<string, unknown> | null = null;
    if (!bibleInitDone) {
        nextUp = {
            phase: 1,
            elementType: 'story',
            title: 'Initialize Story Bible & Cast',
            detail: 'Tier 0.1 Concept Development & Tier 0.2 Cast Interviews'
        };
    } else if (!arcDone) {
        nextUp = {
            phase: 1,
            elementType: 'arc',
            title: 'Establish Story Arc & Thematic Thesis',
            detail: 'Tier 1.1 Story Arc Planner'
        };
    } else if (sequences.length === 0) {
        nextUp = {
            phase: 3,
            elementType: 'act',
            title: acts.length >= 3 ? 'Weave 8 Narrative Sequences' : 'Structure 3 Acts & 8 Sequences',
            detail: 'Tier 2.1–3.2 Narrative Architecture'
        };
    } else {
        for (let sq = 0; sq < 8; sq++) {
            const seqInfo = sequenceBreakdown[sq];
            if (!seqInfo.isWoven) {
                nextUp = {
                    phase: 3,
                    elementType: 'sequence',
                    actNumber: seqInfo.actNumber,
                    seqIdx: sq,
                    seqNumber: seqInfo.number,
                    title: `Weave Scenes · Sequence ${seqInfo.number}`,
                    detail: `Act ${seqInfo.actNumber} · ${seqInfo.title}`
                };
                break;
            }
            const sceneList = scenesMap[`${sq}`] || scenesMap[sq] || [];
            for (let scIdx = 0; scIdx < sceneList.length; scIdx++) {
                const proseObj = proseMap[`${sq}-${scIdx}`];
                const hasFinal = Boolean(
                    (typeof proseObj === 'string' && proseObj.trim()) ||
                        (proseObj &&
                            typeof proseObj === 'object' &&
                            typeof (proseObj as Record<string, unknown>).final === 'string' &&
                            ((proseObj as Record<string, unknown>).final as string).trim())
                );
                if (!hasFinal) {
                    const scnTitle = sceneList[scIdx]?.title || `Scene ${scIdx + 1}`;
                    const scLabel = `${seqInfo.number}.${scIdx + 1}`;
                    nextUp = {
                        phase: 4,
                        elementType: 'scene',
                        actNumber: seqInfo.actNumber,
                        seqIdx: sq,
                        seqNumber: seqInfo.number,
                        sceneIdx: scIdx,
                        sceneLabel: scLabel,
                        title: `Draft Scene ${scLabel}: ${scnTitle}`,
                        detail: `Act ${seqInfo.actNumber} · Seq ${seqInfo.number}: ${seqInfo.title}`
                    };
                    break;
                }
            }
            if (nextUp) break;
        }
    }

    if (!nextUp) {
        if (enableEditorialHarness && !editorialDone) {
            nextUp = {
                phase: 5,
                elementType: 'editorial',
                title: 'Run Autonomous Editorial Harness',
                detail: '5-Phase Adversarial Tribunal & 3-Wave Literary CI/CD'
            };
        } else {
            nextUp = {
                phase: 5,
                elementType: 'complete',
                title: 'Full Novel Complete',
                detail: 'All sequences drafted and verified'
            };
        }
    }

    const phaseStatusObj = (
        pct: number,
        doneLabel = 'Complete',
        progLabel = 'In Progress',
        pendLabel = 'Pending'
    ): PhaseProgressItem => ({
        pct,
        status: pct >= 100 ? 'complete' : pct > 0 ? 'in_progress' : 'pending',
        label: pct >= 100 ? doneLabel : pct > 0 ? progLabel : pendLabel
    });

    return {
        overallPct,
        phases: {
            1: phaseStatusObj(phase1Pct, 'Established'),
            2: phaseStatusObj(phase2Pct, `${cast.length} Cast Ready`),
            3: phaseStatusObj(phase3Pct, 'All 8 Woven'),
            4: phaseStatusObj(phase4Pct, `${totalCompletedScenes} Drafted`),
            5: enableEditorialHarness
                ? phaseStatusObj(phase5Pct, 'Verified', 'Polishing', 'Standing By')
                : { pct: 100, status: 'skipped', label: 'Skipped (Setting)' }
        },
        sequences: sequenceBreakdown,
        plannedTotalScenes,
        estimatedTotalScenes,
        isSceneCountEstimated,
        completedScenes: totalCompletedScenes,
        draftedOnlyScenes: totalDraftedOnlyScenes,
        wordsWritten,
        targetWords,
        castCount: cast.length,
        interviewedCount,
        actsCount: acts.length,
        seqCount: sequences.length,
        wovenSeqCount,
        editorialDone,
        enableEditorialHarness,
        nextUp
    };
}

/**
 * Computes Audio Production Control Center progress, per-sequence audio matrix,
 * voice casting coverage, and 5-stage live status for Audio Autopilot.
 */
export function computeAudioProductionEstimate(
    story: (Partial<Story> & Record<string, unknown>) | null | undefined,
    availableSceneAudioMap: Record<string, Record<string, unknown>> = {},
    getSceneAudioStatus: ((sq: number, scIdx: number) => { status?: string } | null) | null = null,
    audioAutopilotProgress: Record<string, unknown> | null = null,
    audioDramaSettings: Record<string, unknown> | null = null,
    isAudioAutopilotRunning = false
): Record<string, unknown> {
    const tiers = Array.isArray(TTS_PIPELINE_TIERS) ? TTS_PIPELINE_TIERS : [];
    const activeTier =
        tiers.find((t) => t.id === audioDramaSettings?.backend) ||
        tiers[Number(audioDramaSettings?.pipelineTier)] ||
        { shortLabel: 'Hybrid Breeze 2 & Drama-3' };
    const backendLabel =
        (audioAutopilotProgress?.backendLabel as string | undefined) ||
        activeTier.shortLabel ||
        'Hybrid Breeze 2 & Drama-3';

    const cast =
        Array.isArray(story?.cast) && story!.cast!.length > 0
            ? story!.cast!
            : Array.isArray(story?.characters)
              ? story!.characters!
              : [];
    const voicedCastCount = cast.filter((c) => Boolean(c && (c.vocal_cadence || c.voice_seed))).length;
    const narratorReady = Boolean(story?.narrator_vocal_cadence);

    const seqs = Array.isArray(story?.sequences) ? story!.sequences! : [];
    const scenesMap = (story?.scenes || {}) as Record<string, Array<Record<string, unknown>>>;
    const proseMap = (story?.prose || {}) as Record<string, unknown>;
    const errorIds = new Set<string>(
        Array.isArray(audioAutopilotProgress?.errorSceneIds)
            ? (audioAutopilotProgress!.errorSceneIds as string[])
            : []
    );

    const seqGroups: Array<Record<string, unknown>> = [];
    let totalDrafted = 0;
    let readyCount = 0;
    let staleCount = 0;
    let pendingCount = 0;
    let errorCount = 0;
    let totalDurationSec = 0;
    let totalSizeBytes = 0;
    let nextAudioScene: Record<string, unknown> | null = null;
    let latestSavedAudio: Record<string, unknown> | null = null;

    const extractProse = (sq: number, scIdx: number): string => {
        const raw = proseMap[`${sq}-${scIdx}`];
        if (!raw) return '';
        const rec = typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
        const str = typeof raw === 'string' ? raw : rec?.final || rec?.draft || rec?.text || rec?.content || '';
        return typeof str === 'string' ? str.trim() : '';
    };

    seqs.forEach((seqObj, sq) => {
        const rawScenes = scenesMap[`${sq}`] || scenesMap[sq] || [];
        const sceneList = Array.isArray(rawScenes) ? rawScenes : [];
        const draftedScenes: Array<Record<string, unknown>> = [];

        sceneList.forEach((sc, scIdx) => {
            const proseText = extractProse(sq, scIdx);
            if (!proseText) return;
            totalDrafted++;
            const sId = `${sq}-${scIdx}`;
            const meta = availableSceneAudioMap?.[sId] || null;

            let rawStatus = 'none';
            if (typeof getSceneAudioStatus === 'function') {
                rawStatus = getSceneAudioStatus(sq, scIdx)?.status || 'none';
            } else if (meta) {
                rawStatus = 'ready';
            }

            const isCurrentlyRendering = Boolean(
                isAudioAutopilotRunning &&
                    audioAutopilotProgress?.currentSeqIdx === sq &&
                    audioAutopilotProgress?.currentSceneIdx === scIdx
            );

            let status = rawStatus === 'ready' ? 'ready' : rawStatus === 'stale' ? 'stale' : 'pending';
            if (isCurrentlyRendering) {
                status = 'rendering';
            } else if (errorIds.has(sId) && status !== 'ready') {
                status = 'error';
            }

            if (status === 'ready') readyCount++;
            else if (status === 'stale') staleCount++;
            else if (status === 'error') errorCount++;
            else if (status === 'pending') pendingCount++;

            if (meta) {
                totalDurationSec += Number(meta.durationSec) || 0;
                totalSizeBytes += Number(meta.sizeBytes) || 0;
                const updatedAt = Number(meta.updatedAt) || 0;
                if (!latestSavedAudio || updatedAt >= (Number(latestSavedAudio.updatedAt) || 0)) {
                    latestSavedAudio = {
                        seqIdx: sq,
                        sceneIdx: scIdx,
                        label: `${seqObj?.number || sq + 1}.${scIdx + 1}`,
                        seqTitle: seqObj?.title || `Sequence ${sq + 1}`,
                        sceneTitle: sc?.title || `Scene ${scIdx + 1}`,
                        durationSec: Number(meta.durationSec) || 0,
                        sizeBytes: Number(meta.sizeBytes) || 0,
                        cueCount: Number(meta.cueCount) || 0,
                        updatedAt
                    };
                }
            }

            const sceneItem: Record<string, unknown> = {
                seqIdx: sq,
                sceneIdx: scIdx,
                label: `${seqObj?.number || sq + 1}.${scIdx + 1}`,
                title: sc?.title || `Scene ${scIdx + 1}`,
                seqTitle: seqObj?.title || `Sequence ${sq + 1}`,
                status,
                durationSec: Number(meta?.durationSec) || 0,
                sizeBytes: Number(meta?.sizeBytes) || 0,
                cueCount: Number(meta?.cueCount) || 0,
                updatedAt: Number(meta?.updatedAt) || 0
            };
            draftedScenes.push(sceneItem);

            if (!nextAudioScene && (status === 'stale' || status === 'pending')) {
                nextAudioScene = sceneItem;
            }
        });

        if (draftedScenes.length > 0) {
            seqGroups.push({
                seqIdx: sq,
                number: seqObj?.number || sq + 1,
                title: seqObj?.title || `Sequence ${sq + 1}`,
                scenes: draftedScenes
            });
        }
    });

    let fractionalActive = 0;
    if (
        isAudioAutopilotRunning &&
        audioAutopilotProgress?.currentSeqIdx !== null &&
        audioAutopilotProgress?.currentSeqIdx !== undefined &&
        audioAutopilotProgress?.currentSceneIdx !== null &&
        audioAutopilotProgress?.currentSceneIdx !== undefined
    ) {
        const curSq = Number(audioAutopilotProgress.currentSeqIdx);
        const curSc = Number(audioAutopilotProgress.currentSceneIdx);
        const activeKey = `${curSq}-${curSc}`;
        const activeRawStatus =
            typeof getSceneAudioStatus === 'function'
                ? getSceneAudioStatus(curSq, curSc)?.status
                : availableSceneAudioMap?.[activeKey]
                  ? 'ready'
                  : 'none';
        if (activeRawStatus !== 'ready') {
            fractionalActive = Math.max(
                0,
                Math.min(0.99, (Number(audioAutopilotProgress.stagePct) || 0) / 100)
            );
        }
    }

    const overallPct =
        totalDrafted > 0
            ? Math.min(100, Math.round(((readyCount + fractionalActive) / totalDrafted) * 100))
            : 0;

    const stages: Record<string, string> = {};
    const allAudioComplete = totalDrafted > 0 && readyCount === totalDrafted && staleCount === 0;
    const activeStageId = (audioAutopilotProgress?.activeStageId as string | null) || null;

    if (isAudioAutopilotRunning && activeStageId) {
        if (activeStageId === 'done') {
            AUDIO_PRODUCTION_STAGE_ORDER.forEach((id) => {
                stages[id] = 'done';
            });
        } else {
            const activeIdx = AUDIO_PRODUCTION_STAGE_ORDER.indexOf(activeStageId);
            AUDIO_PRODUCTION_STAGE_ORDER.forEach((id, idx) => {
                if (activeIdx === -1) stages[id] = 'standby';
                else if (idx < activeIdx) stages[id] = 'done';
                else if (idx === activeIdx) stages[id] = 'active';
                else stages[id] = 'pending';
            });
        }
    } else if (allAudioComplete) {
        AUDIO_PRODUCTION_STAGE_ORDER.forEach((id) => {
            stages[id] = 'done';
        });
    } else {
        AUDIO_PRODUCTION_STAGE_ORDER.forEach((id) => {
            stages[id] = 'standby';
        });
        if (voicedCastCount > 0 || narratorReady) stages.casting = 'done';
        if (readyCount > 0) stages.archiving = 'in_progress';
    }

    return {
        overallPct,
        totalDrafted,
        readyCount,
        staleCount,
        pendingCount,
        errorCount,
        totalDurationSec,
        totalSizeBytes,
        sequences: seqGroups,
        backendLabel,
        castCount: cast.length,
        voicedCastCount,
        narratorReady,
        nextAudioScene,
        latestSavedAudio,
        stages,
        allAudioComplete
    };
}

export interface RecentStoryArtifacts {
    latestProse: {
        seqIdx: number;
        sceneIdx: number;
        seqNumber: number;
        seqTitle: string;
        sceneTitle: string;
        text: string;
        wordCount: number;
    } | null;
    latestCharacter: CastMember | null;
    latestSequence: Record<string, unknown> | null;
    totalCharacters: number;
    totalSequences: number;
    totalActs: number;
}

/** Extracts newest prose, character, and sequence artifacts for Live Progress widgets. */
export function getRecentStoryArtifacts(
    story: (Partial<Story> & Record<string, unknown>) | null | undefined
): RecentStoryArtifacts {
    if (!story || typeof story !== 'object') {
        return {
            latestProse: null,
            latestCharacter: null,
            latestSequence: null,
            totalCharacters: 0,
            totalSequences: 0,
            totalActs: 0
        };
    }

    let latestProse: RecentStoryArtifacts['latestProse'] = null;
    const sequences = story.sequences || [];
    const scenesObj = (story.scenes || {}) as Record<string, Array<Record<string, unknown>>>;
    const proseObj = (story.prose || {}) as Record<string, unknown>;

    for (let seqIdx = sequences.length - 1; seqIdx >= 0; seqIdx--) {
        const scenes = scenesObj[`${seqIdx}`] || scenesObj[seqIdx] || [];
        for (let scnIdx = scenes.length - 1; scnIdx >= 0; scnIdx--) {
            const sId = `${seqIdx}-${scnIdx}`;
            const p = proseObj[sId] as Record<string, unknown> | string | undefined;
            const text =
                (p && typeof p === 'object'
                    ? String(p.final || p.draft || '')
                    : typeof p === 'string'
                      ? p
                      : '') || '';
            if (text && text.trim().length > 0) {
                const scn = scenes[scnIdx] || {};
                latestProse = {
                    seqIdx,
                    sceneIdx: scnIdx,
                    seqNumber: sequences[seqIdx]?.number || seqIdx + 1,
                    seqTitle: sequences[seqIdx]?.title || `Sequence ${seqIdx + 1}`,
                    sceneTitle: String(scn.title || `Scene ${scnIdx + 1}`),
                    text: text.trim(),
                    wordCount: text.trim().split(/\s+/).filter(Boolean).length
                };
                break;
            }
        }
        if (latestProse) break;
    }

    const chars =
        Array.isArray(story.cast) && story.cast.length > 0
            ? story.cast
            : Array.isArray(story.characters)
              ? story.characters
              : [];
    const latestCharacter = chars.length > 0 ? chars[chars.length - 1] : null;

    let latestSequence: Record<string, unknown> | null = null;
    if (sequences.length > 0) {
        const latestSeqIdx = sequences.length - 1;
        const rawLatestSeq = sequences[latestSeqIdx];
        const seqScenesArr =
            scenesObj[`${latestSeqIdx}`] || scenesObj[latestSeqIdx] || rawLatestSeq?.scenes || [];
        latestSequence = {
            ...rawLatestSeq,
            seqIdx: latestSeqIdx,
            plannedScenesCount: Array.isArray(seqScenesArr) ? seqScenesArr.length : 0
        };
    }

    return {
        latestProse,
        latestCharacter,
        latestSequence,
        totalCharacters: chars.length,
        totalSequences: sequences.length,
        totalActs: (story.acts || []).length
    };
}
