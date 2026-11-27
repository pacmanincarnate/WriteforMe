import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    PASSAGE_MAX_CHARS,
    passageFromAnswer,
    passageRewriteProblem,
    passageSelection,
    passageSurroundings,
    withPassageReplaced
} from '@/domain/editing';
import { rewritePassage, type PassageRewriteRequest, type PassageRewriteResult } from '@/pipeline/passageRewrite';
import type { PipelineRuntimeContext } from '@/pipeline/context';
import { SAFEGUARD_PROMPTS } from '@/prompts';
import { PassageRewriteBar } from '@/views/writer/PassageRewriteBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SCENE =
    'Mara closed the ledger room door. The lamp guttered in the draught. ' +
    'She felt very scared and her heart was beating very fast in her chest. ' +
    'Outside, the harbour bell rang twice.';
const START = SCENE.indexOf('She felt');
const END = SCENE.indexOf(' Outside');

describe('what was selected', () => {
    it('trims white space and keeps exact offsets', () => {
        const picked = passageSelection(SCENE, START - 1, END + 1);
        expect(picked).toEqual({ start: START, end: END, text: SCENE.slice(START, END) });
        // Selecting backwards is the same selection.
        expect(passageSelection(SCENE, END, START)).toEqual(picked);
    });

    it('explains a selection that cannot be rewritten', () => {
        expect(passageSelection(SCENE, 5, 5)).toEqual({ problem: 'Select the passage you want rewritten first.' });
        expect('problem' in passageSelection(SCENE, 0, 4)).toBe(true);
        expect('problem' in passageSelection('x'.repeat(PASSAGE_MAX_CHARS + 50), 0, PASSAGE_MAX_CHARS + 50)).toBe(true);
    });

    it('shows the model the neighbours, cut at word breaks', () => {
        const picked = passageSelection(SCENE, START, END) as { start: number; end: number; text: string };
        const around = passageSurroundings(SCENE, picked, 30);
        expect(SCENE.slice(0, START).endsWith(around.before)).toBe(true);
        expect(around.before).toBe('guttered in the draught. ');
        expect(around.after).toBe(' Outside, the harbour bell');
        expect(SCENE.slice(END).startsWith(around.after)).toBe(true);
        expect(passageSurroundings(SCENE, picked).before).toBe(SCENE.slice(0, START));
    });
});

describe('what came back', () => {
    it('reads the passage out of the tag, a fence, or bare text', () => {
        expect(passageFromAnswer('<rewrite>Fear had her by the throat.</rewrite>')).toBe('Fear had her by the throat.');
        expect(passageFromAnswer('Sure.\n<rewrite>\nFear had her.\n</rewrite>\nHope that helps')).toBe('Fear had her.');
        expect(passageFromAnswer('<rewrite>Cut off mid')).toBe('Cut off mid');
        expect(passageFromAnswer('```\nFear had her.\n```')).toBe('Fear had her.');
        expect(passageFromAnswer('   ')).toBeNull();
    });

    it('refuses a rewrite that is unchanged, runaway, or repeats its neighbours', () => {
        const around = {
            before: 'Mara closed the ledger room door and stood a long while listening to the lamp gutter in the draught.',
            after: 'Outside, the harbour bell rang twice and then a third time, which it never did on an ordinary night.'
        };
        const original = 'She felt very scared.';
        expect(passageRewriteProblem(original, 'Fear had her by the throat.', around)).toBeNull();
        expect(passageRewriteProblem(original, 'She  felt very\nscared.', around)).toMatch(/unchanged/);
        expect(passageRewriteProblem(original, 'word '.repeat(200), around)).toMatch(/far longer/);
        expect(passageRewriteProblem(original, `${around.before} Fear had her.`, around)).toMatch(/before the passage/);
        expect(passageRewriteProblem(original, `Fear had her. ${around.after}`, around)).toMatch(/after the passage/);
    });

    it('changes nothing outside the selection', () => {
        const picked = passageSelection(SCENE, START, END) as { start: number; end: number; text: string };
        const replaced = withPassageReplaced(SCENE, picked, 'Fear had her by the throat.');
        expect(replaced.text).toBe(
            'Mara closed the ledger room door. The lamp guttered in the draught. ' +
                'Fear had her by the throat. Outside, the harbour bell rang twice.'
        );
        expect(replaced.text.slice(replaced.start, replaced.end)).toBe('Fear had her by the throat.');
    });
});

function ctxAnswering(answers: string[]): { ctx: PipelineRuntimeContext; calls: string[][] } {
    const calls: string[][] = [];
    const ctx = {
        getStory: () => ({
            genre: 'Gothic mystery',
            scenes: { '0': [{ title: 'The Ledger Room', pov_character: 'Mara Voss' }] }
        }),
        callAI: vi.fn(async (...args: string[]) => {
            calls.push(args);
            return answers[Math.min(calls.length - 1, answers.length - 1)];
        })
    } as unknown as PipelineRuntimeContext;
    return { ctx, calls };
}

