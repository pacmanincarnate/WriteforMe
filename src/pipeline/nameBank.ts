/**
 * Name banks in the pipeline: real names offered to the model when it casts a story,
 * and drawn replacements for a stock or made-up name that survives the model's retries.
 */
import type { CastMember, Story } from '@/types';
import { auditEntityNamesAndPlaces as domainAuditEntityNamesAndPlaces } from '@/domain/slop';
import { NameRoll, formatNameBankBlock, loadNameBanks } from '@/domain/names';
import type { PipelineRuntimeContext, PipelineStory } from './context';

export function isNameBankEnabled(ctx: PipelineRuntimeContext): boolean {
    const slopConfig = ctx.getSlopConfig();
    return slopConfig?.enableSlopAudit !== false && slopConfig?.enableNameBank !== false;
}

/** Loads the banks when the feature is on, so the synchronous name audit can use them. */
export async function ensureNameBanks(ctx: PipelineRuntimeContext): Promise<void> {
    if (isNameBankEnabled(ctx)) await loadNameBanks();
}

export interface NameRollRequest {
    story?: PipelineStory | null;
    /** Free text the era, place and peoples are read from. */
    setting: string;
    avoid?: readonly string[];
}

/** A roll for this story, or null when the feature is off or the banks could not load. */
export async function createStoryNameRoll(
    ctx: PipelineRuntimeContext,
    { story = null, setting, avoid = [] }: NameRollRequest
): Promise<NameRoll | null> {
    if (!isNameBankEnabled(ctx)) return null;
    const banks = await loadNameBanks();
    if (!banks) return null;
    const auditFn = ctx.auditEntityNamesAndPlaces || domainAuditEntityNamesAndPlaces;
    const slopConfig = ctx.getSlopConfig();
    const reject = (fullName: string): boolean => {
        try {
            return !auditFn({
                characters: [{ name: fullName } as CastMember],
                existingCast: [],
                slopConfig,
                story: null
            }).valid;
        } catch {
            return false;
        }
    };
    const seed = String((story as Partial<Story> | null)?.id || '') || setting.slice(0, 200);
    return new NameRoll(banks, { seed, setting, words: setting, reject, avoid });
}

/** The `<name_bank>` block for the concept prompt, or '' when there is nothing to offer. */
export async function buildConceptNameBankBlock(
    ctx: PipelineRuntimeContext,
    request: NameRollRequest
): Promise<string> {
    try {
        const roll = await createStoryNameRoll(ctx, request);
        if (!roll) return '';
        return formatNameBankBlock(roll.castOffer(), roll.place);
    } catch (err) {
        console.warn('[nameBank] Could not build the name bank block:', err);
        return '';
    }
}
