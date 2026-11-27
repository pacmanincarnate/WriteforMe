/**
 * @module views/settings/OpenAiImageModel
 * Model picker for the OpenAI (GPT Image) image provider: the known models, or any model id typed by hand.
 */

import { ChevronDown } from '@/components';
import { DEFAULT_IMAGE_MODELS, OPENAI_IMAGE_MODELS } from '@/config';

const CUSTOM = '__custom__';
const FIELD =
    'w-full bg-inset border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors';

export function OpenAiImageModel({
    imageModel,
    setImageModel
}: {
    imageModel: string;
    setImageModel: (model: string) => void;
}) {
    const isKnown = OPENAI_IMAGE_MODELS.some((m) => m.id === imageModel);
    return (
        <div className="space-y-2">
            <div className="relative">
                <select
                    aria-label="Image Model"
                    value={isKnown ? imageModel : CUSTOM}
                    onChange={(e) => setImageModel(e.target.value === CUSTOM ? '' : e.target.value)}
                    className={`${FIELD} appearance-none cursor-pointer`}
                >
                    {OPENAI_IMAGE_MODELS.map((m) => (
                        <option key={m.id} value={m.id} title={m.description}>
                            {m.name}
                        </option>
                    ))}
                    <option value={CUSTOM}>Custom / Other Model ID...</option>
                </select>
                <ChevronDown className="absolute right-3 top-2.5 text-ink-400 pointer-events-none" size={14} />
            </div>
            {!isKnown && (
                <input
                    type="text"
                    aria-label="Custom OpenAI image model ID"
                    value={imageModel}
                    onChange={(e) => setImageModel(e.target.value)}
                    placeholder={`e.g. ${DEFAULT_IMAGE_MODELS.openai}`}
                    className={`${FIELD} font-mono`}
                />
            )}
        </div>
    );
}
