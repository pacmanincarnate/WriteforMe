/**
 * @module config/pipelineSteps
 * Canonical 20-step pipeline metadata, inspector specs, and log-to-step resolver.
 */

export interface PipelineStepMeta {
    id: number;
    tier: string;
    title: string;
    iconName: string;
    iconColor: string;
    badge: string;
    inputs: string;
    gate: string;
}

export interface PipelineStepSpecEntry {
    title: string;
    function: string;
    model: string;
    inputs: string;
    output: string;
    gate: string;
    retries: string;
    constraints: string;
}

export interface ResolvedPipelineStepInfo {
    stepId: number;
    stepTier: string;
    stepTitle: string;
}

export const PIPELINE_STEPS_META: readonly PipelineStepMeta[] = [
    { id: 1, tier: 'Tier 0.1', title: 'Conceptual Development Agent', iconName: 'sparkles', iconColor: 'text-gold-ink', badge: 'dev-model', inputs: 'User raw outline text, style/genre guides, tone parameters, lore context.', gate: 'YAML/XML structure parsed correctly' },
    { id: 2, tier: 'Tier 0.2', title: 'Character Developer (Interviews)', iconName: 'users', iconColor: 'text-plum-600', badge: 'prose-model', inputs: 'World bible context, active character briefs (name, role, flaw, desire).', gate: 'Dossiers generated for cast briefs' },
    { id: 3, tier: 'Tier 1.1', title: 'Story Arc Agent', iconName: 'git-branch', iconColor: 'text-gold-ink', badge: 'dev-model', inputs: 'World bible details, style guides, cast voice files, flaws/desires.', gate: 'Valid YAML/XML story arc structure' },
    { id: 4, tier: 'Tier 1.2', title: 'Story Arc Reviewer', iconName: 'shield-check', iconColor: 'text-ember-600', badge: 'review-model', inputs: 'Raw concept outlines, world bible, generated Story Arc plan.', gate: "Reviewer status == 'PASS'" },

    { id: 5, tier: 'Tier 2.1', title: 'Act Planner (Act Agent)', iconName: 'layers', iconColor: 'text-plum-600', badge: 'dev-model', inputs: 'Core narrative concept, theme milestones, character list, twists.', gate: '>= 3 Acts planned with descriptions' },
    { id: 6, tier: 'Tier 2.2', title: 'Act Reviewer', iconName: 'check-circle-2', iconColor: 'text-ember-600', badge: 'review-model', inputs: 'Generated Act outlines array, major twists, inciting incidents.', gate: "Reviewer status == 'PASS'" },
    { id: 7, tier: 'RAG Archiving', title: 'World Lore Archivist', iconName: 'globe', iconColor: 'text-sage-600', badge: 'prog', inputs: 'World bible text, character dossiers, lore notes.', gate: 'Vector store indexing complete' },
    { id: 8, tier: 'Tier 2.3', title: 'Pacing Architect', iconName: 'sliders', iconColor: 'text-gold-ink', badge: 'dev-model', inputs: 'Act outline mandates and narrative density targets.', gate: 'Pacing map ranges established' },

    { id: 9, tier: 'Tier 3.1', title: 'Sequence Planner (Sequence Agent)', iconName: 'book', iconColor: 'text-gold-ink', badge: 'dev-model', inputs: 'Detailed Act mandates, cast dossiers, story guidelines.', gate: '8 Sequences generated (2-4-2 distribution)' },
    { id: 10, tier: 'Tier 3.2', title: 'Sequence Reviewer', iconName: 'check-circle-2', iconColor: 'text-ember-600', badge: 'review-model', inputs: 'Newly generated sequence plans list, parent Act objectives.', gate: "Reviewer status == 'PASS'" },
    { id: 11, tier: 'Tier 4.1', title: 'Scene Roster Agent', iconName: 'film', iconColor: 'text-ink-700', badge: 'dev-model', inputs: 'Sequence outline schema, cast dossiers, world bible rules.', gate: '>= 4 Scenes generated per Sequence' },
    { id: 12, tier: 'Tier 4.2', title: 'Scene Roster Reviewer', iconName: 'check-circle-2', iconColor: 'text-ember-600', badge: 'review-model', inputs: 'Generated lean scene roster, parent sequence objectives.', gate: "Reviewer status == 'PASS'" },
    { id: 13, tier: 'Tier 4.3', title: 'Scene Expander Agent', iconName: 'list-plus', iconColor: 'text-gold-ink', badge: 'dev-model', inputs: 'Lean scene row, adjacent scene context.', gate: 'Rich description blueprint generated' },
    { id: 14, tier: 'Tier 4.4', title: 'Scene Expander Reviewer', iconName: 'shield-check', iconColor: 'text-ember-600', badge: 'review-model', inputs: 'List of expanded scenes.', gate: 'Continuity validated' },

    { id: 17, tier: 'RAG Preprocess', title: 'Query Expansion & RAG Retriever', iconName: 'search', iconColor: 'text-ink-700', badge: 'dev-model', inputs: 'Scene blueprint text, active cast list, scene location.', gate: 'RAG context facts retrieved' },
    { id: 18, tier: 'Tier 5.1', title: 'Writing Agent (Prose Generator)', iconName: 'feather', iconColor: 'text-gold-ink', badge: 'prose-model', inputs: 'Scene blueprint, cast cards, RAG lore details, style guides.', gate: 'Passes prose length guidelines' },
    { id: 19, tier: 'Validation', title: 'Continuity Reviewer & Surgical Editor', iconName: 'shield-check', iconColor: 'text-ember-600', badge: 'review-model', inputs: 'Scene blueprint, newly generated full scene prose draft.', gate: "Reviewer status == 'PASS' or patch applies" },
    { id: 20, tier: 'Post-Process', title: 'Archivist (End of Scene)', iconName: 'save', iconColor: 'text-sage-600', badge: 'review-model', inputs: 'Finalized scene prose, current cast profiles.', gate: 'JSON registry parsed & state updated' },
    { id: 21, tier: 'Tier 6.0', title: 'Autonomous Editorial Harness (CI/CD)', iconName: 'scale', iconColor: 'text-gold-ink', badge: 'review+prose', inputs: 'Full drafted manuscript XML, Voice DNA, NSG, Layer 0 Blind Reader, 11-Tool Dossiers.', gate: 'Adversarial Tribunal + 4-Gate Literary CI/CD PASS' },
    { id: 22, tier: 'Tier 7.0', title: 'Audio Drama Multi-Voice Production', iconName: 'volume-2', iconColor: 'text-plum-600', badge: 'audio-model', inputs: 'Drafted prose scenes/sequences, character voice registry, Kokoro/Audio.cpp/Gemini TTS configs.', gate: 'Multi-voice chunk synthesis & studio mastering DSP complete' }
];

