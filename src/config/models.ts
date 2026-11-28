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
    category?: string;
}

export const IMAGE_STYLE_CATEGORIES = [
    'Painting & Fine Art',
    'Illustration & Printmaking',
    'Animation & Retro-Digital',
    'Photography & Cinema'
] as const;

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

    // Painting & Fine Art
    {
        id: 'fantasy_oil',
        category: 'Painting & Fine Art',
        name: 'Fantasy Illustration (Oil Painting)',
        description:
            'Executed as a museum-grade high-fantasy oil painting on linen canvas, the image blends meticulous anatomical and environmental realism with bold, expressive alla prima brushstrokes. Rich impasto textures catch the eye along highlights while deep, translucent glazes build luminous depth across weathered fabrics, intricate metalwork, and organic surfaces. Dramatic, chiaroscuro-inspired lighting carves the focal subject out of an atmospheric, mist-laden backdrop, infusing the scene with epic scale and classical painterly gravitas.'
    },
    {
        id: 'dutch_master',
        category: 'Painting & Fine Art',
        name: 'Dutch Master',
        description:
            'Painted in the 17th-century Dutch Golden Age oil tradition, the scene achieves breathtaking realism in its rendering of glistening surfaces, heavy textiles, skin texture, and fine atmospheric dust. Intense, directional chiaroscuro lighting—as if cast from a single unseen side window—illuminates the focal subject with warm, sculptural precision while plunging the surrounding space into rich, velvety umber and charcoal darkness. Grounded in a meticulously balanced, asymmetrical composition with subtle oil craquelure and deep varnish sheen, the image radiates quiet drama and tactile permanence.'
    },
    {
        id: 'impressionist_oil',
        category: 'Painting & Fine Art',
        name: 'Impressionist Oil Painting',
        description:
            'Painted in the 19th-century French plein-air Impressionist oil tradition, the scene is built from rapid, visible broken brushstrokes and thick impasto dabs that capture fleeting light rather than rigid outlines. Luminous, sunlit palettes of warm ochres, lavender shadows, cerulean blues, and vibrant greens blend optically on the eye, avoiding harsh black pigments in favor of rich chromatic harmony. Shimmering atmospheric haze, dappled reflections, and soft-edged forms evoke the immediacy, movement, and airy warmth of an outdoor moment captured on raw primed canvas.'
    },

    // Illustration & Printmaking
    {
        id: 'comic_book_cover',
        category: 'Illustration & Printmaking',
        name: 'Full-Color Comic Book Cover Illustration',
        description:
            'Illustrated as a flagship, textless, full-bleed modern comic book cover extending edge-to-edge as clean, unobstructed artwork. Crisp, dynamic India ink linework with varied line weights and intricate cross-hatching defines the forms, anchored by bold, saturated digital coloring and dramatic cel-and-gradient shading. A heroic, slightly exaggerated perspective and punchy rim lighting elevate the visual tension, balancing graphic clarity with the lush, elevated rendering reserved for showcase cover art.'
    },
    {
        id: 'loose_watercolor',
        category: 'Illustration & Printmaking',
        name: 'Ephemeral & Loose Watercolor with Inking',
        description:
            'Created as a delicate, loose watercolor and ink wash illustration on heavy cold-pressed cotton paper, the artwork embraces fluid pigment blooms, soft wet-on-wet bleeds, and intentional areas of untouched white paper. Spontaneous, fine-nibbed fountain pen linework dances over and beneath the translucent washes, sketching in fleeting contours and airy details without rigid boundaries. The palette remains translucent and ephemeral, glowing with diffused, airy light that gives the entire scene a dreamy, half-remembered quality.'
    },
    {
        id: 'pen_and_ink',
        category: 'Illustration & Printmaking',
        name: 'Pen and Ink Illustration',
        description:
            'Drawn as an intricate monochrome pen-and-ink illustration on lightly toothy archival cream paper, the artwork relies entirely on expressive, hand-drawn dip-pen linework without gray washes or color. Dynamic variations in nib pressure create sweeping contour lines, dense cross-hatching, stippling, and energetic gestural scratches that convey volume, texture, and shadow. Stark contrast between deep India ink blacks and raw negative space produces a striking, graphic immediacy reminiscent of classic golden-age editorial and bookplate illustration.'
    },
    {
        id: 'woodcut',
        category: 'Illustration & Printmaking',
        name: 'Detailed Woodcut Print',
        description:
            'Crafted as a meticulous traditional relief woodcut print pressed in dense black ink onto slightly fibrous, off-white handmade paper, the image is constructed from thousands of deliberate, chiseled gouge marks. Bold, angular contours, rhythmic parallel hatching, and crisp carved textures define every form, leaving raw negative-space cutouts where the woodblock was cleared away. Subtle imperfections in ink saturation, faint woodgrain bleed, and heavy embossed edges lend the composition a tactile, folkloric weight and stark graphic power.'
    },

    // Animation & Retro-Digital
    {
        id: 'ghibli',
        category: 'Animation & Retro-Digital',
        name: 'Studio Ghibli',
        description:
            'Rendered in the nostalgic style of classic hand-drawn Japanese cel animation, the scene pairs expressive, cleanly inked foreground elements with richly layered, hand-painted gouache backgrounds. Soft, naturalistic color palettes of sunlit greens, cerulean skies, and warm earth tones are textured with subtle paper grain, delicate brushwork, and billowing, painterly clouds. Dappled natural sunlight filters through the environment with gentle atmospheric depth, creating a sense of quiet wonder, lived-in detail, and breezy cinematic movement.'
    },
    {
        id: 'gritty_anime_90s',
        category: 'Animation & Retro-Digital',
        name: '1990s Gritty Anime',
        description:
            'Rendered as a hand-painted 1990s theatrical anime film cel shot on 35mm film, the image pairs sharp, angular ink outlines and stark hard-edged cel shading with densely detailed, hand-painted gouache backgrounds. Atmospheric urban grime, intricate mechanical surfaces, and dramatic nocturnal lighting are bathed in moody teal shadows, glowing neon accents, and nostalgic analog color grading. Subtle film grain, soft lens halation around bright light sources, and dynamic cinematic framing capture the raw, high-stakes tension and tactile analog weight of classic late-century OVA animation.'
    },
    {
        id: 'pixel_art_16bit',
        category: 'Animation & Retro-Digital',
        name: '16-Bit Pixel Art',
        description:
            'Crafted as high-craft 16-bit retro video game pixel art from the golden era of classic console sprites, the scene is constructed on a crisp, low-resolution pixel grid with zero anti-aliasing blur or smooth vector gradients. Every form is defined by deliberate pixel clusters, readable silhouettes, selective outlines, and meticulous hand-dithered shading patterns that create rich texture within a tight, cohesive 32-color palette. Vibrant, punchy lighting and nostalgic tile-based environmental detail give the composition the unmistakable charm, clarity, and handcrafted precision of vintage arcade and RPG artwork.'
    },

    // Photography & Cinema
    {
        id: 'cinematic_film_still',
        category: 'Photography & Cinema',
        name: 'High-End Cinematic Film Still',
        description:
            'Captured as a prestige, big-budget theatrical film still shot on large-format 65mm digital cinema cameras with master prime lenses, the image delivers tack-sharp micro-detail and effortless dynamic range. Motivated, sculptural lighting blends rich atmospheric haze, volumetric light shafts, and nuanced color separation—such as warm practical lighting balanced against cool ambient shadow—to create breathtaking dimensional depth. Composed with disciplined widescreen geometry, strong leading lines, and deliberate foreground-to-background layering, every inch of the frame feels meticulously art-directed and emotionally resonant.'
    },
    {
        id: 'indie_film',
        category: 'Photography & Cinema',
        name: 'Indie Film Cinematography',
        description:
            'Shot as an intimate, contemporary arthouse independent film still on 35mm anamorphic lenses, the frame features a lifted, low-contrast tonal curve with milky blacks and gently rolled-off highlights. Despite the soft contrast, the color grading is boldly curated and vibrant, pairing saturated, unexpected color harmonies against naturalistic, unpolished textures. An ultra-shallow depth of field isolates the focal point against a creamy, softly distorted bokeh background, anchored by an unconventional, artfully balanced off-center composition.'
    },
    {
        id: 'noir',
        category: 'Photography & Cinema',
        name: 'Film Noir',
        description:
            'Captured as a vintage 1940s black-and-white film noir still shot on 35mm monochrome stock, the image is defined by stark, high-contrast lighting and deep, impenetrable obsidian shadows. Hard directional light slices across the frame—casting sharp geometric pools, Venetian blind shadows, or stark silhouettes—while visible silver-halide film grain and subtle halation soften the brightest specular highlights. Framed with tense, off-kilter angles and claustrophobic depth, the composition exudes atmospheric dread, rain-slicked texture, and cynical mid-century melodrama.'
    },
    {
        id: 'polaroid_snapshot',
        category: 'Photography & Cinema',
        name: 'Polaroid Snapshot',
        description:
            'Captured as a candid, unposed vintage Polaroid SX-70 instant photograph, the image carries the unmistakable chemical imperfections of integral film, including slightly faded shadows, warm magenta-cyan color shifts, and soft, imperfect focus. A harsh, direct on-camera flash flattens the foreground with bright specular reflections while letting the background fall rapidly into murky, underexposed shadow. The unstudied, slightly tilted snapshot framing and subtle emulsion grain evoke an authentic, fleeting slice of analog memory.'
    }
];

