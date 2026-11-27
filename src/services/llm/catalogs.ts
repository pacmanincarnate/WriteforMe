/**
 * @module services/llm/catalogs
 * Live model catalog fetchers for Gemini (text + image models) and the local Codex and
 * Claude Code bridges.
 */

import { CLOUD_API_URLS } from '@/config';
import { fetchWithTimeout } from '@/services/http';
import { CLI_BRIDGE_DEFAULT_URLS } from '@/types';
import { checkKoboldCPPStatus, type KoboldStatusResult } from './koboldcpp';

export interface GeminiRawModelEntry {
    name?: string;
    displayName?: string;
    description?: string;
    supportedGenerationMethods?: string[];
}

export interface GeminiImageModelInfo {
    id: string;
    name: string;
    description: string;
}

export interface OpenRouterImageModelPricing {
    prompt?: string | number | null;
    completion?: string | number | null;
    image?: string | number | null;
    image_output?: string | number | null;
    image_token?: string | number | null;
    request?: string | number | null;
}

export interface OpenRouterRawImageModelEntry {
    id?: string;
    name?: string;
    description?: string;
    architecture?: {
        modality?: string;
        input_modalities?: string[];
        output_modalities?: string[];
    };
    pricing?: OpenRouterImageModelPricing | null;
}

export interface OpenRouterImageModelInfo {
    id: string;
    name: string;
    description: string;
    modality: string;
    costLabel: string;
    costDetail: string;
    isFree: boolean;
}

export interface GeminiCatalogResult {
    models: string[];
    imageModels: GeminiImageModelInfo[];
}

export interface CodexModelInfo {
    id: string;
    [key: string]: unknown;
}

export interface CodexCatalogResult {
    status: KoboldStatusResult;
    models: CodexModelInfo[];
    embeddingStatus: Record<string, unknown> | null;
}

export interface ClaudeCatalogResult {
    status: KoboldStatusResult;
    models: CodexModelInfo[];
}

