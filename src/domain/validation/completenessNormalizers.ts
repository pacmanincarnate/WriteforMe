/**
 * @module domain/validation/completenessNormalizers
 * Deterministic output completeness normalizers and auto-patchers for
 * Story Arc, Act Planning, and Sequence Agent XML payloads.
 */

import type { CastMember } from '@/types';
import { escapeRegExp, extractTag, extractTagList } from '@/utils';
import { parseActNumber, parseSequencesXML } from '@/domain/story';

export interface CompletenessContext {
    core_thematic_argument?: string;
    concept?: string;
    status_quo?: string;
    threads?: Array<{ id: string; name: string; description?: string }>;
    cast?: Array<CastMember & { corner_role?: string }>;
    startingCast?: Array<CastMember & { corner_role?: string }>;
    character_arcs?: Array<{ lie_believed?: string; truth_needed?: string }>;
    [key: string]: unknown;
}

export interface CompletenessReport {
    rawOutput: string;
    repaired: boolean;
    repairs: string[];
}

/** Ensures all 3 acts include the 5 required mandate headings and `<thread_statuses_at_end>` coverage. */
export function ensureActOutputCompleteness(
    rawOutput: unknown,
    storyContext: CompletenessContext = {}
): CompletenessReport {
    if (!rawOutput || typeof rawOutput !== 'string') {
        return { rawOutput: String(rawOutput || ''), repaired: false, repairs: [] };
    }

    let updatedOutput = rawOutput;
    const repairs: string[] = [];
    const requiredHeadings = [
        {
            key: 'THEMATIC & STRUCTURAL FUNCTION',
            regex: /\*\*THEMATIC\s*(?:&|AND)\s*STRUCTURAL\s*FUNCTION:\*\*/i,
            synthesize: (actNum: number) => {
                const theme = storyContext.core_thematic_argument || 'the central thematic argument';
                if (actNum === 1)
                    return `- **THEMATIC & STRUCTURAL FUNCTION:** Establish Todorov equilibrium and initial status quo, introducing the central thematic argument: "${theme}". Act I maps the disruptions that shatter the opening balance and commit the characters to the core conflict.`;
                if (actNum === 2)
                    return `- **THEMATIC & STRUCTURAL FUNCTION:** Drive narrative disequilibrium, escalating the thematic conflict and testing the core argument against escalating external and internal crises across the 4-sequence midsection.`;
                return `- **THEMATIC & STRUCTURAL FUNCTION:** Guide the narrative toward ultimate thematic synthesis, resolving disequilibrium into a transformed new equilibrium and providing cathartic resolution of "${theme}".`;
            }
        },
        {
            key: 'DRAMATIC ARC & PACING CURVES',
            regex: /\*\*DRAMATIC\s*ARC\s*(?:&|AND)\s*PACING\s*CURVES:\*\*/i,
            synthesize: (actNum: number) => {
                if (actNum === 1)
                    return `- **DRAMATIC ARC & PACING CURVES:** Pacing opens with atmospheric orientation (Sequence 1) before the inciting incident forces irreversible lock-in (Sequence 2) at the Act I break.`;
                if (actNum === 2)
                    return `- **DRAMATIC ARC & PACING CURVES:** Pacing moves through the New World (Sequence 3), crests at the major Midpoint shift (Sequence 4), navigates the fallout (Sequence 5), and plunges into the Dark Night (Sequence 6).`;
                return `- **DRAMATIC ARC & PACING CURVES:** Pacing accelerates through the climactic confrontation (Sequence 7) toward the resonant denouement and transformed resolution (Sequence 8).`;
            }
        },
        {
            key: 'THREAD PROGRESSION & CONVERGENCE',
            regex: /\*\*THREAD\s*PROGRESSION\s*(?:&|AND)\s*CONVERGENCE:\*\*/i,
            synthesize: (actNum: number) => {
                const threadNames =
                    (storyContext.threads || []).map((t) => `${t.id} (${t.name})`).join(', ') ||
                    'primary and secondary threads';
                if (actNum === 1)
                    return `- **THREAD PROGRESSION & CONVERGENCE:** Introduces and weaves active narrative threads (${threadNames}), establishing the initial stakes and potential fault lines.`;
                if (actNum === 2)
                    return `- **THREAD PROGRESSION & CONVERGENCE:** Intersects all active narrative threads (${threadNames}) at high-friction knots, forcing subplot collisions and compounding crises.`;
                return `- **THREAD PROGRESSION & CONVERGENCE:** Drives all remaining narrative threads (${threadNames}) to conclusive convergence and definitive thematic resolution.`;
            }
        },
        {
            key: 'CHARACTER & PSYCHOLOGICAL JOURNEY',
            regex: /\*\*CHARACTER\s*(?:&|AND)\s*PSYCHOLOGICAL\s*JOURNEY:\*\*/i,
            synthesize: (actNum: number) => {
                const leadChar =
                    storyContext.cast && storyContext.cast[0]
                        ? storyContext.cast[0].name
                        : 'the protagonist';
                const charArc =
                    storyContext.character_arcs && storyContext.character_arcs[0]
                        ? storyContext.character_arcs[0]
                        : null;
                const lie = charArc?.lie_believed || 'their defensive self-deception';
                const truth = charArc?.truth_needed || 'the necessary truth';
                if (actNum === 1)
                    return `- **CHARACTER & PSYCHOLOGICAL JOURNEY:** Explores ${leadChar}'s initial worldview, grounded in the lie believed ("${lie}"), which begins to fracture under early pressure.`;
                if (actNum === 2)
                    return `- **CHARACTER & PSYCHOLOGICAL JOURNEY:** Strips away ${leadChar}'s defenses as the lie believed ("${lie}") proves untenable, pushing them toward breakdown and the precipice of growth.`;
                return `- **CHARACTER & PSYCHOLOGICAL JOURNEY:** ${leadChar} finally embraces the truth needed ("${truth}"), enabling psychological breakthrough, synthesis, and self-actualization.`;
            }
        },
        {
            key: 'ANTICIPATED ISSUES & CRITICAL CONSTRAINTS',
            regex: /\*\*ANTICIPATED\s*ISSUES\s*(?:&|AND)\s*CRITICAL\s*CONSTRAINTS:\*\*/i,
            synthesize: (actNum: number) => {
                if (actNum === 1)
                    return `- **ANTICIPATED ISSUES & CRITICAL CONSTRAINTS:** Guard against exposition heavy pacing; ensure Sequence 1 and 2 establish immediate active stakes without informational stagnation.`;
                if (actNum === 2)
                    return `- **ANTICIPATED ISSUES & CRITICAL CONSTRAINTS:** Guard against the saggy middle; ensure the Midpoint shift fundamentally alters the nature of the protagonist's struggle and raises irreversible stakes.`;
                return `- **ANTICIPATED ISSUES & CRITICAL CONSTRAINTS:** Guard against anti-climactic resolution; ensure the climactic climax demands genuine sacrifice and every active thread earns its payoff.`;
            }
        }
    ];

    const actBlockRegex = /<act(?:\s+[^>]*)?>([\s\S]*?)<\/act>/gi;
    let actMatch: RegExpExecArray | null;
    while ((actMatch = actBlockRegex.exec(updatedOutput)) !== null) {
        const fullActTag = actMatch[0];
        const actInner = actMatch[1];
        const rawNum = extractTag(actInner, 'number') || '1';
        const actNum = parseActNumber(rawNum);

        const mandateMatch = /<act_mandate(?:\s+[^>]*)?>([\s\S]*?)<\/act_mandate>/i.exec(actInner);
        if (mandateMatch) {
            let mandateText = mandateMatch[1];
            let mandateChanged = false;

            for (const req of requiredHeadings) {
                if (!req.regex.test(mandateText)) {
                    const synthLine = req.synthesize(actNum);
                    mandateText = mandateText.trim() + '\n        ' + synthLine;
                    mandateChanged = true;
                    repairs.push(`Act ${actNum} mandate: added missing heading [${req.key}]`);
                }
            }

            if (mandateChanged) {
                const newActInner = actInner.replace(
                    mandateMatch[0],
                    `<act_mandate>\n        ${mandateText.trim()}\n      </act_mandate>`
                );
                updatedOutput = updatedOutput.replace(fullActTag, `<act>\n${newActInner.trim()}\n    </act>`);
            }
        } else {
            const syntheticMandate = requiredHeadings.map((h) => `        ${h.synthesize(actNum)}`).join('\n');
            const newActInner =
                actInner.trim() + `\n      <act_mandate>\n${syntheticMandate}\n      </act_mandate>`;
            updatedOutput = updatedOutput.replace(fullActTag, `<act>\n${newActInner.trim()}\n    </act>`);
            repairs.push(`Act ${actNum}: synthesized missing <act_mandate> with all 5 required headings`);
        }
    }

    const threads = Array.isArray(storyContext.threads) ? storyContext.threads : [];
    if (threads.length > 0) {
        const threadStatusesMatch =
            /<thread_statuses_at_end(?:\s+[^>]*)?>([\s\S]*?)<\/thread_statuses_at_end>/i.exec(
                updatedOutput
            );
        if (threadStatusesMatch) {
            let tsContent = threadStatusesMatch[1];
            let tsChanged = false;

            for (const t of threads) {
                const threadIdRegex = new RegExp(`<thread_id>\\s*${escapeRegExp(t.id)}\\s*<\\/thread_id>`, 'i');
                if (!threadIdRegex.test(tsContent)) {
                    const newStatusBlock = `\n    <thread_status>\n      <thread_id>${t.id}</thread_id>\n      <status>Thread "${t.name}" active; escalates through middle sequences toward act resolution.</status>\n    </thread_status>`;
                    tsContent += newStatusBlock;
                    tsChanged = true;
                    repairs.push(`thread_statuses_at_end: added missing status for thread ${t.id} (${t.name})`);
                }
            }

            if (tsChanged) {
                updatedOutput = updatedOutput.replace(
                    threadStatusesMatch[0],
                    `<thread_statuses_at_end>${tsContent}\n  </thread_statuses_at_end>`
                );
            }
        } else {
            const newBlock =
                `<thread_statuses_at_end>\n` +
                threads
                    .map(
                        (t) =>
                            `    <thread_status>\n      <thread_id>${t.id}</thread_id>\n      <status>Thread "${t.name}" active; integrated across macro narrative acts.</status>\n    </thread_status>`
                    )
                    .join('\n') +
                `\n  </thread_statuses_at_end>`;

            if (updatedOutput.includes('</acts>')) {
                updatedOutput = updatedOutput.replace('</acts>', `</acts>\n\n  ${newBlock}`);
            } else if (updatedOutput.includes('</response>')) {
                updatedOutput = updatedOutput.replace('</response>', `  ${newBlock}\n</response>`);
            } else {
                updatedOutput += `\n${newBlock}`;
            }
            repairs.push(`Synthesized complete missing <thread_statuses_at_end> for ${threads.length} threads`);
        }
    }

    return {
        rawOutput: updatedOutput,
        repaired: repairs.length > 0,
        repairs
    };
}

