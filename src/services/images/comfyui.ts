/**
 * @module services/images/comfyui
 * ComfyUI Krea 2 workflow builder, default model picker, and async queue/poll client.
 */

import { fetchWithTimeout } from '@/services/http';

export interface ComfyDimensions {
    width: number;
    height: number;
}

export interface ComfyKrea2WorkflowParams {
    prompt: string;
    width: number;
    height: number;
    seed: number;
    unet: string;
    clip: string;
    vae: string;
    lora?: string;
    loraStrength?: number;
    steps?: number;
    cfg?: number;
    sampler?: string;
    scheduler?: string;
}

export interface ComfyWorkflowNode {
    class_type: string;
    inputs: Record<string, unknown>;
}

export type ComfyNodeGraph = Record<string, ComfyWorkflowNode>;

export interface ComfyGenerationOptions {
    url?: string;
    unet: string;
    clip: string;
    vae: string;
    lora?: string;
    loraStrength?: number;
    steps?: number;
    cfg?: number;
    sampler?: string;
    scheduler?: string;
    timeoutSec?: number;
}

/** Converts an aspect-ratio string into Krea 2 pixel dimensions. */
export function comfyAspectToSize(aspectRatio: string): ComfyDimensions {
    const sizes: Record<string, [number, number]> = {
        '1:1': [1024, 1024],
        '3:4': [896, 1152],
        '4:3': [1152, 896],
        '16:9': [1344, 768],
        '9:16': [768, 1344]
    };
    const [width, height] = Object.prototype.hasOwnProperty.call(sizes, aspectRatio)
        ? sizes[aspectRatio]
        : sizes['1:1'];
    return { width, height };
}

/** Builds a ComfyUI API prompt graph for Krea 2 (with optional model-only LoRA). */
export function buildComfyKrea2Workflow({
    prompt,
    width,
    height,
    seed,
    unet,
    clip,
    vae,
    lora,
    loraStrength = 1,
    steps = 20,
    cfg = 1,
    sampler = 'euler',
    scheduler = 'simple'
}: ComfyKrea2WorkflowParams): ComfyNodeGraph {
    const graph: ComfyNodeGraph = {
        '10': { class_type: 'UNETLoader', inputs: { unet_name: unet, weight_dtype: 'default' } },
        '11': { class_type: 'CLIPLoader', inputs: { clip_name: clip, type: 'krea2', device: 'default' } },
        '12': { class_type: 'VAELoader', inputs: { vae_name: vae } },
        '2': { class_type: 'CLIPTextEncode', inputs: { clip: ['11', 0], text: prompt } },
        '3': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['2', 0] } },
        '4': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
        '5': {
            class_type: 'KSampler',
            inputs: {
                model: ['10', 0],
                positive: ['2', 0],
                negative: ['3', 0],
                latent_image: ['4', 0],
                seed,
                steps,
                cfg,
                sampler_name: sampler,
                scheduler,
                denoise: 1
            }
        },
        '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['12', 0] } },
        '7': {
            class_type: 'SaveImage',
            inputs: { images: ['6', 0], filename_prefix: 'EllipsisProse/ellipsisprose' }
        }
    };
    if (typeof lora === 'string' && lora.trim()) {
        graph['15'] = {
            class_type: 'LoraLoaderModelOnly',
            inputs: { model: ['10', 0], lora_name: lora, strength_model: loraStrength }
        };
        graph['5'].inputs.model = ['15', 0];
    }
    return graph;
}

/** Picks the first option matching any ordered pattern, or returns `''`. */
export function pickComfyDefault(
    options: ReadonlyArray<string>,
    patterns: ReadonlyArray<RegExp>
): string {
    for (const pattern of patterns) {
        const match = options.find((option) => new RegExp(pattern.source, pattern.flags).test(option));
        if (match !== undefined) return match;
    }
    return '';
}

interface ComfyQueuedResponse {
    prompt_id?: string;
    error?: { message?: string };
    node_errors?: Record<string, { errors?: Array<{ message?: string; details?: string }> }>;
}

interface ComfyHistoryEntry {
    status?: {
        status_str?: string;
        messages?: Array<[string, { exception_message?: string; message?: string }?]>;
    };
    outputs?: Record<
        string,
        { images?: Array<{ filename?: string; subfolder?: string; type?: string }> }
    >;
}

