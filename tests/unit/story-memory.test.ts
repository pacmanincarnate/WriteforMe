import { describe, expect, it } from 'vitest';
import {
    buildFallbackSceneDelta,
    createEmptyStoryMemory,
    findCompletedUnsummarizedActs,
    findCompletedUnsummarizedSequences,
    pruneStoryMemoryForSequence,
    renderStorySoFar,
    sanitizeScenePlotDelta,
    upsertSceneMemoryDelta
} from '@/domain/continuity';
import { migrateStoryToSequences } from '@/domain/lifecycle';
import { countWords } from '@/utils';

describe('StoryMemory (Telescoping Pyramid)', () => {
    it('sanitizeScenePlotDelta strips Continuity Bridge terminal spatial tags and XML wrappers', () => {
        const dirty = `<story_so_far>
- Maren confronted Tomas at the customs house.
- [TERMINAL SPATIAL & INTERACTION STATE]: Maren at East Pier holding brass key, Tomas blocked by iron gate.
- [Immediate Preceding Scene Handoff (1.1: Dockside)]:
### Heading
She pocketed the ledger before dawn.
</story_so_far>`;

        const clean = sanitizeScenePlotDelta(dirty);
        expect(clean).toContain('Maren confronted Tomas at the customs house.');
        expect(clean).toContain('She pocketed the ledger before dawn.');
        expect(clean).not.toContain('TERMINAL SPATIAL');
        expect(clean).not.toContain('Immediate Preceding Scene Handoff');
        expect(clean).not.toContain('<story_so_far>');
        expect(clean).not.toContain('###');
    });

    it('upsertSceneMemoryDelta invalidates stale sequence and act summaries on scene rewrite', () => {
        const mem = {
            acts: {
                '1': { actNumber: 1, title: 'Setup', summary: 'Old act summary.', updatedAt: 1 }
            },
            sequences: {
                '0': {
                    seqIdx: 0,
                    seqNumber: 1,
                    parentAct: 1,
                    title: 'Seq 1',
                    summary: 'Old seq summary.',
                    sceneCount: 2,
                    updatedAt: 1
                },
                '1': {
                    seqIdx: 1,
                    seqNumber: 2,
                    parentAct: 1,
                    title: 'Seq 2',
                    summary: 'Seq 2 summary stays intact.',
                    sceneCount: 1,
                    updatedAt: 1
                }
            },
            scenes: {
                '0-0': {
                    key: '0-0',
                    seqIdx: 0,
                    sceneIdx: 0,
                    sceneNumber: '1.1',
                    title: 'Opening',
                    synopsis: 'Original 1.1 synopsis.',
                    updatedAt: 1
                }
            }
        };

        const updated = upsertSceneMemoryDelta(mem, {
            key: '0-0',
            seqIdx: 0,
            sceneIdx: 0,
            sceneNumber: '1.1',
            title: 'Opening',
            synopsis: 'Rewritten 1.1 synopsis with new twist.',
            parentAct: 1,
            totalScenesInSeq: 2
        });

        expect(updated.scenes['0-0'].synopsis).toBe('Rewritten 1.1 synopsis with new twist.');
        expect(updated.sequences['0']).toBeUndefined();
        expect(updated.acts['1']).toBeUndefined();
        expect(updated.sequences['1'].summary).toBe('Seq 2 summary stays intact.');
    });

    it('pruneStoryMemoryForSequence removes only target sequence scenes/summary and parent act', () => {
        const mem = {
            acts: {
                '1': { actNumber: 1, title: 'Act 1', summary: 'Act 1 summary.', updatedAt: 1 },
                '2': { actNumber: 2, title: 'Act 2', summary: 'Act 2 summary.', updatedAt: 1 }
            },
            sequences: {
                '0': { seqIdx: 0, seqNumber: 1, parentAct: 1, title: 'S1', summary: 'S1', sceneCount: 1, updatedAt: 1 },
                '1': { seqIdx: 1, seqNumber: 2, parentAct: 1, title: 'S2', summary: 'S2', sceneCount: 1, updatedAt: 1 }
            },
            scenes: {
                '0-0': { key: '0-0', seqIdx: 0, sceneIdx: 0, sceneNumber: '1.1', title: 'A', synopsis: 'A', updatedAt: 1 },
                '1-0': { key: '1-0', seqIdx: 1, sceneIdx: 0, sceneNumber: '2.1', title: 'B', synopsis: 'B', updatedAt: 1 }
            }
        };

        const pruned = pruneStoryMemoryForSequence(mem, 1, 1);
        expect(pruned.scenes['1-0']).toBeUndefined();
        expect(pruned.sequences['1']).toBeUndefined();
        expect(pruned.acts['1']).toBeUndefined();
        expect(pruned.scenes['0-0']).toBeDefined();
        expect(pruned.sequences['0']).toBeDefined();
        expect(pruned.acts['2']).toBeDefined();
    });

    it('detects completed unsummarized sequences and acts accurately', () => {
        const story = {
            sequences: [
                { number: 1, parent_act: 1, title: 'S1' },
                { number: 2, parent_act: 1, title: 'S2' },
                { number: 3, parent_act: 2, title: 'S3' }
            ],
            scenes: {
                '0': [{ title: '1.1' }, { title: '1.2' }],
                '1': [{ title: '2.1' }],
                '2': [{ title: '3.1' }, { title: '3.2' }]
            },
            prose: {
                '0-0': { final: 'Done.' },
                '0-1': { final: 'Done.' },
                '1-0': { final: 'Done.' },
                '2-0': { final: 'Done.' }
            }
        };

        const emptyMem = createEmptyStoryMemory();
        expect(findCompletedUnsummarizedSequences(story, emptyMem)).toEqual([0, 1]);
        expect(findCompletedUnsummarizedActs(story, emptyMem)).toEqual([]);

        const withSeqSummaries = {
            ...emptyMem,
            sequences: {
                '0': { seqIdx: 0, seqNumber: 1, parentAct: 1, title: 'S1', summary: 'Summary 1.', sceneCount: 2, updatedAt: 1 },
                '1': { seqIdx: 1, seqNumber: 2, parentAct: 1, title: 'S2', summary: 'Summary 2.', sceneCount: 1, updatedAt: 1 }
            }
        };
        expect(findCompletedUnsummarizedSequences(story, withSeqSummaries)).toEqual([]);
        expect(findCompletedUnsummarizedActs(story, withSeqSummaries)).toEqual([1]);
    });

    it('renders a bounded telescoping pyramid across 3 Acts and 8 Sequences well under 1200 words', () => {
        const sequences = Array.from({ length: 8 }, (_, idx) => ({
            number: idx + 1,
            parent_act: idx < 2 ? 1 : idx < 6 ? 2 : 3,
            title: idx === 6 ? 'Climax' : `Sequence ${idx + 1}`
        }));
        const scenes: Record<string, Array<{ title: string }>> = {};
        const prose: Record<string, { final: string }> = {};
        for (let sq = 0; sq < 8; sq++) {
            scenes[String(sq)] = Array.from({ length: 4 }, (__, sc) => ({
                title: `Scene ${sq + 1}.${sc + 1}`
            }));
            for (let sc = 0; sc < 4; sc++) {
                if (sq < 7 || sc < 2) {
                    prose[`${sq}-${sc}`] = { final: 'Drafted prose.' };
                }
            }
        }

        const actParagraph = Array(200).fill('word').join(' ');
        const seqParagraph = Array(130).fill('seq').join(' ');
        const memory = {
            acts: {
                '1': { actNumber: 1, title: 'Setup', summary: actParagraph, updatedAt: 1 },
                '2': { actNumber: 2, title: 'Escalation', summary: actParagraph, updatedAt: 1 }
            },
            sequences: {
                '0': { seqIdx: 0, seqNumber: 1, parentAct: 1, title: 'S1', summary: seqParagraph, sceneCount: 4, updatedAt: 1 },
                '6': { seqIdx: 6, seqNumber: 7, parentAct: 3, title: 'Climax', summary: seqParagraph, sceneCount: 4, updatedAt: 1 }
            },
            scenes: {
                '0-0': { key: '0-0', seqIdx: 0, sceneIdx: 0, sceneNumber: '1.1', title: 'Old', synopsis: 'Hidden by Act 1.', updatedAt: 1 },
                '6-0': { key: '6-0', seqIdx: 6, sceneIdx: 0, sceneNumber: '7.1', title: 'Old7', synopsis: 'Hidden by Seq 7.', updatedAt: 1 },
                '7-0': { key: '7-0', seqIdx: 7, sceneIdx: 0, sceneNumber: '8.1', title: 'Aftermath', synopsis: 'Maren returned the ledger to the harbor bell.', updatedAt: 1 },
                '7-1': { key: '7-1', seqIdx: 7, sceneIdx: 1, sceneNumber: '8.2', title: 'Dawn', synopsis: 'The town rebuilt the lighthouse.', updatedAt: 1 }
            }
        };

        const rendered = renderStorySoFar(memory, {
            acts: [
                { number: 1, title: 'Setup' },
                { number: 2, title: 'Escalation' },
                { number: 3, title: 'Resolution' }
            ],
            sequences,
            scenes,
            prose
        });

        expect(rendered).toContain('[Act 1 — Setup]:');
        expect(rendered).toContain('[Act 2 — Escalation]:');
        expect(rendered).toContain('[Sequence 7 — Climax]:');
        expect(rendered).toContain('Scene 8.1 (Aftermath)');
        expect(rendered).not.toContain('Hidden by Act 1.');
        expect(rendered).not.toContain('Hidden by Seq 7.');
        expect(countWords(rendered)).toBeLessThan(650);
    });

    it('migration cleans stale terminal spatial tags and clears story_memory when no prose is drafted', () => {
        const emptyStory = migrateStoryToSequences({
            id: 'empty_mig',
            story_so_far: 'Should be cleared',
            story_memory: {
                acts: { '1': { actNumber: 1, title: 'A', summary: 'Old', updatedAt: 1 } },
                sequences: {},
                scenes: {}
            },
            prose: {}
        });
        expect(emptyStory.story_so_far).toBe('');
        expect(emptyStory.story_memory?.acts).toEqual({});

        const draftedLegacy = migrateStoryToSequences({
            id: 'drafted_mig',
            story_so_far:
                '- Maren entered the vault.\n- [TERMINAL SPATIAL & INTERACTION STATE]: Maren inside vault.',
            prose: { '0-0': { final: 'She turned the brass latch.' } }
        } as Record<string, unknown>);
        expect(draftedLegacy.story_so_far).toBe('- Maren entered the vault.');
        expect((draftedLegacy.story_memory as { manualBaseText?: string }).manualBaseText).toBe(
            '- Maren entered the vault.'
        );
    });

    it('buildFallbackSceneDelta produces clean non-empty narrative summary from blueprint fields', () => {
        const delta = buildFallbackSceneDelta(
            {
                number: '1.1',
                title: 'Pier Check',
                pov_character: 'Maren',
                objective: 'Inspect the night watch log',
                value_shift: { start_state: 'Calm', end_state: 'Alarmed' },
                exit_hook: 'Three pages are torn out'
            },
            0,
            0
        );
        expect(delta.length).toBeGreaterThanOrEqual(25);
        expect(delta).toContain('Maren');
        expect(delta).toContain('Inspect the night watch log');
        expect(delta).toContain('Three pages are torn out');
    });
});
