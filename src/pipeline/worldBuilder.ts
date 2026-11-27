/**
 * @module pipeline/worldBuilder
 * "Build a world from a pitch": three model calls, one for each part of the world, each checked
 * in code before the next is asked for. A refused part is asked for once more with its problems
 * listed. The finished world is not written into the story: it is queued as lore proposals for
 * the author to approve on the Lore page.
 */

import {
    WORLD_PART_LABELS,
    WORLD_PARTS,
    WORLD_SIZES,
    cleanWorldPart,
    queueLoreProposals,
    worldAnswerObject,
    worldDraftLore,
    worldPartAsk,
    worldPartProblems,
    type WorldDraft,
    type WorldPart,
    type WorldSize
} from '@/domain/lore';
import { SAFEGUARD_PROMPTS } from '@/prompts';
import { isModelStop } from '@/services/llm';
import type { PipelineRuntimeContext } from './context';
import { asArray, asString } from './context';

export interface WorldBuildRequest {
    pitch: string;
    size?: string;
}

export type WorldBuildResult =
    | { ok: true; draft: WorldDraft; written: number; added: number }
    | { ok: false; problem: string; part?: WorldPart };

export async function buildWorldFromPitch(ctx: PipelineRuntimeContext, request: WorldBuildRequest): Promise<WorldBuildResult> {
    const pitch = asString(request.pitch).trim();
    if (!pitch) return { ok: false, problem: 'Write a pitch first: a few sentences on the world you want.' };
    const size: WorldSize = request.size && request.size in WORLD_SIZES ? (request.size as WorldSize) : 'medium';

    const story = ctx.getStory() || {};
    const context = {
        pitch,
        size,
        storyFacts: [
            asString(story.title) ? `Title: ${asString(story.title)}` : '',
            asString(story.genre) ? `Genre: ${asString(story.genre)}` : '',
            asString(story.tone) ? `Tone: ${asString(story.tone)}` : ''
        ].filter(Boolean),
        knownTopics: asArray<Record<string, unknown>>(story.lore).map((item) => asString(item?.topic).trim()).filter(Boolean)
    };

    const draft: WorldDraft = {};
    try {
        for (const part of WORLD_PARTS) {
            let problems: string[] = [];
            let accepted = false;
            for (let attempt = 1; attempt <= 2 && !accepted; attempt++) {
                ctx.setLoadingStep(`Building the world: ${WORLD_PART_LABELS[part]}${attempt > 1 ? ' (second try)' : ''}…`);
                const answer = await ctx.callAI(
                    worldPartAsk(part, context, draft, problems),
                    SAFEGUARD_PROMPTS.worldBuilder,
                    true,
                    `World Builder: ${part}${attempt > 1 ? ' (retry)' : ''}`,
                    'structure'
                );
                const object = worldAnswerObject(answer);
                if (!object) {
                    problems = ['The answer was not a JSON object.'];
                    continue;
                }
                const cleaned = cleanWorldPart(part, object);
                problems = worldPartProblems(part, cleaned, draft, size);
                if (problems.length === 0) {
                    (draft as Record<WorldPart, unknown>)[part] = cleaned;
                    accepted = true;
                }
            }
            if (!accepted) {
                return {
                    ok: false,
                    part,
                    problem: `The model's answer for ${WORLD_PART_LABELS[part]} still had problems after a second try, so nothing was added. ${problems.slice(0, 3).join(' ')}`
                };
            }
        }
    } catch (err) {
        if (isModelStop(err)) return { ok: false, problem: 'Stopped. Nothing was added.' };
        return { ok: false, problem: err instanceof Error ? err.message : String(err) };
    } finally {
        ctx.setLoadingStep('');
    }

    const lore = worldDraftLore(draft);
    let added = 0;
    ctx.setStory((prev) => {
        const queued = queueLoreProposals(prev, lore, { act: 1, scene: 1 });
        added = queued.added;
        return queued.story;
    });
    return { ok: true, draft, written: lore.length, added };
}
