/**
 * @module services/llm/types
 * Shared TypeScript contracts for multi-provider LLM calls (Gemini, OpenRouter,
 * nano-GPT, KoboldCPP, Codex), tool calling, and OpenAI schema formatting.
 */

export interface LlmThinkingConfig {
    enabled?: boolean;
    budget?: number;
    effort?: string;
    level?: string;
}

export interface LlmSuccessMetadata {
    modelUsed: string;
    tokensUsed: number | null;
    promptTokens: number | null;
    responseTokens: number | null;
    thinkingTokens: number;
    reasoningTokensUsed: number;
    cachedTokens?: number;
    cacheWriteTokens?: number;
    routedProvider?: string | null;
    reasoningText?: string;
    fullResponse?: string;
}

export interface LlmToolParameterSchema {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    items?: unknown;
    enum?: string[];
    description?: string;
}

export interface LlmToolDefinition {
    name: string;
    description: string;
    parameters?: LlmToolParameterSchema | Record<string, unknown>;
}

export interface OpenAIToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters?: LlmToolParameterSchema | Record<string, unknown>;
    };
}

export type LlmContentBlock =
    | {
          type: 'text';
          text: string;
          cache_control?: { type: 'ephemeral' };
      }
    | Record<string, unknown>;

export interface OpenAIToolCall {
    id?: string;
    type?: string;
    function?: {
        name?: string;
        arguments?: string | Record<string, unknown>;
    };
}

export interface LlmChatMessage {
    role: string;
    content?: string | LlmContentBlock[] | null;
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
    name?: string;
    reasoning?: string;
    reasoning_content?: string;
    thought?: string;
    thinking?: string;
}

export interface GeminiFunctionCall {
    name: string;
    args?: Record<string, unknown> | string;
}

export interface GeminiPart {
    text?: string;
    thought?: boolean;
    functionCall?: GeminiFunctionCall;
    functionResponse?: {
        name: string;
        response: Record<string, unknown>;
    };
}

export interface GeminiContentItem {
    role?: string;
    parts: GeminiPart[];
}

export interface LlmCallOptions {
    max_tokens?: number;
    maxTokens?: number;
    timeout?: number;
    tools?: ReadonlyArray<LlmToolDefinition | OpenAIToolDefinition>;
    tool_choice?: string | Record<string, unknown>;
    thinking?: LlmThinkingConfig;
    contents?: GeminiContentItem[];
    messages?: LlmChatMessage[];
    returnFullData?: boolean;
    onSuccess?: (metadata: LlmSuccessMetadata) => void;
    logName?: string;
    modelRole?: string;
    agentType?: string;
    isWritingAgent?: boolean;
    isCreativeArchitecture?: boolean;
    isAudioDrama?: boolean;
    writing_mode?: string;
    writingMode?: string;
    temperature?: number;
    top_p?: number;
    min_p?: number;
    cacheSplitIndex?: number;
    sessionId?: string;
    disableSmartRouting?: boolean;
    provider?: string;
    grammar?: string;
    gbnf?: string;
    dry_multiplier?: number;
    dry_base?: number;
    dry_allowed_length?: number;
    dry_range?: number;
    dry_sequence_breakers?: string[];
    xtc_probability?: number;
    xtc_threshold?: number;
    adaptive_p?: number;
    adaptive_p_decay?: number;
    sampler_order?: number[];
    stop?: string[];
    toolDelayMs?: number;
    onPromptLog?: (updater: (prev: Record<string, unknown>[]) => Record<string, unknown>[]) => void;
}

export interface OpenAICompatibleFullResult {
    tool_calls: OpenAIToolCall[];
    text: string;
    reasoningText: string;
    message: LlmChatMessage;
    data: Record<string, unknown>;
}

export interface GeminiFullResult {
    functionCalls: GeminiFunctionCall[];
    text: string;
    reasoningText: string;
    candidateParts: GeminiPart[];
    data: Record<string, unknown>;
}

/**
 * Normalizes tool definitions into OpenAI-compatible `{ type: "function", function: ... }` schema
 * so OpenRouter, nano-GPT, and KoboldCPP Jinja chat templates receive valid tool objects.
 */
export function formatOpenAITools(
    tools?: ReadonlyArray<LlmToolDefinition | OpenAIToolDefinition>
): OpenAIToolDefinition[] {
    if (!Array.isArray(tools)) return [];
    return tools.map((t) => {
        if ('type' in t && t.type === 'function' && 'function' in t && t.function) {
            return t;
        }
        const def = t as LlmToolDefinition;
        return {
            type: 'function',
            function: {
                name: def.name,
                description: def.description,
                parameters: def.parameters
            }
        };
    });
}
