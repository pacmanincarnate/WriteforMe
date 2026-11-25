/**
 * @module pipeline/storySoFar
 * Incremental running-synopsis updater synthesized from drafted scenes.
 */

import { PROMPTS } from '@/prompts';
import { decodeXmlEntities } from '@/utils';
import {
    asArray,
    asOptionalRecord,
    asRecord,
    asString,
    type PipelineRuntimeContext,
    type PipelineStory
} from './context';
import { runAgentWithEscalation } from './escalation';

/** Generates an updated chronological "Story So Far" narrative summary from drafted scenes. */
export async function updateStorySoFar(
    ctx: PipelineRuntimeContext,
    currentStory: PipelineStory,
    isAutopilot = false
): Promise<string> {
    const proseMap = asRecord(currentStory?.prose);
    const hasDraftedProse = Object.values(proseMap).some((p) => {
        if (!p) return false;
        const pRec = asOptionalRecord(p);
        const txt =
            typeof p === 'string'
                ? p
                : asString(pRec?.final || pRec?.text || pRec?.draft || pRec?.prose);
        return typeof txt === 'string' && txt.trim().length > 0;
    });
    if (!hasDraftedProse) {
        return '';
    }

    ctx.setLoadingStep('Updating Story So Far narrative...');
    try {
        const draftedScenes: string[] = [];
        const scenesMap = asRecord(currentStory.scenes);
        Object.keys(scenesMap).forEach((seqIdx) => {
            asArray<Record<string, unknown>>(scenesMap[seqIdx]).forEach((sc, idx) => {
                const scNum = asString(sc.number);
                const sIdx = scNum
                    ? parseInt(scNum.split('.').pop() || '', 10) - 1
                    : idx;
                const scId = asString(sc.id);
                const proseEntry =
                    proseMap[`${seqIdx}-${sIdx}`] ||
                    (scId ? proseMap[scId] : undefined) ||
                    proseMap[`${seqIdx}-${idx}`];
                const proseRec = asOptionalRecord(proseEntry);
                const proseText =
                    typeof proseEntry === 'string'
                        ? proseEntry
                        : asString(
                              proseRec?.final ||
                                  proseRec?.text ||
                                  proseRec?.draft ||
                                  proseRec?.prose
                          );
                if (proseText && proseText.trim().length > 0) {
                    draftedScenes.push(
                        `Scene ${scNum || scId}: ${asString(sc.title)} - ${asString(sc.scene_objective || sc.objective)}\n  Draft excerpt: "${proseText.trim().slice(0, 300)}..."`
                    );
                }
            });
        });

        if (draftedScenes.length === 0) {
            return '';
        }

        const acts = asArray<Record<string, unknown>>(currentStory.acts);
        const sequences = asArray<Record<string, unknown>>(currentStory.sequences);

        const getContext = () => `
<concept>${asString(currentStory.concept)}</concept>
<acts>
${acts.map((a) => `Act ${asString(a.number)}: ${asString(a.title)} - ${asString(a.description || a.act_mandate)}`).join('\n')}
</acts>
<sequences>
${sequences.map((s) => `Seq ${asString(s.number)}: ${asString(s.title)} - ${asString(s.dramatic_question)}`).join('\n')}
</sequences>
<scenes_with_drafted_prose>
${draftedScenes.join('\n')}
</scenes_with_drafted_prose>
<existing_story_so_far>
${asString(currentStory.story_so_far) || 'None.'}
</existing_story_so_far>
`;
        const res = await runAgentWithEscalation<{ story_so_far: string }>(ctx, {
            tierName: 'Story So Far Agent',
            isAutopilot,
            generatorPromptFn: () => `
${getContext()}
<output_format_description>
FORMATTING DIRECTIVE: Return strictly as XML tags. Do not use markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

Output Schema:
<response>
  <story_so_far>A comprehensive 2-4 paragraph narrative description capturing the continuous 'gist' and chronological continuity of the story up to the current point based strictly on the events dramatized in the drafted scenes.</story_so_far>
</response>
</output_format_description>
                        `,
            systemPrompt: PROMPTS.storySoFarAgent,
            parserFn: (raw) => {
                if (!raw) return { story_so_far: '' };
                let text = '';
                const rawStr = String(raw);
                const match = rawStr.match(
                    /<story_so_far(?:\s+[^>]*)?>([\s\S]*?)<\/story_so_far>/i
                );
                if (match && match[1].trim()) {
                    text = decodeXmlEntities(match[1].trim());
                }
                if (!text && typeof DOMParser !== 'undefined') {
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(rawStr, 'text/xml');
                        const node = doc.querySelector('story_so_far');
                        if (node && node.textContent?.trim()) {
                            text = node.textContent.trim();
                        }
                    } catch {
                        // Ignore DOMParser fallback failures on partial XML
                    }
                }
                if (!text) {
                    text = rawStr
                        .replace(/<\/?(?:response|story_so_far)[^>]*>/gi, '')
                        .replace(/```(?:xml)?/gi, '')
                        .trim();
                }
                return { story_so_far: text || rawStr.trim() };
            },
            validateFn: (data) => {
                if (!data.story_so_far || data.story_so_far.length < 20) {
                    return {
                        valid: false,
                        errors: ['Story so far description is too short or missing.']
                    };
                }
                return { valid: true };
            },
            modelSize: 'review',
            spawningContext: 'Story So Far Update'
        });

        return res?.parsedData?.story_so_far || asString(currentStory.story_so_far);
    } catch (e) {
        console.error('Story So Far generation failed:', e);
        return asString(currentStory.story_so_far);
    }
}
