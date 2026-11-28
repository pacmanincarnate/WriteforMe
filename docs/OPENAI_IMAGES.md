# OpenAI images (GPT Image)

Settings, Image Generation offers **OpenAI (GPT Image)** as an Image API Provider next to Gemini, OpenRouter and ComfyUI. Covers, scene art and beat art then come from OpenAI's `POST /v1/images/generations`.

- **Key:** the key field under the provider reads **OpenAI API Key** and is required. The app has no OpenAI text provider, so there is no key to fall back on, and the Gemini and OpenRouter keys are never sent to OpenAI. Each image provider saves its own key (`src/hooks/useImageApiKeys.ts`), so the OpenAI key stays put when you switch to Gemini or OpenRouter and back.
- **Models:** the list is `OPENAI_IMAGE_MODELS` in `src/config/models.ts`, kept by hand. "Custom / Other Model ID..." takes any id OpenAI adds later. The default is `DEFAULT_IMAGE_MODELS.openai`.
- **Size:** the app's aspect ratios map to the three sizes every GPT Image model accepts: square `1024x1024`, wide `1536x1024`, tall `1024x1536` (`openAiImageSize`).
- **Format:** images are requested as JPEG so stored art stays small. Quality is left at OpenAI's `auto`.
- OpenAI may ask for organization verification before an account can use GPT Image models; its error message is shown as is.

## Code

- `src/services/images/openai.ts`: the request. `src/services/images/providers.ts` dispatches to it.
- `src/views/settings/OpenAiImageModel.tsx`: the model picker.
- Tests: `tests/unit/openai-images.test.tsx`.
