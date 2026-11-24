/**
 * @module domain/story/entities
 * Character resolution, relationship extraction, epistemic context sanitization,
 * and prompt block formatting for characters, arcs, and friction pairs.
 */

import type { CastMember, Story } from '@/types';
import { decodeXmlEntities, extractTag, safeEscapeRegex } from '@/utils';

export interface CharacterBrief {
    id: string;
    name: string;
    role: string;
    core_flaw: string;
    core_desire: string;
    vocal_cadence: string;
    corner_role: string;
    why_it_makes_sense: string;
    what_it_costs_them: string;
    way_of_living: string;
    why_it_is_appealing: string;
    shared_outlook: string;
    why_they_are_tempting: string;
    the_hidden_trap: string;
    how_they_ended_up: string;
    human_sympathy: string;
    the_wake_up_call: string;
}

export interface ExtractedRelationship {
    from: string;
    to: string;
    feeling: string;
    hidden_tension: string;
    trust_level: number;
}

/** Parses an XML character brief block into a structured character record. */
export function extractCharacterBrief(block: string): CharacterBrief {
    const charId = extractTag(block, 'char_id') || extractTag(block, 'id');
    const briefRole = extractTag(block, 'brief_role') || extractTag(block, 'role');
    const coreFlaw = extractTag(block, 'core_flaw') || extractTag(block, 'safety_habit');
    const coreDesire = extractTag(block, 'core_desire');
    const vocalCadence = extractTag(block, 'vocal_cadence');

    const cornerRole = extractTag(block, 'corner_role') || extractTag(block, 'corner') || '';
    const whyItMakesSense = extractTag(block, 'why_it_makes_sense') || '';
    const whatItCostsThem = extractTag(block, 'what_it_costs_them') || '';
    const wayOfLiving = extractTag(block, 'way_of_living') || '';
    const whyItIsAppealing = extractTag(block, 'why_it_is_appealing') || '';
    const sharedOutlook = extractTag(block, 'shared_outlook') || '';
    const whyTheyAreTempting = extractTag(block, 'why_they_are_tempting') || '';
    const theHiddenTrap = extractTag(block, 'the_hidden_trap') || '';
    const howTheyEndedUp = extractTag(block, 'how_they_ended_up') || '';
    const humanSympathy = extractTag(block, 'human_sympathy') || '';
    const theWakeUpCall = extractTag(block, 'the_wake_up_call') || '';

    const explicitName =
        extractTag(block, 'name') ||
        extractTag(block, 'char_name') ||
        extractTag(block, 'character_name');
    let name = explicitName ? explicitName.trim() : '';
    if (!name) {
        name = block
            .replace(new RegExp(`<char_id>.*?</char_id>`, 's'), '')
            .replace(new RegExp(`<id>.*?</id>`, 's'), '')
            .replace(new RegExp(`<brief_role>.*?</brief_role>`, 's'), '')
            .replace(new RegExp(`<role>.*?</role>`, 's'), '')
            .replace(new RegExp(`<core_flaw>.*?</core_flaw>`, 's'), '')
            .replace(new RegExp(`<safety_habit>.*?</safety_habit>`, 's'), '')
            .replace(new RegExp(`<core_desire>.*?</core_desire>`, 's'), '')
            .replace(new RegExp(`<vocal_cadence>.*?</vocal_cadence>`, 's'), '')
            .replace(new RegExp(`<corner_role>.*?</corner_role>`, 's'), '')
            .replace(new RegExp(`<why_it_makes_sense>.*?</why_it_makes_sense>`, 's'), '')
            .replace(new RegExp(`<what_it_costs_them>.*?</what_it_costs_them>`, 's'), '')
            .replace(new RegExp(`<way_of_living>.*?</way_of_living>`, 's'), '')
            .replace(new RegExp(`<why_it_is_appealing>.*?</why_it_is_appealing>`, 's'), '')
            .replace(new RegExp(`<shared_outlook>.*?</shared_outlook>`, 's'), '')
            .replace(new RegExp(`<why_they_are_tempting>.*?</why_they_are_tempting>`, 's'), '')
            .replace(new RegExp(`<the_hidden_trap>.*?</the_hidden_trap>`, 's'), '')
            .replace(new RegExp(`<how_they_ended_up>.*?</how_they_ended_up>`, 's'), '')
            .replace(new RegExp(`<human_sympathy>.*?</human_sympathy>`, 's'), '')
            .replace(new RegExp(`<the_wake_up_call>.*?</the_wake_up_call>`, 's'), '')
            .trim();
    }

    name = name.replace(/<\/?[a-zA-Z0-9_]+>/g, '').trim().split('\n')[0].trim();
    name = decodeXmlEntities(name);

    return {
        id: charId || `C_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: name || 'Unnamed Character',
        role: briefRole,
        core_flaw: coreFlaw,
        core_desire: coreDesire,
        vocal_cadence: vocalCadence,
        corner_role: cornerRole,
        why_it_makes_sense: whyItMakesSense,
        what_it_costs_them: whatItCostsThem,
        way_of_living: wayOfLiving,
        why_it_is_appealing: whyItIsAppealing,
        shared_outlook: sharedOutlook,
        why_they_are_tempting: whyTheyAreTempting,
        the_hidden_trap: theHiddenTrap,
        how_they_ended_up: howTheyEndedUp,
        human_sympathy: humanSympathy,
        the_wake_up_call: theWakeUpCall
    };
}

/** Parses an XML `<relationship>` block into a relationship record. */
export function extractRelationship(block: string): ExtractedRelationship {
    const sourceId = extractTag(block, 'source_id');
    const targetId = extractTag(block, 'target_id');
    const dynamicSummary = extractTag(block, 'dynamic_summary');
    const hiddenTension = extractTag(block, 'hidden_tension');
    const trustLevel = parseInt(extractTag(block, 'trust_level'), 10) || 5;
    return {
        from: sourceId,
        to: targetId,
        feeling: dynamicSummary,
        hidden_tension: hiddenTension,
        trust_level: trustLevel
    };
}

/** Builds the `<overall_story_information>` prompt block. */
export function buildStoryInfoBlock(
    story: Partial<Story> & Record<string, unknown>,
    { fullStoryLabels = false }: { fullStoryLabels?: boolean } = {}
): string {
    const threads = Array.isArray(story.threads)
        ? (story.threads as Array<{ id?: string; name?: string; description?: string }>)
        : [];
    return `<overall_story_information>
<concept>${story.concept || ''}</concept>
<concept_fidelity_mandate>
The concept above represents the author's specific creative vision. Every event, consequence, and dramatic choice described in this concept must be preserved faithfully throughout the narrative structure. Do not soften, euphemize, redirect, or omit any element of the author's stated intentions. The level of dramatic intensity in the concept is intentional and must be maintained.
</concept_fidelity_mandate>
${story.heart_of_the_dilemma ? `<heart_of_the_dilemma>\n${story.heart_of_the_dilemma}\n</heart_of_the_dilemma>\n` : ''}<story_so_far>${story.story_so_far || 'The story is just beginning (no prose has been written yet).'}</story_so_far>
<status_quo>${story.status_quo || ''}</status_quo>
<story_arc>
Inciting Incident: ${story.inciting_incident || ''}
Themes: ${story.themes || ''}
Threads:
${threads.map((t) => `- [${t.id}] ${t.name}: ${t.description}`).join('\n')}
Core Thematic Argument: ${story.core_thematic_argument || ''}
Story Starting Value State${fullStoryLabels ? ' (Full Story)' : ''}: ${story.starting_value_state || ''}
Story Ending Value State${fullStoryLabels ? ' (Full Story)' : ''}: ${story.ending_value_state || ''}
</story_arc>
</overall_story_information>`;
}

/**
 * Resolves any character identifier (exact name, ID, alias, first name, positional code `C1`,
 * or substring) to a character object inside `cast`.
 */
export function resolveCharacter(
    identifier: unknown,
    cast: CastMember[] = []
): CastMember | null {
    if (!identifier || !Array.isArray(cast) || cast.length === 0) return null;
    const str = String(identifier).trim();
    if (!str) return null;
    const lower = str.toLowerCase();

    let found = cast.find((c) => String(c.name || '').trim().toLowerCase() === lower);
    if (found) return found;

    found = cast.find((c) => String(c.id || '').trim().toLowerCase() === lower);
    if (found) return found;

    found = cast.find((c) => {
        const aliases = Array.isArray(c.aliases)
            ? (c.aliases as unknown[])
            : Array.isArray(c.details?.aliases)
              ? (c.details!.aliases as unknown[])
              : [];
        return aliases.some((a) => String(a || '').trim().toLowerCase() === lower);
    });
    if (found) return found;

    found = cast.find((c) => {
        const cName = String(c.name || '').trim().toLowerCase();
        const parts = cName.split(/\s+/);
        return parts.some((p) => p === lower && p.length >= 2);
    });
    if (found) return found;

    const codeMatch = lower.match(/^(?:character|char|c)?[_\s-]*(\d+)$/i);
    if (codeMatch) {
        const idx = parseInt(codeMatch[1], 10) - 1;
        if (idx >= 0 && idx < cast.length) {
            return cast[idx];
        }
    }

    if (lower.length >= 3) {
        found = cast.find((c) => {
            const cName = String(c.name || '').trim().toLowerCase();
            return cName.includes(lower) || lower.includes(cName);
        });
        if (found) return found;
    }

    return null;
}

/**
 * Resolves a character or dynamically registers a new supporting character in `cast`.
 */
export function ensureCharacter(
    identifier: unknown,
    cast: CastMember[] = []
): CastMember | null {
    if (!identifier) return null;
    const resolved = resolveCharacter(identifier, cast);
    if (resolved) return resolved;

    const nameStr = String(identifier).trim();
    if (!nameStr) return null;

    const slug = nameStr
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const dynamicId = `C_dyn_${slug || Date.now()}`;
    const newChar: CastMember = {
        id: dynamicId,
        name: nameStr,
        role: 'Supporting Character',
        core_flaw: 'Unspecified flaw',
        core_desire: 'Unspecified desire',
        vocal_cadence: 'Standard'
    };
    if (Array.isArray(cast)) {
        cast.push(newChar);
    }
    return newChar;
}

/** Formats `<character_psychological_arcs>` prompt block resolving char IDs to names. */
export function buildCharacterArcsBlock(
    story: Partial<Story> & Record<string, unknown>
): string {
    const cast = Array.isArray(story.cast) ? story.cast : [];
    const arcs = Array.isArray(story.character_arcs)
        ? (story.character_arcs as Array<Record<string, unknown>>)
        : [];
    const lines = arcs.map((ca, idx) => {
        const charObj = resolveCharacter(ca.char_id, cast) || cast[idx];
        const displayName = charObj ? charObj.name : String(ca.char_id || `Character ${idx + 1}`);
        const badgeVal = ca.corner_role || (charObj && charObj.corner_role);
        const roleBadge = badgeVal ? ` [${badgeVal}]` : '';
        const pressureStr = ca.web_pressure ? ` (Web Dynamic: ${ca.web_pressure})` : '';
        return `- ${displayName}${roleBadge}: ${ca.description}${ca.lie_believed ? ` (Safety Habit/Lie: ${ca.lie_believed})` : ''}${ca.truth_needed ? ` (Truth Needed: ${ca.truth_needed})` : ''}${pressureStr}`;
    });
    return `<character_psychological_arcs>\n${lines.join('\n')}\n</character_psychological_arcs>`;
}

/**
 * Epistemic Context Sanitizer: masks unrevealed secret truths and future reversals
 * from character dossiers and story twists for downstream generation steps.
 */
export function sanitizeStoryContextForPosition<T extends Partial<Story> & Record<string, unknown>>(
    story: T,
    _currentActNum = 1,
    currentSeqNum = 1
): T {
    void _currentActNum;
    if (!story || !Array.isArray(story.secret_vault) || story.secret_vault.length === 0) {
        return story;
    }

    const unrevealedSecrets = story.secret_vault.filter(
        (sec) => sec.status !== 'revealed' && Number(sec.reveal_anchor?.sequence_number || 7) > Number(currentSeqNum)
    );

    if (unrevealedSecrets.length === 0) {
        return story;
    }

    const sanitizedCast = (story.cast || []).map((ch) => {
        const cloned: CastMember = { ...ch, details: { ...(ch.details || {}) } };
        unrevealedSecrets.forEach((sec) => {
            const masks = sec.cover_story?.character_masks || {};
            const mask =
                (ch.name ? masks[ch.name] : undefined) ||
                (ch.id ? masks[ch.id] : undefined) ||
                (ch.name
                    ? Object.entries(masks).find(
                          ([k]) => k.toLowerCase() === ch.name.toLowerCase()
                      )?.[1]
                    : undefined);
            if (mask) {
                if (mask.history_mask) cloned.details!.history = mask.history_mask;
                if (mask.apparent_flaw || mask.trait_mask) {
                    cloned.core_flaw = mask.apparent_flaw || mask.trait_mask;
                }
                if (mask.public_interview_voice) {
                    cloned.details!.deep_profile = mask.public_interview_voice;
                    cloned.interview_psychology = mask.public_interview_voice;
                }
            }
            if (sec.truth && sec.truth.length > 5) {
                const truthRegex = new RegExp(safeEscapeRegex(sec.truth), 'gi');
                if (typeof cloned.details!.deep_profile === 'string') {
                    cloned.details!.deep_profile = cloned.details!.deep_profile.replace(
                        truthRegex,
                        '[Private Personal Motivation]'
                    );
                }
                if (typeof cloned.interview_psychology === 'string') {
                    cloned.interview_psychology = cloned.interview_psychology.replace(
                        truthRegex,
                        '[Private Personal Motivation]'
                    );
                }
            }
        });
        return cloned;
    });

    let sanitizedTwists = String(story.major_surprises_and_twists || '');
    unrevealedSecrets.forEach((sec) => {
        if (sec.truth && sec.truth.length > 5) {
            sanitizedTwists = sanitizedTwists.replace(
                new RegExp(safeEscapeRegex(sec.truth), 'gi'),
                '[Crucial Turning Point Withheld]'
            );
        }
        if (sec.title) {
            sanitizedTwists = sanitizedTwists.replace(
                new RegExp(safeEscapeRegex(sec.title), 'gi'),
                '[Key Reversal Pending]'
            );
        }
    });

    return {
        ...story,
        cast: sanitizedCast,
        major_surprises_and_twists: sanitizedTwists
    };
}

/** Builds `<pair>` XML friction blocks for all non-minor cast pairs in a scene. */
export function buildRelationshipFrictionBlock(
    cast: CastMember[] | null | undefined,
    relationships: Record<string, Record<string, unknown>> = {}
): string {
    if (!cast || !Array.isArray(cast) || cast.length < 2) {
        return '  <no_relationship_friction>Solo character present; internal psychological conflict dominates.</no_relationship_friction>';
    }

    const frictionLines: string[] = [];
    for (let i = 0; i < cast.length; i++) {
        for (let j = 0; j < cast.length; j++) {
            if (i === j) continue;
            const charA = cast[i];
            const charB = cast[j];
            if (!charA || !charB) continue;

            const isMinorA = !charA.role || /supporting|minor|texture/i.test(charA.role);
            const isMinorB = !charB.role || /supporting|minor|texture/i.test(charB.role);
            if (isMinorA && isMinorB) continue;

            let rel: Record<string, unknown> | null =
                (relationships &&
                    (relationships[`${charA.name}->${charB.name}`] ||
                        (charA.id && charB.id ? relationships[`${charA.id}->${charB.id}`] : undefined))) ||
                null;
            if (!rel && relationships) {
                for (const [k, r] of Object.entries(relationships)) {
                    if (!k.includes('->')) continue;
                    const [kFrom, kTo] = k.split('->').map((s) => s.trim());
                    const matchA = resolveCharacter(kFrom, cast);
                    const matchB = resolveCharacter(kTo, cast);
                    if (
                        matchA &&
                        matchB &&
                        (matchA.id === charA.id || matchA.name === charA.name) &&
                        (matchB.id === charB.id || matchB.name === charB.name)
                    ) {
                        rel = r;
                        break;
                    }
                }
            }

            const surfaceDynamic =
                (rel?.current as string | undefined) ||
                (rel?.feeling as string | undefined) ||
                'Neutral / Unestablished';

            let hiddenTension = rel?.hidden_tension as string | undefined;
            if (!hiddenTension || hiddenTension.trim() === '') {
                const desireA =
                    charA.core_desire || (charA.details?.goals as string | undefined) || 'Unspecified desire';
                const flawB =
                    charB.core_flaw || (charB.details?.history as string | undefined) || 'Unspecified flaw';
                hiddenTension = `Unspoken emotional tension: ${charA.name} yearns for (${desireA}), which conflicts with ${charB.name}'s psychological blind spot (${flawB})`;
            }

            const trustLevel = rel?.trust_level !== undefined ? rel.trust_level : 5;

            frictionLines.push(`  <pair source="${charA.name}" target="${charB.name}">
    <surface_dynamic>${surfaceDynamic}</surface_dynamic>
    <hidden_tension>${hiddenTension}</hidden_tension>
    <trust_level>${trustLevel}/10</trust_level>
  </pair>`);
        }
    }

    return frictionLines.length > 0
        ? frictionLines.join('\n')
        : '  <no_relationship_friction>No active dynamics recorded.</no_relationship_friction>';
}