export function appendImageStylePrompt(basePrompt: string, styleDescription: string): string {
    const base = basePrompt.trim();
    const style = styleDescription.trim();
    if (!style) return base;
    if (!base) return style;
    if (/[.!?]$/.test(base)) return `${base} ${style}`;
    if (/^[A-Z]/.test(style) && /[.!?]$/.test(style)) return `${base}. ${style}`;
    return `${base}, ${style}`;
}

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
    }
];

export const DEFAULT_OPENROUTER_IMAGE_MODELS: readonly ImageStylePreset[] = [
    {
        id: 'black-forest-labs/flux.2-pro',
        name: 'Black Forest Labs: FLUX.2 Pro',
        description: 'Black Forest Labs FLUX.2 Pro image generation model'
    },
    {
        id: 'black-forest-labs/flux.2-klein-4b',
        name: 'Black Forest Labs: FLUX.2 Klein 4B',
        description: 'Black Forest Labs FLUX.2 Klein 4B fast image model'
    },
    {
        id: 'google/gemini-2.5-flash-image',
        name: 'Google: Gemini 2.5 Flash Image',
        description: 'Google Gemini 2.5 Flash multimodal image model'
    },
    {
        id: 'openai/gpt-image-1-mini',
        name: 'OpenAI: GPT Image 1 Mini',
        description: 'OpenAI GPT Image 1 Mini model'
    },
    {
        id: 'recraft/recraft-v3',
        name: 'Recraft: Recraft V3',
        description: 'Recraft V3 graphic design and illustration model'
    }
];

