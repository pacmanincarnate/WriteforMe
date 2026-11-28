/**
 * @module pipeline/initStory
 * Setup-to-Story entity creation, Tier 0.1 Conceptual Development,
 * Tier 0.2 Staggered Character Interviews, and Tier 1.1 Story Arc seeding.
 */

import { STORAGE_KEYS } from '@/config';
import {
    cleanCharacterNameFromVoiceProfile,
    extractPersonalizedReferenceTextFromInterview,
    getDeterministicVoiceSeed,
    isValidQwenVoiceProfile,
    synthesizeQwenVoiceDesignProfile,
    synthesizeVoiceDesignProfile,
    type AudioStoryLike,
    type VoiceCastMember
} from '@/domain/audio';
import { createDefaultStoryTemplate } from '@/domain/lifecycle';
import { buildUploadLoreChunks, computeLoreFingerprint } from '@/domain/lore';
import {
    applyCascadingNameReplacements as domainApplyCascadingNameReplacements,
    auditEntityNamesAndPlaces as domainAuditEntityNamesAndPlaces,
    extractCandidatePlaceNames as domainExtractCandidatePlaceNames
} from '@/domain/slop';
import {
    buildGenreToneBlocks,
    computePacingRanges,
    extractCharacterBrief,
    extractRelationship,
    formatLoreForPrompt,
    LENGTH_CONTROL,
    parseStoryArcXml,
    parseStructuredGenre,
    parseStructuredStyle,
    parseStructuredTone
} from '@/domain/story';
import {
    createSeriesOpener,
    findSequelLead,
    formatReturningInterviewBlock,
    formatSeriesConceptRules,
    formatSeriesContext,
    isSeriesStory,
    keepSeriesVaultEntries,
    mergeCarriedCharacterStates,
    mergeCarriedRelationships,
    mergeReturningCast,
    validateSequelLead
} from '@/domain/series';
import { createSerialInfo, formatSerialCastBlock } from '@/domain/serial';
import { PROMPTS } from '@/prompts';
import { logStore, storyStore } from '@/services/storage';
import { isLocalProvider, type CastMember, type LoreItem, type Story } from '@/types';
import {
    decodeXmlEntities,
    extractAllTags,
    extractTag,
    extractTagList,
    safeLocalStorageSet,
    stripXmlTags
} from '@/utils';
import {
    asArray,
    asNumber,
    asRecord,
    asString,
    extractErrorMessage,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';
import { repairBannedEntitiesWithAI } from './continuityPipeline';
import { buildStoryArcGeneratorPrompt, buildStoryArcReviewerPrompt } from './arcAndActs';
import { buildConceptNameBankBlock } from './nameBank';
import { runAgentWithEscalation } from './escalation';
import { distillLore, ingestLore, ingestLoreBatch } from './lorePipeline';
import { applySeriesAfterArc, runSeriesArchitect } from './series';

/** True for Book 2 onward of a series: a story seeded from a finished book. */
function isSequelStory(story: PipelineStory | null | undefined): boolean {
    return isSeriesStory(story) && asNumber(asRecord(story?.series).book_number, 1) > 1;
}

/** Reads the lead's name out of raw Tier 0.1 output without running the full cast parse. */
function peekConceptLeadName(conceptOutput: string): string {
    const briefs = extractTagList(extractTag(conceptOutput, 'character_briefs') || conceptOutput, 'brief');
    const lead =
        briefs.find((b) => /MAIN_CHARACTER/i.test(extractTag(b, 'corner_role'))) || briefs[0] || '';
    return decodeXmlEntities(extractTag(lead, 'name') || '').trim();
}

export interface CreateStoryFromSetupOptions {
    navigateToOverview?: boolean;
}

export interface CreatedStoryResult {
    storyId: string;
    story: PipelineStory;
    loreText: string;
}

export interface InitStoryOptions {
    existingStory?: PipelineStory | null;
    fromSetup?: boolean;
}

interface RelationshipEntry {
    current: string;
    initial_feeling: string;
    hidden_tension: string;
    trust_level: number;
    history: Array<{ chapter: string; change: string }>;
}

/** Saves a freshly built story document and makes it the active story. */
export async function activateCreatedStory(
    ctx: PipelineRuntimeContext,
    newStoryId: string,
    createdStory: PipelineStory
): Promise<void> {
    await storyStore.saveStory(newStoryId, createdStory);
    await logStore.saveLogs(newStoryId, []);

    const skipRef = ctx.getSkipNextIdbHydrationIdRef?.();
    if (skipRef) skipRef.current = newStoryId;
    const initMountRef = ctx.getIsInitialMountRef?.();
    if (initMountRef) initMountRef.current = false;

    ctx.setSelectedAct?.(null);
    ctx.setSelectedSequence?.(null);
    ctx.setSelectedScene?.(null);
    ctx.setPromptLog?.([]);
    const logHydratedRef = ctx.getIsLogHydratedRef?.();
    if (logHydratedRef) logHydratedRef.current = true;
    ctx.setWorldPrimer(null);

    const snapshotsMap = ctx.getStorySnapshotsByIdMap?.();
    if (snapshotsMap) snapshotsMap[newStoryId] = createdStory;
    ctx.setStory(createdStory);
    const hydratedRef = ctx.getHasHydratedStoryRef?.();
    if (hydratedRef) hydratedRef.current = true;
    ctx.setActiveStoryId?.(newStoryId);
}

/** Creates and persists a new Story document from the current Setup Wizard draft. */
export async function createStoryEntityFromSetup(
    ctx: PipelineRuntimeContext,
    { navigateToOverview = true }: CreateStoryFromSetupOptions = {}
): Promise<CreatedStoryResult | null> {
    const setupDraft = ctx.getSetupDraft?.() || {};
    const conceptToUse = (setupDraft.inputConcept || '').trim();
    if (!conceptToUse) return null;

    const capturedTitle = (setupDraft.inputTitle || '').trim() || 'My New Story';
    const capturedAuthorNote = setupDraft.inputAuthorNote || '';
    const capturedWritingMode = setupDraft.inputWritingMode || 'novel';
    const capturedBookType = setupDraft.inputBookType || 'popular';
    const capturedCustomWords = setupDraft.inputCustomWords;
    const capturedLoreText = setupDraft.importedLoreText || '';
    const capturedSeriesOpener = Boolean(setupDraft.inputSeriesOpener);
    const capturedSeriesTitle = (setupDraft.inputSeriesTitle || '').trim();
    // A serial is always a series: each arc is one book of it.
    const capturedSerial = Boolean(setupDraft.inputSerial);
    const capturedSerialRotation = setupDraft.inputSerialRotation === 'ensemble' ? 'ensemble' : 'anchored';

    const newStoryId = `story_${Date.now()}`;
    const bookTypesMap = LENGTH_CONTROL.BOOK_TYPES as Record<
        string,
        { words?: number } | undefined
    >;
    const resolvedTargetWords =
        capturedBookType === 'custom'
            ? parseInt(String(capturedCustomWords || ''), 10) || 80000
            : bookTypesMap[capturedBookType]?.words || 80000;
    const baselineRanges = computePacingRanges(resolvedTargetWords, 0);
    const baselineSeqRanges = asRecord(baselineRanges.scenes_per_sequence);
    const rawUploadChunks =
        capturedLoreText && capturedLoreText.trim().length > 0
            ? buildUploadLoreChunks(capturedLoreText)
            : [];

    const baseTemplate = createDefaultStoryTemplate(newStoryId) as unknown as PipelineStory;
    const createdStory: PipelineStory = {
        ...baseTemplate,
        id: newStoryId,
        title: capturedTitle,
        writing_mode: capturedWritingMode,
        book_type: capturedBookType,
        target_word_count: resolvedTargetWords,
        concept: conceptToUse,
        author_note: capturedAuthorNote,
        lore: rawUploadChunks,
        threads: [
            {
                id: 'T1',
                name: 'Main Plot Thread (A-Story)',
                description:
                    'The central external conflict and physical stakes driving the plot forward.'
            },
            {
                id: 'T2',
                name: 'Relationship / Thematic Mirror (B-Story)',
                description:
                    'Relationship dynamics and personal vulnerability testing the core thematic argument.'
            },
            {
                id: 'T3',
                name: 'Internal Arc (C-Story)',
                description:
                    "The protagonist's internal psychological evolution from their core flaw/lie to hard-won truth."
            }
        ],
        generation_ranges: {
            scenes_per_sequence: {
                min: baselineSeqRanges.min,
                max: baselineSeqRanges.max,
                justification: baselineSeqRanges.justification
            }
        },
        ...(capturedSeriesOpener || capturedSerial
            ? { series: createSeriesOpener(capturedSeriesTitle, capturedTitle), open_threads: [] }
            : {}),
        ...(capturedSerial ? { serial: createSerialInfo({ rotation: capturedSerialRotation }) } : {})
    };

    const pendingSetupLore = ctx.getPendingSetupLoreMap?.();
    if (pendingSetupLore && capturedLoreText && capturedLoreText.trim().length > 0) {
        pendingSetupLore[newStoryId] = capturedLoreText;
    }

    try {
        const existingDefault = (await storyStore.loadStory('story_default')) as PipelineStory | null;
        if (
            existingDefault &&
            !existingDefault.concept &&
            !existingDefault.status_quo &&
            (!existingDefault.cast || asArray(existingDefault.cast).length === 0) &&
            (!existingDefault.acts || asArray(existingDefault.acts).length === 0) &&
            (!existingDefault.sequences || asArray(existingDefault.sequences).length === 0) &&
            Object.keys(asRecord(existingDefault.prose)).length === 0 &&
            (!existingDefault.title || existingDefault.title === 'Untitled Story')
        ) {
            await storyStore.deleteStory('story_default');
        }
    } catch {
        // Ignore cleanup errors for untouched default placeholder
    }

    await activateCreatedStory(ctx, newStoryId, createdStory);

    ctx.clearSetupDraft?.();

    if (navigateToOverview && !ctx.isAutopilotProtectedView?.()) {
        ctx.setView?.('dashboard');
    }
    ctx.refreshLibrary?.().catch((err) => {
        console.warn('Failed refreshing library after story creation:', err);
    });

    return {
        storyId: newStoryId,
        story: createdStory,
        loreText: capturedLoreText
    };
}

/** End-to-end story bible initialization: World Primer, Tier 0.1, Tier 0.2, and Tier 1.1 Arc. */
export async function initStory(
    ctx: PipelineRuntimeContext,
    isAutopilotOrEvent: boolean | unknown = false,
    options: InitStoryOptions = {}
): Promise<PipelineStory | undefined> {
    if (ctx.getImportingLore?.()) return undefined;
    const isAutopilot = typeof isAutopilotOrEvent === 'boolean' ? isAutopilotOrEvent : false;
    const opts = options && typeof options === 'object' ? options : {};

    let newStoryId: string | null;
    let baselineStory: PipelineStory;
    let loreTextToUse: string;
    let conceptToUse: string;
    let titleToUse: string;
    let authorNoteToUse: string;
    let writingModeToUse: string;
    let bookTypeToUse: string;
    let customWordsToUse: string | number;

    const setupDraft = ctx.getSetupDraft?.() || {};
    const pendingSetupLore = ctx.getPendingSetupLoreMap?.() || {};
    const snapshotsMap = ctx.getStorySnapshotsByIdMap?.() || {};

    if (opts.existingStory && opts.existingStory.id) {
        baselineStory = opts.existingStory;
        newStoryId = asString(baselineStory.id);
        conceptToUse = asString(baselineStory.concept).trim();
        if (!conceptToUse) return undefined;
        titleToUse = asString(baselineStory.title) || 'My New Story';
        authorNoteToUse = asString(baselineStory.author_note);
        writingModeToUse = asString(baselineStory.writing_mode) || 'novel';
        bookTypeToUse = asString(baselineStory.book_type) || 'popular';
        customWordsToUse = Number(baselineStory.target_word_count || 80000);
        const existingLoreArr = asArray<Record<string, unknown>>(baselineStory.lore);
        loreTextToUse =
            pendingSetupLore[newStoryId] ||
            (existingLoreArr.length > 0
                ? existingLoreArr
                      .map((c) => asString(c.detail))
                      .filter(Boolean)
                      .join('\n\n')
                : '');
        delete pendingSetupLore[newStoryId];
        // A sequel's lore was carried over already organised; it is not distilled again.
        if (isSequelStory(baselineStory)) loreTextToUse = '';
        snapshotsMap[newStoryId] = baselineStory;
        if (!isAutopilot || !ctx.isAutopilotProtectedView?.()) ctx.setView?.('dashboard');
    } else if (
        opts.fromSetup ||
        ctx.getView?.() === 'setup' ||
        (setupDraft.inputConcept && setupDraft.inputConcept.trim())
    ) {
        const created = await createStoryEntityFromSetup(ctx, {
            navigateToOverview: !isAutopilot || !ctx.isAutopilotProtectedView?.()
        });
        if (!created) return undefined;
        newStoryId = created.storyId;
        baselineStory = created.story;
        conceptToUse = asString(baselineStory.concept);
        titleToUse = asString(baselineStory.title) || 'My New Story';
        authorNoteToUse = asString(baselineStory.author_note);
        writingModeToUse = asString(baselineStory.writing_mode) || 'novel';
        bookTypeToUse = asString(baselineStory.book_type) || 'popular';
        customWordsToUse = Number(baselineStory.target_word_count || 80000);
        loreTextToUse = created.loreText || '';
        delete pendingSetupLore[newStoryId];
    } else {
        const existing = ctx.getStory();
        conceptToUse = asString(existing?.concept).trim();
        if (!conceptToUse) return undefined;
        const existingId = asString(existing?.id);
        newStoryId =
            existingId && existingId !== 'story_default' ? existingId : `story_${Date.now()}`;
        baselineStory = {
            ...(createDefaultStoryTemplate(newStoryId) as unknown as PipelineStory),
            ...(existing || {}),
            id: newStoryId
        };
        titleToUse = asString(baselineStory.title) || 'My New Story';
        authorNoteToUse = asString(baselineStory.author_note);
        writingModeToUse = asString(baselineStory.writing_mode) || 'novel';
        bookTypeToUse = asString(baselineStory.book_type) || 'popular';
        customWordsToUse = Number(baselineStory.target_word_count || 80000);
        const existingLoreArr = asArray<Record<string, unknown>>(baselineStory.lore);
        loreTextToUse =
            existingLoreArr.length > 0
                ? existingLoreArr
                      .map((c) => asString(c.detail))
                      .filter(Boolean)
                      .join('\n\n')
                : '';
        await storyStore.saveStory(newStoryId, baselineStory);
        await logStore.saveLogs(newStoryId, []);
        const skipRef = ctx.getSkipNextIdbHydrationIdRef?.();
        if (skipRef) skipRef.current = newStoryId;
        const initMountRef = ctx.getIsInitialMountRef?.();
        if (initMountRef) initMountRef.current = false;
        snapshotsMap[newStoryId] = baselineStory;
        ctx.setStory(baselineStory);
        const hydratedRef = ctx.getHasHydratedStoryRef?.();
        if (hydratedRef) hydratedRef.current = true;
        ctx.setActiveStoryId?.(newStoryId);
        ctx.setPromptLog?.([]);
        const logHydratedRef = ctx.getIsLogHydratedRef?.();
        if (logHydratedRef) logHydratedRef.current = true;
        if (!isAutopilot || !ctx.isAutopilotProtectedView?.()) ctx.setView?.('dashboard');
        ctx.refreshLibrary?.().catch(() => {});
    }

    console.log(
        `[initStory] Starting story bible initialization... Title: "${titleToUse}" | ID: ${newStoryId} | Autopilot: ${isAutopilot}`
    );
    ctx.setLoading(true);
    const initStoryRef = ctx.getInitializingStoryIdRef?.();
    if (initStoryRef) initStoryRef.current = newStoryId;
    ctx.setInitializingStoryId?.(newStoryId);

    const hasInitialLore = Boolean(loreTextToUse && loreTextToUse.trim().length > 0);
    ctx.setActivePipelineWork?.(
        hasInitialLore
            ? {
                  mode: 'novel',
                  phase: 1,
                  elementType: 'lore',
                  title: 'World Lore Primer',
                  subStep: 'Synthesizing World Lore',
                  startedAt: Date.now()
              }
            : {
                  mode: 'novel',
                  phase: 1,
                  elementType: 'story',
                  title: titleToUse,
                  subStep: 'Conceptual Development (Tier 0.1)',
                  startedAt: Date.now()
              }
    );
    ctx.setLoadingStep(
        hasInitialLore ? 'Synthesizing World Lore...' : 'Conceptual Development (Tier 0.1)...'
    );

    const auditFn = ctx.auditEntityNamesAndPlaces || domainAuditEntityNamesAndPlaces;
    const extractPlacesFn = ctx.extractCandidatePlaceNames || domainExtractCandidatePlaceNames;
    const replaceFn = ctx.applyCascadingNameReplacements || domainApplyCascadingNameReplacements;

    try {
        // Both series blocks are empty strings for a standalone story.
        let finalPrompt = `${formatSeriesContext(baselineStory)}${formatSerialCastBlock(baselineStory as Partial<Story>)}${formatSeriesConceptRules(baselineStory)}<concept>${conceptToUse}</concept>`;
        const primer =
            loreTextToUse && loreTextToUse.trim().length > 0
                ? await distillLore(ctx, loreTextToUse, { storyId: newStoryId })
                : null;
        let indexedUploadedChunks: Array<Record<string, unknown>> = [];
        if (loreTextToUse && loreTextToUse.trim().length > 0) {
            const baselineLore = asArray<Record<string, unknown>>(baselineStory.lore);
            const rawChunks =
                baselineLore.length > 0 ? baselineLore : buildUploadLoreChunks(loreTextToUse);
            indexedUploadedChunks = await ingestLoreBatch(ctx, rawChunks, {
                clearExisting: true,
                storyId: newStoryId
            });
            if (!indexedUploadedChunks || indexedUploadedChunks.length === 0) {
                indexedUploadedChunks = rawChunks;
            }
            await ctx.updateStoryById(newStoryId, (prev) => ({
                ...prev,
                world_primer: primer || prev.world_primer || null,
                lore: indexedUploadedChunks
            }));
        }
        if (primer) {
            finalPrompt += `\n\n<world_primer>${primer}</world_primer>`;
            const relevantChunks = await ctx.retrieveContext(
                `Concept: ${conceptToUse} Themes and Tone`,
                0.6,
                null,
                indexedUploadedChunks as unknown as LoreItem[]
            );
            if (relevantChunks.length > 0) {
                finalPrompt += `\n\n<relevant_lore>${relevantChunks.map((c) => c.text).join('\n')}</relevant_lore>`;
            }
        } else if (loreTextToUse && loreTextToUse.trim().length > 0) {
            finalPrompt += `\n\n<author_lore_notes>${loreTextToUse}</author_lore_notes>`;
        } else if (isSequelStory(baselineStory) && asString(baselineStory.world_primer).trim()) {
            finalPrompt += `\n\n<world_primer>${asString(baselineStory.world_primer)}</world_primer>`;
        }

        // Real names for the story's time and place; empty when the name bank is off.
        const nameBankBlock = await buildConceptNameBankBlock(ctx, {
            story: baselineStory,
            setting: `${conceptToUse}\n${authorNoteToUse || ''}`,
            avoid: asArray<Record<string, unknown>>(baselineStory.cast).map((c) => asString(c.name))
        });
        if (nameBankBlock) finalPrompt += `\n\n${nameBankBlock}`;

        finalPrompt += `\n\n<output_format_description>
FORMATTING DIRECTIVE: Return your response strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

Output Schema:
<response>
  <genre_classification>
    Identify the primary narrative engine based on the user's concept.
    - CONTRADICTION SYNTHESIS: If the concept contains conflicting ideas or tones, DO NOT dilute them. Synthesize them into a highly specific, original sub-genre (e.g., if asked for a comedy and a gritty thriller, define exactly how the humor weaponizes the grit).
    - TROPES: Name one genre convention this story will play straight, and one it must ruthlessly subvert to defy reader expectations.
    - BOUNDARIES: Define the inviolable rules and hard constraints governing this story's universe. Structure as two clear categories:
      * INVIOLABLE RULES: Core truths the narrative must always honor (e.g., "Magic has a physical cost — every spell damages the caster's body", "The romance builds through quiet, mundane intimacy, never grand public gestures", "Death is permanent — no resurrection, no loopholes").
      * FORBIDDEN ELEMENTS: Specific elements, tones, or scenarios that would break this story's internal logic or genre contract (e.g., "No deus ex machina rescues", "No characters breaking the fourth wall", "No sanitized violence — if someone is hurt, it has real consequences").
      WARNING: Do NOT list positive themes, genre descriptions, plot goals, or story premises here. This field defines the load-bearing walls and hard limits — the structural rules that every agent writing this story must respect.
  </genre_classification>
  <tone_and_atmosphere>
    Define the psychological weight and atmospheric pressure of the world.
    - AUTHORIAL TRIANGULATION: Name 2 to 3 disparate, highly distinct published authors whose styles, when blended, perfectly capture this unique tone.
    - SENSORY DIRECTIVE AND PERFORMER'S LENS: Instruct the downstream writer on HOW to filter descriptions and embody the characters. Do not list static smells or sounds. Instead, dictate the lens: Does the narrative linger on worn, rain-slicked decay and sudden street hazards (Noir)? Does it obsess over the crushing weight of history and scale (Epic Fantasy)? Crucially, provide guidance on how the narrative lens shifts dynamically during different moments (action, reflection, dialogue) to prevent the prose from falling into a repetitive, monotone rhythm. Give the writer permission to breathe and vary their focus based on the context of the scene.
  </tone_and_atmosphere>
  <writing_style_description>
    Provide an evocative, clear stylistic guide for the prose generator. You must define:
    1. FOCALIZER BIAS: Dictate exactly how the protagonist's internal biases and flaws distort what the narrative camera notices.
    2. SYNTACTIC RHYTHM: Dictate the required sentence structure and cadence, mandating organic sentence variety (modulating between crisp action clauses and flowing, musical compound sentences). Explicitly prohibit telegraphic strings of ultra-short fragments (e.g., chains of <= 3-word sentences) or rigid binary whiplash between extremes.
    3. ANTI-PATTERNS: Name one specific stylistic habit or crutch this book must avoid at all costs.
  </writing_style_description>
  <heart_of_the_dilemma>A single, universal human dilemma (1-2 sentences in everyday language, calibrated to this genre) that all characters reflect from different angles.</heart_of_the_dilemma>
  <status_quo>Comprehensive, multi-paragraph detailing of the setting, rules, history, societal structures, and normal world status quo in its baseline equilibrium before the plot begins.</status_quo>
  <narrator_vocal_cadence>7-Component Voice Design profile for the Story Narrator (Gender + Age + Pitch + Pace + Emotion + Characteristics + Use case). Must be 15-40 words (2-3 natural sentences), objective physical vocal qualities, no names. Example: "A middle-aged male voice, early forties, deep baritone with a rich, magnetic tone and smooth resonance. Moderate, deliberate pace with a calm, composed delivery. Suitable for literary audiobook narration or documentary broadcast."</narrator_vocal_cadence>
  <character_briefs>
    <!-- FOUR-CORNER CHARACTER WEB MANDATE: C1 through C4 MUST reflect the 4 corners of <heart_of_the_dilemma>:
         C1: MAIN_CHARACTER (Protagonist with Safety Habit)
         C2: THE_CHALLENGER (The New Way / Foil who pushes C1 out of their shell)
         C3: THE_COMFORTER (The Safe Way / Warm validating ally who enables the Safety Habit)
         C4: THE_WARNING (The Cost / Opponent who took the Safety Habit too far)
         C5-C6 (Optional): Additional supporting cast if needed. -->
    <brief>
      <id>C1</id>
      <name>Protagonist Name</name>
      <corner_role>MAIN_CHARACTER</corner_role>
      <role>Protagonist. Role in the world, ordinary life, and primary conflict.</role>
      <core_flaw>Their Safety Habit (the believed lie or defense mechanism they rely on to protect themselves).</core_flaw>
      <why_it_makes_sense>Why this habit is understandable, sympathetic, and earned in their past or work.</why_it_makes_sense>
      <what_it_costs_them>The quiet toll, personal cost, or limitation this habit causes.</what_it_costs_them>
      <core_desire>The deep human hunger beneath their choices.</core_desire>
      <vocal_cadence>Bespoke 7-Component voice profile specific to C1 (Gender + Age + Pitch + Pace + Emotion + Characteristics + Use case; 15-40 words in 2-3 natural sentences; must contrast with C2-C4; no names).</vocal_cadence>
    </brief>
    <brief>
      <id>C2</id>
      <name>Challenger Name</name>
      <corner_role>THE_CHALLENGER</corner_role>
      <role>The Challenger / Foil / Love Interest. Pulls the protagonist out of their comfort zone.</role>
      <way_of_living>How they naturally live the opposite approach to C1's Safety Habit.</way_of_living>
      <why_it_is_appealing>Why their perspective is magnetic, refreshing, or challenging to C1.</why_it_is_appealing>
      <core_flaw>Their own distinct blind spot or personal struggle (never an infallible saint or therapist).</core_flaw>
      <core_desire>What they yearn for from life and their bond with C1.</core_desire>
      <vocal_cadence>Bespoke 7-Component voice profile specific to C2 (Gender + Age + Pitch + Pace + Emotion + Characteristics + Use case; 15-40 words in 2-3 natural sentences; must contrast with C1, C3, C4; no names).</vocal_cadence>
    </brief>
    <brief>
      <id>C3</id>
      <name>Comforter Name</name>
      <corner_role>THE_COMFORTER</corner_role>
      <role>The Comforter / Safe Haven. Validates and comforts C1, but enables their limitation.</role>
      <shared_outlook>How they share, validate, or reinforce C1's Safety Habit.</shared_outlook>
      <why_they_are_tempting>The genuine warmth, loyalty, safety, or understanding they offer.</why_they_are_tempting>
      <the_hidden_trap>How their support quietly keeps C1 safe but trapped or stagnant.</the_hidden_trap>
      <core_flaw>Their protective avoidance or fear of disruption.</core_flaw>
      <core_desire>Their deep yearning for security, peace, or preserving the bond.</core_desire>
      <vocal_cadence>Bespoke 7-Component voice profile specific to C3 (Gender + Age + Pitch + Pace + Emotion + Characteristics + Use case; 15-40 words in 2-3 natural sentences; must contrast with C1, C2, C4; no names).</vocal_cadence>
    </brief>
    <brief>
      <id>C4</id>
      <name>Warning Name</name>
      <corner_role>THE_WARNING</corner_role>
      <role>The Warning / Living Mirror / Opponent. Shows what happens when the Safety Habit is taken too far.</role>
      <how_they_ended_up>How years of following this defensive path or extreme version shaped their life.</how_they_ended_up>
      <human_sympathy>Why they are deeply human and understandable rather than an arbitrary villain.</human_sympathy>
      <the_wake_up_call>The mirror they hold up to C1's future.</the_wake_up_call>
      <core_flaw>Their hardened rigidity, obsession, or defensive isolation.</core_flaw>
      <core_desire>Their driving pursuit and why their path collides with C1.</core_desire>
      <vocal_cadence>Bespoke 7-Component voice profile specific to C4 (Gender + Age + Pitch + Pace + Emotion + Characteristics + Use case; 15-40 words in 2-3 natural sentences; must contrast with C1-C3; no names).</vocal_cadence>
    </brief>
  </character_briefs>
  <relationship_matrix>
    <relationship>
      <source_id>C1</source_id>
      <target_id>C2</target_id>
      <dynamic_summary>Summary of how they interact and feel.</dynamic_summary>
      <hidden_tension>The unspoken friction between what they want vs need.</hidden_tension>
      <trust_level>5</trust_level>
    </relationship>
    <relationship>
      <source_id>C1</source_id>
      <target_id>C3</target_id>
      <dynamic_summary>Summary of rivalry, pressure, or adversarial conflict.</dynamic_summary>
      <hidden_tension>The fundamental moral or personal opposition driving their clash.</hidden_tension>
      <trust_level>2</trust_level>
    </relationship>
  </relationship_matrix>
</response>
</output_format_description>

BEGIN DEVELOPING CONCEPTUAL FOUNDATION`;

        console.log('[initStory] Starting Tier 0.1: Conceptual Development...');
        ctx.setActivePipelineWork?.({
            mode: 'novel',
            phase: 1,
            elementType: 'story',
            title: titleToUse,
            subStep: 'Conceptual Development (Tier 0.1)',
            startedAt: Date.now()
        });
        ctx.setLoadingStep('Conceptual Development (Tier 0.1)...');
        let conceptOutput = await ctx.callAI(
            finalPrompt,
            PROMPTS.conceptualDevelopment,
            false,
            'Conceptual Development (0.1)',
            'dev'
        );
        const seriesReturningCast = isSequelStory(baselineStory)
            ? asArray<Record<string, unknown> & { name: string }>(asRecord(baselineStory.series).returning_cast)
            : [];
        if (seriesReturningCast.length > 0) {
            // A sequel's lead may change, but must be a character the series already knows.
            const leadName = peekConceptLeadName(conceptOutput);
            const leadKnown = seriesReturningCast.some(
                (r) => r.name.trim().toLowerCase() === leadName.trim().toLowerCase()
            );
            if (leadName && !leadKnown) {
                ctx.logPipelineValidation(
                    'Series Lead Gate (Tier 0.1)',
                    false,
                    `The new lead "${leadName}" is not a returning character. Regenerating once.`,
                    null,
                    { tierName: 'Conceptual Development', type: 'structural_gate', actionTaken: 'Retrying Tier 0.1' }
                );
                conceptOutput = await ctx.callAI(
                    `${finalPrompt}\n\n=== REVISION REQUESTED ===\nC1 (MAIN_CHARACTER) was "${leadName}", who is not in <returning_cast>. The lead of this book MUST be one of: ${seriesReturningCast.map((r) => r.name).join(', ')}. Use the exact name. New characters may fill other corners.`,
                    PROMPTS.conceptualDevelopment,
                    false,
                    'Conceptual Development (0.1) - Series Lead Retry',
                    'dev'
                );
            }
        }

        const genre = extractTag(conceptOutput, 'genre_classification');
        const styleDesc = extractTag(conceptOutput, 'writing_style_description');
        const toneAtmosphere = extractTag(conceptOutput, 'tone_and_atmosphere');
        const statusQuo =
            extractTag(conceptOutput, 'status_quo') || extractTag(conceptOutput, 'world_bible');
        const heartOfTheDilemma = extractTag(conceptOutput, 'heart_of_the_dilemma') || '';
        const authorialPersona = extractTag(conceptOutput, 'synthesized_authorial_persona') || '';
        const genreRules = extractTag(conceptOutput, 'genre_pacing_and_dialogue_rules') || '';
        const strictAntiPatterns = extractTag(conceptOutput, 'strict_anti_patterns') || '';
        const rawNarratorCadence = decodeXmlEntities(
            extractTag(conceptOutput, 'narrator_vocal_cadence') || ''
        ).trim();
        const narratorCadence = isValidQwenVoiceProfile(rawNarratorCadence)
            ? cleanCharacterNameFromVoiceProfile(rawNarratorCadence, ['Narrator'])
            : synthesizeVoiceDesignProfile({ name: 'Narrator' }, 'Narrator', {
                  genre,
                  tone: toneAtmosphere,
                  concept: conceptToUse
              } as AudioStoryLike);

        let startingCast: Array<CastMember & Record<string, unknown>> = [];
        const searchContainers = [
            extractTag(conceptOutput, 'character_briefs'),
            extractTag(conceptOutput, 'characters'),
            extractTag(conceptOutput, 'cast'),
            conceptOutput
        ];
        const candidateItemTags = ['brief', 'character', 'character_brief', 'char'];

        for (const container of searchContainers) {
            if (!container) continue;
            for (const tag of candidateItemTags) {
                const items = extractTagList(container, tag);
                if (items && items.length > 0) {
                    startingCast = items.map((b, idx) => {
                        const id = extractTag(b, 'id') || extractTag(b, 'char_id') || `C${idx + 1}`;
                        const rawName =
                            extractTag(b, 'name') ||
                            extractTag(b, 'char_name') ||
                            extractTag(b, 'character_name');
                        let name = rawName ? decodeXmlEntities(rawName).trim() : '';
                        if (!name) {
                            name = b
                                .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '')
                                .replace(/<\/?[a-zA-Z0-9_]+>/g, '')
                                .trim()
                                .split('\n')[0]
                                .trim();
                        }
                        const decodedName = decodeXmlEntities(name || `Character ${idx + 1}`);
                        const decodedRole = decodeXmlEntities(
                            extractTag(b, 'role') ||
                                extractTag(b, 'brief_role') ||
                                extractTag(b, 'archetype') ||
                                ''
                        );
                        const decodedFlaw = decodeXmlEntities(
                            extractTag(b, 'core_flaw') ||
                                extractTag(b, 'flaw') ||
                                extractTag(b, 'lie_believed') ||
                                ''
                        );
                        const decodedDesire = decodeXmlEntities(
                            extractTag(b, 'core_desire') ||
                                extractTag(b, 'desire') ||
                                extractTag(b, 'goal') ||
                                ''
                        );
                        const rawCadence = decodeXmlEntities(
                            extractTag(b, 'vocal_cadence') ||
                                extractTag(b, 'cadence') ||
                                extractTag(b, 'voice') ||
                                ''
                        );
                        const cleanedCadence = cleanCharacterNameFromVoiceProfile(rawCadence, [
                            decodedName
                        ]);
                        const cornerRole = decodeXmlEntities(
                            extractTag(b, 'corner_role') ||
                                extractTag(b, 'corner') ||
                                (idx === 0
                                    ? 'MAIN_CHARACTER'
                                    : idx === 1
                                      ? 'THE_CHALLENGER'
                                      : idx === 2
                                        ? 'THE_COMFORTER'
                                        : idx === 3
                                          ? 'THE_WARNING'
                                          : 'SUPPORTING')
                        );
                        const whySense = decodeXmlEntities(
                            extractTag(b, 'why_it_makes_sense') || ''
                        );
                        const whatCosts = decodeXmlEntities(
                            extractTag(b, 'what_it_costs_them') || ''
                        );
                        const wayLiving = decodeXmlEntities(extractTag(b, 'way_of_living') || '');
                        const whyAppealing = decodeXmlEntities(
                            extractTag(b, 'why_it_is_appealing') || ''
                        );
                        const sharedOutlook = decodeXmlEntities(
                            extractTag(b, 'shared_outlook') || ''
                        );
                        const whyTempting = decodeXmlEntities(
                            extractTag(b, 'why_they_are_tempting') || ''
                        );
                        const hiddenTrap = decodeXmlEntities(extractTag(b, 'the_hidden_trap') || '');
                        const howEndedUp = decodeXmlEntities(
                            extractTag(b, 'how_they_ended_up') || ''
                        );
                        const humanSympathy = decodeXmlEntities(
                            extractTag(b, 'human_sympathy') || ''
                        );
                        const wakeUpCall = decodeXmlEntities(
                            extractTag(b, 'the_wake_up_call') || ''
                        );

                        return {
                            id,
                            name: decodedName,
                            role: decodedRole,
                            core_flaw: decodedFlaw,
                            core_desire: decodedDesire,
                            vocal_cadence: isValidQwenVoiceProfile(cleanedCadence)
                                ? cleanedCadence
                                : synthesizeQwenVoiceDesignProfile(
                                      {
                                          id,
                                          name: decodedName,
                                          role: decodedRole,
                                          corner_role: cornerRole,
                                          core_flaw: decodedFlaw,
                                          core_desire: decodedDesire
                                      } as VoiceCastMember,
                                      decodedName,
                                      { genre, tone: toneAtmosphere, concept: conceptToUse } as AudioStoryLike
                                  ),
                            voice_seed: getDeterministicVoiceSeed({ name: decodedName }, null),
                            corner_role: cornerRole,
                            why_it_makes_sense: whySense,
                            what_it_costs_them: whatCosts,
                            way_of_living: wayLiving,
                            why_it_is_appealing: whyAppealing,
                            shared_outlook: sharedOutlook,
                            why_they_are_tempting: whyTempting,
                            the_hidden_trap: hiddenTrap,
                            how_they_ended_up: howEndedUp,
                            human_sympathy: humanSympathy,
                            the_wake_up_call: wakeUpCall
                        };
                    });
                    break;
                }
            }
            if (startingCast.length > 0) break;
        }

        if (startingCast.length === 0) {
            const legacyBriefBlocks = extractAllTags(conceptOutput, 'character_briefs');
            if (legacyBriefBlocks.length > 0 && legacyBriefBlocks[0].includes('<char_id>')) {
                startingCast = legacyBriefBlocks.map(extractCharacterBrief) as unknown as Array<
                    CastMember & Record<string, unknown>
                >;
            }
        }

        if (startingCast.length <= 1) {
            const existingNames = new Set(startingCast.map((c) => c.name.toLowerCase().trim()));
            const STOP_WORDS_LOCAL = new Set([
                'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about',
                'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under',
                'and', 'but', 'or', 'nor', 'so', 'yet', 'if', 'because', 'although', 'since', 'unless',
                'while', 'where', 'when', 'whenever', 'wherever', 'whether', 'as', 'though',
                'he', 'she', 'they', 'it', 'we', 'you', 'i', 'his', 'her', 'their', 'its', 'our', 'your', 'my',
                'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'whose',
                'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
                'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
                'not', 'no', 'never', 'always', 'often', 'sometimes', 'usually',
                'act', 'acts', 'sequence', 'sequences', 'scene', 'scenes', 'chapter', 'chapters', 'part', 'parts',
                'novel', 'story', 'plot', 'theme', 'genre', 'format', 'status', 'quo', 'world', 'setting',
                'character', 'characters', 'protagonist', 'antagonist', 'author', 'reader', 'draft',
                'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
                'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
                'earth', 'city', 'kingdom', 'empire', 'street', 'house', 'room', 'building', 'hospital', 'station',
                'however', 'meanwhile', 'furthermore', 'moreover', 'suddenly', 'instead', 'consequently'
            ]);

            const combinedText = `${conceptToUse}\n${statusQuo || ''}\n${conceptOutput || ''}`;
            const namePattern =
                /\b(?:(?:Dr\.|Mr\.|Mrs\.|Ms\.|Captain|Detective|Commander|Lord|Lady)\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
            const discoveredNames: string[] = [];
            let nMatch: RegExpExecArray | null;
            while ((nMatch = namePattern.exec(combinedText)) !== null) {
                const candidate = nMatch[0].trim();
                const words = candidate.toLowerCase().split(/\s+/);
                if (
                    candidate.length > 2 &&
                    !STOP_WORDS_LOCAL.has(words[0]) &&
                    !STOP_WORDS_LOCAL.has(words[words.length - 1]) &&
                    !existingNames.has(candidate.toLowerCase()) &&
                    !discoveredNames.some(
                        (d) =>
                            d.toLowerCase() === candidate.toLowerCase() ||
                            candidate.toLowerCase().includes(d.toLowerCase())
                    )
                ) {
                    discoveredNames.push(candidate);
                }
            }

            const fallbackTemplates = [
                {
                    role: 'Key Supporting Figure / Foil / Confidante',
                    flaw: 'Shields internal vulnerability behind skepticism and emotional reserve.',
                    desire: 'Seeks genuine connection and loyalty, but fears being compromised or abandoned.',
                    cadence:
                        'A young female voice, mid-twenties, warm and smooth with a slight breathiness. Moderate pace, calm and reassuring delivery. Suitable for guided meditation or audiobook narration.'
                },
                {
                    role: 'Antagonist / Pressure Agent / Rival',
                    flaw: 'Believes that control, order, or individual victory supersedes all moral compromise.',
                    desire: 'Unyielding ambition to enforce their agenda, directly colliding with the protagonist.',
                    cadence:
                        'A middle-aged male voice, late forties, deep baritone with a gravelly, hoarse texture. Deliberate pace with pauses, serious and intense delivery. Suitable for dramatic audiobook narration or documentary voice-over.'
                },
                {
                    role: 'Mentor / Mirror Character / Unexpected Ally',
                    flaw: 'Haunted by a past failure, hesitant to commit fully until forced by crisis.',
                    desire: 'Quiet yearning for redemption and passing the torch to a worthy successor.',
                    cadence:
                        'An elderly male voice, mid-sixties, low resonant pitch with a raspy, mellow warmth. Slow, unhurried pace, gentle and soothing delivery. Suitable for historical chronicle narration or reflective audio drama.'
                }
            ];

            let templateIdx = 0;
            while (startingCast.length < 3) {
                const newId = `C${startingCast.length + 1}`;
                const foundName = discoveredNames.length > 0 ? discoveredNames.shift() : null;
                const tpl = fallbackTemplates[templateIdx % fallbackTemplates.length];
                templateIdx++;
                const charName =
                    foundName ||
                    (startingCast.length === 0
                        ? 'Central Protagonist'
                        : startingCast.length === 1
                          ? 'Secondary Foil & Confidante'
                          : 'Primary Antagonist / Rival');
                const synthesized = synthesizeQwenVoiceDesignProfile(
                    {
                        id: newId,
                        name: charName,
                        role: tpl.role,
                        core_flaw: tpl.flaw,
                        core_desire: tpl.desire
                    } as VoiceCastMember,
                    charName,
                    { genre, tone: toneAtmosphere, concept: conceptToUse, cast: startingCast } as AudioStoryLike
                );
                startingCast.push({
                    id: newId,
                    name: charName,
                    role: tpl.role,
                    core_flaw: tpl.flaw,
                    core_desire: tpl.desire,
                    vocal_cadence: synthesized || tpl.cadence,
                    voice_seed: getDeterministicVoiceSeed({ name: charName }, null)
                });
                existingNames.add(charName.toLowerCase());
            }
        }

        const conceptParsedSuccessfully = Boolean(
            genre || styleDesc || statusQuo || startingCast.length > 0
        );
        ctx.logPipelineValidation(
            'Conceptual Development Gate (Tier 0.1)',
            conceptParsedSuccessfully,
            conceptParsedSuccessfully
                ? `Conceptual foundation established: Genre: ${genre || 'General Fiction'}, Starting Cast: ${startingCast.length} characters.`
                : 'Failed to parse conceptual foundation or starting cast from output.',
            null,
            {
                tierName: 'Conceptual Development',
                type: 'structural_gate',
                actionTaken: conceptParsedSuccessfully
                    ? 'Proceeding to Tier 0.2 Character Interviews'
                    : 'Falling back to legacy defaults'
            }
        );

        if (seriesReturningCast.length > 0) {
            startingCast = mergeReturningCast(startingCast, seriesReturningCast);
            if (!validateSequelLead(startingCast, seriesReturningCast)) {
                ctx.logPipelineValidation(
                    'Series Lead Gate (Tier 0.1)',
                    false,
                    `The lead "${findSequelLead(startingCast)?.name || 'unknown'}" is new to the series. Sequels should be led by a returning character; review the cast.`,
                    null,
                    { tierName: 'Conceptual Development', type: 'structural_gate', actionTaken: 'Proceeding with the generated cast' }
                );
                ctx.showToast('Series: the new book is led by a character the series has not met before.', 'warning');
            }
        }

        const idToName: Record<string, string> = {};
        startingCast.forEach((c) => {
            if (c.id) idToName[c.id] = c.name;
        });

        let relationships: Record<string, RelationshipEntry> = {};
        const relMatrixBlock = extractTag(conceptOutput, 'relationship_matrix');
        if (relMatrixBlock) {
            const relList = extractTagList(relMatrixBlock, 'relationship');
            if (relList && relList.length > 0) {
                relList.forEach((rel) => {
                    const from = extractTag(rel, 'source_id') || extractTag(rel, 'from');
                    const to = extractTag(rel, 'target_id') || extractTag(rel, 'to');
                    const feeling = decodeXmlEntities(
                        extractTag(rel, 'dynamic_summary') || extractTag(rel, 'feeling') || 'Neutral'
                    );
                    const hiddenTension = decodeXmlEntities(extractTag(rel, 'hidden_tension') || '');
                    const trustLevel = parseInt(extractTag(rel, 'trust_level'), 10) || 5;
                    const nameFrom = idToName[from] || from || 'Unknown';
                    const nameTo = idToName[to] || to || 'Unknown';
                    const key = `${nameFrom}->${nameTo}`;
                    relationships[key] = {
                        current: feeling,
                        initial_feeling: feeling,
                        hidden_tension: hiddenTension,
                        trust_level: trustLevel,
                        history: [
                            { chapter: 'Act 1, Starting', change: `${feeling} (Initial Dynamic)` }
                        ]
                    };
                });
            }
        }

        if (Object.keys(relationships).length === 0) {
            const rawRels = extractAllTags(conceptOutput, 'relationship_matrix').map(
                extractRelationship
            );
            rawRels.forEach((rel) => {
                const nameFrom = idToName[rel.from] || rel.from;
                const nameTo = idToName[rel.to] || rel.to;
                const key = `${nameFrom}->${nameTo}`;
                relationships[key] = {
                    current: rel.feeling,
                    initial_feeling: rel.feeling,
                    hidden_tension: asString(asRecord(rel).hidden_tension),
                    trust_level: Number(asRecord(rel).trust_level || 5),
                    history: [
                        { chapter: 'Act 1, Starting', change: `${rel.feeling} (Initial Dynamic)` }
                    ]
                };
            });
        }

        if (Object.keys(relationships).length === 0 && startingCast.length >= 2) {
            for (let i = 0; i < startingCast.length; i++) {
                for (let j = 0; j < startingCast.length; j++) {
                    if (i !== j) {
                        const c1 = startingCast[i];
                        const c2 = startingCast[j];
                        const key = `${c1.name}->${c2.name}`;
                        const baselineFeeling =
                            j === 1 ? 'Complex alliance with underlying friction' : 'Guarded caution';
                        relationships[key] = {
                            current: baselineFeeling,
                            initial_feeling: baselineFeeling,
                            hidden_tension:
                                'Unspoken divergence in priorities and coping mechanisms.',
                            trust_level: j === 1 ? 5 : 3,
                            history: [
                                {
                                    chapter: 'Act 1, Starting',
                                    change: 'Initial dynamic established in status quo'
                                }
                            ]
                        };
                    }
                }
            }
        }

        startingCast = startingCast.map((c) => ({ ...c, is_initial_cast: true }));
        const uploadedLoreChunks =
            loreTextToUse && loreTextToUse.trim().length > 0
                ? indexedUploadedChunks.length > 0
                    ? indexedUploadedChunks
                    : buildUploadLoreChunks(loreTextToUse)
                : [];

        const slopConfig = ctx.getSlopConfig();
        let auditedStatusQuo = statusQuo || '';
        if (slopConfig?.enableSlopAudit !== false && slopConfig?.enableUpstreamNameAudit !== false) {
            try {
                const tier01CtxStory: PipelineStory = {
                    concept: conceptToUse || '',
                    author_note: authorNoteToUse || '',
                    world_primer: primer || null,
                    lore: uploadedLoreChunks
                };
                const placeCandidates = extractPlacesFn(auditedStatusQuo, startingCast);
                const tier01Audit = auditFn({
                    characters: startingCast,
                    places: placeCandidates,
                    existingCast: [],
                    slopConfig,
                    story: tier01CtxStory as Partial<Story>
                });
                if (!tier01Audit.valid && tier01Audit.violations.length > 0) {
                    const { renameMap } = await repairBannedEntitiesWithAI(ctx, {
                        violations: tier01Audit.violations,
                        existingNames: startingCast.map((c) => c.name),
                        storyContext: `${conceptToUse || ''}\n${auditedStatusQuo}`,
                        story: tier01CtxStory
                    });
                    if (Object.keys(renameMap).length > 0) {
                        startingCast = startingCast.map((c) => ({
                            ...c,
                            name: renameMap[c.name] || replaceFn(c.name, renameMap),
                            core_flaw: replaceFn(c.core_flaw || '', renameMap),
                            core_desire: replaceFn(c.core_desire || '', renameMap),
                            vocal_cadence: replaceFn(asString(c.vocal_cadence), renameMap)
                        }));
                        auditedStatusQuo = replaceFn(auditedStatusQuo, renameMap);
                        const nextRels: Record<string, RelationshipEntry> = {};
                        Object.keys(relationships).forEach((rk) => {
                            const parts = rk.split('->');
                            const fromName =
                                parts.length === 2
                                    ? renameMap[parts[0]] || replaceFn(parts[0], renameMap)
                                    : rk;
                            const toName =
                                parts.length === 2
                                    ? renameMap[parts[1]] || replaceFn(parts[1], renameMap)
                                    : '';
                            const newKey =
                                parts.length === 2 ? `${fromName}->${toName}` : replaceFn(rk, renameMap);
                            const relVal = relationships[rk];
                            nextRels[newKey] = {
                                ...relVal,
                                current: replaceFn(relVal.current || '', renameMap),
                                initial_feeling: replaceFn(relVal.initial_feeling || '', renameMap),
                                hidden_tension: replaceFn(relVal.hidden_tension || '', renameMap),
                                history: Array.isArray(relVal.history)
                                    ? relVal.history.map((h) => ({
                                          ...h,
                                          change: replaceFn(h.change || '', renameMap)
                                      }))
                                    : relVal.history
                            };
                        });
                        relationships = nextRels;
                        ctx.showToast(
                            `Upstream Name Audit renamed Tier 0.1 entities: ${Object.keys(renameMap)
                                .map((k) => `${k} → ${renameMap[k]}`)
                                .join(', ')}`,
                            'info'
                        );
                    }
                }
            } catch (tier01AuditErr) {
                console.warn('[initStory Tier 0.1] Upstream name audit warning:', tier01AuditErr);
            }
        }

        const parsedGenreObj = parseStructuredGenre(genre);
        const parsedToneObj = parseStructuredTone(toneAtmosphere);
        const parsedStyleObj = parseStructuredStyle(styleDesc);

        const initialCharacterStates: Record<string, Record<string, unknown>> = {};
        startingCast.forEach((c) => {
            initialCharacterStates[c.name] = {
                name: c.name,
                role: c.role || '',
                physical_state: 'Baseline active condition',
                emotional_state: c.core_flaw || 'Baseline tension',
                location: 'Starting status quo',
                goals: c.core_desire || '',
                unresolved_tension: c.core_flaw || '',
                held_items: [],
                vocal_cadence: c.vocal_cadence || '',
                relationships_status: {}
            };
        });

        const bookTypesMap = LENGTH_CONTROL.BOOK_TYPES as Record<
            string,
            { words?: number } | undefined
        >;
        const resolvedTargetWords =
            bookTypeToUse === 'custom'
                ? parseInt(String(customWordsToUse || ''), 10) || 80000
                : bookTypesMap[bookTypeToUse]?.words || 80000;
        const resolvedBookType = bookTypeToUse || 'popular';
        const baselineRanges = computePacingRanges(resolvedTargetWords, 0);
        const baselineSeqRanges = asRecord(baselineRanges.scenes_per_sequence);
        const parsedStyleRec = asRecord(parsedStyleObj);

        const tier01Style = {
            genre: parsedGenreObj.primaryEngine || (genre ? stripXmlTags(genre) : 'Fiction'),
            genre_raw: genre,
            primary_engine: parsedGenreObj.primaryEngine,
            tropes_played_straight: parsedGenreObj.playedStraight,
            tropes_subverted: parsedGenreObj.ruthlesslySubverted,
            boundaries: parsedGenreObj.boundaries,
            mood:
                parsedToneObj.authorialTriangulation ||
                (toneAtmosphere ? stripXmlTags(toneAtmosphere) : 'Dramatic'),
            tone_raw: toneAtmosphere,
            authorial_triangulation: parsedToneObj.authorialTriangulation,
            sensory_directive: parsedToneObj.sensoryDirective,
            writing_guide:
                asString(parsedStyleRec.thematicLexicon) ||
                (styleDesc ? stripXmlTags(styleDesc) : 'Standard'),
            style_raw: styleDesc,
            focalizer_bias: parsedStyleObj.focalizerBias,
            thematic_lexicon: parsedStyleRec.thematicLexicon,
            syntactic_rhythm: parsedStyleObj.syntacticRhythm,
            anti_patterns: parsedStyleObj.antiPatterns
        };

        const tier01Lore = [
            {
                topic: 'Status Quo Setting',
                detail: auditedStatusQuo,
                valid_from_act: 1,
                valid_from_scene: 1
            },
            ...uploadedLoreChunks
        ];

        // A sequel starts from where the last book left its returning characters.
        const seriesCarryover = isSequelStory(baselineStory)
            ? asRecord(asRecord(baselineStory.series).carryover)
            : null;
        const startingCharacterStates = seriesCarryover
            ? mergeCarriedCharacterStates(
                  initialCharacterStates,
                  seriesCarryover.character_states as Record<string, Record<string, unknown>> | undefined
              )
            : initialCharacterStates;
        const startingRelationships = seriesCarryover
            ? mergeCarriedRelationships(
                  relationships as unknown as Record<string, Record<string, unknown>>,
                  seriesCarryover.relationships as Record<string, Record<string, unknown>> | undefined,
                  startingCast.map((c) => c.name)
              )
            : relationships;
        const carriedSeriesLore = seriesCarryover ? asArray<Record<string, unknown>>(baselineStory.lore) : [];

        const activeStoryId = newStoryId;
        let initialStoryState =
            (await ctx.updateStoryById(activeStoryId, (prev) => ({
                ...prev,
                id: activeStoryId,
                title: prev.title || titleToUse || 'My New Story',
                world_primer: primer || prev.world_primer || null,
                writing_mode: prev.writing_mode || writingModeToUse || 'novel',
                concept: prev.concept || conceptToUse,
                heart_of_the_dilemma: heartOfTheDilemma,
                author_note: prev.author_note !== undefined ? prev.author_note : authorNoteToUse,
                book_type: prev.book_type || resolvedBookType,
                target_word_count: prev.target_word_count || resolvedTargetWords,
                status_quo: auditedStatusQuo || '',
                narrator_vocal_cadence:
                    seriesCarryover && asString(prev.narrator_vocal_cadence).trim()
                        ? prev.narrator_vocal_cadence
                        : narratorCadence,
                narrator_voice_seed: prev.narrator_voice_seed || 718281,
                synthesized_authorial_persona: authorialPersona,
                genre_pacing_and_dialogue_rules: genreRules,
                strict_anti_patterns: strictAntiPatterns,
                character_states: startingCharacterStates,
                style: tier01Style,
                cast: startingCast,
                lore: seriesCarryover ? [...tier01Lore, ...carriedSeriesLore] : tier01Lore,
                relationships: startingRelationships,
                generation_ranges: prev.generation_ranges || {
                    scenes_per_sequence: {
                        min: baselineSeqRanges.min,
                        max: baselineSeqRanges.max,
                        justification: baselineSeqRanges.justification
                    }
                }
            }))) || baselineStory;

        // TIER 0.2: CHARACTER DEVELOPMENT INTERVIEWS
        ctx.setLoadingStep(
            `Character Development (Tier 0.2: 0/${startingCast.length} complete)...`
        );
        const proseConfig = ctx.getEffectiveModelConfig('prose');
        const isLocalProseEndpoint = isLocalProvider(proseConfig?.provider);

        let completedInterviews = 0;
        const executeInterviewForChar = async (
            char: CastMember & Record<string, unknown>,
            i: number,
            total: number
        ) => {
            console.log(
                `[initStory] Dispatching character interview [${i + 1}/${total}]: ${char.name}`
            );
            ctx.setActivePipelineWork?.({
                mode: 'novel',
                phase: 2,
                elementType: 'character',
                characterName: char.name,
                title: char.name,
                itemIndex: completedInterviews + 1,
                itemTotal: startingCast.length,
                subStep: 'Deep Character Interview (Tier 0.2)',
                startedAt: Date.now()
            });
            ctx.setLoadingStep(
                `Interviewing starting cast: ${char.name} (${completedInterviews}/${total} done)...`
            );

            const charLoreDocs = await ctx.retrieveContext(
                `Character: ${char.name} (${char.role})`,
                0.6,
                null,
                indexedUploadedChunks as unknown as LoreItem[]
            );
            const charLoreBlocks = formatLoreForPrompt(primer, charLoreDocs);

            const interviewPrompt = `<user_concept>${conceptToUse}</user_concept>
${heartOfTheDilemma ? `<heart_of_the_dilemma>\n${heartOfTheDilemma}\n</heart_of_the_dilemma>\n` : ''}${charLoreBlocks ? `${charLoreBlocks}\n` : ''}<status_quo>${statusQuo}</status_quo>
<cast_list>
${startingCast.map((c) => `- ${c.name} (${c.role}${c.corner_role ? ` [${asString(c.corner_role)}]` : ''})`).join('\n')}
</cast_list>
<character_briefs>
<char_id>${asString(char.id)}</char_id>
<char_name>${char.name}</char_name>
<brief_role>${char.role}</brief_role>
${char.corner_role ? `<corner_role>${asString(char.corner_role)}</corner_role>\n` : ''}<core_flaw>${asString(char.core_flaw)}</core_flaw>
${char.why_it_makes_sense ? `<why_it_makes_sense>${asString(char.why_it_makes_sense)}</why_it_makes_sense>\n` : ''}${char.what_it_costs_them ? `<what_it_costs_them>${asString(char.what_it_costs_them)}</what_it_costs_them>\n` : ''}${char.way_of_living ? `<way_of_living>${asString(char.way_of_living)}</way_of_living>\n` : ''}${char.why_it_is_appealing ? `<why_it_is_appealing>${asString(char.why_it_is_appealing)}</why_it_is_appealing>\n` : ''}${char.shared_outlook ? `<shared_outlook>${asString(char.shared_outlook)}</shared_outlook>\n` : ''}${char.the_hidden_trap ? `<the_hidden_trap>${asString(char.the_hidden_trap)}</the_hidden_trap>\n` : ''}${char.how_they_ended_up ? `<how_they_ended_up>${asString(char.how_they_ended_up)}</how_they_ended_up>\n` : ''}${char.the_wake_up_call ? `<the_wake_up_call>${asString(char.the_wake_up_call)}</the_wake_up_call>\n` : ''}<core_desire>${asString(char.core_desire)}</core_desire>
<vocal_cadence>${asString(char.vocal_cadence)}</vocal_cadence>
</character_briefs>
${buildGenreToneBlocks({ genre_raw: genre, tone_raw: toneAtmosphere })}

${formatReturningInterviewBlock(char, asNumber(asRecord(baselineStory.series).book_number, 1))}<instruction>Conduct the dramatized character interview for ${char.name}. Ground the character in the established world rules, factions, culture, and lore provided in <world_primer> and <relevant_lore>. Prioritize established lore names, factions, and settings over inventing new ones. Using their unique voice, write out their full responses to every interview question in present tense prose format.</instruction>

<output_format_description>
FORMATTING DIRECTIVE: Return your response strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

Output Schema:
<response>
  <character_registry>
    <id>C1</id>
    <name>Character Name</name>
    <first_person_interview>The complete dramatized interview: present tense prose responses to all interview questions, written in the character's unmistakable voice with behavioral subtext and self-rationalization throughout.</first_person_interview>
    <vocal_cadence>Bespoke 7-Component Voice Design profile specific to this character (Gender: male/female/neutral + Age: child/teenager/young adult/middle-aged/elderly with specific age or sub-range + Pitch: high/medium/low/high-pitched with resonance/deep baritone + Pace: fast/moderate/slow/deliberate with pauses/rapid-fire + Emotion: cheerful/calm/serious/gentle/lively/soothing/intense + Characteristics: magnetic/crisp/hoarse/raspy/breathy/mellow/sweet/rich/gravelly + Use case: narration/news broadcast/ad voice-over/audiobook). 15-40 words in 2-3 natural sentences (e.g., "A young female voice, mid-twenties, warm and smooth with a slight breathiness. Moderate pace, calm and reassuring delivery. Suitable for guided meditation or audiobook narration."). Must reflect this specific character and differ from the rest of the cast; NEVER include character or celebrity names.</vocal_cadence>
    <core_yearning>A rich, poetic 1-2 sentence distillation of what truly drives this character: blending their outward striving with their tender internal longing and the emotional stakes that make them human.</core_yearning>
  </character_registry>
</response>
</output_format_description>

BEGIN DEVELOPING CHARACTER PROFILES`;
            const interviewOutput = await ctx.callAI(
                interviewPrompt,
                PROMPTS.characterDevelopment,
                false,
                `Character Developer (${char.name})`,
                'prose'
            );
            let interviewText =
                decodeXmlEntities(extractTag(interviewOutput, 'first_person_interview') || interviewOutput);

            if (
                interviewText &&
                slopConfig?.enableSlopAudit !== false &&
                slopConfig?.enableUpstreamNameAudit !== false
            ) {
                try {
                    const intCandidates = extractPlacesFn(interviewText, startingCast);
                    const singlePropChars = intCandidates
                        .filter((p) => p.indexOf(' ') === -1)
                        .map((p) => ({ name: p }) as CastMember);
                    const intAudit = auditFn({
                        characters: singlePropChars,
                        places: intCandidates,
                        existingCast: startingCast,
                        slopConfig,
                        story: initialStoryState as Partial<Story>
                    });
                    if (!intAudit.valid && intAudit.violations.length > 0) {
                        const { renameMap } = await repairBannedEntitiesWithAI(ctx, {
                            violations: intAudit.violations,
                            existingNames: startingCast.map((c) => c.name).concat(intCandidates),
                            storyContext: `${conceptToUse || ''}\nCharacter: ${char.name}`,
                            story: initialStoryState
                        });
                        if (Object.keys(renameMap).length > 0) {
                            interviewText = replaceFn(interviewText, renameMap);
                        }
                    }
                } catch (intAuditErr) {
                    console.warn(
                        `[initStory Tier 0.2] Interview entity audit warning for ${char.name}:`,
                        intAuditErr
                    );
                }
            }

            completedInterviews++;
            ctx.setLoadingStep(
                `Interviewing starting cast (${completedInterviews}/${total} done)...`
            );

            char.voice_sample = `${interviewText.split('.')[0].substring(0, 100)}...`;
            const parsedYearning = extractTag(interviewOutput, 'core_yearning');
            if (parsedYearning && parsedYearning.trim()) {
                char.core_desire = decodeXmlEntities(parsedYearning.trim());
            }
            char.details = {
                history: char.core_flaw,
                story_events: 'Identified in conceptual worldbuilding',
                goals: char.core_desire,
                deep_profile: interviewText
            };
            const extractedTier02Cadence = cleanCharacterNameFromVoiceProfile(
                decodeXmlEntities(extractTag(interviewOutput, 'vocal_cadence') || ''),
                [char.name]
            );
            if (char.returning_from_book && asString(char.vocal_cadence).trim()) {
                // Returning characters keep the voice the series already gave them.
            } else if (isValidQwenVoiceProfile(extractedTier02Cadence)) {
                char.vocal_cadence = extractedTier02Cadence;
            } else if (!isValidQwenVoiceProfile(asString(char.vocal_cadence))) {
                char.vocal_cadence = synthesizeQwenVoiceDesignProfile(
                    char as VoiceCastMember,
                    char.name,
                    { genre, tone: toneAtmosphere, concept: conceptToUse, cast: startingCast } as AudioStoryLike
                );
            } else {
                char.vocal_cadence = cleanCharacterNameFromVoiceProfile(
                    asString(char.vocal_cadence),
                    [char.name]
                );
            }
            if (typeof char.voice_seed !== 'number' || !Number.isFinite(char.voice_seed)) {
                char.voice_seed = getDeterministicVoiceSeed(char, null);
            }
            if (!char.user_edited_reference_text && interviewText) {
                const personalizedRef = extractPersonalizedReferenceTextFromInterview(interviewText);
                if (personalizedRef) {
                    char.reference_text = personalizedRef;
                }
            }

            await ctx.updateStoryById(activeStoryId, (prev) => {
                const updatedCast = asArray<CastMember & Record<string, unknown>>(prev.cast).map(
                    (c) => (c.id === char.id || c.name === char.name ? { ...c, ...char } : c)
                );
                const updatedStates = { ...asRecord(prev.character_states) };
                if (updatedStates[char.name]) {
                    const prevCharState = asRecord(updatedStates[char.name]);
                    updatedStates[char.name] = {
                        ...prevCharState,
                        goals: char.core_desire || prevCharState.goals,
                        vocal_cadence: char.vocal_cadence || prevCharState.vocal_cadence
                    };
                }
                return {
                    ...prev,
                    cast: updatedCast,
                    character_states: updatedStates
                };
            });

            return char;
        };

        if (isLocalProseEndpoint) {
            for (let i = 0; i < startingCast.length; i++) {
                await executeInterviewForChar(startingCast[i], i, startingCast.length);
            }
        } else {
            const interviewPromises = startingCast.map(async (char, i) => {
                const startDelayMs = i * 2000;
                if (startDelayMs > 0) {
                    ctx.logPipelineDelay?.(
                        `Character Developer (${char.name})`,
                        startDelayMs,
                        'Staggered interview rate-limit spacing'
                    );
                    await new Promise((resolve) => setTimeout(resolve, startDelayMs));
                }
                return await executeInterviewForChar(char, i, startingCast.length);
            });
            await Promise.all(interviewPromises);
        }

        ctx.logPipelineValidation(
            'Character Development Gate (Tier 0.2)',
            startingCast.every((c) => Boolean(c.voice_sample)),
            `Completed deep first-person voice interviews for all ${startingCast.length} cast members.`,
            null,
            {
                tierName: 'Character Developer',
                type: 'structural_gate',
                actionTaken: 'Proceeding to Tier 1.1 Story Arc Planner'
            }
        );

        initialStoryState =
            (await ctx.updateStoryById(activeStoryId, (prev) => ({
                ...prev,
                cast: startingCast
            }))) || initialStoryState;

        // SERIES ARCHITECT (series only): plans this book's place in the series before the arc.
        if (isSeriesStory(initialStoryState)) {
            initialStoryState = await runSeriesArchitect(ctx, activeStoryId, initialStoryState);
        }

        // TIER 1.1: STORY ARC PLANNER
        ctx.setActivePipelineWork?.({
            mode: 'novel',
            phase: 1,
            elementType: 'arc',
            title: 'Story Arc & Thematic Thesis',
            subStep: 'Story Arc Planner (Tier 1.1)',
            startedAt: Date.now()
        });
        ctx.setLoadingStep('Story Arc Planner (Tier 1.1)...');

        let storyArcGenerated = false;
        try {
            const pillarsBlock = `${authorialPersona ? `<synthesized_authorial_persona>\n${authorialPersona}\n</synthesized_authorial_persona>\n\n` : ''}${genreRules ? `<genre_pacing_and_dialogue_rules>\n${genreRules}\n</genre_pacing_and_dialogue_rules>\n\n` : ''}${strictAntiPatterns ? `<strict_anti_patterns>\n${strictAntiPatterns}\n</strict_anti_patterns>\n\n` : ''}`;

            const arcLoreDocs = await ctx.retrieveContext(
                `Story Arc Conflict Themes: ${conceptToUse}`,
                0.6,
                null,
                indexedUploadedChunks as unknown as LoreItem[]
            );
            const arcLoreBlocks = formatLoreForPrompt(primer, arcLoreDocs);

            const initStyle = asRecord(initialStoryState.style);
            const initCastList = startingCast as Array<CastMember & Record<string, unknown>>;

            const arcResult = await runAgentWithEscalation(ctx, {
                tierName: 'Story Arc Agent',
                isAutopilot,
                context: initialStoryState,
                generatorPromptFn: () =>
                    buildStoryArcGeneratorPrompt({
                        concept: conceptToUse,
                        heartOfTheDilemma,
                        arcLoreBlocks,
                        pillarsBlock,
                        style: initStyle,
                        statusQuo,
                        castList: initCastList,
                        authorNoteStory: initialStoryState as Partial<Story> & Record<string, unknown>
                    }),
                systemPrompt: PROMPTS.storyArc,
                reviewerSystemPrompt: PROMPTS.arcReview,
                reviewerPromptFn: (genOutput) =>
                    buildStoryArcReviewerPrompt({
                        concept: conceptToUse,
                        heartOfTheDilemma,
                        arcLoreBlocks,
                        pillarsBlock,
                        style: initStyle,
                        statusQuo,
                        castList: initCastList,
                        genOutput
                    }),
                parserFn: (text) => parseStoryArcXml(text) as unknown as Record<string, unknown>,
                modelSize: 'dev',
                spawningContext: 'Story Arc planning'
            });

            const parsedArc = asRecord(arcResult.parsedData);
            const parsedVault = asArray(parsedArc.secret_vault);
            const parsedThreads = asArray(parsedArc.threads);
            const arcPatch: PipelineStory = {
                starting_value_state: asString(parsedArc.starting_value_state),
                ending_value_state: asString(parsedArc.ending_value_state),
                core_thematic_argument: asString(parsedArc.core_thematic_argument),
                major_surprises_and_twists: asString(parsedArc.major_surprises_and_twists),
                character_arcs: asArray(parsedArc.character_arcs),
                inciting_incident: asString(parsedArc.inciting_incident),
                ...(parsedVault.length > 0 ? { secret_vault: parsedVault } : {}),
                ...(parsedThreads.length > 0 ? { threads: parsedThreads } : {})
            };
            initialStoryState =
                (await ctx.updateStoryById(activeStoryId, (prev) => ({
                    ...prev,
                    ...arcPatch,
                    ...(isSeriesStory(prev) && arcPatch.secret_vault
                        ? { secret_vault: keepSeriesVaultEntries(prev.secret_vault, arcPatch.secret_vault) }
                        : {})
                }))) || { ...initialStoryState, ...arcPatch };
            if (isSeriesStory(initialStoryState)) {
                // The arc step rewrites threads and the vault; put the series layer back on top.
                initialStoryState =
                    (await ctx.updateStoryById(activeStoryId, (prev) => applySeriesAfterArc(prev))) ||
                    applySeriesAfterArc(initialStoryState);
            }
            storyArcGenerated = true;
        } catch (arcErr) {
            console.warn(
                '[initStory] Story Arc Agent failed, but Story Bible was preserved:',
                arcErr
            );
            ctx.showToast(
                "Story Bible initialized! Story Arc failed to generate — click 'Run Story Arc Agent' in Overview to generate arcs.",
                'warning'
            );
        }

        const statusQuoItem: Partial<LoreItem> & Record<string, unknown> = {
            topic: 'Status Quo Setting',
            detail: statusQuo,
            valid_from_act: 1,
            valid_from_scene: 1
        };
        const currentStory = ctx.getStory();
        const isActiveStoryForRag = !currentStory?.id || currentStory.id === activeStoryId;
        const processedStatusQuo = isActiveStoryForRag
            ? await ingestLore(ctx, statusQuoItem)
            : statusQuoItem;
        const finalLore = [processedStatusQuo || statusQuoItem, ...uploadedLoreChunks, ...carriedSeriesLore];
        const embService = ctx.getEmbeddingService();
        if (isActiveStoryForRag && embService?.isConfigured()) {
            safeLocalStorageSet(
                STORAGE_KEYS.ragFingerprint,
                computeLoreFingerprint(
                    activeStoryId,
                    finalLore as LoreItem[],
                    embService.getProviderLabel()
                )
            );
        }

        const finalStory =
            (await ctx.updateStoryById(activeStoryId, (prev) => ({
                ...prev,
                lore: finalLore,
                world_primer: primer || prev.world_primer || null,
                cast: asArray(prev.cast).length > 0 ? prev.cast : startingCast,
                relationships:
                    Object.keys(asRecord(prev.relationships)).length > 0
                        ? prev.relationships
                        : relationships,
                continuity_ledger: Array.isArray(prev.continuity_ledger)
                    ? prev.continuity_ledger
                    : []
            }))) || initialStoryState;

        if (finalStory?.world_primer && (!currentStory?.id || currentStory.id === activeStoryId)) {
            ctx.setWorldPrimer(asString(finalStory.world_primer));
        }
        ctx.refreshLibrary?.().catch(() => {});
        if (storyArcGenerated) {
            ctx.showToast(
                "Story Bible & Arcs initialized! Click 'Structure Acts & Sequences' to develop narrative structure."
            );
        } else {
            ctx.showToast(
                "Story Bible initialized! Click 'Run Story Arc Agent' in Overview to generate story arcs.",
                'info'
            );
        }
        return finalStory;
    } catch (e) {
        const msg = extractErrorMessage(e);
        console.error('[initStory] FAILURE: Initialization failed with error:', e);
        if (!isAutopilot) {
            if (ctx.notifyAlert) ctx.notifyAlert(`Initialization failed: ${msg}`);
            else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
                window.alert(`Initialization failed: ${msg}`);
            }
        } else {
            ctx.showToast(`Initialization failed: ${msg}`, 'error');
        }
        return undefined;
    } finally {
        if (initStoryRef && initStoryRef.current === newStoryId) {
            initStoryRef.current = null;
            ctx.setInitializingStoryId?.(null);
        }
        if (!isAutopilot) {
            ctx.setLoading(false);
            ctx.setLoadingStep('');
        }
    }
}
