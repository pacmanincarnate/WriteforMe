/**
 * @module services/images/openai
 * OpenAI GPT Image generation (`POST /v1/images/generations`).
 */

import { CLOUD_API_URLS, DEFAULT_IMAGE_MODELS } from '@/config';
import { fetchWithTimeout } from '@/services/http';

/** GPT Image can take a couple of minutes at high quality. */
const OPENAI_IMAGE_TIMEOUT_MS = 180000;

interface OpenAiImageResponse {
    data?: Array<{ b64_json?: string | null }>;
    output_format?: string;
}

/** Maps an app aspect ratio ("3:4", "16:9") onto the three sizes every GPT Image model accepts. */
export function openAiImageSize(aspectRatio: string): string {
    const [w, h] = (aspectRatio || '').split(':').map(Number);
    if (!w || !h || w === h) return '1024x1024';
    return w > h ? '1536x1024' : '1024x1536';
}

function openAiErrorMessage(status: number, errText: string): string {
    try {
        const parsed = JSON.parse(errText) as { error?: { message?: string } };
        if (parsed.error?.message) return `OpenAI Image API failed: ${parsed.error.message}`;
    } catch {
        // Keep the raw text when the body is not JSON
    }
    return `OpenAI Image API failed: ${status} - ${errText}`;
}

/** Generates one image with a GPT Image model and returns it as a data URL. */
export async function generateOpenAiImage(
    prompt: string,
    aspectRatio: string,
    model: string | undefined,
    apiKey: string
): Promise<string> {
    const response = await fetchWithTimeout(
        CLOUD_API_URLS.openAiImages,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: (model || '').trim() || DEFAULT_IMAGE_MODELS.openai,
                prompt,
                n: 1,
                size: openAiImageSize(aspectRatio),
                // JPEG keeps stored covers and scene art a fraction of the default PNG size.
                output_format: 'jpeg'
            })
        },
        OPENAI_IMAGE_TIMEOUT_MS
    );

    if (!response.ok) {
        throw new Error(openAiErrorMessage(response.status, await response.text()));
    }

    const data = (await response.json()) as OpenAiImageResponse;
    const b64 = (data.data?.[0]?.b64_json || '').trim();
    if (!b64) {
        throw new Error(`No image returned from OpenAI. Response: ${JSON.stringify(data)}`);
    }
    return `data:image/${data.output_format || 'jpeg'};base64,${b64}`;
}
