/**
 * @module config/models
 * Image presets, provider default model catalogs, icon registries, and UI view labels.
 */

import type { ModelDescriptor } from '@/types';

export interface IconOption {
    value: string;
    label: string;
}

export interface ImageStylePreset {
    id: string;
    name: string;
    description: string;
}

export const AVAILABLE_ICONS: readonly IconOption[] = [
    { value: 'tag', label: 'Tag (Generic)' },
    { value: 'book-open', label: 'Book Open (Default)' },
    { value: 'zap', label: 'Zap (Action)' },
    { value: 'heart', label: 'Heart (Romance)' },
    { value: 'eye', label: 'Eye (Suspense)' },
    { value: 'message-square', label: 'Message Square (Dialogue)' },
    { value: 'search', label: 'Search (Mystery)' },
    { value: 'globe', label: 'Globe (Grand Scale)' },
    { value: 'scroll', label: 'Scroll (World Building)' },
    { value: 'smile', label: 'Smile (Humor)' },
    { value: 'layers', label: 'Layers (Exposition)' },
    { value: 'sparkles', label: 'Sparkles (Revelation)' },
    { value: 'help-circle', label: 'Help Circle (Uncertainty)' },
    { value: 'brain', label: 'Brain (Reflection)' },
    { value: 'users', label: 'Users (Relational)' },
    { value: 'swords', label: 'Swords (Combat)' },
    { value: 'shield', label: 'Shield (Defense)' },
    { value: 'flame', label: 'Flame (Intensity)' },
    { value: 'compass', label: 'Compass (Journey)' },
    { value: 'clock', label: 'Clock (Pacing)' },
    { value: 'key', label: 'Key (Reveal)' },
    { value: 'feather', label: 'Feather (Writing)' },
    { value: 'award', label: 'Award (Glory)' },
    { value: 'anchor', label: 'Anchor (Stability)' },
    { value: 'aperture', label: 'Aperture (Focus)' },
    { value: 'bell', label: 'Bell (Alert)' },
    { value: 'bomb', label: 'Bomb (Threat)' },
    { value: 'bone', label: 'Bone (Death)' },
    { value: 'briefcase', label: 'Briefcase (Business)' },
    { value: 'camera', label: 'Camera (Visual)' },
    { value: 'castle', label: 'Castle (Setting)' },
    { value: 'cloud', label: 'Cloud (Atmosphere)' },
    { value: 'coffee', label: 'Coffee (Cozy)' },
    { value: 'coins', label: 'Coins (Wealth)' },
    { value: 'crown', label: 'Crown (Royalty)' },
    { value: 'database', label: 'Database (Lore)' },
    { value: 'droplet', label: 'Droplet (Rain/Blood)' },
    { value: 'frown', label: 'Frown (Sorrow)' },
    { value: 'fingerprint', label: 'Fingerprint (Identity)' },
    { value: 'flower', label: 'Flower (Beauty)' },
    { value: 'gavel', label: 'Gavel (Law)' },
    { value: 'scale', label: 'Scale (Justice/Dilemma)' },
    { value: 'ghost', label: 'Ghost (Horror)' },
    { value: 'gift', label: 'Gift (Surprise)' },
    { value: 'hammer', label: 'Hammer (Craft)' },
    { value: 'home', label: 'Home (Domestic)' },
    { value: 'image', label: 'Image (Art)' },
    { value: 'infinity', label: 'Infinity (Cosmic)' },
    { value: 'life-buoy', label: 'Life Buoy (Rescue)' },
    { value: 'link', label: 'Link (Connection)' },
    { value: 'lock', label: 'Lock (Secrecy)' },
    { value: 'magnet', label: 'Magnet (Attraction)' },
    { value: 'map', label: 'Map (Geography)' },
    { value: 'map-pin', label: 'Map Pin (Location)' },
    { value: 'milestone', label: 'Milestone (Progress)' },
    { value: 'moon', label: 'Moon (Dreams)' },
    { value: 'mountain', label: 'Mountain (Obstacle)' },
    { value: 'music', label: 'Music (Sound)' },
    { value: 'package', label: 'Package (Object)' },
    { value: 'palette', label: 'Palette (Color)' },
    { value: 'pen-tool', label: 'Pen Tool (Craft)' },
    { value: 'phone', label: 'Phone (Call)' },
    { value: 'puzzle', label: 'Puzzle (Conspiracy)' },
    { value: 'radio', label: 'Radio (Signal)' },
    { value: 'scissors', label: 'Scissors (Severance)' },
    { value: 'send', label: 'Send (Message)' },
    { value: 'skull', label: 'Skull (Fatality)' },
    { value: 'snowflake', label: 'Snowflake (Cold)' },
    { value: 'sun', label: 'Sun (Warmth)' },
    { value: 'target', label: 'Target (Goal)' },
    { value: 'thumbs-up', label: 'Thumbs Up (Approval)' },
    { value: 'trash-2', label: 'Trash (Discard)' },
    { value: 'trophy', label: 'Trophy (Success)' },
    { value: 'umbrella', label: 'Umbrella (Protection)' },
    { value: 'volume-2', label: 'Volume (Voice)' },
    { value: 'wind', label: 'Wind (Speed)' },
    { value: 'wand', label: 'Wand (Magic)' },
    { value: 'dribbble', label: 'Dribbble (Leisure)' },
    { value: 'sprout', label: 'Sprout (Growth)' },
    { value: 'activity', label: 'Activity (Pulse)' },
    { value: 'battery', label: 'Battery (Energy)' },
    { value: 'crosshair', label: 'Crosshair (Precision)' }
];

