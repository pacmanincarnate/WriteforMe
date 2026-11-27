/**
 * Leak judge: one extra call that reads a finished scene for an unrevealed secret told in other
 * words, which no word match can catch, and a surgical edit that takes the telling out.
 *
 * It fails open. If the judge call fails, replies in the wrong shape, quotes words that are not
 * in the scene, or the edit cannot be applied, the scene is kept as written.
 */
import type { SecretEntry } from '@/types';
import { computeChangeRatio } from '@/domain/editing';
import { getSurgicalPromptForMode, PROMPTS, SAFEGUARD_PROMPTS } from '@/prompts';
import { getFeatureOptions } from '@/stores';
import { extractTag, extractTagList } from '@/utils';
import type { PipelineRuntimeContext, PipelineStory } from './context';
import { asArray, asString } from './context';
import { applySurgicalEditsWithRetry } from './surgicalPatch';

/** A leak fix that rewrites more of the scene than this is not a fix; the scene is kept. */
const MAX_FIX_CHANGE_RATIO = 0.25;

export interface SecretLeak {
    secretId: string;
    quote: string;
    why: string;
}

export interface SecretLeakCheckResult {
    /** The scene, with leaks edited out when the fix applied. */
    prose: string;
    /** Leaks the judge named whose quoted words are really in the scene. */
    leaks: SecretLeak[];
    fixed: boolean;
    /** False when there was nothing to check or the check is off. */
    checked: boolean;
}

/** Secrets the reader must not know yet at this sequence. */
export function unrevealedSecretsAt(story: PipelineStory, sequenceNumber: number): SecretEntry[] {
    return asArray<SecretEntry>(story.secret_vault).filter(
        (sec) =>
            sec &&
            asString(sec.truth).trim().length > 5 &&
            sec.status !== 'revealed' &&
            Number(sec.reveal_anchor?.sequence_number || 7) > sequenceNumber
    );
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** The judge's reply as leaks, keeping only quotes that are in the scene and secrets that were asked about. */
export function parseSecretLeaks(raw: string, prose: string, secretIds: readonly string[]): SecretLeak[] {
    const body = extractTag(raw, 'leaks') || raw || '';
    const haystack = squash(prose);
    const seen = new Set<string>();
    const found: SecretLeak[] = [];
    extractTagList(body, 'leak').forEach((block) => {
        const quote = extractTag(block, 'quote').replace(/^["“”']+|["“”']+$/g, '').trim();
        const secretId = extractTag(block, 'secret_id').trim();
        const key = squash(quote);
        if (key.length < 8 || seen.has(key) || !haystack.includes(key)) return;
        if (secretIds.length > 0 && secretId && !secretIds.includes(secretId)) return;
        seen.add(key);
        found.push({ secretId: secretId || secretIds[0] || '', quote, why: extractTag(block, 'why').trim() });
    });
    return found;
}

function secretsBlock(secrets: SecretEntry[]): { xml: string; ids: string[] } {
    const ids: string[] = [];
    const xml = secrets
        .map((sec, index) => {
            const id = asString(sec.id) || `S${index + 1}`;
            ids.push(id);
            const cover = asString((sec.cover_story as Record<string, unknown> | undefined)?.public_narrative);
            return `<secret id="${id}">
<truth>${asString(sec.truth)}</truth>${cover ? `\n<cover_story>${cover}</cover_story>` : ''}
<planned_reveal>Sequence ${Number(sec.reveal_anchor?.sequence_number || 7)}</planned_reveal>
</secret>`;
        })
        .join('\n');
    return { xml, ids };
}

export interface SecretLeakCheckParams {
    story: PipelineStory;
    /** 1-based number of the sequence the scene is in. */
    sequenceNumber: number;
    prose: string;
    isAudioDrama?: boolean;
    label?: string;
}

export async function checkSceneForSecretLeaks(
    ctx: PipelineRuntimeContext,
    { story, sequenceNumber, prose, isAudioDrama = false, label = 'Secret Leak Check' }: SecretLeakCheckParams
): Promise<SecretLeakCheckResult> {
    const untouched: SecretLeakCheckResult = { prose, leaks: [], fixed: false, checked: false };
    if (!getFeatureOptions().secretLeakCheck || !prose || prose.trim().length < 200) return untouched;
    const secrets = unrevealedSecretsAt(story, sequenceNumber);
    if (secrets.length === 0) return untouched;

    const { xml, ids } = secretsBlock(secrets);
    let leaks: SecretLeak[];
    try {
        const raw = await ctx.callAI(
            `<unrevealed_secrets>\n${xml}\n</unrevealed_secrets>\n\n<scene_prose>\n${prose}\n</scene_prose>\n\nName every passage that gives a secret away, or return <leaks></leaks>.`,
            SAFEGUARD_PROMPTS.secretLeakJudge,
            false,
            label,
            'review'
        );
        leaks = parseSecretLeaks(raw, prose, ids);
    } catch (err) {
        console.warn(`[${label}] The leak check could not run; the scene is kept as written:`, err);
        return { ...untouched, checked: true };
    }
    if (leaks.length === 0) return { ...untouched, checked: true };

    try {
        const instructions = `These passages give away a truth the reader must not know yet. Rewrite ONLY each quoted passage so the scene still works but the truth is no longer stated or made certain. Keep any hint or odd detail a careful reader could notice later. Do not state the truth anywhere in your rewrite.\n${leaks
            .map((leak, index) => `${index + 1}. "${leak.quote}"${leak.why ? ` (${leak.why})` : ''}`)
            .join('\n')}`;
        const system = getSurgicalPromptForMode(PROMPTS.surgicalProseEditor, isAudioDrama);
        const output = await ctx.callAI(
            `<original_text>\n${prose}\n</original_text>\n\n<surgical_instructions>\n${instructions}\n</surgical_instructions>\n\nBEGIN SURGICAL PROSE EDIT`,
            system,
            false,
            `${label}: Fix`,
            'review'
        );
        const report = await applySurgicalEditsWithRetry(ctx, {
            originalText: prose,
            blocksText: output,
            systemPrompt: system,
            logName: `${label}: Fix`,
            modelSize: 'review'
        });
        const stillThere = leaks.some((leak) => squash(report.text).includes(squash(leak.quote)));
        if (report.applied.length > 0 && !stillThere && computeChangeRatio(prose, report.text) <= MAX_FIX_CHANGE_RATIO) {
            return { prose: report.text, leaks, fixed: true, checked: true };
        }
    } catch (err) {
        console.warn(`[${label}] The leak fix could not be applied; the scene is kept as written:`, err);
    }
    return { prose, leaks, fixed: false, checked: true };
}
