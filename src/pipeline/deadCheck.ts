/**
 * @module pipeline/deadCheck
 * After a scene is written: if it names someone the story's record holds dead, and the scene's
 * plan did not ask for them, one call reads only the paragraphs that name them and rewrites the
 * sentences that have them alive. A scene that names no one dead costs no call. It fails open:
 * a failed call or an unusable answer leaves the scene as written.
 */

import {
    acceptableDeadRewrite,
    deadCharacters,
    deadNamedParagraphs,
    namedDead,
    withParagraphsReplaced,
    type DeadCheckStory
} from '@/domain/continuity/deadCharacters';
import { SAFEGUARD_PROMPTS } from '@/prompts';
import { isModelStop } from '@/services/llm';
import { getFeatureOptions } from '@/stores';
import type { PipelineRuntimeContext } from './context';
import { asArray, asString } from './context';

export interface DeadCheckParams {
    /** The story as it stood before this scene was written. */
    story: DeadCheckStory;
    scene: Record<string, unknown>;
    prose: string;
    label: string;
}

export interface DeadCheckResult {
    prose: string;
    /** The dead the scene named without its plan asking for them. */
    named: string[];
    /** How many paragraphs named them, and how many of those were rewritten. */
    flagged: number;
    rewritten: number;
    checked: boolean;
}

/** Everything the scene's plan says, as one text: a dead character named here is meant to appear. */
function planText(scene: Record<string, unknown>): string {
    const cast = [...asArray<unknown>(scene.cast_names), ...asArray<unknown>(scene.active_characters)].map((c) =>
        typeof c === 'string' ? c : asString((c as Record<string, unknown> | null)?.name)
    );
    return [
        ...cast,
        asString(scene.title),
        asString(scene.pov_character),
        asString(scene.objective),
        asString(scene.scene_events),
        asString(scene.description),
        asString(scene.the_hinge_moment),
        asString(scene.transition_jump),
        asString(scene.entrance_conditions)
    ].join('\n');
}

function parseRewrites(answer: string): Map<number, string> {
    const found = new Map<number, string>();
    const pattern = /<passage\s+n="(\d+)"\s*>([\s\S]*?)<\/passage>/gi;
    let match = pattern.exec(answer);
    while (match) {
        found.set(Number(match[1]), match[2].trim());
        match = pattern.exec(answer);
    }
    return found;
}

export async function checkSceneForTheDead(ctx: PipelineRuntimeContext, params: DeadCheckParams): Promise<DeadCheckResult> {
    const unchanged: DeadCheckResult = { prose: params.prose, named: [], flagged: 0, rewritten: 0, checked: false };
    if (!getFeatureOptions().deadCharacterCheck || !params.prose.trim()) return unchanged;

    const dead = deadCharacters(params.story).map((d) => d.name);
    if (dead.length === 0) return unchanged;
    const everyone = asArray<Record<string, unknown>>(params.story.cast).map((c) => asString(c?.name)).filter(Boolean);
    const living = everyone.filter((name) => !dead.includes(name));

    // A dead character the plan names is there on purpose (a flashback, a ghost, a body).
    const planned = namedDead(dead, planText(params.scene), living);
    const unplanned = dead.filter((name) => !planned.includes(name));
    // A first name shared with someone the plan asked for is theirs, like one shared with the living.
    const flagged = deadNamedParagraphs(params.prose, unplanned, [...living, ...planned]);
    if (flagged.length === 0) return { ...unchanged, checked: true };

    const named = [...new Set(flagged.flatMap((paragraph) => paragraph.names))];
    const result: DeadCheckResult = { prose: params.prose, named, flagged: flagged.length, rewritten: 0, checked: true };
    const prompt =
        `<dead>\n${named.join('\n')}\n</dead>\n\n` +
        flagged.map((paragraph, i) => `<passage n="${i + 1}">\n${paragraph.text}\n</passage>`).join('\n\n');
    try {
        const answer = await ctx.callAI(prompt, SAFEGUARD_PROMPTS.deadCheck, false, params.label, 'review');
        const rewrites = parseRewrites(asString(answer));
        const replacements = new Map<number, string>();
        flagged.forEach((paragraph, i) => {
            const rewrite = rewrites.get(i + 1);
            if (rewrite && acceptableDeadRewrite(paragraph.text, rewrite)) replacements.set(paragraph.index, rewrite);
        });
        if (replacements.size > 0) {
            result.prose = withParagraphsReplaced(params.prose, replacements);
            result.rewritten = replacements.size;
        }
    } catch (err) {
        if (isModelStop(err)) throw err;
        console.warn('[Dead Character Check] The check failed; the scene is kept as written:', err);
    }
    return result;
}