export const DEFAULT_IMAGE_STYLES: readonly ImageStylePreset[] = [
    { id: 'none', name: 'None (No added style)', description: '' },
    {
        id: 'dark_fantasy',
        name: 'Dark Fantasy Oil Painting',
        description:
            'dark fantasy oil painting style, heavy impasto, rich textures, moody chiaroscuro lighting, deep shadows, detailed brushwork'
    },
    {
        id: 'cyberpunk',
        name: 'Cyberpunk Neon Vector',
        description:
            'cyberpunk vector art style, clean lines, vibrant neon color palette, glowing accents, synthwave aesthetic, high contrast'
    },
    {
        id: 'ghibli',
        name: 'Studio Ghibli Anime',
        description:
            'classic hand-drawn anime style, soft watercolor backgrounds, clean line art, warm emotional lighting, gentle nostalgic atmosphere'
    },
    {
        id: 'noir',
        name: 'Cinematic Noir Photography',
        description:
            'high-contrast monochrome cinematic photography, film noir style, heavy shadows, wet streets, atmospheric fog, dramatic key lighting'
    },
    {
        id: 'watercolor',
        name: 'Vintage Watercolor',
        description:
            'vintage watercolor illustration, soft pastel washes, delicate ink outlines, textured paper, whimsical and nostalgic feel'
    },
    {
        id: 'concept_art',
        name: 'Epic Digital Concept Art',
        description:
            'epic fantasy digital concept art style, sweeping landscapes, volumetric lighting, highly detailed environment, dramatic scale and atmosphere'
    },
    {
        id: 'charcoal',
        name: 'Pencil Sketch & Charcoal',
        description:
            'detailed pencil sketch and charcoal drawing, cross-hatching, realistic textures, artistic paper grain, high contrast sketch'
    },
    {
        id: 'pop_art',
        name: 'Retro Comic Book Pop Art',
        description:
            'retro 1980s comic book style, bold outlines, halftone dot patterns, saturated primary colors, dynamic action lines'
    },
    {
        id: 'woodcut',
        name: 'Mythological Woodcut Print',
        description:
            'traditional woodblock print style, bold black ink cuts, vintage paper texture, mythological illustration, stylized engravings'
    },
    {
        id: 'surrealism',
        name: 'Surrealist Dreamscape',
        description:
            'surrealist painting style, dreamlike atmosphere, melting geometries, strange lighting, rich symbolic details, vivid colors'
    }
];

