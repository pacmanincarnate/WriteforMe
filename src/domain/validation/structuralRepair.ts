/**
 * @module domain/validation/structuralRepair
 * Surgical LLM-assisted repair passes for defective beat MRUs and flat scene value shifts.
 */

import { PROMPTS } from '@/prompts';
import { decodeXmlEntities, extractTag, extractTagList } from '@/utils';

export type StructuralRepairCallAIFn = (
    userPrompt: string,
    sysPrompt: string,
    useJson: boolean,
    label: string,
    role: string
) => Promise<string | null | undefined>;

export interface DefectiveBeatEntry {
    index: number;
    beat: Record<string, unknown>;
    reason?: string;
}

export interface DefectiveValueShiftEntry {
    index: number;
    scene?: Record<string, unknown>;
    reason?: string;
}

export interface StructuralRepairResult {
    success: boolean;
    repairedCount?: number;
    genOutput?: string;
}

/** Surgically expands underdeveloped MRU beat actions/reactions via AI review pass. */
export async function surgicallyRepairBeatMRUs(
    defectiveBeats: DefectiveBeatEntry[],
    allBeats: Array<Record<string, unknown>>,
    context: Record<string, unknown>,
    genOutput: string,
    callAIFn: StructuralRepairCallAIFn | null = null
): Promise<StructuralRepairResult> {
    if (!defectiveBeats || defectiveBeats.length === 0) {
        return { success: false, genOutput };
    }

    // The LLM entry point must be passed in; the domain layer does not reach for globals.
    const effectiveCallAI = callAIFn;
    if (typeof effectiveCallAI !== 'function') {
        return { success: false, genOutput };
    }

    console.group(
        `[Surgical MRU Choreographer] Repairing ${defectiveBeats.length} defective beat(s)...`
    );

    let userPrompt = `<scene_context>\n`;
    userPrompt += `Scene: ${String(context.scene_title || context.title || 'Scene')}\n`;
    userPrompt += `Objective: ${String(context.objective || '')}\n`;
    userPrompt += `Description: ${String(context.description || context.rich_scene_description || '')}\n`;
    userPrompt += `</scene_context>\n\n`;

    userPrompt += `<full_scene_beat_choreography>\n`;
    for (let i = 0; i < allBeats.length; i++) {
        const b = allBeats[i];
        const bId = String(b.beat_id || b.id || i + 1);
        const isDefective = defectiveBeats.some((db) => db.index === i);

        if (isDefective) {
            userPrompt += `\n<<< TARGET DEFECTIVE BEAT: Beat ${bId} >>>\n`;
            userPrompt += `[Summary]: ${String(b.action_summary || b.description || 'Action')}\n`;
            userPrompt += `[Tactic]: ${String(b.char_A_tactic || b.tactic || 'Advance')}\n`;
            userPrompt += `[DEFECTIVE ACTION]: "${String(b.char_A_action || b.action || '')}"\n`;
            userPrompt += `[DEFECTIVE REACTION]: "${String(b.char_B_reaction || b.reaction || '')}"\n`;
            userPrompt += `Please expand both into rich, dense, multi-sentence paragraphs (40-100+ chars each) following Dwight Swain's biological reaction order.\n`;
            userPrompt += `<<< END TARGET DEFECTIVE BEAT >>>\n`;
        } else {
            userPrompt += `\n[Beat ${bId}] (Valid) Tactic: "${String(b.char_A_tactic || b.tactic || '')}"\n`;
            userPrompt += `Action: "${String(b.char_A_action || b.action || '')}"\n`;
            userPrompt += `Reaction: "${String(b.char_B_reaction || b.reaction || '')}"\n`;
        }
    }
    userPrompt += `</full_scene_beat_choreography>\n\n`;
    userPrompt += `<output_format_description>
FORMATTING DIRECTIVE: Return your response strictly as XML tags. Do not use YAML or markdown blocks.
CRITICAL XML RULE: Enclose the entire response in <response>...</response>.

Output Schema:
<response>
  <repaired_beats>
    <beat>
      <beat_id>1.1.14</beat_id>
      <char_A_tactic>The literal, physical action or emotional bid used to achieve the objective.</char_A_tactic>
      <char_A_action>The action itself.</char_A_action>
      <char_B_reaction>The visceral reaction of the other character.</char_B_reaction>
      <power_shift>Clear shift in dramatic tension or emotional balance.</power_shift>
    </beat>
  </repaired_beats>
</response>
</output_format_description>

BEGIN SURGICAL BEAT REPAIR`;

    try {
        const sysPrompt = PROMPTS.surgicalMRUChoreographer;
        const surgicalRes = await effectiveCallAI(
            userPrompt,
            sysPrompt,
            false,
            'MRU Surgical Choreographer',
            'review'
        );

        const repairedList: Array<{
            beat_id: string | null;
            id?: string | null;
            char_A_tactic: string;
            char_A_action: string;
            char_B_reaction: string;
            power_shift: string;
        }> = [];
        const beatBlocks = surgicalRes ? extractTagList(surgicalRes, 'beat') : [];
        if (beatBlocks && beatBlocks.length > 0) {
            for (const b of beatBlocks) {
                repairedList.push({
                    beat_id: extractTag(b, 'beat_id') || extractTag(b, 'id'),
                    char_A_tactic: decodeXmlEntities(extractTag(b, 'char_A_tactic') || ''),
                    char_A_action: decodeXmlEntities(extractTag(b, 'char_A_action') || ''),
                    char_B_reaction: decodeXmlEntities(extractTag(b, 'char_B_reaction') || ''),
                    power_shift: decodeXmlEntities(extractTag(b, 'power_shift') || '')
                });
            }
        }

        if (repairedList.length > 0) {
            let nextGenOutput = genOutput;
            for (const rep of repairedList) {
                const repId = String(rep.beat_id || rep.id || '').trim();
                const targetBeat =
                    allBeats.find((b) => String(b.beat_id || b.id || '').trim() === repId) ||
                    (defectiveBeats.length === 1 ? defectiveBeats[0].beat : null);

                if (targetBeat) {
                    if (rep.char_A_tactic) {
                        targetBeat.char_A_tactic = rep.char_A_tactic;
                        targetBeat.tactic = rep.char_A_tactic;
                    }
                    if (rep.char_A_action) {
                        targetBeat.char_A_action = rep.char_A_action;
                        targetBeat.action = rep.char_A_action;
                    }
                    if (rep.char_B_reaction) {
                        targetBeat.char_B_reaction = rep.char_B_reaction;
                        targetBeat.reaction = rep.char_B_reaction;
                    }
                    if (rep.power_shift) targetBeat.power_shift = rep.power_shift;

                    const escapedId = repId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const blockRegex = new RegExp(
                        `<beat>(?:(?!<\\/beat>)[\\s\\S])*?(?:<beat_id>|<id>)\\s*${escapedId}\\s*(?:<\\/beat_id>|<\\/id>)[\\s\\S]*?<\\/beat>`,
                        'i'
                    );
                    const match = nextGenOutput.match(blockRegex);
                    if (match) {
                        let newBlock = match[0];
                        if (rep.char_A_tactic) {
                            newBlock = newBlock.replace(
                                /<(tactic|char_A_tactic)>[\s\S]*?<\/\1>/gi,
                                `<$1>${rep.char_A_tactic}</$1>`
                            );
                        }
                        if (rep.char_A_action) {
                            newBlock = newBlock.replace(
                                /<(action|char_A_action)>[\s\S]*?<\/\1>/gi,
                                `<$1>${rep.char_A_action}</$1>`
                            );
                        }
                        if (rep.char_B_reaction) {
                            newBlock = newBlock.replace(
                                /<(reaction|char_B_reaction)>[\s\S]*?<\/\1>/gi,
                                `<$1>${rep.char_B_reaction}</$1>`
                            );
                        }
                        if (rep.power_shift && newBlock.includes('<power_shift>')) {
                            newBlock = newBlock.replace(
                                /<power_shift>[\s\S]*?<\/power_shift>/gi,
                                `<power_shift>${rep.power_shift}</power_shift>`
                            );
                        }
                        nextGenOutput = nextGenOutput.replace(match[0], newBlock);
                    }
                }
            }
            console.groupEnd();
            return { success: true, repairedCount: repairedList.length, genOutput: nextGenOutput };
        }
    } catch (err) {
        console.error('[Surgical MRU Choreographer] Failed to execute surgical repair:', err);
    }
    console.groupEnd();
    return { success: false };
}

