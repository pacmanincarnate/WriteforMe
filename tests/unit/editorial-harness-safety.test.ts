/**
 * The editorial harness rewrites the author's prose, so these tests pin the rules that keep it
 * from damaging text: stale spans are skipped (never paragraph-overwritten), unreadable model
 * replies are retried instead of swapped for a regex edit, the arbiter fails closed and sees the
 * voice it judges against, slop tickets must really remove the slop, and merges / reverts only
 * ever touch the scenes the harness changed.
 */
import { describe, expect, it, vi } from 'vitest';
import {
    applyManuscriptPatchToScene,
    buildDeterministicSurgicalRepair,
    compileGateFailureFeedback,
    conveneAdversarialTribunal,
    getDraftedStoryScenesList,
    parsePatchArbiterVerdict,
    parseTribunalRubric,
    runFourGateVerificationSuite,
    runSceneNlpTelemetry,
    toSimplePast,
    type EditorialStoryInput,
    type InvestigationDossier
} from '@/domain/editorial';
import {
    buildEditorPatchPrompt,
    buildPreRunProseSnapshot,
    executeSingleHarnessTransaction,
    revertAllHarnessTransactions,
    runAutonomousEditorialHarness,
    undoCommittedSpan,
    type ExtendedEditPlanTransaction
} from '@/pipeline/editorialHarness';
import type { CallAiFn, PipelineRuntimeContext, PipelineStory } from '@/pipeline';
import { DEFAULT_SLOP_CONFIG } from '@/domain/slop';

const PARA_1 = 'Elena crossed the damp cobblestones toward the harbor lantern.';
const PARA_2 =
    'The ledger sat open on the crate. Marcus kept his hands in his coat and watched the water.';

function makeStory(prose: Record<string, unknown>): PipelineStory {
    return {
        id: 'harness_safety_story',
        writing_mode: 'novel',
        cast: [{ id: 'c_elena', name: 'Elena Vance', role: 'Protagonist' }],
        acts: [{ number: 1, title: 'Low Tide' }],
        sequences: [{ number: 1, parent_act: 1, title: 'Pier' }],
        scenes: {
            '0': [
                { number: '1.1', title: 'Lantern', pov_character: 'Elena Vance' },
                { number: '1.2', title: 'Ledger', pov_character: 'Elena Vance' }
            ]
        },
        prose
    } as PipelineStory;
}

function firstScene(story: PipelineStory) {
    const scene = getDraftedStoryScenesList(story as unknown as EditorialStoryInput)[0];
    if (!scene) throw new Error('fixture has no drafted scene');
    return scene;
}

function makeTx(overrides: Partial<ExtendedEditPlanTransaction> = {}): ExtendedEditPlanTransaction {
    return {
        transactionId: 'tx_test_1',
        wave: 'WAVE_3_MICRO',
        sceneId: 'sc_0_0',
        displayCoord: '1.1',
        startAnchor: 'sc_0_0:p2',
        endAnchor: 'sc_0_0:p2',
        verbatimOriginal: PARA_2,
        priorityScore: 60,
        tickets: [],
        combinedDirective: 'Sharpen the paragraph.',
        combinedProblem: 'Flat rhythm.',
        status: 'PENDING',
        gateResults: null,
        patchedXml: null,
        patchedProseSpan: null,
        ...overrides
    };
}

function makeCtx(initial: PipelineStory, callAI: CallAiFn, useLLM = false) {
    let story = initial;
    const toasts: Array<{ message: string; variant?: string }> = [];
    const ctx = {
        getStory: () => story,
        setStory: (u: PipelineStory | ((p: PipelineStory) => PipelineStory)) => {
            story = typeof u === 'function' ? u(story) : u;
            return story;
        },
        showToast: (message: string, variant?: string) => toasts.push({ message, variant }),
        setLoading: vi.fn(),
        setLoadingStep: vi.fn(),
        setActivePipelineWork: vi.fn(),
        setCurrentPipelineStep: vi.fn(),
        setIsRunningEditorialHarness: vi.fn(),
        setEditorialHarnessPhase: vi.fn(),
        setEditorialHarnessProgress: vi.fn(),
        getEditorialScopeSceneId: () => 'ALL',
        getEditorialUseDeepLLM: () => useLLM,
        getBannedPhrases: () => [],
        getSlopConfig: () => DEFAULT_SLOP_CONFIG,
        callAI
    } as unknown as PipelineRuntimeContext;
    return { ctx, toasts, getStory: () => story };
}