/** Ensures `<global_arc>`, `<narrative_threads>`, and per-character `<character_arcs>` tags are complete. */
export function ensureStoryArcOutputCompleteness(
    rawOutput: unknown,
    storyContext: CompletenessContext = {}
): CompletenessReport {
    let updatedOutput = typeof rawOutput === 'string' ? rawOutput.trim() : '';
    const repairs: string[] = [];

    if (!updatedOutput) {
        return { rawOutput: '', repaired: false, repairs: [] };
    }

    const esc = (str: unknown): string => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (!/<response(?:\s+[^>]*)?>/i.test(updatedOutput)) {
        updatedOutput = `<response>\n${updatedOutput}\n</response>`;
        repairs.push('Wrapped story arc in <response> root tag');
    }

    const cast = Array.isArray(storyContext.cast)
        ? storyContext.cast
        : Array.isArray(storyContext.startingCast)
          ? storyContext.startingCast
          : [];
    const concept = storyContext.concept || '';

    if (/<global_arc(?:\s+[^>]*)?>/i.test(updatedOutput) && !/<\/global_arc>/i.test(updatedOutput)) {
        if (/<narrative_threads(?:\s+[^>]*)?>/i.test(updatedOutput)) {
            updatedOutput = updatedOutput.replace(/(<narrative_threads(?:\s+[^>]*)?>)/i, '</global_arc>\n\n$1');
            repairs.push('Closed unclosed <global_arc> before <narrative_threads>');
        } else if (/<character_arcs(?:\s+[^>]*)?>/i.test(updatedOutput)) {
            updatedOutput = updatedOutput.replace(/(<character_arcs(?:\s+[^>]*)?>)/i, '</global_arc>\n\n$1');
            repairs.push('Closed unclosed <global_arc> before <character_arcs>');
        } else if (/<\/response>/i.test(updatedOutput)) {
            updatedOutput = updatedOutput.replace(/<\/response>/i, '</global_arc>\n</response>');
            repairs.push('Closed unclosed <global_arc> before </response>');
        } else {
            updatedOutput += '\n</global_arc>';
            repairs.push('Appended missing </global_arc>');
        }
    }

    let globalArcMatch = /<global_arc(?:\s+[^>]*)?>([\s\S]*?)<\/global_arc>/i.exec(updatedOutput);
    let globalArcContent = globalArcMatch ? globalArcMatch[1] : null;

    const protagonistName = cast[0] && cast[0].name ? cast[0].name : 'the protagonist';
    const protagFlaw =
        cast[0] && cast[0].core_flaw ? cast[0].core_flaw : 'fear of vulnerability and defensive detachment';
    const protagDesire =
        cast[0] && cast[0].core_desire ? cast[0].core_desire : 'authentic purpose and moral truth';

    const requiredGlobalFields = [
        {
            tag: 'core_thematic_argument',
            synthesize: () =>
                concept
                    ? 'True agency and connection demand confronting vulnerable truth rather than seeking protective validation.'
                    : 'Authentic agency demands confronting uncomfortable truth rather than clinging to protective illusions.'
        },
        {
            tag: 'starting_value_state',
            synthesize: () =>
                `${protagonistName} is governed by ${protagFlaw}, trapped in defensive isolation and false certainty.`
        },
        {
            tag: 'ending_value_state',
            synthesize: () =>
                `${protagonistName} achieves ${protagDesire}, embracing vulnerability and shared conviction over personal fear.`
        },
        {
            tag: 'inciting_incident',
            synthesize: () =>
                concept
                    ? `A profound disruption forces ${protagonistName} out of equilibrium: ${concept.slice(0, 150)}...`
                    : `An irreversible catalytic event shatters the established status quo and forces ${protagonistName} into active struggle.`
        },
        {
            tag: 'major_surprises_and_twists',
            synthesize: () =>
                `1. Major Reversal: A perceived adversary reveals a deeper systemic truth, upending ${protagonistName}'s initial strategy.\n2. Major Reversal: The sacrifice intended to achieve victory reveals that the true obstacle was internal all along.`
        }
    ];

    if (
        !globalArcContent &&
        (/<core_thematic_argument/i.test(updatedOutput) || /<starting_value_state/i.test(updatedOutput))
    ) {
        const extractedFields: string[] = [];
        for (const req of requiredGlobalFields) {
            const tagRegex = new RegExp(`<${req.tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${req.tag}>`, 'i');
            const match = tagRegex.exec(updatedOutput);
            if (match && match[1].trim()) {
                extractedFields.push(`    <${req.tag}>${match[1].trim()}</${req.tag}>`);
            } else {
                extractedFields.push(`    <${req.tag}>${req.synthesize()}</${req.tag}>`);
                repairs.push(`global_arc: synthesized missing <${req.tag}>`);
            }
        }
        const synthesizedArc = `  <global_arc>\n${extractedFields.join('\n')}\n  </global_arc>`;
        for (const req of requiredGlobalFields) {
            const tagRegex = new RegExp(`<${req.tag}(?:\\s+[^>]*)?>[\\s\\S]*?<\\/${req.tag}>`, 'gi');
            updatedOutput = updatedOutput.replace(tagRegex, '');
        }
        if (/<narrative_threads/i.test(updatedOutput)) {
            updatedOutput = updatedOutput.replace(/(<narrative_threads(?:\s+[^>]*)?>)/i, `${synthesizedArc}\n\n$1`);
        } else if (/<character_arcs/i.test(updatedOutput)) {
            updatedOutput = updatedOutput.replace(/(<character_arcs(?:\s+[^>]*)?>)/i, `${synthesizedArc}\n\n$1`);
        } else {
            updatedOutput = updatedOutput.replace(/<response(?:\s+[^>]*)?>/i, `<response>\n${synthesizedArc}\n`);
        }
        repairs.push('Wrapped existing loose global arc fields inside <global_arc>');
        globalArcMatch = /<global_arc(?:\s+[^>]*)?>([\s\S]*?)<\/global_arc>/i.exec(updatedOutput);
        globalArcContent = globalArcMatch ? globalArcMatch[1] : null;
    }

    if (globalArcContent !== null && globalArcMatch) {
        let arcChanged = false;
        for (const req of requiredGlobalFields) {
            const fieldRegex = new RegExp(`<${req.tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${req.tag}>`, 'i');
            const match = fieldRegex.exec(globalArcContent);
            if (!match || !match[1].trim()) {
                const synthesizedVal = req.synthesize();
                if (match && !match[1].trim()) {
                    globalArcContent = globalArcContent.replace(
                        match[0],
                        `<${req.tag}>${synthesizedVal}</${req.tag}>`
                    );
                } else {
                    globalArcContent += `\n    <${req.tag}>${synthesizedVal}</${req.tag}>`;
                }
                arcChanged = true;
                repairs.push(`global_arc: synthesized missing <${req.tag}>`);
            }
        }
        if (arcChanged) {
            updatedOutput = updatedOutput.replace(
                globalArcMatch[0],
                `<global_arc>${globalArcContent}\n  </global_arc>`
            );
        }
    } else {
        const fieldsXml = requiredGlobalFields.map((f) => `    <${f.tag}>${f.synthesize()}</${f.tag}>`).join('\n');
        const newGlobalArc = `  <global_arc>\n${fieldsXml}\n  </global_arc>`;
        if (updatedOutput.includes('<narrative_threads>')) {
            updatedOutput = updatedOutput.replace(
                '<narrative_threads>',
                `${newGlobalArc}\n\n  <narrative_threads>`
            );
        } else if (updatedOutput.includes('<character_arcs>')) {
            updatedOutput = updatedOutput.replace(
                '<character_arcs>',
                `${newGlobalArc}\n\n  <character_arcs>`
            );
        } else {
            updatedOutput = updatedOutput.replace(/<response(?:\s+[^>]*)?>/i, `<response>\n${newGlobalArc}\n`);
        }
        repairs.push('Synthesized complete missing <global_arc> block');
    }

    const threadsMatch = /<narrative_threads(?:\s+[^>]*)?>([\s\S]*?)<\/narrative_threads>/i.exec(
        updatedOutput
    );
    let threadsContent = threadsMatch ? threadsMatch[1] : null;

    const canonicalThreads = [
        {
            id: 'T1',
            name: 'Main Plot Thread (A-Story)',
            description: concept
                ? `The central external conflict driving the narrative forward: ${concept.slice(0, 160)}.`
                : 'The primary external stakes and driving conflict across the macro narrative.'
        },
        {
            id: 'T2',
            name: 'Relationship / Thematic Mirror (B-Story)',
            description:
                'Interpersonal relationship dynamic that directly tests, mirrors, and challenges the core thematic argument.'
        },
        {
            id: 'T3',
            name: 'Internal Arc (C-Story)',
            description: `${protagonistName}'s psychological journey from the lie (${protagFlaw}) to internal truth and self-reckoning.`
        }
    ];

    if (threadsContent !== null && threadsMatch) {
        let threadsChanged = false;
        for (const ct of canonicalThreads) {
            const threadIdRegex = new RegExp(`<thread_id>\\s*${esc(ct.id)}\\s*<\\/thread_id>`, 'i');
            if (!threadIdRegex.test(threadsContent)) {
                const altRegex =
                    ct.id === 'T1'
                        ? /<(?:a_story|main_plot|main_thread)>/i
                        : ct.id === 'T2'
                          ? /<(?:b_story|relationship_subplot|thematic_mirror)>/i
                          : /<(?:c_story|internal_arc|character_thread)>/i;
                if (!altRegex.test(threadsContent)) {
                    threadsContent += `\n    <thread>\n      <thread_id>${ct.id}</thread_id>\n      <name>${ct.name}</name>\n      <description>${ct.description}</description>\n    </thread>`;
                    threadsChanged = true;
                    repairs.push(`narrative_threads: synthesized missing thread ${ct.id} (${ct.name})`);
                }
            }
        }
        if (threadsChanged) {
            updatedOutput = updatedOutput.replace(
                threadsMatch[0],
                `<narrative_threads>${threadsContent}\n  </narrative_threads>`
            );
        }
    } else {
        const newThreadsBlock =
            `  <narrative_threads>\n` +
            canonicalThreads
                .map(
                    (t) =>
                        `    <thread>\n      <thread_id>${t.id}</thread_id>\n      <name>${t.name}</name>\n      <description>${t.description}</description>\n    </thread>`
                )
                .join('\n') +
            `\n  </narrative_threads>`;

        if (updatedOutput.includes('<character_arcs>')) {
            updatedOutput = updatedOutput.replace(
                '<character_arcs>',
                `${newThreadsBlock}\n\n  <character_arcs>`
            );
        } else if (updatedOutput.includes('</global_arc>')) {
            updatedOutput = updatedOutput.replace('</global_arc>', `</global_arc>\n\n${newThreadsBlock}`);
        } else if (updatedOutput.includes('</response>')) {
            updatedOutput = updatedOutput.replace('</response>', `${newThreadsBlock}\n</response>`);
        } else {
            updatedOutput += `\n${newThreadsBlock}`;
        }
        repairs.push('Synthesized complete missing <narrative_threads> with T1, T2, T3');
    }

    const charArcsContainerMatch =
        /<character_arcs(?:\s+[^>]*)?>([\s\S]*?)<\/character_arcs>/i.exec(updatedOutput);
    let charArcsContent = charArcsContainerMatch ? charArcsContainerMatch[1] : null;

    const targetCharacters =
        cast.length > 0
            ? cast
            : [
                  {
                      name: protagonistName,
                      role: 'Protagonist',
                      core_flaw: protagFlaw,
                      core_desire: protagDesire
                  } as CastMember & { corner_role?: string }
              ];

    if (charArcsContent !== null && charArcsContainerMatch) {
        let arcsChanged = false;
        for (const charObj of targetCharacters) {
            const charName = charObj.name;
            const charIdPattern = new RegExp(
                `<char_id>\\s*${esc(charName)}\\s*<\\/char_id>|<arc[^>]*\\bchar_id=["']${esc(charName)}["']`,
                'i'
            );
            const arcForCharMatch = charIdPattern.exec(charArcsContent);

            if (!arcForCharMatch) {
                const flaw = charObj.core_flaw || 'defensive emotional isolation';
                const desire = charObj.core_desire || 'genuine connection and moral courage';
                const cornerRole = charObj.corner_role || 'SUPPORTING';
                const syntheticArc = `\n    <arc>\n      <char_id>${charName}</char_id>\n      <corner_role>${cornerRole}</corner_role>\n      <lie_believed>Relies on their safety habit of ${flaw}.</lie_believed>\n      <truth_needed>Realizes that ${desire} requires moving beyond this defense.</truth_needed>\n      <arc_catalyst>The catalytic disruption and escalating demands of the central crisis.</arc_catalyst>\n      <arc_description>${charName} confronts their comfort zone, undergoing an essential transformation as the conflict escalates.</arc_description>\n      <web_pressure>Acts as the ${cornerRole.replace(/_/g, ' ')} reflecting the core dilemma against the other cast members.</web_pressure>\n    </arc>`;
                charArcsContent += syntheticArc;
                arcsChanged = true;
                repairs.push(`character_arcs: synthesized missing arc for character "${charName}"`);
            } else {
                const arcBlockRegex = new RegExp(
                    `(<arc(?:\\s+[^>]*)?>[\\s\\S]*?<char_id>\\s*${esc(charName)}\\s*<\\/char_id>[\\s\\S]*?<\\/arc>)`,
                    'i'
                );
                const specificArcMatch = arcBlockRegex.exec(charArcsContent);
                if (specificArcMatch) {
                    let arcBlock = specificArcMatch[1];
                    let subChanged = false;
                    const requiredSubfields = [
                        {
                            tag: 'lie_believed',
                            synth: `Believes their safety depends on ${charObj.core_flaw || 'maintaining defensive control'}.`
                        },
                        {
                            tag: 'truth_needed',
                            synth: `Must recognize that ${charObj.core_desire || 'true fulfillment'} requires vulnerability.`
                        },
                        {
                            tag: 'arc_catalyst',
                            synth: 'The catalytic crisis forcing an irreversible choice.'
                        },
                        {
                            tag: 'arc_description',
                            synth: 'A profound shift from defensive rationalization to active, authentic agency.'
                        }
                    ];
                    for (const sub of requiredSubfields) {
                        const subRegex = new RegExp(
                            `<${sub.tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${sub.tag}>`,
                            'i'
                        );
                        const sMatch = subRegex.exec(arcBlock);
                        if (!sMatch || !sMatch[1].trim()) {
                            if (sMatch && !sMatch[1].trim()) {
                                arcBlock = arcBlock.replace(sMatch[0], `<${sub.tag}>${sub.synth}</${sub.tag}>`);
                            } else {
                                arcBlock = arcBlock.replace(
                                    '</arc>',
                                    `  <${sub.tag}>${sub.synth}</${sub.tag}>\n    </arc>`
                                );
                            }
                            subChanged = true;
                            repairs.push(`character_arcs (${charName}): repaired missing/empty <${sub.tag}>`);
                        }
                    }
                    if (subChanged) {
                        charArcsContent = charArcsContent.replace(specificArcMatch[0], arcBlock);
                        arcsChanged = true;
                    }
                }
            }
        }
        if (arcsChanged) {
            updatedOutput = updatedOutput.replace(
                charArcsContainerMatch[0],
                `<character_arcs>${charArcsContent}\n  </character_arcs>`
            );
        }
    } else {
        const newArcsBlock =
            `  <character_arcs>\n` +
            targetCharacters
                .map((c) => {
                    const flaw = c.core_flaw || 'defensive emotional isolation';
                    const desire = c.core_desire || 'authentic purpose and moral connection';
                    const cornerRole = c.corner_role || 'SUPPORTING';
                    return `    <arc>\n      <char_id>${c.name}</char_id>\n      <corner_role>${cornerRole}</corner_role>\n      <lie_believed>Relies on their safety habit of ${flaw}.</lie_believed>\n      <truth_needed>Realizes that ${desire} requires moving beyond this defense.</truth_needed>\n      <arc_catalyst>The catalytic disruption and escalating demands of the central crisis.</arc_catalyst>\n      <arc_description>${c.name} confronts their comfort zone, undergoing an essential transformation as the conflict escalates.</arc_description>\n      <web_pressure>Acts as the ${cornerRole.replace(/_/g, ' ')} reflecting the core dilemma against the other cast members.</web_pressure>\n    </arc>`;
                })
                .join('\n') +
            `\n  </character_arcs>`;
        if (updatedOutput.includes('</response>')) {
            updatedOutput = updatedOutput.replace('</response>', `${newArcsBlock}\n</response>`);
        } else {
            updatedOutput += `\n${newArcsBlock}`;
        }
        repairs.push(
            `Synthesized complete missing <character_arcs> for ${targetCharacters.length} cast members`
        );
    }

    return {
        rawOutput: updatedOutput,
        repaired: repairs.length > 0,
        repairs
    };
}

