/**
 * @module services/images/providers
 * Multi-provider image generation dispatcher (ComfyUI, Gemini Imagen / generateContent, OpenRouter).
 */

import { APP_HTTP_HEADERS, CLOUD_API_URLS, DEFAULT_IMAGE_MODELS } from '@/config';
import { fetchWithTimeout } from '@/services/http';
import { withCloudActivity } from '@/services/vram';
import { generateComfyImage, type ComfyGenerationOptions } from './comfyui';

export type ImageProviderName = 'comfyui' | 'gemini' | 'openrouter' | string;

export interface ImageGenerationConfig {
    provider: ImageProviderName;
    model?: string;
    apiKey?: string;
    fallbackGeminiKey?: string;
    fallbackOpenRouterKey?: string;
    onModelMigrated?: (nextModel: string) => void;
    comfy?: ComfyGenerationOptions;
}

interface GeminiImageApiResponse {
    predictions?: Array<{
        bytesBase64Encoded?: string;
        imageBytes?: string;
        mimeType?: string;
        image?: { imageBytes?: string; mimeType?: string };
    }>;
    generatedImages?: Array<{
        image?: { imageBytes?: string; mimeType?: string };
    }>;
    candidates?: Array<{
        content?: {
            parts?: Array<{
                inlineData?: { data?: string; mimeType?: string };
            }>;
        };
    }>;
}

interface OpenRouterImageDataItem {
    b64_json?: string | null;
    url?: string | null;
    media_type?: string | null;
    mime_type?: string | null;
}

interface OpenRouterImageResponse {
    data?: OpenRouterImageDataItem[];
    choices?: Array<{
        message?: {
            images?: Array<{
                image_url?: { url?: string };
                url?: string;
            }>;
        };
    }>;
}

function detectBase64ImageMimeType(b64: string): string {
    const trimmed = b64.trim();
    if (trimmed.startsWith('/9j/')) return 'image/jpeg';
    if (trimmed.startsWith('iVBORw0KGgo')) return 'image/png';
    if (trimmed.startsWith('UklGR')) return 'image/webp';
    if (trimmed.startsWith('R0lGOD')) return 'image/gif';
    if (trimmed.startsWith('PHN2Zy') || trimmed.startsWith('PD94bW')) return 'image/svg+xml';
    return 'image/png';
}

async function fetchImageUrlAsDataUrl(imgUrl: string): Promise<string> {
    if (imgUrl.startsWith('data:')) {
        return imgUrl;
    }

    const imgResponse = await fetchWithTimeout(imgUrl, {}, 30000);
    if (!imgResponse.ok) {
        throw new Error(
            `Failed to fetch image from URL returned by OpenRouter: ${imgResponse.statusText}`
        );
    }
    const blob = await imgResponse.blob();
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
            } else {
                reject(new Error('OpenRouter: failed to convert image blob to data URL'));
            }
        };
        reader.onerror = () => reject(reader.error || new Error('OpenRouter: FileReader error'));
        reader.readAsDataURL(blob);
    });
}

async function extractOpenRouterImageDataUrl(data: OpenRouterImageResponse): Promise<string> {
    const item = data.data?.[0];
    if (item) {
        const b64 = typeof item.b64_json === 'string' ? item.b64_json.trim() : '';
        if (b64) {
            if (b64.startsWith('data:')) {
                return b64;
            }
            const mimeType =
                (item.media_type || item.mime_type || '').trim() || detectBase64ImageMimeType(b64);
            return `data:${mimeType};base64,${b64}`;
        }
        const itemUrl = typeof item.url === 'string' ? item.url.trim() : '';
        if (itemUrl) {
            return fetchImageUrlAsDataUrl(itemUrl);
        }
    }

    const imgObj = data.choices?.[0]?.message?.images?.[0];
    const imgUrl = imgObj?.image_url?.url || imgObj?.url;
    if (imgUrl) {
        return fetchImageUrlAsDataUrl(imgUrl);
    }

    throw new Error(`No image returned from OpenRouter. Response: ${JSON.stringify(data)}`);
}

function extractGeminiErrorMessage(status: number, errText: string): string {
    let errMsg = `Gemini Image API failed: ${status} - ${errText}`;
    try {
        const parsed = JSON.parse(errText) as { error?: { message?: string } };
        if (parsed.error?.message) errMsg = `Gemini Image API failed: ${parsed.error.message}`;
    } catch {
        // Retain raw error text when response body is not JSON
    }
    return errMsg;
}

