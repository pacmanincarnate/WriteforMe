import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CACHE_POINT,
    cacheOrderProblems,
    splitAtCachePoint,
    takeCachePoint
} from '@/domain/prompt/cacheLayout';
import { dispatchAI } from '@/pipeline/aiDispatch';
import { buildProseContext } from '@/pipeline/proseContext';
import { buildAnthropicRequest, callOpenRouter } from '@/services/llm';
import { useFeatureOptionsStore } from '@/stores';

const long = (word: string, times: number): string => `${word} `.repeat(times);

describe('the cache point', () => {
    it('is taken out of a prompt and reported as a position', () => {
        const start = long('rules', 300);
        const { prompt, cacheSplitIndex } = takeCachePoint(`${start}${CACHE_POINT}Now write.`);
        expect(prompt).toBe(`${start}Now write.`);
        expect(cacheSplitIndex).toBe(start.length);
        expect(prompt.slice(0, cacheSplitIndex as number)).toBe(start);
    });

    it('uses the last mark when there are several, and none when the start is too short', () => {
        const a = long('a', 600);
        const b = long('b', 600);
        const twice = takeCachePoint(`${a}${CACHE_POINT}${b}${CACHE_POINT}tail`);
        expect(twice.prompt).toBe(`${a}${b}tail`);
        expect(twice.cacheSplitIndex).toBe(a.length + b.length);
        expect(takeCachePoint(`short${CACHE_POINT}tail`)).toEqual({ prompt: 'shorttail', cacheSplitIndex: null });
        expect(takeCachePoint(`${a}${CACHE_POINT}`).cacheSplitIndex).toBeNull();
        expect(takeCachePoint('plain')).toEqual({ prompt: 'plain', cacheSplitIndex: null });
    });

    it('splits text only at a usable position', () => {
        const text = long('x', 1000);
        expect(splitAtCachePoint(text, 1500)).toEqual([text.slice(0, 1500), text.slice(1500)]);
        expect(splitAtCachePoint(text, 100)).toBeNull();
        expect(splitAtCachePoint(text, text.length)).toBeNull();
        expect(splitAtCachePoint(text, null)).toBeNull();
        expect(splitAtCachePoint(text, Number.NaN)).toBeNull();
    });
});

describe('cache order', () => {
    it('accepts slow-changing sections first and names one that is out of place', () => {
        expect(cacheOrderProblems('<world_primer>a</world_primer><story_so_far>b</story_so_far><scene_blueprint>c')).toEqual([]);
        const problems = cacheOrderProblems('<story_so_far>b</story_so_far><active_characters_profiles>c');
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('<active_characters_profiles> changes only when the people in the scene change');
        expect(problems[0]).toContain('comes after <story_so_far>, which changes with every scene');
        expect(cacheOrderProblems('no sections here')).toEqual([]);
    });
});