describe('rewriting a passage', () => {
    const request: PassageRewriteRequest = { seqIdx: 0, sceneIdx: 0, text: SCENE, start: START, end: END, instruction: 'show, do not tell' };

    it('sends only the passage to be rewritten, with its neighbours for continuity', async () => {
        const { ctx, calls } = ctxAnswering(['<rewrite>Her pulse hammered against the collar of her coat.</rewrite>']);
        const result = await rewritePassage(ctx, request);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.text).toContain('The lamp guttered in the draught. Her pulse hammered against the collar of her coat. Outside,');
        expect(result.original).toBe(SCENE.slice(START, END));
        const [prompt, system, isJson, logName, role] = calls[0];
        expect(system).toBe(SAFEGUARD_PROMPTS.passageRewrite);
        expect(isJson).toBe(false);
        expect(logName).toBe('Passage Rewrite (Scene 1.1)');
        expect(role).toBe('prose');
        expect(prompt).toContain(`<passage>\n${SCENE.slice(START, END)}\n</passage>`);
        expect(prompt).toContain('<instruction>\nshow, do not tell\n</instruction>');
        expect(prompt).toContain('Point of view: Mara Voss');
        expect(prompt).toContain('Genre: Gothic mystery');
    });

    it('asks once more when the answer is unusable, then gives up without changing anything', async () => {
        const good = ctxAnswering([SCENE.slice(START, END), '<rewrite>Her pulse hammered.</rewrite>']);
        const fixed = await rewritePassage(good.ctx, request);
        expect(fixed.ok).toBe(true);
        expect(good.calls.length).toBe(2);
        expect(good.calls[1][0]).toContain('<previous_attempt_rejected>');

        const bad = ctxAnswering(['', '']);
        const failed = await rewritePassage(bad.ctx, request);
        expect(failed).toEqual({ ok: false, problem: 'The model returned nothing. The passage was left as it was.' });
        expect(bad.calls.length).toBe(2);
    });

    it('makes no call for an empty selection, and reports a failed call', async () => {
        const none = ctxAnswering(['x']);
        expect((await rewritePassage(none.ctx, { ...request, start: 3, end: 3 })).ok).toBe(false);
        expect(none.calls.length).toBe(0);

        const ctx = { getStory: () => ({}), callAI: vi.fn(async () => { throw new Error('API Error: 500'); }) } as unknown as PipelineRuntimeContext;
        expect(await rewritePassage(ctx, request)).toEqual({ ok: false, problem: 'API Error: 500' });
    });
});

describe('the rewrite bar', () => {
    const roots: Root[] = [];
    afterEach(() => {
        while (roots.length) {
            const root = roots.pop();
            act(() => root?.unmount());
        }
        document.body.innerHTML = '';
    });

    function mount(onRewrite: (r: PassageRewriteRequest) => Promise<PassageRewriteResult>) {
        let draftNow = SCENE;
        function Probe(): React.ReactElement {
            const [draft, setDraft] = useState(SCENE);
            const ref = useRef<HTMLTextAreaElement | null>(null);
            draftNow = draft;
            return (
                <div>
                    <textarea ref={ref} value={draft} onChange={(e) => setDraft(e.target.value)} />
                    <PassageRewriteBar seqIdx={0} sceneIdx={0} draft={draft} setDraft={setDraft} textareaRef={ref} onRewrite={onRewrite} />
                </div>
            );
        }
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        roots.push(root);
        act(() => root.render(<Probe />));
        const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
        return { host, draft: () => draftNow, button, box: () => host.querySelector('textarea')! };
    }

    it('rewrites the selection in the draft and can undo it', async () => {
        const onRewrite = vi.fn(async (req: PassageRewriteRequest): Promise<PassageRewriteResult> => {
            const rewrite = 'Her pulse hammered.';
            return {
                ok: true,
                text: req.text.slice(0, req.start) + rewrite + req.text.slice(req.end),
                start: req.start,
                end: req.start + rewrite.length,
                original: req.text.slice(req.start, req.end),
                rewrite
            };
        });
        const h = mount(onRewrite);
        h.box().setSelectionRange(START, END);
        await act(async () => { h.button('Rewrite Selection')!.click(); });
        expect(onRewrite).toHaveBeenCalledWith({ seqIdx: 0, sceneIdx: 0, text: SCENE, start: START, end: END, instruction: '' });
        expect(h.draft()).toContain('Her pulse hammered. Outside,');
        expect(h.host.textContent).toContain('Save Changes keeps it.');

        await act(async () => { h.button('Undo Rewrite')!.click(); });
        expect(h.draft()).toBe(SCENE);
        expect(h.button('Undo Rewrite')).toBeUndefined();
    });

    it('shows why nothing was rewritten and leaves the draft alone', async () => {
        const h = mount(async () => ({ ok: false, problem: 'Select the passage you want rewritten first.' }));
        await act(async () => { h.button('Rewrite Selection')!.click(); });
        expect(h.draft()).toBe(SCENE);
        expect(h.host.textContent).toContain('Select the passage you want rewritten first.');
    });
});