export const PIPELINE_STEP_SPEC: Record<number, PipelineStepSpecEntry> = {
    1: { title: 'Conceptual Development Agent', function: 'initStory() - Tier 0.1', model: 'Development Model Target', inputs: 'User raw outline text, style/genre guides, tone parameters, lore context.', output: 'XML tags detailing core genre class, style guidelines, atmosphere guidelines, world bible status quo, and initial character briefs.', gate: 'XML tags parse correctly, returning string blocks for genre, style, and world bible.', retries: 'Direct UI correction loops. No automated cascading deletions above this stage.', constraints: 'Cultivate core concept to logical extremes. Define status quo, inciting incident, and core thematic arguments.' },
    2: { title: 'Character Developer (Interviews)', function: 'initStory() - Tier 0.2', model: 'Prose Model Target', inputs: 'World bible context, active character brief (name, role, flaw, desire), and narrative tone guidelines.', output: 'Dramatized character interview responses, voice samples, and psychological dossiers.', gate: 'A text interview block is successfully generated for every single character profile brief in the cast list.', retries: 'Retries profile generation on failure. Aborts initialization if permanent API error occurs.', constraints: "Must produce dramatized present tense prose responses to all 12 structured interview questions in the character's unique voice." },
    3: { title: 'Story Arc Agent', function: 'initStory() - Tier 1.1', model: 'Development Model Target', inputs: 'World bible, genre classification, style parameters, tone guidelines, character casts with flaws/desires.', output: 'XML schema detailing starting and ending value states (inciting incident), character arcs, twists, and narrative threads.', gate: 'Story Arc details parsed as valid XML structure. Maps character arcs and narrative threads.', retries: 'Retries the Story Arc planner up to 3 times on reviewer FAIL status.', constraints: 'Specify concrete Lie, Truth, and Catalyst for character arcs.' },
    4: { title: 'Story Arc Reviewer', function: 'runAgentWithEscalation() - Tier 1.2', model: 'Review Model Target', inputs: 'Story concept, world bible, generated Story Arc plan.', output: 'XML status report: PASS or FAIL along with critiques/reasons.', gate: "Reviewer status == 'PASS'", retries: 'Fails trigger a retry of Step 3 (Story Arc Agent), feeding the critique reasons as prompts.', constraints: 'Strict audit of thematic arguments, thread tracking, and logical reversals.' },
    5: { title: 'Act Planner (Act Agent)', function: 'runAgentWithEscalation() - Tier 2.1', model: 'Development Model Target', inputs: 'Story concept, theme milestones, character profiles list, and structural boundaries.', output: 'XML list representing Acts: number, title, description, milestones, and knots.', gate: 'Passes Programmatic Validation: at least 3 acts planned, and every act description has a length >= 50 characters.', retries: 'Up to 3 attempts. Downstream failure in Sequence Agent plans triggers a rollback to this step.', constraints: 'Map out exact intersections (knots) where multiple threads collide.' },
    6: { title: 'Act Reviewer', function: 'runAgentWithEscalation() - Tier 2.2', model: 'Review Model Target', inputs: 'Generated Act outlines, twists and surprises, inciting incidents.', output: 'XML listing critique analysis, status (PASS or FAIL), and list of deviation reasons.', gate: "Reviewer status == 'PASS'", retries: 'FAIL status triggers retry of Step 5 (Act Planner).', constraints: 'Validate act developments are earned and logical.' },
    7: { title: 'World Lore Archivist', function: 'initStory() - Lore RAG Archiving', model: 'Vector DB & Graph Manager', inputs: 'World bible text, character dossiers, lore notes.', output: 'Indexed vector embeddings & entity graph nodes.', gate: 'Vector store indexing complete.', retries: 'Logs warning on indexing error and continues with raw text fallback.', constraints: 'Ensure canon facts are indexed without duplication.' },
    8: { title: 'Pacing Architect', function: 'initStory() - Tier 2.3', model: 'Development Model Target', inputs: 'Act outline mandates and narrative density targets.', output: 'XML output defining narrative density ranges (scenes per sequence, beats per scene).', gate: 'Pacing ranges defined and stored in story state.', retries: 'Uses default density ranges if call fails.', constraints: 'Balance fast kinetic pacing with legato-staccato rhythm.' },
    9: { title: 'Sequence Planner (Sequence Agent)', function: 'generateSequences() - Tier 3.1', model: 'Development Model Target', inputs: 'Detailed Act mandates, cast dossiers, story guidelines.', output: 'XML schema detailing 8 Frank Daniel sequences: number, parent_act, title, sequence_function, dramatic_question, and ending_hook.', gate: 'Passes Programmatic Validation: 8 sequences generated in 2-4-2 distribution.', retries: 'Up to 3 attempts. 3 failures trigger cascading rollback to Act Agent (Step 5).', constraints: 'Each sequence must define its dramatic question and sequence climax.' },
    10: { title: 'Sequence Reviewer', function: 'generateSequences() - Tier 3.2', model: 'Review Model Target', inputs: 'Newly generated sequence plans list, parent Act objectives.', output: 'XML outlining critique analysis, status (PASS or FAIL), and deviation reasons.', gate: "Reviewer status == 'PASS'", retries: 'FAIL triggers retry of Step 9 up to 3 times, then rolls back to Step 5.', constraints: 'Verify Frank Daniel model alignment and dramatic question sharpness.' },
    11: { title: 'Scene Roster Agent', function: 'generateScenes() - Tier 4.1', model: 'Development Model Target', inputs: 'Sequence outline, active cast lists, target sequence scope, world bible rules.', output: 'XML roster of lean scenes: scene_id, title, characters, threads, objective, scene_type, transition_jump, temporal_scope, entrance/exit conditions.', gate: 'Passes Programmatic Validation: at least 4 scenes created per Sequence.', retries: 'Up to 3 attempts. 3 failures trigger rollback to Sequence Agent (Step 9).', constraints: 'Alternate proactive scenes and reactive sequels with explicit transition jumps.' },
    12: { title: 'Scene Roster Reviewer & Surgical Editor', function: 'generateScenes() - Tier 4.2', model: 'Review Model Target', inputs: 'Generated lean scene roster, parent sequence objectives.', output: 'XML outlining status (PASS or FAIL), structured issues, and deviation reasons.', gate: "Reviewer status == 'PASS' or surgical edits resolve flagged issues.", retries: 'Minor/Major issues trigger Surgical Scene Editor. Critical failures trigger retry of Step 11 up to 3 times, then roll back to Step 9.', constraints: 'Audit Swain Scene/Sequel alternation and causal linkage.' },
    13: { title: 'Scene Expander Agent', function: 'generateScenes() - Tier 4.3', model: 'Development Model Target', inputs: 'Lean scene row, adjacent scene context (previous exit / next entrance), narrative mode library.', output: 'XML expansion: rich_scene_description blueprint, dominant narrative mode, value shift, hard facts, relationship shifts.', gate: 'Rich description blueprint generated.', retries: 'Up to 3 attempts via the escalation loop.', constraints: 'Blueprint only - no prose or dialogue. Respect adjacent-scene continuity.' },
    14: { title: 'Scene Expander Reviewer', function: 'generateScenes() - Tier 4.4', model: 'Review Model Target', inputs: 'Full list of expanded scenes for the sequence.', output: 'XML status report: PASS or FAIL with deviation reasons.', gate: 'Continuity validated across the expanded scene flow.', retries: 'FAIL is logged; scenes are kept (advisory batch review).', constraints: 'Check teleportation, state collisions, and clinical tone.' },
    17: { title: 'Query Expansion & RAG Context Retriever', function: 'retrieveContext()', model: 'Development Model Target', inputs: 'Scene blueprint description, active cast list, scene location.', output: 'Relevant canonical facts, lore notes, character relationships attached to prompt.', gate: 'Preprocessed terms and RAG facts returned.', retries: 'Falls back to raw action query on search exception.', constraints: 'Ensure canonical facts are never contradicted.' },
    18: { title: 'Writing Agent (Prose Generator)', function: 'writeSceneProse()', model: 'Prose Model Target', inputs: 'Full scene blueprint, cast cards, RAG lore details, style guides, preceding prose.', output: 'Story text paragraphs matching the calculated scene word count. Text-only format.', gate: 'Passes prose length and format guidelines.', retries: 'Up to 3 attempts. 3 failures trigger rollback to Scene Planner (Step 11).', constraints: 'Subtext over text, distinct character voices, emotional authenticity.' },
    19: { title: 'Continuity Reviewer & Surgical Editor', function: 'writeSceneProse() Reviewer & Patch', model: 'Review Model Target', inputs: 'Scene blueprint, newly generated prose draft, banned words filter.', output: 'PASS or FAIL status. If FAIL with minor issues, applies surgical search-replace patch.', gate: "Reviewer status == 'PASS' or surgical edit applies cleanly.", retries: 'Critical fail triggers prose rewrite loop (Step 18).', constraints: 'Check for posture slips, teleportation, and dialogue bloat.' },
    20: { title: 'Archivist (End of Scene)', function: 'handleWorldUpdates() / Archivist', model: 'Review Model Target', inputs: 'Finalized scene prose, current cast profiles, lore database topics.', output: 'JSON object updating character goals, new lore entries, and relationship shifts.', gate: 'JSON output parses successfully and updates state model.', retries: 'Regex fallback on JSON parse failure.', constraints: 'Assign unique IDs to all new character briefs immediately.' },
    21: { title: 'Autonomous Editorial Harness (CI/CD)', function: 'runAutonomousEditorialHarness() - Tier 6.0', model: 'Review & Prose Model Targets', inputs: 'Full drafted manuscript XML, AestheticConstitution, AuthorVoiceDNA, NarrativeStateGraph, Layer 0 Blind Reader, 11-Tool Dossiers.', output: 'Verified Ticket Queue, 3-Wave CompiledEditPlan, and 4-Gate Literary CI/CD verified <ManuscriptPatch> transactions.', gate: 'Adversarial Tribunal Priority >= 35 & All 4 CI/CD Gates PASS', retries: 'Up to 3 worktree retries per transaction; automatic rollback on 4-Gate failure.', constraints: 'Enforces Voice DNA CV/Psychic Distance envelope, GESM epistemic firewall, and 35% scene churn cap.' },
    22: { title: 'Audio Drama Multi-Voice Production', function: 'runStudioRenderJob() / Tier 7.0', model: 'Kokoro TTS / Audio.cpp / Gemini Voice', inputs: 'Scene/Sequence prose, character voice mapping, dialogue cue boundaries, dual-engine TTS configs.', output: 'Multi-voice synthesized chunks, mastered WAV/MP3 with loudness normalization.', gate: 'All dialogue and narration chunks synthesized without truncation; MP3 encoded successfully.', retries: 'Automatic fallback to secondary TTS engine or Kokoro-JS in-browser.', constraints: 'Preserve character voice consistency, emotion tag adherence, zero clipped buffers.' }
};