/** Dispatches an image generation prompt to the configured provider and returns a data URL. */
export async function generateImage(
    prompt: string,
    aspectRatio = '1:1',
    config: ImageGenerationConfig
): Promise<string> {
    const prov = config.provider;
    const model = config.model;
    const key =
        config.apiKey || (prov === 'gemini' ? config.fallbackGeminiKey : config.fallbackOpenRouterKey);

    if (prov === 'comfyui') {
        const comfyOpts: ComfyGenerationOptions = config.comfy || { unet: '', clip: '', vae: '' };
        return generateComfyImage(prompt, aspectRatio, comfyOpts);
    }

    if (!key) {
        throw new Error(`API key for provider "${prov}" is not configured. Please check your settings.`);
    }

    if (prov === 'gemini') {
        return withCloudActivity(async () => {
        let cleanModel = (model || DEFAULT_IMAGE_MODELS.gemini)
            .trim()
            .replace(/:(predict|generateImages|generateContent)$/, '');
        if (cleanModel === 'imagen-3.0-generate-002') {
            cleanModel = DEFAULT_IMAGE_MODELS.gemini;
            config.onModelMigrated?.(DEFAULT_IMAGE_MODELS.gemini);
        }
        const isLegacyImagen = cleanModel.startsWith('imagen-');

        if (isLegacyImagen) {
            const url = `${CLOUD_API_URLS.geminiModels}/${cleanModel}:predict?key=${encodeURIComponent(key)}`;
            const payload = {
                instances: [{ prompt }],
                parameters: { sampleCount: 1, aspectRatio, outputMimeType: 'image/jpeg' }
            };
            const response = await fetchWithTimeout(
                url,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                    body: JSON.stringify(payload)
                },
                60000
            );

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(extractGeminiErrorMessage(response.status, errText));
            }

            const data = (await response.json()) as GeminiImageApiResponse;
            const b64 =
                data.predictions?.[0]?.bytesBase64Encoded ||
                data.predictions?.[0]?.image?.imageBytes ||
                data.predictions?.[0]?.imageBytes ||
                data.generatedImages?.[0]?.image?.imageBytes;
            if (!b64) {
                throw new Error(`No image returned from Gemini API. Response: ${JSON.stringify(data)}`);
            }
            const mimeType =
                data.predictions?.[0]?.mimeType ||
                data.generatedImages?.[0]?.image?.mimeType ||
                'image/jpeg';
            return `data:${mimeType};base64,${b64}`;
        }

        const url = `${CLOUD_API_URLS.geminiModels}/${cleanModel}:generateContent?key=${encodeURIComponent(key)}`;
        const promptWithAspect =
            aspectRatio && !prompt.toLowerCase().includes('aspect ratio')
                ? `${prompt} (Aspect ratio: ${aspectRatio})`
                : prompt;
        const payload = {
            contents: [{ parts: [{ text: promptWithAspect }] }],
            generationConfig: { responseModalities: ['IMAGE'] }
        };

        const response = await fetchWithTimeout(
            url,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                body: JSON.stringify(payload)
            },
            60000
        );

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(extractGeminiErrorMessage(response.status, errText));
        }

        const data = (await response.json()) as GeminiImageApiResponse;
        const imagePart = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
        if (imagePart?.inlineData?.data) {
            const mimeType = imagePart.inlineData.mimeType || 'image/jpeg';
            return `data:${mimeType};base64,${imagePart.inlineData.data}`;
        }

        const b64 =
            data.predictions?.[0]?.bytesBase64Encoded ||
            data.predictions?.[0]?.image?.imageBytes ||
            data.generatedImages?.[0]?.image?.imageBytes;
        if (b64) {
            const mimeType = data.predictions?.[0]?.mimeType || 'image/jpeg';
            return `data:${mimeType};base64,${b64}`;
        }
        throw new Error(`No image returned from Gemini API. Response: ${JSON.stringify(data)}`);
        });
    }

    if (prov === 'openrouter') {
        return withCloudActivity(async () => {
        const cleanModel = (model || DEFAULT_IMAGE_MODELS.openrouter).trim();
        const cleanAspectRatio = (aspectRatio || '').trim();
        const referer =
            typeof window !== 'undefined' && window.location ? window.location.href : '';
        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
            'HTTP-Referer': referer,
            'X-Title': APP_HTTP_HEADERS.title
        };

        const payload: Record<string, unknown> = {
            model: cleanModel,
            prompt,
            response_format: 'b64_json'
        };
        if (cleanAspectRatio) {
            payload.aspect_ratio = cleanAspectRatio;
        }

        const response = await fetchWithTimeout(
            CLOUD_API_URLS.openRouterImages,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            },
            60000
        );

        if (response.ok) {
            const data = (await response.json()) as OpenRouterImageResponse;
            return extractOpenRouterImageDataUrl(data);
        }

        const errText = await response.text();

        if (response.status === 400 && cleanAspectRatio && /aspect_ratio/i.test(errText)) {
            const retryResponse = await fetchWithTimeout(
                CLOUD_API_URLS.openRouterImages,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: cleanModel,
                        prompt,
                        response_format: 'b64_json'
                    })
                },
                60000
            );
            if (retryResponse.ok) {
                const retryData = (await retryResponse.json()) as OpenRouterImageResponse;
                return extractOpenRouterImageDataUrl(retryData);
            }
            const retryErrText = await retryResponse.text();
            throw new Error(`OpenRouter Image API failed: ${retryResponse.status} - ${retryErrText}`);
        }

        if ((response.status === 404 || response.status === 405) && /chat\/completions/i.test(errText)) {
            const chatResponse = await fetchWithTimeout(
                CLOUD_API_URLS.openRouterChat,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: cleanModel,
                        messages: [{ role: 'user', content: prompt }],
                        modalities: ['image']
                    })
                },
                60000
            );
            if (chatResponse.ok) {
                const chatData = (await chatResponse.json()) as OpenRouterImageResponse;
                return extractOpenRouterImageDataUrl(chatData);
            }
            const chatErrText = await chatResponse.text();
            throw new Error(`OpenRouter Image API failed: ${chatResponse.status} - ${chatErrText}`);
        }

        throw new Error(`OpenRouter Image API failed: ${response.status} - ${errText}`);
        });
    }

    throw new Error(`Unsupported Image Provider: ${prov}`);
}