const finalOf = (story: PipelineStory, key: string): string =>
    String((story.prose as Record<string, { final?: string }>)[key]?.final || '');

describe('patch application', () => {
    it('skips an edit whose span is gone instead of overwriting the paragraph', () => {
        const story = makeStory({ '0-0': { final: `${PARA_1}\n\n${PARA_2}` } });
        const scene = firstScene(story);
        const tx = makeTx({ verbatimOriginal: 'A sentence that was rewritten by an earlier edit.' });
        const reply =
            '<ManuscriptPatchTransaction><PatchOperation type="REPLACE_SPAN"><ReplacementSpan>One short line.</ReplacementSpan></PatchOperation></ManuscriptPatchTransaction>';

        const res = applyManuscriptPatchToScene(scene, tx, reply, story as EditorialStoryInput);

        expect(res.success).toBe(false);
        expect(res.stale).toBe(true);
        expect(res.updatedFullProse).toBeUndefined();
    });

    it('fails the round on an unreadable reply instead of committing a regex edit', () => {
        const story = makeStory({ '0-0': { final: `${PARA_1}\n\n${PARA_2}` } });
        const res = applyManuscriptPatchToScene(
            firstScene(story),
            makeTx(),
            'Sure! I made the paragraph punchier.',
            story as EditorialStoryInput
        );
        expect(res.success).toBe(false);
        expect(res.unreadableReply).toBe(true);

        const feedback = compileGateFailureFeedback({
            gates: [{ gate: 'Gate 1: NSG & XML Schema Validator', passed: false, details: `Gate 1 failed: ${res.error}` }]
        });
        expect(feedback.correction).toContain('<ReplacementSpan>');
    });

    it('treats a misquoted verifier as a bad reply, not a stale span', () => {
        const story = makeStory({ '0-0': { final: `${PARA_1}\n\n${PARA_2}` } });
        const reply = `<ManuscriptPatchTransaction><PatchOperation type="REPLACE_SPAN">
  <OriginalSpanVerifier>The ledger was open on a crate.</OriginalSpanVerifier>
  <ReplacementSpan>The ledger lay splayed on the crate.</ReplacementSpan>
</PatchOperation></ManuscriptPatchTransaction>`;
        const res = applyManuscriptPatchToScene(firstScene(story), makeTx(), reply, story as EditorialStoryInput);
        expect(res.success).toBe(false);
        expect(res.stale).toBeFalsy();
        expect(res.unreadableReply).toBe(true);
    });

    it('still splices a sentence-level edit inside the ticket paragraph', () => {
        const story = makeStory({ '0-0': { final: `${PARA_1}\n\n${PARA_2}` } });
        const reply = `<ManuscriptPatchTransaction><PatchOperation type="REPLACE_SPAN">
  <OriginalSpanVerifier>The ledger sat open on the crate.</OriginalSpanVerifier>
  <ReplacementSpan>The ledger lay splayed on the crate, pages lifting.</ReplacementSpan>
</PatchOperation></ManuscriptPatchTransaction>`;
        const res = applyManuscriptPatchToScene(firstScene(story), makeTx(), reply, story as EditorialStoryInput);
        expect(res.success).toBe(true);
        expect(res.updatedFullProse).toContain(PARA_1);
        expect(res.updatedFullProse).toContain('pages lifting. Marcus kept his hands in his coat');
    });
});

