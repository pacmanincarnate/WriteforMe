/**
 * @module pipeline/passageRewrite
 * "Select a passage and rewrite it": one model call that returns only the selected passage,
 * rewritten. The scene around it is shown for continuity and cannot change. Nothing is saved
 * here; the caller decides whether to keep the result.
 */

import {
    PASSAGE_INSTRUCTION_MAX_CHARS,
    passageFromAnswer,
    passageRewriteProblem,
    passageSelection,
    passageSurroundings,
    withPassageReplaced
} from '@/domain/editing';
import { SAFEGUARD_PROMPTS } from '@/prompts';
import { isModelStop } from '@/services/llm';
import type { PipelineRuntimeContext } from './context';
import { asArray, asRecord, asString } from './context';

export interface PassageRewriteRequest {
    seqIdx: number;
    sceneIdx: number;
    /** The scene text the selection offsets refer to (the editor's draft, saved or not). */
    text: string;
    start: number;
    end: number;
    instruction?: string;
}

export type PassageRewriteResult =
    | { ok: true; text: string; start: number; end: number; original: string; rewrite: string }
    | { ok: false; problem: string };

export async function rewritePassage(
    ctx: PipelineRuntimeContext,
    request: PassageRewriteRequest
): Promise<PassageRewriteResult> {
    const selection = passageSelection(request.text, request.start, request.end);
    if ('problem' in selection) return { ok: false, problem: selection.problem };

    const story = ctx.getStory() || {};
    const scenes = asArray<Record<string, unknown>>(asRecord(story.scenes)[`${request.seqIdx}`]);
    const scene = scenes[request.sceneIdx] || {};
    const surroundings = passageSurroundings(request.text, selection);
    const instruction = asString(request.instruction).trim().slice(0, PASSAGE_INSTRUCTION_MAX_CHARS);

    const sceneFacts = [
        asString(scene.title) ? `Scene: ${asString(scene.title)}` : '',
        asString(scene.pov_character) ? `Point of view: ${asString(scene.pov_character)}` : '',
        asString(story.genre) ? `Genre: ${asString(story.genre)}` : '',
        asString(story.tone) ? `Tone: ${asString(story.tone)}` : ''
    ].filter(Boolean);

    const buildPrompt = (note: string): string =>
        `${sceneFacts.length ? `<scene_facts>\n${sceneFacts.join('\n')}\n</scene_facts>\n\n` : ''}` +
        `<before>\n${surroundings.before}\n</before>\n\n` +
        `<passage>\n${selection.text}\n</passage>\n\n` +
        `<after>\n${surroundings.after}\n</after>` +
        `${instruction ? `\n\n<instruction>\n${instruction}\n</instruction>` : ''}` +
        `${note ? `\n\n<previous_attempt_rejected>\n${note} Return only the rewritten passage.\n</previous_attempt_rejected>` : ''}`;

    let problem = '';
    try {
        for (let attempt = 1; attempt <= 2; attempt++) {
            const answer = await ctx.callAI(
                buildPrompt(problem),
                SAFEGUARD_PROMPTS.passageRewrite,
                false,
                `Passage Rewrite (Scene ${request.seqIdx + 1}.${request.sceneIdx + 1}${attempt > 1 ? ', retry' : ''})`,
                'prose'
            );
            const rewrite = passageFromAnswer(asString(answer));
            problem = rewrite ? passageRewriteProblem(selection.text, rewrite, surroundings) || '' : 'The model returned nothing.';
            if (rewrite && !problem) {
                const replaced = withPassageReplaced(request.text, selection, rewrite);
                return { ok: true, ...replaced, original: selection.text, rewrite };
            }
        }
    } catch (err) {
        if (isModelStop(err)) return { ok: false, problem: 'Stopped.' };
        return { ok: false, problem: err instanceof Error ? err.message : String(err) };
    }
    return { ok: false, problem: `${problem} The passage was left as it was.` };
}
