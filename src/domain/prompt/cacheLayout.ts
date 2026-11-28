/**
 * @module domain/prompt/cacheLayout
 * Prompt order for caching. Every model service (Claude, OpenAI, Gemini, DeepSeek) and every
 * local model (KoboldCPP, llama.cpp) can skip re-reading a prompt only for the part at its start
 * that is the same as last time. So what changes least goes first:
 *
 *   story  → the same for every scene of the story (persona, genre rules, world primer)
 *   cast   → changes only when the people in the scene change (voices, profiles)
 *   scene  → changes with each scene (story so far, lore, blueprint)
 *   call   → changes with each call (the draft being revised, the critique, a directive)
 *
 * A prompt builder marks the end of the part that later calls will repeat with CACHE_POINT. The
 * mark is taken out before the prompt is sent, and services that want to be told where the
 * repeated part ends (Claude, directly or through OpenRouter) are told.
 */

/** Invisible, so a prompt that reaches a model with the mark still in it reads the same. */
export const CACHE_POINT = String.fromCharCode(0x2063, 0x2063, 0x2063);

/** Prefixes shorter than this are not worth a cache mark (services refuse short ones anyway). */
export const MIN_CACHE_PREFIX_CHARS = 1024;

export interface PromptWithCachePoint {
    /** The prompt with every mark removed. */
    prompt: string;
    /** Where the repeated start ends, in characters of the cleaned prompt; null when unmarked or too short. */
    cacheSplitIndex: number | null;
}

/** Removes the cache marks from a prompt and says where the last one stood. */
export function takeCachePoint(raw: string): PromptWithCachePoint {
    const text = String(raw ?? '');
    if (!text.includes(CACHE_POINT)) return { prompt: text, cacheSplitIndex: null };
    const parts = text.split(CACHE_POINT);
    const prompt = parts.join('');
    const index = prompt.length - parts[parts.length - 1].length;
    const usable = index >= MIN_CACHE_PREFIX_CHARS && index < prompt.length;
    return { prompt, cacheSplitIndex: usable ? index : null };
}

export const CACHE_TIERS = ['story', 'cast', 'scene', 'call'] as const;
export type CacheTier = (typeof CACHE_TIERS)[number];

const CHANGES: Record<CacheTier, string> = {
    story: 'only when the story settings change',
    cast: 'only when the people in the scene change',
    scene: 'with every scene',
    call: 'with every call'
};

/** The sections of the scene-writing prompt, by their opening tag, and how often each changes. */
export const PROSE_SECTION_TIERS: Readonly<Record<string, CacheTier>> = {
    synthesized_authorial_persona: 'story',
    genre_pacing_and_dialogue_rules: 'story',
    strict_anti_patterns: 'story',
    world_primer: 'story',
    content_limits: 'story',
    canonical_character_interview_voice: 'cast',
    active_characters_profiles: 'cast',
    story_so_far: 'scene',
    relationship_friction_matrix: 'scene',
    lore_context: 'scene',
    previous_context: 'scene',
    scene_blueprint: 'scene',
    dialogue_pacing_target: 'scene',
    phrase_habits: 'scene',
    current_scene_prior_draft_context: 'call',
    mandatory_full_rewrite_mandate: 'call',
    directive_requirement: 'call'
};

/**
 * Sections that sit after a faster-changing one, each as a sentence. An empty list means the
 * prompt is in cache order. Sections the prompt does not have are ignored.
 */
export function cacheOrderProblems(
    prompt: string,
    tiers: Readonly<Record<string, CacheTier>> = PROSE_SECTION_TIERS
): string[] {
    const found = Object.entries(tiers)
        .map(([tag, tier]) => ({ tag, tier, at: prompt.indexOf(`<${tag}>`) }))
        .filter((section) => section.at >= 0)
        .sort((a, b) => a.at - b.at);
    const problems: string[] = [];
    let fastest: { tag: string; tier: CacheTier } | null = null;
    for (const section of found) {
        const rank = CACHE_TIERS.indexOf(section.tier);
        if (fastest && rank < CACHE_TIERS.indexOf(fastest.tier)) {
            problems.push(
                `<${section.tag}> changes ${CHANGES[section.tier]}, but it comes after <${fastest.tag}>, which changes ${CHANGES[fastest.tier]}. Put <${section.tag}> first, so the start of the prompt stays the same and can stay cached.`
            );
        } else if (!fastest || rank > CACHE_TIERS.indexOf(fastest.tier)) {
            fastest = section;
        }
    }
    return problems;
}

/** Splits text at a cache point into the repeated start and the rest; null when the point is unusable. */
export function splitAtCachePoint(text: string, cacheSplitIndex: number | null | undefined): [string, string] | null {
    if (typeof cacheSplitIndex !== 'number' || !Number.isFinite(cacheSplitIndex)) return null;
    if (cacheSplitIndex < MIN_CACHE_PREFIX_CHARS || cacheSplitIndex >= text.length) return null;
    return [text.slice(0, cacheSplitIndex), text.slice(cacheSplitIndex)];
}