/**
 * The Claude models offered before (or without) a live Models API lookup. With a key in
 * Settings the list is topped up from `GET /v1/models`, so newer models appear on their own.
 */
export const ANTHROPIC_DEFAULT_MODELS: readonly ModelDescriptor[] = [
    {
        id: 'claude-fable-5-2',
        name: 'Claude Fable 5.2',
        description: 'Most capable model, for the hardest prose and planning work',
        contextLength: 1000000,
        capabilities: { vision: true, json: true, reasoning: true }
    },
    {
        id: 'claude-opus-5-5',
        name: 'Claude Opus 5.5',
        description: 'Strong all-round writer and planner',
        contextLength: 1000000,
        capabilities: { vision: true, json: true, reasoning: true }
    },
    {
        id: 'claude-sonnet-5-5',
        name: 'Claude Sonnet 5.5',
        description: 'Fast and capable, a good fit for reviews and audits',
        contextLength: 1000000,
        capabilities: { vision: true, json: true, reasoning: true }
    },
    {
        id: 'claude-haiku-5-5',
        name: 'Claude Haiku 5.5',
        description: 'Fastest and cheapest, a good fit for outlines and beats',
        contextLength: 1000000,
        capabilities: { vision: true, json: true, reasoning: true }
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

/** The one name for the novel / audio drama choice, and for each side of it. */
export const WRITING_MODE_TITLE = 'Writing mode';
export const WRITING_MODE_LABELS = { novel: 'Novel', audio_drama: 'Audio Drama' } as const;

/** The label for a story's writing mode; anything that is not audio drama is a novel. */
export function writingModeLabel(mode: string | null | undefined): string {
    return mode === 'audio_drama' ? WRITING_MODE_LABELS.audio_drama : WRITING_MODE_LABELS.novel;
}

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
    inspector: 'Memory Search',
    pipeline: 'Live Progress',
    logs: "Author's Log",
    settings: 'Settings',
    reader: 'Reading Room'
};