describe('offline repair grammar', () => {
    it('conjugates verbs properly', () => {
        expect(toSimplePast('smile')).toBe('smiled');
        expect(toSimplePast('run')).toBe('ran');
        expect(toSimplePast('cry')).toBe('cried');
        expect(toSimplePast('Laugh')).toBe('Laughed');
        expect(buildDeterministicSurgicalRepair("She couldn't help but smile at him.")).toBe(
            'She smiled at him.'
        );
        expect(buildDeterministicSurgicalRepair('He started to run for the door.', {}, 2)).toBe(
            'He ran for the door.'
        );
    });

    it('keeps "the" lowercase mid-sentence when removing a filter verb', () => {
        expect(buildDeterministicSurgicalRepair('Then she saw the door swing open.')).toBe(
            'Then the door swing open.'
        );
        expect(buildDeterministicSurgicalRepair('She saw the door swing open.')).toBe(
            'The door swing open.'
        );
    });

    it('does not lowercase "I" or names when joining sentences', () => {
        expect(buildDeterministicSurgicalRepair('The rain stopped. I went out.', {}, 3)).toBe(
            'The rain stopped. I went out.'
        );
        expect(buildDeterministicSurgicalRepair('The rain stopped. Marcus went out.', {}, 3)).toBe(
            'The rain stopped. Marcus went out.'
        );
        expect(buildDeterministicSurgicalRepair('The rain stopped. The street steamed.', {}, 3)).toBe(
            'The rain stopped, and the street steamed.'
        );
    });
});

describe('Gate 4 patch arbiter', () => {
    it('rejects replies with no verdict, unresolved tickets, or a low voice score', () => {
        expect(parsePatchArbiterVerdict('Looks good to me!').approved).toBe(false);
        expect(parsePatchArbiterVerdict('Looks good to me!').reason).toBe('unreadable');
        expect(
            parsePatchArbiterVerdict(
                '<PatchArbiterVerdict verdict="APPROVE_COMMIT"><TicketResolutionCheck resolved="FALSE" notes="x" /></PatchArbiterVerdict>'
            ).reason
        ).toBe('unresolved');
        expect(
            parsePatchArbiterVerdict(
                '<PatchArbiterVerdict verdict="APPROVE_COMMIT"><VoiceFidelityScore score_0_to_10="3" /></PatchArbiterVerdict>'
            ).reason
        ).toBe('low_voice_score');
        const ok = parsePatchArbiterVerdict(
            '<PatchArbiterVerdict verdict="APPROVE_COMMIT"><TicketResolutionCheck resolved="TRUE" /><VoiceFidelityScore score_0_to_10="8" /></PatchArbiterVerdict>'
        );
        expect(ok.approved).toBe(true);
        expect(ok.voiceFidelityScore).toBe(8);
    });

    it('gives the arbiter the voice DNA and constitution, and skips it when Gate 1 already failed', async () => {
        const story = makeStory({ '0-0': { final: `${PARA_1}\n\n${PARA_2}` } });
        const scene = firstScene(story);
        const baseline = runSceneNlpTelemetry(scene, story as EditorialStoryInput, [], DEFAULT_SLOP_CONFIG);
        const arbiter = vi.fn(
            async () =>
                '<PatchArbiterVerdict verdict="APPROVE_COMMIT"><VoiceFidelityScore score_0_to_10="8" /></PatchArbiterVerdict>'
        );
        const reply = `<ManuscriptPatchTransaction><PatchOperation type="REPLACE_SPAN">
  <OriginalSpanVerifier>The ledger sat open on the crate.</OriginalSpanVerifier>
  <ReplacementSpan>The ledger lay splayed on the crate.</ReplacementSpan>
</PatchOperation></ManuscriptPatchTransaction>`;
        const patched = applyManuscriptPatchToScene(scene, makeTx(), reply, story as EditorialStoryInput);
        const suite = await runFourGateVerificationSuite({
            sceneItem: scene,
            patchedResult: patched,
            transaction: makeTx(),
            baselineTelemetry: baseline,
            story: story as EditorialStoryInput,
            voiceDna: { xml: '<AuthorVoiceDNA marker="voice-sent" />' } as never,
            constitution: { xml: '<AestheticConstitution marker="constitution-sent" />' } as never,
            callAIFn: arbiter,
            useLLM: true,
            slopConfig: DEFAULT_SLOP_CONFIG
        });
        expect(suite.allPassed).toBe(true);
        const prompt = String((arbiter.mock.calls[0] as unknown[])[0]);
        expect(prompt).toContain('voice-sent');
        expect(prompt).toContain('constitution-sent');

        arbiter.mockClear();
        const failed = await runFourGateVerificationSuite({
            sceneItem: scene,
            patchedResult: { success: false, error: 'nope' },
            transaction: makeTx(),
            baselineTelemetry: baseline,
            story: story as EditorialStoryInput,
            callAIFn: arbiter,
            useLLM: true
        });
        expect(failed.allPassed).toBe(false);
        expect(arbiter).not.toHaveBeenCalled();
    });

    it('does not commit when the arbiter call fails', async () => {
        const story = makeStory({ '0-0': { final: `${PARA_1}\n\n${PARA_2}` } });
        const scene = firstScene(story);
        const reply =
            '<ManuscriptPatchTransaction><PatchOperation type="REPLACE_SPAN"><OriginalSpanVerifier>The ledger sat open on the crate.</OriginalSpanVerifier><ReplacementSpan>The ledger lay splayed on the crate.</ReplacementSpan></PatchOperation></ManuscriptPatchTransaction>';
        const suite = await runFourGateVerificationSuite({
            sceneItem: scene,
            patchedResult: applyManuscriptPatchToScene(scene, makeTx(), reply, story as EditorialStoryInput),
            transaction: makeTx(),
            baselineTelemetry: runSceneNlpTelemetry(scene, story as EditorialStoryInput, [], DEFAULT_SLOP_CONFIG),
            story: story as EditorialStoryInput,
            callAIFn: vi.fn(async () => {
                throw new Error('network down');
            }),
            useLLM: true
        });
        expect(suite.allPassed).toBe(false);
        expect(suite.gates[3].details).toContain('network down');
    });
});

