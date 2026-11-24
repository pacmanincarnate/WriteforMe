import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    callAgenticLoop,
    executeLocalTool,
    isMetaCommentaryText,
    WRITING_AGENT_TOOLS,
    type LocalToolContext
} from '@/services/llm';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
});

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });

describe('services/llm executeLocalTool', () => {
    const baseContext: LocalToolContext = {
        sequenceData: { number: 2 },
        currentScene: { number: '2.1', title: 'Cellar Audit', pov_character: 'Maren Vance' },
        previousScene: {
            title: 'Harbor Arrival',
            setting: 'North Pier',
            characters_present: ['Maren Vance', 'Tomas Kell'],
            exit_hook: 'Wet footprints leading down to the Tide Registry'
        },
        previousSceneProseText: 'Maren locked the grate and descended into the dark corridor.',
        currentSceneProseText: 'Old draft prose awaiting revision.',
        currentSceneCritique: 'Needs sharper dialogue.',
        activeCast: [
            { name: 'Maren Vance', id: 'maren' },
            { name: 'Tomas Kell', id: 'tomas' }
        ],
        story: {
            id: 'story_1',
            title: 'The Salt Clock',
            writing_mode: 'novel',
            status_quo: 'Storms have cut Oakhaven off from the mainland.',
            cast: [
                {
                    id: 'maren',
                    name: 'Maren Vance',
                    role: 'Protagonist',
                    core_flaw: 'Distrusts allies',
                    core_desire: 'Expose the forged 1918 tide ledger',
                    details: {
                        deep_profile:
                            'Maren secretly hid the brass cipher inside the cathedral bell.'
                    }
                }
            ],
            character_states: {
                'Maren Vance': {
                    location: 'Tide Registry',
                    emotional_state: 'Guarded vigilance'
                }
            },
            lore: [
                {
                    topic: 'Brass Cipher',
                    detail: 'Maren secretly hid the brass cipher inside the cathedral bell.'
                }
            ],
            continuity_ledger: [
                {
                    key: 'Lantern Oil',
                    value: 'Quarter-full',
                    category: 'inventory',
                    source_scene: '1.2'
                }
            ],
            secret_vault: [
                {
                    status: 'hidden',
                    title: 'Brass Cipher',
                    truth: 'Maren secretly hid the brass cipher inside the cathedral bell',
                    reveal_anchor: { sequence_number: 6 },
                    cover_story: {
                        character_masks: {
                            'Maren Vance': {
                                apparent_flaw: 'Overworked archivist'
                            }
                        }
                    }
                }
            ]
        }
    };

    it('masks unrevealed secrets in character state and lore queries prior to reveal anchor', () => {
        expect(WRITING_AGENT_TOOLS.length).toBe(8);

        const charRes = executeLocalTool(
            'inspect_character_state',
            { character_id: 'Maren' },
            baseContext
        ) as {
            found: boolean;
            state: { emotional_state: string; canonical_interview_voice: string };
        };
        expect(charRes.found).toBe(true);
        expect(charRes.state.emotional_state).toBe('Overworked archivist');
        expect(charRes.state.canonical_interview_voice).toContain('[Private Personal Motivation]');
        expect(charRes.state.canonical_interview_voice).not.toContain('cathedral bell');

        const loreRes = executeLocalTool('query_story_lore', { topic: 'Cipher' }, baseContext) as {
            matches_found: number;
            results: Array<{ topic: string; detail: string }>;
        };
        expect(loreRes.matches_found).toBeGreaterThan(0);
        expect(loreRes.results[0].topic).toBe('[Redacted Topic]');
        expect(loreRes.results[0].detail).toContain('[Redacted lore - pending narrative development]');
    });

    it('inspects previous scene exit, current draft overrides, archivist, oracle, and commit', () => {
        const prev = executeLocalTool('inspect_previous_scene_exit', {}, baseContext);
        expect(prev.has_previous_scene).toBe(true);
        expect(prev.exit_hook).toContain('Tide Registry');

        const normalDraft = executeLocalTool('inspect_current_scene_draft', {}, baseContext);
        expect(normalDraft.has_draft).toBe(true);

        const forcedRewrite = executeLocalTool(
            'inspect_current_scene_draft',
            {},
            { ...baseContext, forceFullRewrite: true }
        );
        expect(forcedRewrite.has_draft).toBe(false);

        const archivist = executeLocalTool(
            'query_archivist',
            { query: 'Lantern', focus_entity: 'Lantern' },
            baseContext
        ) as { historical_ground_truth: { continuity_facts: Array<{ key: string }> } };
        expect(archivist.historical_ground_truth.continuity_facts[0].key).toBe('Lantern Oil');

        const oracle = executeLocalTool(
            'roll_narrative_oracle',
            { category: 'status_shift', dramatic_context: 'Vault interrogation' },
            baseContext
        ) as { oracle_roll: { category: string; micro_friction_constraint: string } };
        expect(oracle.oracle_roll.category).toBe('status_shift');
        expect(oracle.oracle_roll.micro_friction_constraint.length).toBeGreaterThan(10);

        const commit = executeLocalTool(
            'commit_scene_prose',
            { final_prose: 'One two three four.', scene_exit_hook: 'Fog rises.' },
            baseContext
        );
        expect(commit.status).toBe('COMMITTED');
        expect(commit.word_count).toBe(4);

        const unknown = executeLocalTool('nonexistent_tool', {}, baseContext);
        expect(unknown.error).toContain('Unknown tool');
    });

    it('evaluates drafts for novel anti-patterns and audio drama formatting rules', () => {
        const clinicalNovel = executeLocalTool(
            'evaluate_draft',
            {
                draft_text:
                    'His cortisol spiked sharply as he stood three steps ahead in the dim limestone hallway beside the iron gate, counting silent shadows along the flagstones while rain drummed steadily overhead across the slate tiles and lantern light flickered down the wet steps without a single word spoken.'
            },
            baseContext
        ) as { ready_to_commit: boolean; anti_pattern_flags: string[]; dialogue_word_count: number };
        expect(clinicalNovel.ready_to_commit).toBe(false);
        expect(clinicalNovel.dialogue_word_count).toBe(0);
        expect(clinicalNovel.anti_pattern_flags.some((f) => f.includes('0% spoken dialogue'))).toBe(
            true
        );

        const audioDrama = executeLocalTool(
            'evaluate_draft',
            {
                draft_text:
                    'Narrator: Fog wraps the brass lantern.\nNarrator: Rain hits the pier.\nMaren Vance: [whispered, tense] <whisper>Keep your voice down.</whisper>'
            },
            {
                ...baseContext,
                writing_mode: 'audio_drama',
                story: { ...baseContext.story, writing_mode: 'audio_drama' }
            }
        ) as { format: string; consecutive_narrator_runs: number };
        expect(audioDrama.format).toBe('audio_drama_script');
        expect(audioDrama.consecutive_narrator_runs).toBeGreaterThan(0);
    });
});

