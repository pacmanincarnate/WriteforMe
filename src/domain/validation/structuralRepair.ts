/**
 * @module domain/validation/structuralRepair
 * Surgical LLM-assisted repair pass for flat scene value shifts.
 */

import { decodeXmlEntities, extractTag, extractTagList } from '@/utils';

export type StructuralRepairCallAIFn = (
    userPrompt: string,
    sysPrompt: string,
    useJson: boolean,
    label: string,
    role: string
) => Promise<string | null | undefined>;

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