describe('Gate 2 slop tickets', () => {
    it('fails a slop ticket whose flagged phrase is still in the paragraph', async () => {
        const slopPara = 'Her silence was a testament to years of grief, and the lamp hissed.';
        const story = makeStory({ '0-0': { final: `${PARA_1}\n\n${slopPara}` } });
        const scene = firstScene(story);
        const baseline = runSceneNlpTelemetry(scene, story as EditorialStoryInput, [], DEFAULT_SLOP_CONFIG);
        expect(baseline.slopViolations.some((v) => /testament/i.test(v.phrase))).toBe(true);

        const tx = makeTx({
            verbatimOriginal: slopPara,
            tickets: [{ category: 'FORBIDDEN_SLOP_PHRASE' }] as never
        });
        const reply = `<ManuscriptPatchTransaction><PatchOperation type="REPLACE_SPAN"><ReplacementSpan>Her silence was a testament to years of grief, and the old lamp hissed.</ReplacementSpan></PatchOperation></ManuscriptPatchTransaction>`;
        const suite = await runFourGateVerificationSuite({
            sceneItem: scene,
            patchedResult: applyManuscriptPatchToScene(scene, tx, reply, story as EditorialStoryInput),
            transaction: tx,
            baselineTelemetry: baseline,
            story: story as EditorialStoryInput,
            useLLM: false,
            slopConfig: DEFAULT_SLOP_CONFIG
        });
        expect(suite.gates[1].passed).toBe(false);
        expect(suite.gates[1].details).toContain('Ticket not resolved');
        expect(compileGateFailureFeedback(suite).correction).toContain('Remove the flagged phrase');
    });
});