/** Heals truncated sequence XML tags, guarantees all 8 sequences exist, and backfills required headings. */
export function ensureSequenceOutputCompleteness(
    rawOutput: unknown,
    storyContext: CompletenessContext = {}
): CompletenessReport {
    if (!rawOutput || typeof rawOutput !== 'string') {
        return { rawOutput: String(rawOutput || ''), repaired: false, repairs: [] };
    }

    let updatedOutput = rawOutput.trim();
    const repairs: string[] = [];

    const descOpens = (updatedOutput.match(/<description(?:\s+[^>]*)?>/gi) || []).length;
    const descCloses = (updatedOutput.match(/<\/description>/gi) || []).length;
    if (descOpens > descCloses) {
        const lastDescIdx = updatedOutput.lastIndexOf('<description');
        if (lastDescIdx !== -1) {
            const afterDesc = updatedOutput.slice(lastDescIdx);
            if (!afterDesc.includes('</description>')) {
                updatedOutput = updatedOutput.trim() + '\n        </description>';
                repairs.push('Healed cut-off <description> tag');
            }
        }
    }

    const tsOpens = (updatedOutput.match(/<thread_storylines(?:\s+[^>]*)?>/gi) || []).length;
    const tsCloses = (updatedOutput.match(/<\/thread_storylines>/gi) || []).length;
    if (tsOpens > tsCloses) {
        updatedOutput = updatedOutput.trim() + '\n      </thread_storylines>';
        repairs.push('Healed cut-off <thread_storylines> tag');
    }

    const seqOpens = (updatedOutput.match(/<sequence(?:\s+[^>]*)?>/gi) || []).length;
    const seqCloses = (updatedOutput.match(/<\/sequence>/gi) || []).length;
    if (seqOpens > seqCloses) {
        const lastSeqIdx = updatedOutput.lastIndexOf('<sequence');
        const lastSeqSlice = updatedOutput.slice(lastSeqIdx);
        if (!lastSeqSlice.includes('<sequence_climax>')) {
            updatedOutput +=
                "\n        <sequence_climax>The decisive shift resolving this sequence's dramatic question.</sequence_climax>";
        }
        if (!lastSeqSlice.includes('<ending_hook>')) {
            updatedOutput +=
                '\n        <ending_hook>Events compel the characters into the next dramatic chapter.</ending_hook>';
        }
        if (!lastSeqSlice.includes('<next_sequence_boundary_guard>')) {
            updatedOutput +=
                '\n        <next_sequence_boundary_guard>Reserve subsequent sequence events, locations, and new character introductions for the next sequence.</next_sequence_boundary_guard>';
        }
        updatedOutput = updatedOutput.trim() + '\n    </sequence>';
        repairs.push('Healed cut-off <sequence> block');
    }

    if (/<sequence(?:\s+[^>]*)?>/i.test(updatedOutput) && !/<sequences(?:\s+[^>]*)?>/i.test(updatedOutput)) {
        updatedOutput = `<sequences>\n${updatedOutput}\n</sequences>`;
        repairs.push('Wrapped sequence blocks in <sequences>');
    } else if (!/<sequences(?:\s+[^>]*)?>/i.test(updatedOutput)) {
        updatedOutput = `<sequences>\n</sequences>`;
    } else if (!/<\/sequences>/i.test(updatedOutput)) {
        updatedOutput = updatedOutput.trim() + '\n</sequences>';
        repairs.push('Added missing </sequences> closing tag');
    }

    if (!/<response(?:\s+[^>]*)?>/i.test(updatedOutput)) {
        updatedOutput = `<response>\n${updatedOutput}\n</response>`;
        repairs.push('Wrapped sequences in <response> root tag');
    } else if (!/<\/response>/i.test(updatedOutput)) {
        updatedOutput = updatedOutput.trim() + '\n</response>';
        repairs.push('Added missing </response> closing tag');
    }

    const existingNumbers = new Set<number>();
    try {
        const parsed = parseSequencesXML(updatedOutput) || [];
        parsed.forEach((s) => {
            const num = parseInt(String(s.number), 10);
            if (!isNaN(num)) existingNumbers.add(num);
        });
    } catch {
        // Fallback to raw <sequence> tag scan below
    }
    if (existingNumbers.size === 0) {
        const seqBlocks = extractTagList(updatedOutput, 'sequence') || [];
        seqBlocks.forEach((block, idx) => {
            const rawNum = extractTag(block, 'number');
            const num = parseInt(rawNum, 10) || idx + 1;
            if (!isNaN(num)) existingNumbers.add(num);
        });
    }

    const theme =
        storyContext.core_thematic_argument ||
        'intimacy and truth demand vulnerability over defensive validation';
    const leadChar =
        storyContext.cast && storyContext.cast[0] ? storyContext.cast[0].name : 'the protagonist';
    const castNames =
        storyContext.cast && storyContext.cast.length > 0
            ? storyContext.cast.map((c) => c.name)
            : [leadChar];
    const secondaryChars = castNames.filter((n) => n !== leadChar);
    const loveInterestOrFoil = secondaryChars[0] || 'supporting cast';
    const threads =
        Array.isArray(storyContext.threads) && storyContext.threads.length > 0
            ? storyContext.threads
            : [
                  { id: 'T1', name: 'Main Plot Thread (A-Story)' },
                  { id: 'T2', name: 'Relationship Mirror (B-Story)' },
                  { id: 'T3', name: 'Internal Arc (C-Story)' }
              ];
    const threadIds = threads.map((t) => t.id);

    const sequenceBlueprints = [
        {
            number: 1,
            act: 1,
            fn: 'Status Quo & Setup',
            title: 'Status Quo & Initial Disturbance',
            question: `Will ${leadChar} maintain their established defenses and routines, or will the opening disruption reveal the cracks in their world?`,
            objective: `Establish ${leadChar}'s baseline reality, core flaw, and the initial catalyst that shatters equilibrium.`,
            thematicFunc: `Establishes Todorov equilibrium and introduces the central thematic tension: "${theme}". Explores ${leadChar}'s initial lie before the disruptive inciting event.`,
            dramaticArc: `Opens in atmospheric normal world, introduces the principal cast, and delivers the initial disturbance that challenges the status quo.`,
            threadProg: `Establishes active narrative threads (${threadIds.join(', ')}), mapping initial stakes and underlying frictions.`,
            charJourney: `${leadChar} clings to their defensive self-deception, while ${loveInterestOrFoil} and the ensemble enter the orbit.`,
            constraints: `Avoid informational dumps; ensure the ordinary world is revealed dynamically through active conflict.`
        },
        {
            number: 2,
            act: 1,
            fn: 'Inciting Incident & Lock-In',
            title: 'The Lock-In & Crossing the Threshold',
            question: `Will ${leadChar} resist the escalating challenge, or will circumstance force irreversible commitment?`,
            objective: `Propel ${leadChar} across the threshold of no return, locking them into the primary arena of conflict.`,
            thematicFunc: `Tests ${leadChar}'s refusal of the call against mounting pressure, establishing the point of no return for "${theme}".`,
            dramaticArc: `Escalates pressure from the inciting incident, culminating in an irreversible choice that forces the Act I break.`,
            threadProg: `T1 accelerates into motion; T2 initiates personal connection; T3 internal defenses begin to strain.`,
            charJourney: `${leadChar} takes the decisive step into unfamiliar territory, believing they can maintain control while walking into deeper entanglement.`,
            constraints: `Ensure the lock-in is causally earned; ${leadChar} must actively cross the threshold rather than being passively pushed.`
        },
        {
            number: 3,
            act: 2,
            fn: 'First Obstacles & New World',
            title: 'The New World & Initial Tests',
            question: `Will ${leadChar}'s old strategies hold up against the unfamiliar rules and obstacles of the new environment?`,
            objective: `Test the protagonist's tactics in heightened territory; reveal the complexity of the opposing forces.`,
            thematicFunc: `Contrasts ${leadChar}'s habitual coping mechanisms with the realities of the new world, highlighting the inadequacy of their defensive lie.`,
            dramaticArc: `Rising action with episodic trials; initial small victories lure characters deeper before unforeseen complications arise.`,
            threadProg: `All active threads (${threadIds.join(', ')}) branch into new complications as relationship dynamics deepen.`,
            charJourney: `${leadChar} attempts to play by their old playbook, but ${loveInterestOrFoil}'s genuine presence introduces unexpected friction.`,
            constraints: `Guard against repetitive episodic encounters; each obstacle must reveal new facets of character and raise stakes.`
        },
        {
            number: 4,
            act: 2,
            fn: 'Escalation & Midpoint Reversal',
            title: 'Escalation & The Midpoint Shift',
            question: `Will the emergence of hidden stakes and revelations shatter ${leadChar}'s illusions and pivot the conflict?`,
            objective: `Deliver the major Midpoint shift (revelation or reversal), converting reactive struggle into proactive engagement.`,
            thematicFunc: `The thematic midpoint: the core lie is forcefully confronted, proving that "${theme}" cannot be avoided without catastrophe.`,
            dramaticArc: `Tension accelerates toward a major collision where a hidden truth or betrayal alters the trajectory of the entire story.`,
            threadProg: `Threads T1 and T2 collide at a high-friction knot, compounding external stakes with deep interpersonal intimacy or vulnerability.`,
            charJourney: `${leadChar} experiences an acute moment of genuine connection or stark revelation, stripping away casual denial.`,
            constraints: `The Midpoint must represent a true point of no return that fundamentally transforms the nature of the stakes.`
        },
        {
            number: 5,
            act: 2,
            fn: 'Midpoint Fallout & Counter-Tactics',
            title: 'The Fallout & Aggressive Counter-Moves',
            question: `How will the characters navigate the dangerous ripple effects of the Midpoint revelation as adversaries adapt?`,
            objective: `Navigate the immediate aftermath of the Midpoint reversal; establish proactive counter-strategies.`,
            thematicFunc: `Explores the consequences of temporary clarity; characters attempt to take offensive control while grappling with deeper vulnerability.`,
            dramaticArc: `Urgent, fast-paced maneuvering as new plans are initiated under mounting time pressure and tightened scrutiny.`,
            threadProg: `Subplot threads intensify; secondary characters exert opposing pressures, threatening to collapse fragile alliances.`,
            charJourney: `${leadChar} oscillates between courageous vulnerability and retreat into old defenses under renewed external pressure.`,
            constraints: `Ensure counter-tactics feel organic and proactive rather than purely reactionary delays.`
        },
        {
            number: 6,
            act: 2,
            fn: 'Tightening Net & Dark Night',
            title: 'The Tightening Net & Dark Night of the Soul',
            question: `When the plan collapses and defenses shatter, will ${leadChar} surrender to despair or discover the truth needed to survive?`,
            objective: `Bring the protagonist to the lowest emotional and tactical ebb; force the ultimate reckoning with the core lie.`,
            thematicFunc: `The ultimate crucible: the protagonist's lie completely fails, leaving them with no choice but to face "${theme}" directly.`,
            dramaticArc: `A sequence of tightening pressure, mounting traps, and catastrophic collapse, culminating in the apparent defeat before the Act III break.`,
            threadProg: `All threads appear broken or compromised; secrets emerge and consequences demand immediate, painful reckoning.`,
            charJourney: `${leadChar} hits rock bottom, shedding the protective armor of their flaw and finding the conviction to embrace the truth.`,
            constraints: `The despair must be grounded in genuine emotional and situational loss, making the eventual resurgence feel earned.`
        },
        {
            number: 7,
            act: 3,
            fn: 'Climax & Decisive Confrontation',
            title: 'The Decisive Confrontation',
            question: `Will ${leadChar} and their allies triumph in the final clash by acting upon the hard-won truth?`,
            objective: `Execute the ultimate climactic confrontation, pitting the synthesized truth directly against the core antagonistic force.`,
            thematicFunc: `The thematic proof: victory or resolution is achieved exclusively because the characters embrace "${theme}".`,
            dramaticArc: `Maximum tension and kinetic momentum; decisive confrontations across all major narrative and interpersonal fronts.`,
            threadProg: `Threads converge decisively; A-story external stakes and B-story relationship truths resolve in lockstep.`,
            charJourney: `${leadChar} acts with full authenticity and moral courage, permanently transcending their starting flaw.`,
            constraints: `Ensure the climax is resolved through character agency and thematic truth, not external coincidences.`
        },
        {
            number: 8,
            act: 3,
            fn: 'Resolution & New Equilibrium',
            title: 'The New Equilibrium & Transformed Reality',
            question: `How will the characters inhabit the transformed reality forged by the crucible of their journey?`,
            objective: `Establish the resonant new equilibrium, thematic crystallization, and final emotional denouement.`,
            thematicFunc: `Crystallizes the transformed value state: "${theme}" is embodied in the irreversible new reality of the characters' lives.`,
            dramaticArc: `Pacing decelerates into reflective, resonant emotional beats, tying off lingering threads and sealing the character arcs.`,
            threadProg: `Final thread status: all narrative threads reach conclusive resolution or meaningful transformed states.`,
            charJourney: `${leadChar} stands in full self-possession, connected to others and the world with hard-earned wisdom.`,
            constraints: `Avoid rushed wrap-ups; allow the emotional impact and thematic resonance of the resolution to breathe.`
        }
    ];

    const requiredHeadings = [
        'THEMATIC & STRUCTURAL FUNCTION',
        'DRAMATIC ARC & PACING CURVES',
        'THREAD PROGRESSION & CONVERGENCE',
        'CHARACTER & PSYCHOLOGICAL JOURNEY',
        'ANTICIPATED ISSUES & CRITICAL CONSTRAINTS'
    ] as const;

    const formatSeqBlock = (bp: (typeof sequenceBlueprints)[number]): string => {
        const charFocus = castNames.slice(0, 3).map((c) => `        <character>${c}</character>`).join('\n');
        const threadAdv = threadIds.map((t) => `        <thread>${t}</thread>`).join('\n');
        const threadStorylines = threads
            .map(
                (t) => `        <thread_storyline>
          <thread_id>${t.id}</thread_id>
          <storyline_advancement>${t.name} advances through ${bp.title.toLowerCase()}, raising stakes and testing loyalties.</storyline_advancement>
          <weaving_interaction>Intersects with ${leadChar}'s emotional journey and core thematic pressures.</weaving_interaction>
        </thread_storyline>`
            )
            .join('\n');

        return `    <sequence>
      <number>${bp.number}</number>
      <parent_act>${bp.act}</parent_act>
      <title>${bp.title}</title>
      <sequence_function>${bp.fn}</sequence_function>
      <dramatic_question>${bp.question}</dramatic_question>
      <starting_state>${bp.number === 1 ? `Opens in the established status quo world with ${leadChar} at baseline.` : `Continues directly from Sequence ${bp.number - 1}'s ending hook, matching its terminal location and cast state.`}</starting_state>
      <description>
        - **THEMATIC & STRUCTURAL FUNCTION:** ${bp.thematicFunc}
        - **DRAMATIC ARC & PACING CURVES:** ${bp.dramaticArc}
        - **THREAD PROGRESSION & CONVERGENCE:** ${bp.threadProg}
        - **CHARACTER & PSYCHOLOGICAL JOURNEY:** ${bp.charJourney}
        - **ANTICIPATED ISSUES & CRITICAL CONSTRAINTS:** ${bp.constraints}
      </description>
      <sequence_objective>${bp.objective}</sequence_objective>
      <threads_advanced>
${threadAdv}
      </threads_advanced>
      <thread_storylines>
${threadStorylines}
      </thread_storylines>
      <characters_in_focus>
${charFocus}
      </characters_in_focus>
      <sequence_climax>Moments before the sequence closes, the central tension reaches a temporary inflection point, answering the dramatic question and setting the next stage.</sequence_climax>
      <ending_hook>An unexpected turn or pressing demand propels the characters directly into the following sequence.</ending_hook>
      <next_sequence_boundary_guard>${bp.number < 8 ? `Deliver characters to the threshold of Sequence ${bp.number + 1} without preempting Sequence ${bp.number + 1}'s core events or new character introductions.` : `Final sequence of the novel; resolve all active narrative threads.`}</next_sequence_boundary_guard>
    </sequence>`;
    };

    for (let i = 1; i <= 8; i++) {
        if (!existingNumbers.has(i)) {
            const bp = sequenceBlueprints[i - 1];
            const seqXml = formatSeqBlock(bp);
            updatedOutput = updatedOutput.replace(/<\/sequences>/i, `${seqXml}\n  </sequences>`);
            repairs.push(`Sequence ${i}: Auto-synthesized missing sequence for Act ${bp.act} (${bp.fn})`);
        }
    }

    const seqTagRegex = /<sequence(?:\s+[^>]*)?>([\s\S]*?)<\/sequence>/gi;
    let match: RegExpExecArray | null;
    while ((match = seqTagRegex.exec(updatedOutput)) !== null) {
        const fullSeqTag = match[0];
        const seqInner = match[1];
        const num = parseInt(extractTag(seqInner, 'number'), 10) || 1;
        const bp = sequenceBlueprints[(num - 1) % 8] || sequenceBlueprints[0];

        const descMatch = /<description(?:\s+[^>]*)?>([\s\S]*?)<\/description>/i.exec(seqInner);
        if (descMatch) {
            let descText = descMatch[1];
            let descModified = false;
            for (const reqH of requiredHeadings) {
                const hRegex = new RegExp(`\\*\\*${escapeRegExp(reqH)}:\\*\\*`, 'i');
                if (!hRegex.test(descText)) {
                    let synthText: string;
                    if (reqH === 'THEMATIC & STRUCTURAL FUNCTION') synthText = bp.thematicFunc;
                    else if (reqH === 'DRAMATIC ARC & PACING CURVES') synthText = bp.dramaticArc;
                    else if (reqH === 'THREAD PROGRESSION & CONVERGENCE') synthText = bp.threadProg;
                    else if (reqH === 'CHARACTER & PSYCHOLOGICAL JOURNEY') synthText = bp.charJourney;
                    else synthText = bp.constraints;
                    descText = descText.trim() + `\n        - **${reqH}:** ${synthText}`;
                    descModified = true;
                    repairs.push(`Sequence ${num}: Added missing description heading [${reqH}]`);
                }
            }
            if (descModified) {
                const newSeqInner = seqInner.replace(
                    descMatch[0],
                    `<description>\n${descText}\n      </description>`
                );
                updatedOutput = updatedOutput.replace(
                    fullSeqTag,
                    `<sequence>\n${newSeqInner.trim()}\n    </sequence>`
                );
            }
        }
    }

    return {
        rawOutput: updatedOutput,
        repaired: repairs.length > 0,
        repairs
    };
}