export function mapLogNameToStepId(name: string | number | null | undefined): number | null {
    if (name === null || name === undefined || name === '') return null;
    if (typeof name === 'number') {
        return name >= 1 && name <= 22 ? name : null;
    }
    const rawStr = String(name).trim();
    const parsedNum = parseInt(rawStr.replace(/^[^\d]*/, ''), 10);
    if (/^(?:step\s*)?\d+$/i.test(rawStr) && !isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= 22) {
        return parsedNum;
    }
    const n = rawStr.toLowerCase();

    if (
        n.includes('tier 7') ||
        n.includes('audio drama') ||
        n.includes('audiodrama') ||
        n.includes('tts pipeline') ||
        n.includes('voice production') ||
        n.includes('voice alignment') ||
        n.includes('chunk synthesis') ||
        n.includes('audio mastering') ||
        n.includes('audiomastering') ||
        n.includes('studio master') ||
        n.includes('scene audio') ||
        n.includes('sequence audio') ||
        n.includes('exportsceneaudio') ||
        n.includes('exportsequenceaudio')
    ) return 22;

    if (
        n.includes('tier 6') ||
        n.includes('editorial harness') ||
        n.includes('voice dna') ||
        n.includes('blind reader') ||
        n.includes('intent execution') ||
        n.includes('editorial investigator') ||
        n.includes('adversarial tribunal') ||
        n.includes('macro structural') ||
        n.includes('meso scene') ||
        n.includes('micro line') ||
        n.includes('patch arbiter')
    ) return 21;

    if (n.includes('tier 0.1') || n.includes('conceptual') || n.includes('concept') || n.includes('generateconcept')) return 1;
    if (n.includes('tier 0.2') || n.includes('character developer') || n.includes('character interview') || n.includes('interview') || n.includes('character brief')) return 2;

    if (n.includes('story arc agent reviewer') || n.includes('story arc reviewer') || n.includes('tier 1.2') || n.includes('arcreview') || (n.includes('surgical editor') && n.includes('story arc'))) return 4;
    if (n.includes('tier 1.1') || n.includes('story arc agent') || n.includes('story arc planner') || n.includes('story arc') || n.includes('storyarc')) return 3;

    if (n.includes('act agent reviewer') || n.includes('act reviewer') || n.includes('act review') || n.includes('actreview') || n.includes('tier 2.2') || (n.includes('surgical editor') && n.includes('act agent'))) return 6;
    if (n.includes('act agent') || n.includes('act planner') || n.includes('act architect') || n.includes('generateacts') || n.includes('actagent') || n.includes('tier 2.1')) return 5;
    if (n.includes('lore archivist') || n.includes('lore extraction') || n.includes('rag ingest') || n.includes('lore merger') || n.includes('world lore') || n.includes('lorearchivist')) return 7;
    if (n.includes('pacing architect') || n.includes('pacing') || n.includes('tier 2.3')) return 8;

    if (n.includes('sequence agent reviewer') || n.includes('sequence reviewer') || n.includes('sequence review') || n.includes('sequencereview') || n.includes('tier 3.2') || (n.includes('surgical editor') && n.includes('sequence agent'))) return 10;
    if (n.includes('sequence agent') || n.includes('sequence planner') || n.includes('generatesequences') || n.includes('sequenceagent') || n.includes('tier 3.1')) return 9;

    if (n.includes('scene expander agent reviewer') || n.includes('scene expander reviewer') || n.includes('tier 4.4')) return 14;
    if (n.includes('scene expander agent') || n.includes('scene expander') || n.includes('sceneexpander') || n.includes('tier 4.3')) return 13;
    if (n.includes('scene roster agent reviewer') || n.includes('scene roster reviewer') || n.includes('scene reviewer') || n.includes('tier 4.2') || (n.includes('surgical') && n.includes('scene roster'))) return 12;
    if (n.includes('scene roster') || n.includes('scene agent') || n.includes('scene planner') || n.includes('generatescenes') || n.includes('sceneroster') || n.includes('tier 4.1')) return 11;

    if (n.includes('rag context') || n.includes('retrievecontext') || n.includes('retriever') || n.includes('retrieve context') || n.includes('rag preprocess') || n.includes('query expansion')) return 17;

    if (
        n.includes('writing agent reviewer') ||
        n.includes('continuity reviewer') ||
        n.includes('continuity auditor') ||
        n.includes('writing review') ||
        n.includes('writingreview') ||
        n.includes('directive prose reviewer') ||
        n.includes('directive consistency reviewer') ||
        n.includes('directive surgical') ||
        n.includes('surgical prose') ||
        n.includes('surgical editor (writing') ||
        n.includes('surgical editor') ||
        n.includes('banned words') ||
        n.includes('style polish') ||
        n.includes('sensory polish') ||
        n.includes('mru surgical') ||
        n.includes('surgical value shift') ||
        n.includes('surgical rsi') ||
        n.includes('continuity bridge') ||
        n.includes('bridge generator') ||
        n.includes('act compressor') ||
        n.includes('validation gate') ||
        n.includes('validation')
    ) return 19;

    if (
        n.includes('writing agent') ||
        n.includes('prose generator') ||
        n.includes('prose writer') ||
        n.includes('writesceneprose') ||
        n.includes('draftscenemru') ||
        n.includes('draftscene') ||
        n.includes('agentic writer') ||
        n.includes('agentic loop') ||
        n.includes('tier 5.3') ||
        n.includes('drafting scene') ||
        n.includes('prose')
    ) return 18;

    if (n.includes('archivist') || n.includes('world updates') || n.includes('handleworldupdates') || n.includes('world update')) return 20;

    return null;
}

export function getPipelineStepInfo(
    name: string | number | null | undefined,
    explicitStepId: number | null = null
): ResolvedPipelineStepInfo | null {
    let sId = explicitStepId;
    if (!sId) {
        if (typeof name === 'number') {
            sId = name >= 1 && name <= 22 ? name : null;
        } else {
            sId = mapLogNameToStepId(name);
        }
    }
    if (!sId) return null;
    const stepSpec = PIPELINE_STEPS_META.find((s) => s.id === sId);
    if (stepSpec) {
        return {
            stepId: stepSpec.id,
            stepTier: stepSpec.tier,
            stepTitle: stepSpec.title
        };
    }
    return {
        stepId: sId,
        stepTier: `Step ${sId}`,
        stepTitle: typeof name === 'string' && name ? name : `Step ${sId}`
    };
}
