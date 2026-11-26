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
