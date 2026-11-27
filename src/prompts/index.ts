/**
 * @module prompts
 * Central AI prompt registry, protocols, and dynamic system prompt builders.
 */

export * from './protocols';
export * from './systemPrompt';
export { CONCEPT_PROMPTS } from './tiers/concept';
export { STRUCTURE_PROMPTS } from './tiers/structure';
export { PROSE_PROMPTS } from './tiers/prose';
export { CONTINUITY_PROMPTS } from './tiers/continuity';
export { EDITORIAL_PROMPTS } from './tiers/editorial';
export { SERIES_PROMPTS } from './tiers/series';
export { SAFEGUARD_PROMPTS } from './tiers/safeguards';

import { buildWritingSystemPrompt } from './systemPrompt';
import { CONCEPT_PROMPTS } from './tiers/concept';
import { STRUCTURE_PROMPTS } from './tiers/structure';
import { PROSE_PROMPTS } from './tiers/prose';
import { CONTINUITY_PROMPTS } from './tiers/continuity';
import { EDITORIAL_PROMPTS } from './tiers/editorial';

export const PROMPTS = {
    ...STRUCTURE_PROMPTS,
    ...CONCEPT_PROMPTS,
    ...PROSE_PROMPTS,
    ...CONTINUITY_PROMPTS,
    ...EDITORIAL_PROMPTS,
    writingAgent: buildWritingSystemPrompt({ isAudioDrama: false }),
    get audioDramaWritingAgent(): string {
        return `${buildWritingSystemPrompt({ isAudioDrama: true })}\n\n${PROMPTS.audioDramaWritingModifier}`;
    },
    // Backwards-compatibility aliases preserving legacy registry keys
    storySoFarAgent: '',
    writing: '',
    characterDeveloper: '',
    storyArcPlanner: '',
    actDivisionPlanner: '',
    sequencePlanner: '',
    sceneRosterPlanner: '',
    sceneRosterAgent: '',
    sceneRosterReview: '',
    sceneExpanderAgent: '',
    sceneExpanderReview: '',
    surgicalEditorSceneExpansion: '',
    surgicalMRUChoreographer: '',
    editorialInvestigatorAgent: ''
};

PROMPTS.storySoFarAgent = PROMPTS.sequenceCompressorAgent;
PROMPTS.writing = PROMPTS.writingAgent;
PROMPTS.characterDeveloper = PROMPTS.characterDevelopment;
PROMPTS.storyArcPlanner = PROMPTS.storyArc;
PROMPTS.actDivisionPlanner = PROMPTS.actAgent;
PROMPTS.sequencePlanner = PROMPTS.sequenceAgent;
PROMPTS.sceneRosterPlanner = PROMPTS.scenePlannerAgent;
PROMPTS.sceneRosterAgent = PROMPTS.scenePlannerAgent;
PROMPTS.sceneRosterReview = PROMPTS.sequenceReview;
PROMPTS.sceneExpanderAgent = PROMPTS.scenePlannerAgent;
PROMPTS.sceneExpanderReview = PROMPTS.sequenceReview;
PROMPTS.surgicalEditorSceneExpansion = PROMPTS.surgicalEditorStructural;
PROMPTS.surgicalMRUChoreographer = PROMPTS.surgicalEditorStructural;
PROMPTS.editorialInvestigatorAgent = PROMPTS.editorialTribunalAgent;

export type PromptKey = keyof typeof PROMPTS;
