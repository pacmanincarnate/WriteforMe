/**
 * @module services/llm/catalogs
 * Live model catalog fetchers for Gemini (text + image models) and the local Codex Bridge.
 */

import { fetchWithTimeout } from '@/services/http';
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
        'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',
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
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(keyToUse)}&pageSize=100`,
        { headers: { 'x-goog-api-key': keyToUse } },
        15000
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { models?: GeminiRawModelEntry[] };
    return extractGeminiImageModels(data.models || []);
}

/** Probes the local Codex Bridge status, embeddings health, and available model catalog. */
export async function fetchCodexCatalog(codexUrl: string): Promise<CodexCatalogResult> {
    const baseUrl = (String(codexUrl || '').trim() || 'http://localhost:5010').replace(/\/+$/, '');
    try {
        const [status, response, health] = await Promise.all([
            checkKoboldCPPStatus(baseUrl),
            fetchWithTimeout(`${baseUrl}/v1/models`, { headers: { Accept: 'application/json' } }, 3000),
            fetchWithTimeout(`${baseUrl}/health`, { headers: { Accept: 'application/json' } }, 6000)
                .then((res) => (res.ok ? (res.json() as Promise<Record<string, unknown>>) : null))
                .catch(() => null)
        ]);

        const embeddingStatus =
            health && typeof health.embeddings === 'object' && health.embeddings !== null
                ? (health.embeddings as Record<string, unknown>)
                : null;

        if (!status.online) {
            return {
                status: { online: false, model: null, error: status.error || 'Bridge offline' },
                models: [],
                embeddingStatus
            };
        }
        if (!response.ok) {
            return {
                status: { online: false, model: null, error: `HTTP ${response.status}` },
                models: [],
                embeddingStatus
            };
        }
        const catalog = (await response.json()) as { data?: CodexModelInfo[] };
        if (!Array.isArray(catalog.data)) {
            return {
                status: { online: false, model: null, error: 'Invalid bridge model list' },
                models: [],
                embeddingStatus
            };
        }
        return {
            status,
            models: catalog.data.filter((model) => typeof model?.id === 'string'),
            embeddingStatus
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Bridge offline';
        return {
            status: { online: false, model: null, error: msg || 'Bridge offline' },
            models: [],
            embeddingStatus: null
        };
    }
}
