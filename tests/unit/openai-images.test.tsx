import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_IMAGE_MODELS, OPENAI_IMAGE_MODELS } from '@/config';
import { generateImage, openAiImageSize } from '@/services/images';
import { OpenAiImageModel } from '@/views/settings/OpenAiImageModel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function stubFetch(response: () => Response) {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
        async () => response()
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('OpenAI image provider', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('maps aspect ratios to the three GPT Image sizes', () => {
        expect(openAiImageSize('1:1')).toBe('1024x1024');
        expect(openAiImageSize('3:4')).toBe('1024x1536');
        expect(openAiImageSize('16:9')).toBe('1536x1024');
        expect(openAiImageSize('')).toBe('1024x1024');
    });

    it('posts to the Images API with the dedicated key and returns a data URL', async () => {
        const fetchMock = stubFetch(() => json({ data: [{ b64_json: 'QUJD' }], output_format: 'jpeg' }));
        const result = await generateImage('Lantern alley', '3:4', {
            provider: 'openai',
            model: 'gpt-image-1.5',
            apiKey: 'sk-test'
        });
        expect(result).toBe('data:image/jpeg;base64,QUJD');
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('https://api.openai.com/v1/images/generations');
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
        expect(JSON.parse(String(init?.body))).toEqual({
            model: 'gpt-image-1.5',
            prompt: 'Lantern alley',
            n: 1,
            size: '1024x1536',
            output_format: 'jpeg'
        });
    });

    it('uses the default model when none is set', async () => {
        const fetchMock = stubFetch(() => json({ data: [{ b64_json: 'QUJD' }] }));
        await generateImage('Cover', '1:1', { provider: 'openai', model: ' ', apiKey: 'sk-test' });
        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe(DEFAULT_IMAGE_MODELS.openai);
    });

    it('never borrows the Gemini or OpenRouter key', async () => {
        const fetchMock = stubFetch(() => json({}));
        await expect(
            generateImage('Cover', '1:1', {
                provider: 'openai',
                apiKey: '',
                fallbackGeminiKey: 'gem',
                fallbackOpenRouterKey: 'or'
            })
        ).rejects.toThrow('needs an OpenAI API key');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("surfaces OpenAI's own error message, and an empty result", async () => {
        stubFetch(() => json({ error: { message: 'Your organization must be verified.' } }, 403));
        await expect(
            generateImage('Cover', '1:1', { provider: 'openai', apiKey: 'sk-test' })
        ).rejects.toThrow('OpenAI Image API failed: Your organization must be verified.');

        stubFetch(() => json({ data: [] }));
        await expect(
            generateImage('Cover', '1:1', { provider: 'openai', apiKey: 'sk-test' })
        ).rejects.toThrow('No image returned from OpenAI');
    });
});

describe('OpenAiImageModel', () => {
    let root: Root | null = null;
    let host: HTMLDivElement | null = null;

    function mount(imageModel: string, setImageModel = vi.fn()) {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        act(() => root!.render(<OpenAiImageModel imageModel={imageModel} setImageModel={setImageModel} />));
        return { host, setImageModel };
    }

    afterEach(() => {
        act(() => root?.unmount());
        host?.remove();
        root = null;
        host = null;
    });

    it('lists the known models and has the default among them', () => {
        const { host } = mount(DEFAULT_IMAGE_MODELS.openai);
        const select = host.querySelector('select')!;
        expect(select.value).toBe(DEFAULT_IMAGE_MODELS.openai);
        expect(select.options.length).toBe(OPENAI_IMAGE_MODELS.length + 1);
        expect(host.querySelector('input')).toBeNull();
    });

    it('opens a text field for a custom model id', () => {
        const { host, setImageModel } = mount(DEFAULT_IMAGE_MODELS.openai);
        const select = host.querySelector('select')!;
        act(() => {
            select.value = '__custom__';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(setImageModel).toHaveBeenCalledWith('');
    });

    it('shows a hand-typed id in the text field', () => {
        const { host } = mount('gpt-image-9');
        expect(host.querySelector('select')!.value).toBe('__custom__');
        expect(host.querySelector('input')!.value).toBe('gpt-image-9');
    });
});