describe('the scene-writing prompt', () => {
    const story = {
        id: 'story-1',
        title: 'The Marrow',
        style: { genre: 'Literary', tone: 'Dry' },
        story_so_far: 'Ilse took the ferry out.',
        world_primer: long('The river floods.', 20),
        cast: [
            { id: 'c1', name: 'Ilse Varga', role: 'Protagonist', core_flaw: 'Pride', core_desire: 'Rest', details: { deep_profile: long('I tie knots.', 10) } }
        ],
        sequences: [{ number: 1, title: 'Crossing' }],
        scenes: { '0': [{ number: '1.1', title: 'Night ferry', objective: 'Cross.', active_characters: ['Ilse Varga'] }] },
        relationships: {},
        lore: []
    };
    const build = (extra: Record<string, unknown> = {}): string =>
        buildProseContext({ storyToUse: story as never, seq: 0, s: 0, activeCast: story.cast as never, ...extra });

    beforeEach(() => useFeatureOptionsStore.getState().setOption('promptCacheMarks', true));
    afterEach(() => useFeatureOptionsStore.getState().setOption('promptCacheMarks', true));

    it('is in cache order, with the cast ahead of the story so far', () => {
        const prompt = build();
        expect(cacheOrderProblems(prompt)).toEqual([]);
        expect(prompt.indexOf('<active_characters_profiles>')).toBeGreaterThan(-1);
        expect(prompt.indexOf('<active_characters_profiles>')).toBeLessThan(prompt.indexOf('<story_so_far>'));
        expect(prompt.indexOf('<story_so_far>')).toBeLessThan(prompt.indexOf('<scene_blueprint>'));
    });

    it('repeats its start, letter for letter, when the same scene is revised', () => {
        const draft = takeCachePoint(build());
        const revision = takeCachePoint(
            build({ existingProseText: 'The ferry left late.', existingCritique: 'Too slow.', dInst: 'Make it tenser.' })
        );
        expect(draft.cacheSplitIndex).not.toBeNull();
        expect(revision.cacheSplitIndex).toBe(draft.cacheSplitIndex);
        const at = draft.cacheSplitIndex as number;
        expect(revision.prompt.slice(0, at)).toBe(draft.prompt.slice(0, at));
        // Everything that changes with the call is after the mark.
        expect(revision.prompt.indexOf('<current_scene_prior_draft_context>')).toBeGreaterThanOrEqual(at);
        expect(revision.prompt.indexOf('<directive_requirement>')).toBeGreaterThan(at);
        expect(revision.prompt.indexOf('<scene_blueprint>')).toBeLessThan(at);
    });

    it('leaves the mark out when the option is off', () => {
        useFeatureOptionsStore.getState().setOption('promptCacheMarks', false);
        expect(build()).not.toContain(CACHE_POINT);
    });
});

describe('what the services are told', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        delete (window as unknown as { __callAIOverride?: unknown }).__callAIOverride;
    });

    it('never passes the mark itself on', async () => {
        const seen: string[] = [];
        (window as unknown as { __callAIOverride?: unknown }).__callAIOverride = async (prompt: string) => {
            seen.push(prompt);
            return 'ok';
        };
        const start = long('rules', 300);
        await dispatchAI({ prompt: `${start}${CACHE_POINT}Now write.`, isJson: false } as never, {} as never);
        expect(seen).toEqual([`${start}Now write.`]);
    });

    const opening = `${long('context', 400)}Now write.`;
    const history = [
        { role: 'system' as const, content: 'System' },
        { role: 'user' as const, content: opening },
        { role: 'assistant' as const, content: 'Checking the lore.' },
        { role: 'user' as const, content: 'Go on.' }
    ];

    it('Claude: the opening message of a conversation gets the mark, later messages do not', () => {
        const req = buildAnthropicRequest('claude-opus-5-5', '', 'System', { messages: history, cacheSplitIndex: 3200 });
        expect(req.messages[0].content).toEqual([
            { type: 'text', text: opening.slice(0, 3200), cache_control: { type: 'ephemeral' } },
            { type: 'text', text: opening.slice(3200) }
        ]);
        expect(req.messages[2].content).toEqual([{ type: 'text', text: 'Go on.' }]);
        const plain = buildAnthropicRequest('claude-opus-5-5', '', 'System', { messages: history });
        expect(plain.messages[0].content).toEqual([{ type: 'text', text: opening }]);
    });

    it('OpenRouter: the same, for a model that takes cache marks', async () => {
        const bodies: Array<{ messages: Array<{ role: string; content: unknown }> }> = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
                if (String(url).includes('/endpoints')) {
                    return new Response(JSON.stringify({ data: { endpoints: [] } }), { status: 200 });
                }
                bodies.push(JSON.parse(String(init?.body || '{}')));
                return new Response(
                    JSON.stringify({
                        choices: [{ finish_reason: 'stop', message: { content: 'Done.' } }],
                        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        await callOpenRouter('or-key', 'anthropic/claude-3.7-sonnet', '', 'System', false, {
            messages: history,
            cacheSplitIndex: 3200
        });
        const sent = bodies[0].messages;
        expect(sent[1].content).toEqual([
            { type: 'text', text: opening.slice(0, 3200), cache_control: { type: 'ephemeral' } },
            { type: 'text', text: opening.slice(3200) }
        ]);
        expect(sent[3].content).toBe('Go on.');
    });
});