/** Filters raw Gemini model records down to image generation / Imagen / Banana models. */
export function extractGeminiImageModels(
    rawModels: ReadonlyArray<GeminiRawModelEntry>
): GeminiImageModelInfo[] {
    return (rawModels || [])
        .filter((m) => {
            const id = (m.name || '').replace(/^models\//, '').toLowerCase();
            const display = (m.displayName || '').toLowerCase();
            const desc = (m.description || '').toLowerCase();
            return (
                id.includes('image') ||
                id.includes('banana') ||
                id.includes('imagen') ||
                display.includes('image') ||
                display.includes('banana') ||
                display.includes('imagen') ||
                desc.includes('image') ||
                desc.includes('imagen')
            );
        })
        .map((m) => {
            const cleanId = (m.name || '').replace(/^models\//, '');
            const label = m.displayName ? `${m.displayName} (${cleanId})` : cleanId;
            return { id: cleanId, name: label, description: m.description || '' };
        });
}

/** Fetches both `generateContent` text models and image models from the Gemini API. */
export async function fetchGeminiCatalog(apiKey: string): Promise<GeminiCatalogResult> {
    if (!apiKey) {
        return { models: [], imageModels: [] };
    }
    const response = await fetchWithTimeout(
        `${CLOUD_API_URLS.geminiModels}?pageSize=100`,
        { headers: { 'x-goog-api-key': apiKey } },
        15000
    );
    if (!response.ok) throw new Error('Failed to fetch models');
    const data = (await response.json()) as { models?: GeminiRawModelEntry[] };
    const rawModels = data.models || [];
    const models = rawModels
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => (m.name || '').replace('models/', ''))
        .filter(Boolean);
    const imageModels = extractGeminiImageModels(rawModels);
    return { models, imageModels };
}

/** Fetches only Gemini image generation models using the supplied API key. */
export async function fetchGeminiImageModelsCatalog(
    apiKey: string
): Promise<GeminiImageModelInfo[]> {
    const keyToUse = (apiKey || '').trim();
    if (!keyToUse) return [];
    const response = await fetchWithTimeout(
        `${CLOUD_API_URLS.geminiModels}?key=${encodeURIComponent(keyToUse)}&pageSize=100`,
        { headers: { 'x-goog-api-key': keyToUse } },
        15000
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { models?: GeminiRawModelEntry[] };
    return extractGeminiImageModels(data.models || []);
}

function parsePricingCost(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

function formatUsd(amount: number): string {
    if (amount >= 1) {
        const fixed = amount.toFixed(2);
        return `$${fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed}`;
    }
    if (amount >= 0.01) {
        return `$${amount.toFixed(2)}`;
    }
    return `$${Number(amount.toPrecision(3)).toString()}`;
}

/** Formats OpenRouter image model pricing into concise dropdown labels and detailed breakdowns. */
export function formatOpenRouterImagePricing(
    pricing?: OpenRouterImageModelPricing | null
): { costLabel: string; costDetail: string; isFree: boolean } {
    if (!pricing) {
        return { costLabel: 'Pricing N/A', costDetail: 'Pricing unavailable', isFree: false };
    }

    const prompt = parsePricingCost(pricing.prompt);
    const completion = parsePricingCost(pricing.completion);
    const image = parsePricingCost(pricing.image);
    const imageOutput = parsePricingCost(pricing.image_output);
    const imageToken = parsePricingCost(pricing.image_token);
    const request = parsePricingCost(pricing.request);

    const presentFields = [prompt, completion, image, imageOutput, imageToken, request].filter(
        (v): v is number => v !== null
    );

    if (presentFields.some((v) => v < 0)) {
        return { costLabel: 'Dynamic', costDetail: 'Dynamic router pricing', isFree: false };
    }

    if (presentFields.length > 0 && presentFields.every((v) => v === 0)) {
        return { costLabel: 'Free', costDetail: 'Free', isFree: true };
    }

    if (imageOutput !== null && imageOutput > 0) {
        const perM = imageOutput * 1_000_000;
        const costLabel =
            request !== null && request > 0
                ? `${formatUsd(perM)}/1M img tok + ${formatUsd(request)}/req`
                : `${formatUsd(perM)}/1M img tok`;
        const parts = [`Image output: ${formatUsd(perM)}/1M tokens`];
        if (prompt !== null && prompt > 0) {
            parts.push(`Prompt: ${formatUsd(prompt * 1_000_000)}/1M tokens`);
        }
        if (image !== null && image > 0) {
            parts.push(`Input image: ${formatUsd(image)}/img`);
        }
        if (request !== null && request > 0) {
            parts.push(`Request: ${formatUsd(request)}/req`);
        }
        return { costLabel, costDetail: parts.join(' · '), isFree: false };
    }

    if (request !== null && request > 0) {
        return {
            costLabel: `${formatUsd(request)}/img`,
            costDetail: `Per request: ${formatUsd(request)}`,
            isFree: false
        };
    }

    if (image !== null && image > 0) {
        return {
            costLabel: `${formatUsd(image)}/img`,
            costDetail: `Per image: ${formatUsd(image)}`,
            isFree: false
        };
    }

    if ((prompt !== null && prompt > 0) || (completion !== null && completion > 0)) {
        const labelParts: string[] = [];
        const detailParts: string[] = [];
        if (prompt !== null && prompt > 0) {
            const p = formatUsd(prompt * 1_000_000);
            labelParts.push(`${p}/1M in`);
            detailParts.push(`Prompt: ${p}/1M tokens`);
        }
        if (completion !== null && completion > 0) {
            const c = formatUsd(completion * 1_000_000);
            labelParts.push(`${c}/1M out`);
            detailParts.push(`Completion: ${c}/1M tokens`);
        }
        return {
            costLabel: labelParts.join(' · '),
            costDetail: detailParts.join(' · '),
            isFree: false
        };
    }

    return { costLabel: 'Pricing N/A', costDetail: 'Pricing unavailable', isFree: false };
}

/** Filters raw OpenRouter catalog entries down to real text-to-image models with formatted pricing. */
export function extractOpenRouterImageModels(
    rawModels: ReadonlyArray<OpenRouterRawImageModelEntry>
): OpenRouterImageModelInfo[] {
    return (rawModels || [])
        .filter((m) => {
            const id = (m.id || '').trim();
            if (!id || id.toLowerCase().startsWith('openrouter/')) return false;

            const pricing = m.pricing;
            if (pricing) {
                const p = parsePricingCost(pricing.prompt);
                const c = parsePricingCost(pricing.completion);
                const io = parsePricingCost(pricing.image_output);
                if ((p !== null && p < 0) || (c !== null && c < 0) || (io !== null && io < 0)) {
                    return false;
                }
            }

            const modality = (m.architecture?.modality || '').toLowerCase();
            const [modalityIn = '', modalityOut = ''] = modality.split('->');
            const inputModalities = m.architecture?.input_modalities;
            const outputModalities = m.architecture?.output_modalities;

            const acceptsText = Array.isArray(inputModalities)
                ? inputModalities.some((mod) => String(mod).toLowerCase() === 'text')
                : modalityIn.includes('text');
            const outputsImage = Array.isArray(outputModalities)
                ? outputModalities.some((mod) => String(mod).toLowerCase() === 'image')
                : modalityOut.includes('image');

            return acceptsText && outputsImage;
        })
        .map((m) => {
            const id = (m.id || '').trim();
            const name = (m.name || id).trim();
            const modality = (m.architecture?.modality || 'text->image').trim();
            const { costLabel, costDetail, isFree } = formatOpenRouterImagePricing(m.pricing);
            return {
                id,
                name,
                description: (m.description || '').trim(),
                modality,
                costLabel,
                costDetail,
                isFree
            };
        });
}

/** Fetches live OpenRouter models supporting image output and filters to text-to-image models. */
export async function fetchOpenRouterImageModelsCatalog(
    apiKey = ''
): Promise<OpenRouterImageModelInfo[]> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const trimmedKey = (apiKey || '').trim();
    if (trimmedKey) {
        headers['Authorization'] = `Bearer ${trimmedKey}`;
    }
    const response = await fetchWithTimeout(
        `${CLOUD_API_URLS.openRouterModels}?output_modalities=image`,
        { method: 'GET', headers },
        15000
    );
    if (!response.ok) {
        throw new Error(`OpenRouter HTTP ${response.status}`);
    }
    const data = (await response.json()) as
        | OpenRouterRawImageModelEntry[]
        | { data?: OpenRouterRawImageModelEntry[] };
    const rawList = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : [];
    return extractOpenRouterImageModels(rawList);
}

interface CliBridgeProbe extends CodexCatalogResult {
    health: Record<string, unknown> | null;
}

/** Probes a local CLI bridge (Codex or Claude Code): status, /health payload, and model catalog. */
async function probeCliBridge(bridgeUrl: string, defaultUrl: string): Promise<CliBridgeProbe> {
    const baseUrl = (String(bridgeUrl || '').trim() || defaultUrl).replace(/\/+$/, '');
    let health: Record<string, unknown> | null = null;
    let embeddingStatus: Record<string, unknown> | null = null;
    const offline = (error: string): CliBridgeProbe => ({
        status: { online: false, model: null, error },
        models: [],
        embeddingStatus,
        health
    });
    try {
        const [status, response, healthBody] = await Promise.all([
            checkKoboldCPPStatus(baseUrl),
            fetchWithTimeout(`${baseUrl}/v1/models`, { headers: { Accept: 'application/json' } }, 3000),
            fetchWithTimeout(`${baseUrl}/health`, { headers: { Accept: 'application/json' } }, 6000)
                .then((res) => (res.ok ? (res.json() as Promise<Record<string, unknown>>) : null))
                .catch(() => null)
        ]);
        health = healthBody;
        embeddingStatus =
            health && typeof health.embeddings === 'object' && health.embeddings !== null
                ? (health.embeddings as Record<string, unknown>)
                : null;

        if (!status.online) return offline(status.error || 'Bridge offline');
        if (!response.ok) return offline(`HTTP ${response.status}`);
        const catalog = (await response.json()) as { data?: CodexModelInfo[] };
        if (!Array.isArray(catalog.data)) return offline('Invalid bridge model list');
        return {
            status,
            models: catalog.data.filter((model) => typeof model?.id === 'string'),
            embeddingStatus,
            health
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Bridge offline';
        return offline(msg || 'Bridge offline');
    }
}

/** Probes the local Codex Bridge status, embeddings health, and available model catalog. */
export async function fetchCodexCatalog(codexUrl: string): Promise<CodexCatalogResult> {
    const { status, models, embeddingStatus } = await probeCliBridge(
        codexUrl,
        CLI_BRIDGE_DEFAULT_URLS.codex
    );
    return { status, models, embeddingStatus };
}

export const CLAUDE_BRIDGE_CLI_MISSING =
    'Bridge is running, but Claude Code was not found. Install it, then restart the bridge.';
export const CLAUDE_BRIDGE_SIGNED_OUT =
    'Bridge is running, but Claude Code is not signed in. Run "claude" once in a terminal and sign in.';

/**
 * Probes the local Claude Code Bridge. The bridge can be up while the CLI behind it is missing or
 * signed out, so its /health login report decides whether the provider counts as online.
 */
export async function fetchClaudeCatalog(claudeUrl: string): Promise<ClaudeCatalogResult> {
    const { status, models, health } = await probeCliBridge(claudeUrl, CLI_BRIDGE_DEFAULT_URLS.claude);
    if (!status.online || !health) return { status, models };
    const login =
        typeof health.login === 'object' && health.login !== null
            ? (health.login as Record<string, unknown>)
            : null;
    const error = !health.claude
        ? CLAUDE_BRIDGE_CLI_MISSING
        : login?.loggedIn === false
          ? CLAUDE_BRIDGE_SIGNED_OUT
          : null;
    return error ? { status: { online: false, model: null, error }, models } : { status, models };
}