describe('tribunal', () => {
    const dossier: InvestigationDossier = {
        id: 'dos_1',
        hypothesisId: 'hyp_1',
        category: 'CADENCE_OR_ECHO_DEFECT',
        proposedWave: 'WAVE_3_MICRO',
        sceneId: 'sc_0_0',
        displayCoord: '1.1',
        startAnchor: 'sc_0_0:p2',
        endAnchor: 'sc_0_0:p2',
        rootCauseAnalysis: 'Investigator analysis.',
        citedEvidence: [{ sourceTool: 'read_scene_span', anchor: 'sc_0_0:p2', verbatimQuote: PARA_2 }],
        proposedRemediation: 'Investigator remedy.',
        layer0Divergence: 0.4
    };

    it('reads rubric scores in any attribute order', () => {
        expect(parseTribunalRubric(`<RubricScores R='2' C="3" D="4" I="5" E="1" />`)).toEqual({
            E: 1, I: 5, D: 4, C: 3, R: 2
        });
        expect(parseTribunalRubric('<RubricScores E="4" />')).toBeNull();
    });

    it("uses the judge's ticket text and lets a judge veto stand", async () => {
        const approve = vi.fn(
            async () => `<TribunalDeliberationList><TribunalCase><JudgeRuling verdict="APPROVED_FOR_COMPILATION">
<RubricScores R="5" C="5" D="5" I="5" E="5" /><AnchoredEditorialTicket>
<ProblemStatement>Judge problem.</ProblemStatement><SurgicalDirective>Judge directive; keep the coat detail.</SurgicalDirective>
</AnchoredEditorialTicket></JudgeRuling></TribunalCase></TribunalDeliberationList>`
        );
        const approved = await conveneAdversarialTribunal([dossier], null, null, null, approve, true);
        expect(approved.verifiedTickets[0].surgicalDirective).toBe('Judge directive; keep the coat detail.');
        expect(approved.verifiedTickets[0].problemStatement).toBe('Judge problem.');

        const veto = vi.fn(
            async () =>
                '<JudgeRuling verdict="VETOED_FALSE_POSITIVE"><RubricScores E="5" I="5" D="5" C="5" R="5" /></JudgeRuling>'
        );
        const vetoed = await conveneAdversarialTribunal([dossier], null, null, null, veto, true);
        expect(vetoed.verifiedTickets).toHaveLength(0);
        expect(vetoed.tribunalCases[0].verdict).toBe('VETOED_FALSE_POSITIVE');
    });
});

describe('editor prompt', () => {
    it('keeps "]]>" in prose from closing the CDATA section', () => {
        const story = makeStory({ '0-0': { final: `${PARA_1}\n\n${PARA_2}` } });
        const prompt = buildEditorPatchPrompt({
            tx: makeTx({ verbatimOriginal: 'Code: a[b[0]]> c' }),
            sceneItem: firstScene(story),
            voiceXml: '',
            constitutionXml: '',
            attempt: 1,
            attemptHistory: []
        });
        expect(prompt).toContain('<![CDATA[Code: a[b[0]]]]><![CDATA[> c]]>');
    });
});