/** Surgically repairs flat scene value shifts across sequence plans via AI review pass. */
export async function surgicallyRepairValueShifts(
    defectiveScenes: DefectiveValueShiftEntry[],
    allScenes: Array<Record<string, unknown>>,
    context: Record<string, unknown>,
    genOutput: string,
    callAIFn: StructuralRepairCallAIFn | null = null
): Promise<StructuralRepairResult> {
    if (!defectiveScenes || defectiveScenes.length === 0) {
        return { success: false, genOutput };
    }

    // The LLM entry point must be passed in; the domain layer does not reach for globals.
    const effectiveCallAI = callAIFn;
    if (typeof effectiveCallAI !== 'function') {
        return { success: false, genOutput };
    }

    console.group(
        `[Surgical Value Shift Repair] Repairing ${defectiveScenes.length} defective scene(s)...`
    );

    const sequenceData = (context?.sequence || context?.sequenceData || {}) as Record<
        string,
        unknown
    >;

    let userPrompt = `<sequence_overview>\n`;
    userPrompt += `Sequence ID: ${String(sequenceData.number || '1')}\n`;
    userPrompt += `Title: ${String(sequenceData.title || 'Sequence')}\n`;
    userPrompt += `Objective: ${String(sequenceData.objective || 'Advance plot')}\n`;
    userPrompt += `</sequence_overview>\n\n`;

    userPrompt += `<full_sequence_scenes>\n`;
    for (let i = 0; i < allScenes.length; i++) {
        const sc = allScenes[i];
        const scId = String(sc.number || sc.scene_id || i + 1);
        const isDefective = defectiveScenes.some((ds) => ds.index === i);
        const valShift = (sc.value_shift || {}) as { start_state?: string; end_state?: string };

        if (isDefective) {
            userPrompt += `\n<<< TARGET DEFECTIVE SCENE: Scene ${scId} >>>\n`;
            userPrompt += `[Scene Type]: ${String(sc.scene_type || 'PROACTIVE')}\n`;
            userPrompt += `[FLAT VALUE SHIFT ERROR]: ${String(valShift.start_state || '')} -> ${String(valShift.end_state || '')}.\n`;
            userPrompt += `Please provide a revised start_state and end_state that show a meaningful change in valence based on the scene's outcome.\n`;
        } else {
            userPrompt += `- Scene ${scId}: ${valShift.start_state || '?'} -> ${valShift.end_state || '?'}\n`;
        }
    }
    userPrompt += `</full_sequence_scenes>\n\n`;

    userPrompt += `<response>\n  <repaired_scenes>\n    <scene>\n      <number>[scene id]</number>\n      <value_shift>\n        <start_state>...</start_state>\n        <end_state>...</end_state>\n      </value_shift>\n    </scene>\n  </repaired_scenes>\n</response>\n`;

    const sysPrompt =
        'You are a surgical narrative repair agent. Your only job is to fix the target defects precisely as requested and output valid XML enclosed in <response>...</response>.\n\nBEGIN SURGICAL VALUE SHIFT REPAIR';

    try {
        const repairResult = await effectiveCallAI(
            userPrompt,
            sysPrompt,
            false,
            'Surgical Value Shift Repair',
            'review'
        );

        const repairedList: Array<{
            number: string | null;
            scene_id?: string | null;
            value_shift: { start_state: string; end_state: string };
        }> = [];
        const sceneBlocks = repairResult ? extractTagList(repairResult, 'scene') : [];
        if (sceneBlocks && sceneBlocks.length > 0) {
            for (const s of sceneBlocks) {
                const vsBlock = extractTag(s, 'value_shift');
                const start_state = vsBlock
                    ? extractTag(vsBlock, 'start_state')
                    : extractTag(s, 'start_state');
                const end_state = vsBlock
                    ? extractTag(vsBlock, 'end_state')
                    : extractTag(s, 'end_state');
                repairedList.push({
                    number: extractTag(s, 'number') || extractTag(s, 'scene_id'),
                    value_shift: {
                        start_state: decodeXmlEntities(start_state || ''),
                        end_state: decodeXmlEntities(end_state || '')
                    }
                });
            }
        }

        if (repairedList.length > 0) {
            let nextGenOutput = genOutput;
            for (const rep of repairedList) {
                const repId = String(rep.number || rep.scene_id || '');
                const targetScene = allScenes.find(
                    (sc) => String(sc.number || sc.scene_id) === repId
                );

                if (
                    targetScene &&
                    rep.value_shift &&
                    rep.value_shift.start_state &&
                    rep.value_shift.end_state
                ) {
                    const targetVs = (targetScene.value_shift || {}) as {
                        start_state?: string;
                        end_state?: string;
                    };
                    targetVs.start_state = rep.value_shift.start_state;
                    targetVs.end_state = rep.value_shift.end_state;
                    targetScene.value_shift = targetVs;

                    const escapedId = repId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const blockRegex = new RegExp(
                        `<scene>(?:(?!<\\/scene>)[\\s\\S])*?(?:<number>|<scene_id>)\\s*${escapedId}\\s*(?:<\\/number>|<\\/scene_id>)[\\s\\S]*?<\\/scene>`,
                        'i'
                    );
                    const match = nextGenOutput.match(blockRegex);
                    if (match) {
                        let newBlock = match[0];
                        if (rep.value_shift.start_state) {
                            newBlock = newBlock.replace(
                                /<start_state>[\s\S]*?<\/start_state>/gi,
                                `<start_state>${rep.value_shift.start_state}</start_state>`
                            );
                        }
                        if (rep.value_shift.end_state) {
                            newBlock = newBlock.replace(
                                /<end_state>[\s\S]*?<\/end_state>/gi,
                                `<end_state>${rep.value_shift.end_state}</end_state>`
                            );
                        }
                        nextGenOutput = nextGenOutput.replace(match[0], newBlock);
                    }
                }
            }
            console.groupEnd();
            return { success: true, repairedCount: repairedList.length, genOutput: nextGenOutput };
        }
    } catch (err) {
        console.error('[Surgical Value Shift Repair] Failed to execute surgical repair:', err);
    }
    console.groupEnd();
    return { success: false };
}
