import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyWorldUpdates, type WorldUpdateStoryState } from '@/domain/continuity';
import {
    appendPersistedMandate,
    canonicalizeModalityHand,
    clearDirectivePlanResults,
    countStoryWords,
    getSceneActiveCast,
    parseDirectivePlan,
    resolveSceneCastFields,
    serializeDirectivePlan
} from '@/domain/story';
import {
    buildDirectiveReviewContext,
    buildProseContext,
    directiveReviewFailure,
    dispatchAI,
    parseDirectiveReview,
    PROMPT_LOG_CAP,
    type PromptLogEntry
} from '@/pipeline';
import { fetchComfyInfoCatalog } from '@/services/images';
import {
    buildKoboldSamplerSettings,
    fetchCodexCatalog,
    fetchGeminiCatalog,
    fetchGeminiImageModelsCatalog,
    getEffectiveModelConfig,
    resolveAgentMaxTokens,
    resolveRole,
    resolveThinkingConfigForAgent
} from '@/services/llm';

describe('Phase 5B: role config, catalogs, dispatchAI, directive helpers, world updates, prose context', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('resolves model roles, Kobold sanitization, thinking budgets, agent max tokens, and samplers', () => {
        expect(resolveRole('dev', 'Writing Agent Scene 1')).toBe('prose');
        expect(resolveRole('dev', 'Sequence Review Pass')).toBe('review');
        expect(resolveRole('dev', 'Character Developer Tier 0.2')).toBe('prose');
        expect(resolveRole('dev', 'Act Agent Planner')).toBe('dev');

        const cfgProse = getEffectiveModelConfig('prose', {
            devProvider: 'gemini',
            devModel: 'gemini-2.5-flash',
            proseProvider: 'koboldcpp',
            proseModel: 'gpt-4o',
            koboldLoadedModel: 'local-llama-3'
        });
        expect(cfgProse).toEqual({
            provider: 'koboldcpp',
            model: 'local-llama-3',
            isFallback: true
        });

        const cfgFallback = getEffectiveModelConfig('review', {
            devProvider: 'openrouter',
            devModel: 'anthropic/claude-sonnet-4'
        });
        expect(cfgFallback).toEqual({
            provider: 'openrouter',
            model: 'anthropic/claude-sonnet-4',
            isFallback: true
        });

        expect(
            resolveThinkingConfigForAgent('Writing Reviewer', {
                enableThinkingWriting: true,
                thinkingBudgetWriting: 8192
            }).enabled
        ).toBe(false);

        const writingThink = resolveThinkingConfigForAgent('Writing Agent Scene 1', {
            enableThinkingWriting: true,
            thinkingBudgetWriting: 4096
        });
        expect(writingThink).toEqual({
            enabled: true,
            budget: 4096,
            effort: 'medium',
            level: 'MEDIUM'
        });

        expect(
            resolveAgentMaxTokens({
                targetProvider: 'gemini',
                currentModel: 'gemini-2.5-pro',
                logName: 'Writing Agent',
                thinkingConfig: writingThink
            })
        ).toBe(32768);

        const audioDramaSampler = buildKoboldSamplerSettings({
            isWritingAgent: true,
            isCreativeArchitecture: false,
            isAudioDramaMode: true
        });
        expect(audioDramaSampler.profile).toBe('creative_writing_audio_drama');
        expect(audioDramaSampler.xtc_probability).toBe(0);
    });

    it('fetches Gemini text/image catalogs, Codex bridge catalog, and ComfyUI node options', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.includes('generativelanguage.googleapis.com')) {
                    return new Response(
                        JSON.stringify({
                            models: [
                                {
                                    name: 'models/gemini-2.5-flash',
                                    displayName: 'Gemini 2.5 Flash',
                                    supportedGenerationMethods: ['generateContent']
                                },
                                {
                                    name: 'models/gemini-3.1-flash-image',
                                    displayName: 'Gemini Image',
                                    supportedGenerationMethods: ['generateContent']
                                }
                            ]
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    );
                }
                if (url.includes('localhost:5010/api/v1/model')) {
                    return new Response(JSON.stringify({ result: 'codex-gpt-5' }), { status: 200 });
                }
                if (url.includes('localhost:5010/v1/models')) {
                    return new Response(JSON.stringify({ data: [{ id: 'gpt-5.6-luna' }] }), {
                        status: 200
                    });
                }
                if (url.includes('localhost:5010/health')) {
                    return new Response(JSON.stringify({ embeddings: { ready: true } }), {
                        status: 200
                    });
                }
                if (url.includes('127.0.0.1:8188/system_stats')) {
                    return new Response(
                        JSON.stringify({
                            system: { comfyui_version: '0.3.1' },
                            devices: [{ name: 'RTX 4090' }]
                        }),
                        { status: 200 }
                    );
                }
                if (url.includes('UNETLoader')) {
                    return new Response(
                        JSON.stringify({
                            UNETLoader: {
                                input: { required: { unet_name: [['flux.safetensors', 'krea2_turbo.safetensors']] } }
                            }
                        }),
                        { status: 200 }
                    );
                }
                if (url.includes('CLIPLoader')) {
                    return new Response(
                        JSON.stringify({
                            CLIPLoader: {
                                input: { required: { clip_name: [['t5.safetensors', 'qwen3vl_4b.safetensors']] } }
                            }
                        }),
                        { status: 200 }
                    );
                }
                if (url.includes('VAELoader')) {
                    return new Response(
                        JSON.stringify({
                            VAELoader: {
                                input: { required: { vae_name: [['ae.safetensors', 'qwen_vae.safetensors']] } }
                            }
                        }),
                        { status: 200 }
                    );
                }
                if (url.includes('LoraLoaderModelOnly')) {
                    return new Response(
                        JSON.stringify({
                            LoraLoaderModelOnly: { input: { required: { lora_name: [['grain.safetensors']] } } }
                        }),
                        { status: 200 }
                    );
                }
                if (url.includes('KSampler')) {
                    return new Response(
                        JSON.stringify({
                            KSampler: {
                                input: {
                                    required: {
                                        sampler_name: [['euler', 'dpmpp_2m']],
                                        scheduler: [['simple', 'karras']]
                                    }
                                }
                            }
                        }),
                        { status: 200 }
                    );
                }
                return new Response(JSON.stringify({}), { status: 404 });
            })
        );

        const gemCatalog = await fetchGeminiCatalog('gem-key');
        expect(gemCatalog.models).toEqual(['gemini-2.5-flash', 'gemini-3.1-flash-image']);
        expect(gemCatalog.imageModels.map((m) => m.id)).toEqual(['gemini-3.1-flash-image']);

        const imgOnly = await fetchGeminiImageModelsCatalog('gem-key');
        expect(imgOnly).toHaveLength(1);

        const codex = await fetchCodexCatalog('http://localhost:5010');
        expect(codex.status.online).toBe(true);
        expect(codex.models).toEqual([{ id: 'gpt-5.6-luna' }]);
        expect(codex.embeddingStatus).toEqual({ ready: true });

        const comfy = await fetchComfyInfoCatalog('http://127.0.0.1:8188');
        expect(comfy.status.online).toBe(true);
        expect(comfy.status.device).toBe('RTX 4090');
        expect(comfy.options.unet[0]).toBe('krea2_turbo.safetensors');
        expect(comfy.defaults).toEqual({
            unet: 'krea2_turbo.safetensors',
            clip: 'qwen3vl_4b.safetensors',
            vae: 'qwen_vae.safetensors'
        });
    });

    it('dispatches AI calls with log updates, permanent error stop, length failover, and single timeout retry', async () => {
        expect(PROMPT_LOG_CAP).toBe(250);

        let logs: PromptLogEntry[] = [];
        const setPromptLog = (updater: (prev: PromptLogEntry[]) => PromptLogEntry[]) => {
            logs = updater(logs);
        };
        const showToast = vi.fn();
        const setStep = vi.fn();

        // 1. Happy path OpenRouter + deepseek-r1 length failover -> deepseek/deepseek-chat
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
                const body = init?.body ? (JSON.parse(String(init.body)) as { model?: string }) : {};
                if (body.model !== 'deepseek/deepseek-chat') {
                    return new Response(
                        JSON.stringify({
                            choices: [{ finish_reason: 'length', message: { content: '' } }],
                            usage: { completion_tokens: 4000 }
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    );
                }
                return new Response(
                    JSON.stringify({
                        model: body.model,
                        choices: [{ finish_reason: 'stop', message: { content: '<ok>Done</ok>' } }],
                        usage: { prompt_tokens: 100, completion_tokens: 12, total_tokens: 112 }
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            })
        );

        const res = await dispatchAI(
            {
                prompt: 'Draft beat',
                systemPrompt: 'System',
                isJson: false,
                logName: 'Writing Agent Scene 1',
                modelRoleOrSize: 'prose'
            },
            {
                modelSettings: {
                    apiProvider: 'openrouter',
                    proseProvider: 'openrouter',
                    proseModel: 'deepseek/deepseek-r1'
                },
                thinkingSettings: {
                    enableThinkingWriting: true,
                    thinkingBudgetWriting: 8192
                },
                openRouterKey: 'sk-test'
            },
            {
                setCurrentPipelineStep: setStep,
                setPromptLog,
                showToast,
                sleepFn: async () => {}
            }
        );

        expect(res).toBe('<ok>Done</ok>');
        expect(setStep).toHaveBeenCalledWith(18);
        expect(logs[0]?.status).toBe('success');
        expect(logs[0]?.modelUsed).toBe('deepseek/deepseek-chat');

        // 2. Permanent 401 error fails on attempt 1 with error toast
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Invalid key' } }), { status: 401 }))
        );
        await expect(
            dispatchAI(
                { prompt: 'Hello', logName: 'Sequence Agent', modelRoleOrSize: 'dev' },
                {
                    modelSettings: { apiProvider: 'openrouter', devModel: 'openai/gpt-4o' },
                    thinkingSettings: {},
                    openRouterKey: 'bad-key'
                },
                { setPromptLog, showToast, sleepFn: async () => {} }
            )
        ).rejects.toThrow(/401|Authorization Failed/i);
        expect(logs[0]?.status).toBe('error');
        expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/401|Authorization Failed/i), 'error');

        // 3. AbortError timeout retries once and fails on second timeout
        let abortCount = 0;
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                abortCount++;
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                throw err;
            })
        );
        await expect(
            dispatchAI(
                { prompt: 'Hello', logName: 'Act Agent', modelRoleOrSize: 'dev' },
                {
                    modelSettings: { apiProvider: 'gemini', geminiModel: 'gemini-2.5-flash' },
                    thinkingSettings: {},
                    apiKey: 'gem-key',
                    apiTimeout: 10
                },
                { setPromptLog, showToast, sleepFn: async () => {} }
            )
        ).rejects.toThrow(/request timed out after/i);
        expect(abortCount).toBe(2);
    });

    it('handles directive planning helpers, round-trip XML serialization, review parsing, and word counting', () => {
        const cast = [
            { id: 'c1', name: 'Maren Vance', role: 'Lead' },
            { id: 'c2', name: 'Jorah Bell', role: 'Ally' }
        ];
        expect(getSceneActiveCast({ title: 'S1', cast_names: ['Maren Vance'] }, cast)).toHaveLength(1);
        expect(getSceneActiveCast({ title: 'S2', objective: 'Meet Jorah at dawn' }, cast)[0]?.id).toBe('c2');

        expect(canonicalizeModalityHand(['dialogue', 'sensory'], [])).toEqual(['Sensory Anchoring']);
        expect(resolveSceneCastFields('Maren Vance, Stranger', cast)).toEqual({
            cast_ids: ['c1', 'Stranger'],
            cast_names: ['Maren Vance', 'Stranger'],
            characters_present: ['Maren Vance', 'Stranger']
        });

        expect(appendPersistedMandate('Base note', 'Keep ring hidden', 'Act 2')).toContain(
            '- **DIRECTIVE MANDATE (Act 2):** Keep ring hidden'
        );

        const xml = `<response>
<evaluation>Needs sharper turn</evaluation>
<scope_kind>arc</scope_kind>
<consistency_notes>Check clock chime</consistency_notes>
<actions>
  <action>
    <action_type>EDIT_PROSE_LINES</action_type>
    <target_act_idx>0</target_act_idx>
    <target_sequence_idx>1</target_sequence_idx>
    <target_scene_idx>0</target_scene_idx>
    <description>Tighten closing line</description>
    <allow_large_change>false</allow_large_change>
    <details>
      <instructions>Replace weak verb</instructions>
      <line_edits><edit><find>walked slowly</find><replace>crossed</replace></edit></line_edits>
    </details>
  </action>
</actions>
</response>`;
        const parsed = parseDirectivePlan(xml);
        expect(parsed.scope_kind).toBe('arc');
        expect(parsed.actions).toHaveLength(1);
        expect(parsed.actions[0]?.details.line_edits).toEqual([
            { find: 'walked slowly', replace: 'crossed' }
        ]);
        const reserialized = serializeDirectivePlan(parsed);
        const reparsed = parseDirectivePlan(reserialized);
        expect(reparsed.actions[0]?.details.line_edits).toEqual([
            { find: 'walked slowly', replace: 'crossed' }
        ]);
        const cleared = clearDirectivePlanResults({
            ...parsed,
            actions: [{ ...parsed.actions[0]!, result: { ok: true } }]
        });
        expect(cleared.actions[0]?.result).toBeUndefined();

        const reviewPrompt = buildDirectiveReviewContext(
            {
                cast,
                sequences: [{ number: 1, title: 'Opening', parent_act: 1 }],
                scenes: { '0': [{ title: 'Pier Watch', pov_character: 'Maren Vance' }] },
                prose: { '0-0': { final: 'Waves struck the pilings.' } }
            },
            0,
            0
        );
        expect(reviewPrompt).toContain('Waves struck the pilings.');
        expect(parseDirectiveReview('<response><status>PASS</status><critique_analysis>Solid</critique_analysis></response>').status).toBe('PASS');
        expect(directiveReviewFailure(new Error('Network down')).error).toBe(true);

        expect(
            countStoryWords({
                sequences: [{ number: 1, scenes: [{ number: 1, prose: 'One two three four' }] }]
            })
        ).toBe(4);
    });

    it('applies world updates while honoring user_edited locks and compiles 4-tier prose context', () => {
        const updatedStory = applyWorldUpdates<WorldUpdateStoryState>(
            {
                cast: [
                    {
                        id: 'c1',
                        name: 'Maren Vance',
                        role: 'Lead',
                        details: { history: 'Harbor clerk', goals: 'User locked goal', story_events: '', evolution: '' }
                    }
                ],
                user_edited: { 'cast.0.goals': true },
                lore: [{ topic: 'Fog Bell', detail: 'Rings at ebb tide' }],
                continuity_ledger: [
                    { key: 'Valence (1.1)', value: 'shift', category: 'Valence Shift' }
                ],
                relationships: {},
                knowledge_graph: { nodes: [], edges: [] },
                event_log: []
            },
            {
                cast_updates: [
                    {
                        name: 'Maren Vance',
                        append_history: 'Found stamped crate',
                        update_goals: 'Overwritten goal'
                    }
                ],
                new_characters: [{ name: 'Tamsin Grey', role: 'Smuggler' }],
                relationship_updates: [
                    { from: 'Maren Vance', to: 'Tamsin Grey', new_feeling: 'Wary', trigger: 'Ledger trade' }
                ],
                continuity_facts: [{ key: 'Pier Lantern', value: 'Broken glass on east post', category: 'Object' }],
                character_state_updates: [{ name: 'Maren Vance', emotional_state: 'Alert', location: 'East Pier' }]
            },
            [{ topic: 'East Pier', detail: 'Abandoned timber wharf' }],
            1,
            '1.1'
        );

        expect(updatedStory.cast?.[0]?.details?.goals).toBe('User locked goal');
        expect(updatedStory.cast?.[0]?.details?.history).toContain('Found stamped crate');
        expect(updatedStory.cast).toHaveLength(2);
        expect(updatedStory.continuity_ledger).toHaveLength(1);
        expect(updatedStory.continuity_ledger?.[0]?.key).toBe('Pier Lantern');
        expect(updatedStory.character_states?.['Maren Vance']?.location).toBe('East Pier');

        const ctx = buildProseContext({
            storyToUse: {
                writing_mode: 'novel',
                world_primer: 'A wet port city.',
                story_so_far: 'Maren arrived at Pier Seven.',
                acts: [{ number: 1, title: 'Tide', act_mandate: 'Secret truth revealed in Act 3' }],
                secret_vault: [
                    {
                        status: 'active',
                        truth: 'Secret truth revealed',
                        title: 'Harbor Betrayal',
                        reveal_anchor: { act_number: 3, sequence_number: 7 },
                        cover_story: {
                            character_masks: {
                                'Maren Vance': { history_mask: 'Ordinary clerk' }
                            }
                        }
                    }
                ],
                relationships: updatedStory.relationships
            },
            scene: {
                title: 'Night Watch',
                pov_character: 'Maren Vance',
                characters_present: ['Maren Vance', 'Tamsin Grey'],
                objective: 'Inspect the crate',
                value_shift: 'Calm -> Dread'
            },
            sequenceData: { number: 1, title: 'Harbor', parent_act: 1 },
            s: 0,
            seq: 0,
            activeCast: updatedStory.cast,
            loreContext: [{ text: 'East Pier: Abandoned wharf' }],
            forceFullRewrite: true
        });

        expect(ctx).toContain('<synthesized_authorial_persona>');
        expect(ctx).toContain('[Crucial Turning Point Withheld]');
        expect(ctx).not.toContain('Harbor Betrayal');
        expect(ctx).toContain('<mandatory_full_rewrite_mandate>');
        expect(ctx).toContain('MULTI-CHARACTER SCENE (2 characters present: Maren Vance, Tamsin Grey)');
    });
});