export const DEFAULT_GEMINI_IMAGE_MODELS: readonly ImageStylePreset[] = [
    {
        id: 'gemini-3.1-flash-image',
        name: 'Nano Banana 2 (gemini-3.1-flash-image)',
        description: 'Google Gemini 3.1 Flash Image model (recommended)'
    },
    {
        id: 'gemini-3.1-flash-lite-image',
        name: 'Nano Banana 2 Lite (gemini-3.1-flash-lite-image)',
        description: 'Google Gemini 3.1 Flash Lite Image model'
    },
    {
        id: 'gemini-3-pro-image',
        name: 'Nano Banana Pro (gemini-3-pro-image)',
        description: 'Google Gemini 3 Pro high-fidelity image model'
    },
    {
        id: 'gemini-2.5-flash-image',
        name: 'Nano Banana (gemini-2.5-flash-image)',
        description: 'Google Gemini 2.5 Flash Image model'
    }
];

export const DEFAULT_OPENROUTER_IMAGE_MODELS: readonly ImageStylePreset[] = [
    {
        id: 'stabilityai/stable-diffusion-xl',
        name: 'Stable Diffusion XL (stabilityai/stable-diffusion-xl)',
        description: 'Stability AI SDXL 1.0'
    },
    {
        id: 'black-forest-labs/flux-1-schnell',
        name: 'FLUX.1 Schnell (black-forest-labs/flux-1-schnell)',
        description: 'Black Forest Labs FLUX.1 Schnell'
    },
    {
        id: 'black-forest-labs/flux-1-dev',
        name: 'FLUX.1 Dev (black-forest-labs/flux-1-dev)',
        description: 'Black Forest Labs FLUX.1 Dev'
    },
    {
        id: 'recraft/recraft-v3',
        name: 'Recraft V3 (recraft/recraft-v3)',
        description: 'Recraft Vector and Graphic Design Model'
    }
];

export const NANO_GPT_DEFAULT_MODELS: readonly ModelDescriptor[] = [
    {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'Flagship OpenAI model',
        contextLength: 128000,
        capabilities: { vision: true, json: true }
    },
    {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Fast, lightweight model',
        contextLength: 128000,
        capabilities: { vision: true, json: true }
    },
    {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        description: 'Anthropic flagship model',
        contextLength: 200000,
        capabilities: { vision: true, json: true }
    },
    {
        id: 'deepseek/deepseek-r1',
        name: 'DeepSeek R1',
        description: 'Open-weight reasoning model',
        contextLength: 64000,
        capabilities: { reasoning: true, json: true }
    },
    {
        id: 'deepseek/deepseek-chat',
        name: 'DeepSeek V3',
        description: 'General language model',
        contextLength: 64000,
        capabilities: { json: true }
    },
    {
        id: 'deepseek/deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        description: 'Fast, high-quality model — 1M context, 384K output',
        contextLength: 1048576,
        capabilities: { reasoning: true, json: true }
    }
];

export const VIEW_LABELS: Record<string, string> = {
    library: 'Bookshelf',
    setup: 'New Story',
    dashboard: 'Overview',
    cast: 'Cast & Characters',
    relationships: 'Character Dynamics',
    lore: 'World & Archives',
    structure: 'Story Outline',
    sequence_dashboard: 'Scene Studio',
    writer: 'Prose Studio',
    directive: 'Request Change',
    editorial: 'Developmental Polish',
    inspector: 'Story Memory Search',
    pipeline: 'Live Progress',
    logs: "Author's Log",
    settings: 'Settings',
    reader: 'Reading Room'
};