/** Submits a Krea 2 workflow to local ComfyUI, polls history, and returns a data URL. */
export async function generateComfyImage(
    prompt: string,
    aspectRatio: string,
    options: ComfyGenerationOptions
): Promise<string> {
    const unet = String(options.unet || '');
    const clip = String(options.clip || '');
    const vae = String(options.vae || '');
    if (!unet.trim() || !clip.trim() || !vae.trim()) {
        throw new Error('ComfyUI: choose the Krea 2 diffusion model, text encoder and VAE in Settings');
    }

    const baseUrl = (String(options.url || '').trim() || 'http://127.0.0.1:8188').replace(/\/+$/, '');
    const rawTimeout = options.timeoutSec;
    const timeoutSec = typeof rawTimeout === 'number' && Number.isFinite(rawTimeout) && rawTimeout > 0
        ? rawTimeout
        : 600;
    const started = Date.now();
    const controller = new AbortController();
    const seedParts = crypto.getRandomValues(new Uint32Array(2));
    const seed = (seedParts[0] & 0x1fffff) * 0x100000000 + seedParts[1];
    const workflow = buildComfyKrea2Workflow({
        prompt,
        ...comfyAspectToSize(aspectRatio),
        seed,
        unet,
        clip,
        vae,
        lora: options.lora,
        loraStrength: options.loraStrength,
        steps: options.steps,
        cfg: options.cfg,
        sampler: options.sampler,
        scheduler: options.scheduler
    });

    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const timeoutError = (): Error => new Error(`ComfyUI generation timed out after ${timeoutSec} s`);
    const deadline = new Promise<never>((_resolve, reject) => {
        deadlineTimer = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(timeoutError());
        }, timeoutSec * 1000);
    });

    const generate = async (): Promise<string> => {
        let response: Response;
        try {
            response = await fetchWithTimeout(
                `${baseUrl}/prompt`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: workflow, client_id: 'ellipsisprose' }),
                    signal: controller.signal
                },
                0
            );
        } catch (error) {
            const msg = error instanceof Error ? error.message : '';
            if (error instanceof TypeError || /failed to fetch/i.test(msg)) {
                throw new Error(
                    `Cannot reach ComfyUI at ${baseUrl}. Is it running, and was it started with --enable-cors-header? See README.`,
                    { cause: error }
                );
            }
            throw error;
        }

        const queued = (await response.json()) as ComfyQueuedResponse;
        if (!response.ok) {
            const nodeError = Object.values(queued.node_errors || {}).flatMap(
                (node) => node.errors || []
            )[0];
            const details = [queued.error?.message, nodeError?.message, nodeError?.details]
                .filter(Boolean)
                .join('; ');
            throw new Error(`ComfyUI: ${details || `HTTP ${response.status}`}`);
        }

        const id = queued.prompt_id;
        if (!id) throw new Error('ComfyUI: no prompt_id returned');
        console.log(`[ComfyUI] queued ${id}`);

        while (!controller.signal.aborted) {
            await new Promise<void>((resolve) => {
                pollTimer = setTimeout(resolve, 1500);
            });
            if (controller.signal.aborted) throw timeoutError();

            const historyResponse = await fetchWithTimeout(
                `${baseUrl}/history/${encodeURIComponent(id)}`,
                { signal: controller.signal },
                0
            );
            const history = (await historyResponse.json()) as Record<string, ComfyHistoryEntry | undefined>;
            if (!historyResponse.ok) {
                throw new Error(`ComfyUI history failed: HTTP ${historyResponse.status}`);
            }

            const entry = history[id];
            if (entry?.status?.status_str === 'error') {
                const executionError = entry.status.messages?.find(
                    (message) => message[0] === 'execution_error'
                )?.[1];
                throw new Error(
                    `ComfyUI: ${executionError?.exception_message || executionError?.message || 'execution failed'}`
                );
            }

            const img = Object.values(entry?.outputs || {})
                .flatMap((output) => output.images || [])
                .find((item) => item.filename);
            if (!img || !img.filename) continue;

            const query = new URLSearchParams({
                filename: img.filename,
                subfolder: img.subfolder || '',
                type: img.type || 'output'
            });
            const imageResponse = await fetchWithTimeout(
                `${baseUrl}/view?${query}`,
                { signal: controller.signal },
                0
            );
            if (!imageResponse.ok) {
                throw new Error(`ComfyUI image download failed: HTTP ${imageResponse.status}`);
            }

            const blob = await imageResponse.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    if (typeof reader.result === 'string') {
                        resolve(reader.result);
                    } else {
                        reject(new Error('ComfyUI: failed to read image as data URL'));
                    }
                };
                reader.onerror = () => reject(reader.error || new Error('ComfyUI: failed to read image'));
                reader.onabort = () => reject(timeoutError());
                controller.signal.addEventListener('abort', () => reader.abort(), { once: true });
                reader.readAsDataURL(blob);
            });
            console.log(`[ComfyUI] done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
            return dataUrl;
        }
        throw timeoutError();
    };

    try {
        return await Promise.race([generate(), deadline]);
    } catch (error) {
        if (timedOut) throw timeoutError();
        throw error;
    } finally {
        clearTimeout(deadlineTimer);
        clearTimeout(pollTimer);
        controller.abort();
    }
}