describe('merging, re-running and reverting', () => {
    const slopScene = (extra: string) =>
        `${PARA_1}\n\nHer silence was a testament to years of grief.${extra}`;

    it("keeps a second run's commits in a scene the first run already edited", async () => {
        const { ctx, getStory } = makeCtx(makeStory({ '0-0': { final: slopScene('') } }), vi.fn());

        await runAutonomousEditorialHarness(ctx, { useLLM: false });
        const afterFirst = finalOf(getStory(), '0-0');
        expect(afterFirst).not.toContain('testament to');

        // The author adds a new cliché to the same scene and runs the harness again.
        const edited = `${afterFirst}\n\nThe bell tolled, a testament to the town's patience.`;
        ctx.setStory((prev) => ({ ...prev, prose: { '0-0': { final: edited } } }));
        const state = await runAutonomousEditorialHarness(ctx, { useLLM: false });

        const afterSecond = finalOf(getStory(), '0-0');
        expect(afterSecond).not.toContain('testament to');
        expect(afterSecond).toContain('The bell tolled');
        expect(state?.summary.committedTransactions).toBeGreaterThan(0);
        expect(state?.touchedProseKeys).toEqual(['0-0']);
    });

    it("keeps the author's text when the scene changes mid-run, and says so", async () => {
        const authorText = 'The author rewrote this scene while the harness was busy.';
        let holder: { ctx: PipelineRuntimeContext } | null = null;
        const callAI = vi.fn(async (prompt: string) => {
            if (prompt.includes('<AtomicEditTransaction')) {
                holder?.ctx.setStory((prev) => ({ ...prev, prose: { '0-0': { final: authorText } } }));
                return '<ManuscriptPatchTransaction><PatchOperation type="REPLACE_SPAN"><ReplacementSpan>Her silence held years of grief.</ReplacementSpan></PatchOperation></ManuscriptPatchTransaction>';
            }
            if (prompt.includes('VersionB_Patched')) {
                return '<PatchArbiterVerdict verdict="APPROVE_COMMIT"><VoiceFidelityScore score_0_to_10="8" /></PatchArbiterVerdict>';
            }
            return '';
        });
        const made = makeCtx(makeStory({ '0-0': { final: slopScene('') } }), callAI, true);
        holder = made;

        const state = await runAutonomousEditorialHarness(made.ctx, { useLLM: true });

        expect(finalOf(made.getStory(), '0-0')).toBe(authorText);
        const txs = (state?.editPlan?.waves || []).flatMap((w) => w.transactions);
        expect(txs.some((tx) => tx.status === 'SKIPPED_CONFLICT')).toBe(true);
        expect(state?.summary.committedTransactions).toBe(0);
    });

    it('re-running a committed edit starts from the pre-edit text', async () => {
        const { ctx, getStory } = makeCtx(makeStory({ '0-0': { final: slopScene('') } }), vi.fn());
        const state = await runAutonomousEditorialHarness(ctx, { useLLM: false });
        const committed = (state?.editPlan?.waves || [])
            .flatMap((w) => w.transactions as ExtendedEditPlanTransaction[])
            .find((tx) => tx.status === 'COMMITTED');
        expect(committed).toBeTruthy();
        const before = finalOf(getStory(), '0-0');

        await executeSingleHarnessTransaction(ctx, committed!.transactionId);

        const after = finalOf(getStory(), '0-0');
        // The first paragraph is untouched either way: the old re-run replaced whole paragraphs.
        expect(after.startsWith(PARA_1)).toBe(true);
        expect(after.split('\n\n')).toHaveLength(before.split('\n\n').length);
        expect(after).not.toContain('testament to');
    });

    it('undoes one edit without discarding other changes to the scene', () => {
        const tx = {
            beforeProse: 'A one. B one.',
            afterProse: 'A two. B one.',
            beforeSpan: 'A one.',
            afterSpan: 'A two.'
        };
        expect(undoCommittedSpan('A two. B one.', tx)).toBe('A one. B one.');
        expect(undoCommittedSpan('A two. B three.', tx)).toBe('A one. B three.');
        expect(undoCommittedSpan('A two. A two.', tx)).toBeNull();
        expect(undoCommittedSpan('Totally different.', tx)).toBeNull();
    });

    it('"Revert all" restores only the scenes the harness edited', async () => {
        const { ctx, getStory } = makeCtx(
            makeStory({ '0-0': { final: slopScene('') }, '0-1': { final: PARA_2 } }),
            vi.fn()
        );
        await runAutonomousEditorialHarness(ctx, { useLLM: false });
        expect(finalOf(getStory(), '0-0')).not.toContain('testament to');

        // A scene written after the harness ran, and a hand edit to an untouched scene.
        ctx.setStory((prev) => ({
            ...prev,
            prose: {
                ...(prev.prose as Record<string, unknown>),
                '0-1': { final: 'Hand-edited later.' },
                '0-2': { final: 'Written after the harness.' }
            }
        }));
        await revertAllHarnessTransactions(ctx);

        expect(finalOf(getStory(), '0-0')).toBe(slopScene(''));
        expect(finalOf(getStory(), '0-1')).toBe('Hand-edited later.');
        expect(finalOf(getStory(), '0-2')).toBe('Written after the harness.');
    });

    it('snapshots each scene fresh unless earlier harness edits are still live in it', () => {
        const snap = buildPreRunProseSnapshot(
            { a: { final: 'a-original' }, b: { final: 'b-ancient' } },
            ['a'],
            { a: { final: 'a-edited' }, b: { final: 'b-now' }, c: { final: 'c-new' } }
        );
        expect(snap).toEqual({
            a: { final: 'a-original' },
            b: { final: 'b-now' },
            c: { final: 'c-new' }
        });
    });
});