describe('services/llm callAgenticLoop', () => {
    it('executes Gemini multi-turn function calls through commit_scene_prose and logs turns', async () => {
        let turnCount = 0;
        globalThis.fetch = vi.fn<typeof fetch>(async () => {
            turnCount++;
            if (turnCount === 1) {
                return jsonResponse({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        functionCall: {
                                            name: 'inspect_previous_scene_exit',
                                            args: {}
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                });
            }
            return jsonResponse({
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    functionCall: {
                                        name: 'commit_scene_prose',
                                        args: {
                                            final_prose:
                                                'Maren set the lamp on the wet slate and opened the ledger.',
                                            character_state_updates: [
                                                {
                                                    character_name: 'Maren Vance',
                                                    emotional_state: 'Resolute'
                                                }
                                            ],
                                            scene_exit_hook: 'Steps echo outside.'
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ]
            });
        });

        let loggedEntries: Record<string, unknown>[] = [];
        const result = await callAgenticLoop({
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            apiKey: 'gem-key',
            prompt: 'Draft scene 2.1',
            systemPrompt: 'Literary style',
            options: {
                toolDelayMs: 0,
                onPromptLog: (updater) => {
                    loggedEntries = updater(loggedEntries);
                }
            }
        });

        expect(result.prose).toBe('Maren set the lamp on the wet slate and opened the ledger.');
        expect(result.sceneExitHook).toBe('Steps echo outside.');
        expect(result.turnsCompleted).toBe(2);
        expect(loggedEntries).toHaveLength(2);
        expect(loggedEntries[0].status).toBe('success');
    });

    it('falls back from OpenAI native tool error to XML tool call and guards meta-commentary', async () => {
        expect(isMetaCommentaryText('Let me check my draft is at target')).toBe(true);
        expect(isMetaCommentaryText('Maren unlatched the brass lantern beside the quay.')).toBe(
            false
        );

        let callIdx = 0;
        const draftedText =
            'Maren held the salted parchment to the flame. "Look at the ledger margin," she whispered, pressing her thumb over the scraped ink.';
        globalThis.fetch = vi.fn<typeof fetch>(async () => {
            callIdx++;
            if (callIdx === 1) {
                return jsonResponse(
                    { error: { message: 'tools parameter unrecognized in schema' } },
                    400
                );
            }
            if (callIdx === 2) {
                return jsonResponse({
                    choices: [
                        {
                            message: {
                                content: `<tool_call name="evaluate_draft">${JSON.stringify({
                                    draft_text: draftedText
                                })}</tool_call>`
                            }
                        }
                    ]
                });
            }
            return jsonResponse({
                choices: [
                    {
                        message: {
                            content: 'Let me check evaluate_draft dialogue percentage now.'
                        }
                    }
                ]
            });
        });

        const res = await callAgenticLoop({
            provider: 'koboldcpp',
            model: 'local-gguf',
            baseUrl: 'http://localhost:5001',
            prompt: 'Write scene',
            systemPrompt: 'System',
            maxTurns: 4,
            options: { toolDelayMs: 0 }
        });

        // Meta-commentary final message was rejected in favor of latestDraftProse from evaluate_draft!
        expect(res.prose).toBe(draftedText);
    });

    it('runs OpenRouter native tool_calls with story-scoped sessionId and commit_scene_prose', async () => {
        const bodies: Array<Record<string, unknown>> = [];
        let turn = 0;
        globalThis.fetch = vi.fn<typeof fetch>(async (url, init) => {
            if (String(url).includes('/endpoints')) {
                return jsonResponse({ data: { endpoints: [] } });
            }
            turn++;
            bodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>);
            if (turn === 1) {
                return jsonResponse({
                    choices: [
                        {
                            message: {
                                role: 'assistant',
                                content: null,
                                tool_calls: [
                                    {
                                        id: 'call_1',
                                        type: 'function',
                                        function: {
                                            name: 'evaluate_draft',
                                            arguments: JSON.stringify({
                                                draft_text: '"Where is the ledger?" Maren asked.'
                                            })
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                });
            }
            return jsonResponse({
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content: null,
                            tool_calls: [
                                {
                                    id: 'call_2',
                                    type: 'function',
                                    function: {
                                        name: 'commit_scene_prose',
                                        arguments: JSON.stringify({
                                            final_prose: '"Where is the ledger?" Maren asked beside the damp stone gate.'
                                        })
                                    }
                                }
                            ]
                        }
                    }
                ]
            });
        });

        const res = await callAgenticLoop({
            provider: 'openrouter',
            model: 'deepseek/deepseek-chat',
            apiKey: 'or-key',
            prompt: 'Write scene',
            systemPrompt: 'System',
            context: { story: { id: 'story_salt' } },
            options: { toolDelayMs: 0, disableSmartRouting: true }
        });

        expect(res.prose).toBe('"Where is the ledger?" Maren asked beside the damp stone gate.');
        expect(res.turnsCompleted).toBe(2);
        expect(bodies[0].session_id).toBe('ep:story_salt:prose:deepseek_deepseek-chat');
    });
});
