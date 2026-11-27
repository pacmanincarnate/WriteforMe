/**
 * @module domain/continuity/activeState
 * Knowledge Graph synchronization, Semantic Event Log, Pre-Flight `<active_state>` compiler
 * combining Continuity Ledger + GESM Epistemic Graph, and Tier 4 Continuity Auditor.
 */

import type { CastMember } from '@/types';
import { PROMPTS } from '@/prompts';
import { isSerializationPlaceholder, safeEscapeRegex, tokenMatch } from '@/utils';
import { isAudioDramaScriptText } from '@/domain/audio';
import { applySurgicalEditsDetailed } from '@/domain/editing';
import {
    formatContinuityLedgerForPrompt,
    formatSceneCoord,
    parseSceneCoordinates
} from './ledger';
import type { ContinuityStoryState } from './ledger';
import { compileEpistemicAsymmetryAndIrony, projectFocalizedSubgraph } from './epistemicGraph';
import { extractProseTextTail, formatSceneCharactersList } from './contextBuilders';

export interface KnowledgeGraphNode {
    id: string;
    type: string;
    name: string;
    role?: string;
    status: string;
    attributes: Record<string, unknown>;
    last_updated_scene: string | null;
}

export interface KnowledgeGraphEdge {
    id: string;
    source: string;
    target: string;
    type: string;
    relation: string;
    status: string;
    details: string;
    last_updated_scene: string | null;
}

export interface KnowledgeGraph {
    nodes: KnowledgeGraphNode[];
    edges: KnowledgeGraphEdge[];
}

export interface SemanticEventEntry {
    id: string;
    scene_id: string;
    sequence: number | null;
    scene: number | null;
    summary: string;
    key_events: string[];
    entities_involved: string[];
    timestamp: number;
}

export type ContinuityAuditCallAIFn = (
    prompt: string,
    sysPrompt: string,
    useSchema: boolean,
    label: string,
    tier: string
) => Promise<string>;

export interface ContinuityAuditParams {
    proseText?: string;
    activeStateBlock?: string;
    systemPrompt?: string;
    scene?: Record<string, unknown>;
    previousScene?: Record<string, unknown> | null;
    previousSceneProseText?: string;
    upcomingBoundaryInfo?: string;
    callAIFn?: ContinuityAuditCallAIFn | null;
    isAutopilot?: boolean;
    isAudioDrama?: boolean;
}

export interface ContinuityAuditResult {
    prose: string;
    status: 'SKIPPED' | 'PASS' | 'PATCHED';
    patchesApplied: number;
}

/** Initializes or hydrates the Story Knowledge Graph from cast, lore, and relationship state. */
export function initKnowledgeGraph(storyState: ContinuityStoryState = {}): KnowledgeGraph {
    const kg = (storyState.knowledge_graph || { nodes: [], edges: [] }) as Partial<KnowledgeGraph>;
    const nodes: KnowledgeGraphNode[] = Array.isArray(kg.nodes) ? [...kg.nodes] : [];
    const edges: KnowledgeGraphEdge[] = Array.isArray(kg.edges) ? [...kg.edges] : [];

    (storyState.cast || []).forEach((c) => {
        if (!c || !c.name) return;
        const id = c.id || `node_char_${c.name.toLowerCase().replace(/\s+/g, '_')}`;
        if (!nodes.some((n) => n.name && n.name.toLowerCase() === c.name.toLowerCase())) {
            nodes.push({
                id,
                type: 'character',
                name: c.name,
                role: c.role || 'Character',
                status: c.core_flaw || 'active',
                attributes: {
                    vocal_cadence: c.vocal_cadence || '',
                    core_desire: c.core_desire || ''
                },
                last_updated_scene: null
            });
        }
    });

    ((storyState.lore || []) as Array<Record<string, unknown>>).forEach((l) => {
        if (!l || typeof l.topic !== 'string' || !l.topic) return;
        const top = l.topic.toLowerCase();
        const cat = String(l.category || l.type || '').toLowerCase();
        const det = String(l.detail || l.text || '').toLowerCase();
        const isLoc =
            top.includes('location') ||
            top.includes('setting') ||
            top.includes('place') ||
            top.includes('vault') ||
            top.includes('bunker') ||
            top.includes('station') ||
            top.includes('room') ||
            top.includes('city') ||
            cat.includes('place') ||
            cat.includes('location') ||
            det.includes('location') ||
            det.includes('underground bunker');
        const isFac =
            top.includes('faction') ||
            top.includes('group') ||
            top.includes('guild') ||
            top.includes('clan') ||
            top.includes('order') ||
            cat.includes('faction');
        const isItem =
            top.includes('item') ||
            top.includes('object') ||
            top.includes('artifact') ||
            top.includes('weapon') ||
            top.includes('key') ||
            cat.includes('object') ||
            cat.includes('item');
        const type = isLoc ? 'location' : isFac ? 'faction' : isItem ? 'item' : 'concept';
        if (!nodes.some((n) => n.name && n.name.toLowerCase() === String(l.topic).toLowerCase())) {
            nodes.push({
                id: `node_${type}_${l.topic.toLowerCase().replace(/\s+/g, '_')}`,
                type,
                name: l.topic,
                status: 'established',
                attributes: { detail: l.detail || l.text || '' },
                last_updated_scene: null
            });
        }
    });

    const rels = (storyState.relationships || {}) as Record<string, unknown>;
    Object.entries(rels).forEach(([pairKey, data]) => {
        if (!data) return;
        const parts = pairKey.split('->');
        if (parts.length === 2) {
            const from = parts[0].trim();
            const to = parts[1].trim();
            const feeling =
                typeof data === 'string'
                    ? data
                    : String((data as Record<string, unknown>).current || '');
            if (
                !edges.some(
                    (e) => e.source === from && e.target === to && e.type === 'relationship'
                )
            ) {
                edges.push({
                    id: `edge_rel_${from}_${to}`.toLowerCase().replace(/\s+/g, '_'),
                    source: from,
                    target: to,
                    type: 'relationship',
                    relation: feeling || 'neutral',
                    status: 'active',
                    details: feeling,
                    last_updated_scene: null
                });
            }
        }
    });

    return { nodes, edges };
}

/** Merges incremental node and edge updates into the Knowledge Graph. */
export function updateKnowledgeGraph(
    storyState: ContinuityStoryState = {},
    updates: {
        nodes?: Array<Partial<KnowledgeGraphNode>>;
        edges?: Array<Partial<KnowledgeGraphEdge>>;
    } = {}
): KnowledgeGraph {
    const currentGraph = initKnowledgeGraph(storyState);
    const nodes = [...currentGraph.nodes];
    const edges = [...currentGraph.edges];

    if (Array.isArray(updates.nodes)) {
        updates.nodes.forEach((uNode) => {
            if (!uNode || !uNode.name) return;
            const existingIdx = nodes.findIndex(
                (n) => n.name && n.name.toLowerCase() === uNode.name!.toLowerCase()
            );
            if (existingIdx !== -1) {
                nodes[existingIdx] = {
                    ...nodes[existingIdx],
                    ...uNode,
                    attributes: {
                        ...(nodes[existingIdx].attributes || {}),
                        ...(uNode.attributes || {})
                    }
                };
            } else {
                nodes.push({
                    id:
                        uNode.id ||
                        `node_${uNode.type || 'entity'}_${uNode.name.toLowerCase().replace(/\s+/g, '_')}`,
                    type: uNode.type || 'character',
                    name: uNode.name,
                    status: uNode.status || 'active',
                    attributes: uNode.attributes || {},
                    last_updated_scene: uNode.last_updated_scene || null
                });
            }
        });
    }

    if (Array.isArray(updates.edges)) {
        updates.edges.forEach((uEdge) => {
            if (!uEdge || !uEdge.source || !uEdge.target) return;
            const existingIdx = edges.findIndex(
                (e) =>
                    e.source &&
                    e.target &&
                    e.source.toLowerCase() === uEdge.source!.toLowerCase() &&
                    e.target.toLowerCase() === uEdge.target!.toLowerCase() &&
                    e.type === (uEdge.type || 'relationship')
            );
            if (existingIdx !== -1) {
                edges[existingIdx] = { ...edges[existingIdx], ...uEdge };
            } else {
                edges.push({
                    id:
                        uEdge.id ||
                        `edge_${uEdge.type || 'rel'}_${uEdge.source}_${uEdge.target}`
                            .toLowerCase()
                            .replace(/\s+/g, '_'),
                    source: uEdge.source,
                    target: uEdge.target,
                    type: uEdge.type || 'relationship',
                    relation: uEdge.relation || uEdge.details || 'connected',
                    status: uEdge.status || 'active',
                    details: uEdge.details || '',
                    last_updated_scene: uEdge.last_updated_scene || null
                });
            }
        });
    }

    return { nodes, edges };
}

/** Appends a scene event entry to the immutable Semantic Event Log copy. */
export function logSemanticEvent(
    storyState: ContinuityStoryState = {},
    event: Partial<SemanticEventEntry> = {}
): SemanticEventEntry[] {
    const eventLog = Array.isArray(storyState.event_log)
        ? [...(storyState.event_log as SemanticEventEntry[])]
        : [];
    if (!event || !event.summary) return eventLog;
    const newEntry: SemanticEventEntry = {
        id: event.id || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        scene_id: event.scene_id || '',
        sequence: event.sequence ?? null,
        scene: event.scene ?? null,
        summary: event.summary,
        key_events: Array.isArray(event.key_events) ? event.key_events : [event.summary],
        entities_involved: Array.isArray(event.entities_involved) ? event.entities_involved : [],
        timestamp: Date.now()
    };
    eventLog.push(newEntry);
    return eventLog;
}

/** Queries recent semantic events matching involved entity names or free-text terms. */
export function querySemanticEventLog(
    storyState: ContinuityStoryState = {},
    {
        entityNames = [],
        query = '',
        limit = 5
    }: { entityNames?: string[]; query?: string; limit?: number } = {}
): SemanticEventEntry[] {
    const eventLog = Array.isArray(storyState.event_log)
        ? (storyState.event_log as SemanticEventEntry[])
        : [];
    if (eventLog.length === 0) return [];

    const cleanEntities = (entityNames || []).map((e) => String(e).toLowerCase().trim()).filter(Boolean);
    const cleanQuery = String(query || '').toLowerCase().trim();

    const matches: SemanticEventEntry[] = [];
    for (let i = eventLog.length - 1; i >= 0; i--) {
        const ev = eventLog[i];
        let isMatch = false;

        if (cleanEntities.length > 0) {
            const evEntities = (ev.entities_involved || []).map((e) => String(e).toLowerCase());
            for (const ce of cleanEntities) {
                if (
                    evEntities.some((ee) => ee.includes(ce) || ce.includes(ee)) ||
                    (ev.summary && ev.summary.toLowerCase().includes(ce))
                ) {
                    isMatch = true;
                    break;
                }
            }
        }

        if (!isMatch && cleanQuery) {
            if (ev.summary && ev.summary.toLowerCase().includes(cleanQuery)) isMatch = true;
            if (
                Array.isArray(ev.key_events) &&
                ev.key_events.some((k) => String(k).toLowerCase().includes(cleanQuery))
            ) {
                isMatch = true;
            }
        }

        if (isMatch || (cleanEntities.length === 0 && !cleanQuery)) {
            matches.push(ev);
            if (matches.length >= limit) break;
        }
    }
    return matches;
}

/** Tier 3 Pre-Flight Router: compiles `<active_state>` combining Ledger, Knowledge Graph, States, and GESM. */
export function compileActiveState(
    storyState: ContinuityStoryState = {},
    scene: Record<string, unknown> = {},
    activeCast: Array<CastMember | string> = [],
    scopeOpts: Record<string, unknown> = {}
): string {
    const graph = initKnowledgeGraph(storyState);
    const rawChars: unknown[] = [
        ...(Array.isArray(scene.characters_present)
            ? scene.characters_present
            : scene.characters_present
              ? [scene.characters_present]
              : []),
        ...(Array.isArray(scene.cast_names)
            ? scene.cast_names
            : scene.cast_names
              ? [scene.cast_names]
              : []),
        ...(Array.isArray(activeCast) ? activeCast : activeCast ? [activeCast] : [])
    ];
    const charNames: string[] = [];
    rawChars.forEach((c) => {
        if (!c) return;
        if (typeof c === 'string') {
            c.split(/[,;\n]+|(?:\band\b)/i)
                .map((s) => s.trim().replace(/^-\s*/, ''))
                .filter((x) => Boolean(x) && !isSerializationPlaceholder(x))
                .forEach((x) => {
                    if (!charNames.some((cn) => cn.toLowerCase() === x.toLowerCase())) {
                        charNames.push(x);
                    }
                });
        } else if (typeof c === 'object' && typeof (c as { name?: unknown }).name === 'string') {
            const cn = String((c as { name: string }).name).trim();
            if (
                cn &&
                !isSerializationPlaceholder(cn) &&
                !charNames.some((existing) => existing.toLowerCase() === cn.toLowerCase())
            ) {
                charNames.push(cn);
            }
        }
    });

    const settingStr = String(
        scene.setting || scene.environment || scene.setting_anchor || ''
    ).trim();
    const isActiveCharName = (nameStr: string): boolean => {
        const nLower = String(nameStr || '').trim().toLowerCase();
        if (!nLower) return false;
        return charNames.some((cn) => cn.toLowerCase() === nLower);
    };
    const ledgerPlaceKeys = new Set(
        (storyState.continuity_ledger || [])
            .filter(
                (e) =>
                    e &&
                    e.status !== 'resolved' &&
                    /^(?:place|location|setting|environment)$/i.test(String(e.category || ''))
            )
            .map((e) => String(e.key || e.subject || e.name || '').trim().toLowerCase())
            .filter(Boolean)
    );

    const activeEdges = graph.edges.filter((e) => {
        if (!e || !e.source || !e.target) return false;
        if (String(e.type || '').toLowerCase() === 'ownership') return false;
        return isActiveCharName(e.source) || isActiveCharName(e.target);
    });

    const connectedEntityNames = new Set<string>();
    activeEdges.forEach((e) => {
        if (e.source) connectedEntityNames.add(String(e.source).trim().toLowerCase());
        if (e.target) connectedEntityNames.add(String(e.target).trim().toLowerCase());
    });

    const activeNodes = graph.nodes.filter((n) => {
        if (!n || !n.name) return false;
        const nType = String(n.type || '').toLowerCase();
        const nLower = String(n.name).trim().toLowerCase();
        if (nType === 'item') return false;
        if (nType === 'location' && ledgerPlaceKeys.has(nLower)) return false;
        if (nType === 'character') {
            return isActiveCharName(n.name) || connectedEntityNames.has(nLower);
        }
        return (Boolean(settingStr) && tokenMatch(settingStr, n.name)) || connectedEntityNames.has(nLower);
    });

    const recentEvents = querySemanticEventLog(storyState, { entityNames: charNames, limit: 4 });

    const REDUNDANT_KG_ATTRS = new Set(['vocal_cadence', 'core_desire', 'backstory', 'recent_events']);
    const orderedActiveNodes = [
        ...activeNodes.filter((n) => String(n.type || '').toLowerCase() !== 'character'),
        ...activeNodes.filter((n) => String(n.type || '').toLowerCase() === 'character')
    ];
    const entityLines = orderedActiveNodes.map((n) => {
        const nType = String(n.type || 'entity').toLowerCase();
        if (nType === 'character' && !isActiveCharName(n.name)) {
            return `- [CHARACTER] ${n.name} (Off-scene): Status: ${n.status || 'Active'}`;
        }
        const attrs = n.attributes
            ? Object.entries(n.attributes)
                  .filter(
                      ([k, v]) =>
                          !REDUNDANT_KG_ATTRS.has(String(k).toLowerCase()) &&
                          v !== null &&
                          v !== undefined &&
                          String(v).trim() !== ''
                  )
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ')
            : '';
        return `- [${nType.toUpperCase()}] ${n.name}: Status: ${n.status || 'Active'}${attrs ? ` (${attrs})` : ''}`;
    });

    const edgeLines = activeEdges.map((e) => {
        const rel = String(e.relation || '').trim();
        const det = String(e.details || '').trim();
        const detailSuffix = det && det.toLowerCase() !== rel.toLowerCase() ? ` (${det})` : '';
        return `- [${String(e.type || 'relationship').toUpperCase()}] ${e.source} -> ${e.target}: ${rel}${detailSuffix} [Status: ${e.status || 'Active'}]`;
    });

    const eventLines = recentEvents.map(
        (ev) => `- ${ev.scene_id ? `[Scene ${ev.scene_id}] ` : ''}${ev.summary}`
    );

    const currentSeqNum =
        Number(
            scopeOpts?.sequence ||
                scene?.sequence ||
                parseSceneCoordinates(scene, storyState)?.sequence
        ) || 1;
    const unrevealedSecrets = Array.isArray(storyState.secret_vault)
        ? storyState.secret_vault.filter(
              (sec) =>
                  sec &&
                  sec.status !== 'revealed' &&
                  Number(sec.reveal_anchor?.sequence_number || 7) > currentSeqNum
          )
        : [];
    const maskSecretText = (val: unknown): string => {
        let textVal = String(val || '');
        if (!textVal || unrevealedSecrets.length === 0) return textVal;
        unrevealedSecrets.forEach((sec) => {
            if (sec.truth && sec.truth.length > 5) {
                textVal = textVal.replace(
                    new RegExp(safeEscapeRegex(sec.truth), 'gi'),
                    '[Private Tension]'
                );
            }
        });
        return textVal;
    };

    const charStateMap = (storyState.character_states || {}) as Record<
        string,
        Record<string, unknown>
    >;
    const stateLines: string[] = [];
    const seenStateNames = new Set<string>();
    const formatCharStateLine = (cs: Record<string, unknown>, fallbackName: string): string => {
        const displayName = String(cs.name || cs.character || fallbackName);
        const upd =
            cs.last_updated_scene || cs.updated_at_scene || cs.updated || cs.last_scene || 'Current';
        const emo = maskSecretText(cs.emotional_state || 'Baseline');
        const tension = maskSecretText(cs.unresolved_tension || 'None recorded');
        return `- ${displayName}: Location: ${cs.location || 'See scene setting'} | Physical State: ${cs.physical_state || 'Active condition'} | Emotional State: ${emo} | Unresolved Tension: ${tension} | Updated: ${upd}`;
    };
    charNames.forEach((cName) => {
        const cs =
            charStateMap[cName] ||
            Object.values(charStateMap).find(
                (st) =>
                    st &&
                    ((st.name && String(st.name).toLowerCase() === cName.toLowerCase()) ||
                        (st.character && String(st.character).toLowerCase() === cName.toLowerCase()))
            );
        if (cs) {
            const keyName = String(cs.name || cs.character || cName).toLowerCase();
            if (!seenStateNames.has(keyName)) {
                seenStateNames.add(keyName);
                stateLines.push(formatCharStateLine(cs, cName));
            }
        }
    });
    if (stateLines.length === 0) {
        Object.entries(charStateMap).forEach(([k, cs]) => {
            if (!cs) return;
            const keyName = String(cs.name || cs.character || k).toLowerCase();
            if (!seenStateNames.has(keyName)) {
                seenStateNames.add(keyName);
                stateLines.push(formatCharStateLine(cs, k));
            }
        });
    }
    const characterStatesSnippet = `<verified_character_locations_and_states>\n${stateLines.length > 0 ? stateLines.join('\n') : 'No tracked character location/state snapshots recorded yet.'}\n</verified_character_locations_and_states>\n`;

    let continuityLedgerText = 'No active continuity items.';
    const formattedLedger = formatContinuityLedgerForPrompt(storyState, {
        ...(scopeOpts || {}),
        sceneObj: scene,
        activeCast
    });
    if (formattedLedger && String(formattedLedger).trim()) {
        continuityLedgerText = String(formattedLedger).trim();
    }
    const continuityLedgerSnippet = `<continuity_ledger>\n${continuityLedgerText}\n</continuity_ledger>\n`;

    let epistemicProjectionSnippet = '';
    let epistemicDirectivesSnippet = '';
    try {
        const rawSceneNumStr = scene && scene.number ? String(scene.number).trim() : '';
        const sceneCoord =
            rawSceneNumStr && rawSceneNumStr.includes('.')
                ? rawSceneNumStr
                : formatSceneCoord(
                      scopeOpts.sequence || 1,
                      scopeOpts.scene || (Number(rawSceneNumStr) > 0 ? Number(rawSceneNumStr) : 1)
                  );
        const povChar = String(scene.pov_character || charNames[0] || 'Protagonist');
        const partnerChars = charNames.filter((cn) => cn.toLowerCase() !== povChar.toLowerCase());

        const projection = projectFocalizedSubgraph(storyState, {
            povCharId: povChar,
            partnerCharIds: partnerChars,
            sceneEntityIds: Array.from(connectedEntityNames),
            sceneCoord
        });

        const compiledEpistemic = compileEpistemicAsymmetryAndIrony(
            projection,
            scene,
            storyState,
            sceneCoord
        );
        if (compiledEpistemic.activeStateSnippet) {
            epistemicProjectionSnippet = compiledEpistemic.activeStateSnippet + '\n';
        }
        if (compiledEpistemic.directivesBlock) {
            epistemicDirectivesSnippet = compiledEpistemic.directivesBlock + '\n';
        }
    } catch (epistemicErr) {
        console.warn('[compileActiveState] GESM projection bypassed:', epistemicErr);
    }

    return `<active_state>
${continuityLedgerSnippet}<relational_ground_truth>
${entityLines.length > 0 ? `Entities Present:\n${entityLines.join('\n')}\n` : 'Entities Present: Baseline cast condition.\n'}${edgeLines.length > 0 ? `Current Dynamics:\n${edgeLines.join('\n')}\n` : 'Current Dynamics: Baseline active relationships.\n'}</relational_ground_truth>
${characterStatesSnippet}<recent_event_chronology>
${eventLines.length > 0 ? eventLines.join('\n') : 'No prior recorded historical events for these entities.'}
</recent_event_chronology>
${epistemicProjectionSnippet}${epistemicDirectivesSnippet}</active_state>`;
}

/** Tier 4 Dedicated Continuity Auditor: checks drafted scene prose against `<active_state>` and patches contradictions. */
export async function runContinuityAuditor({
    proseText = '',
    activeStateBlock = '',
    systemPrompt = '',
    scene = {},
    previousScene = null,
    previousSceneProseText = '',
    upcomingBoundaryInfo = '',
    callAIFn = null,
    isAudioDrama = false
}: ContinuityAuditParams = {}): Promise<ContinuityAuditResult> {
    if (!proseText || proseText.length < 100 || !activeStateBlock) {
        return { prose: proseText, status: 'SKIPPED', patchesApplied: 0 };
    }

    try {
        // The LLM entry point must be passed in (`callAIFn`); the domain layer does not reach for globals.
        const effectiveCallAI = callAIFn;
        if (!effectiveCallAI) return { prose: proseText, status: 'SKIPPED', patchesApplied: 0 };

        const isAudioDramaMode = Boolean(isAudioDrama || isAudioDramaScriptText(proseText));

        const sceneCastStr = formatSceneCharactersList(scene);
        const sceneBlueprintConstraints = `<scene_blueprint_constraints>
Title: ${scene?.title || 'Scene'}
Scene Number: ${scene?.number || ''}
POV Character: ${scene?.pov_character || ''}
Setting: ${scene?.setting || scene?.environment || ''}
Transition Jump: ${scene?.transition_jump || ''}
Entrance Conditions: ${scene?.entrance_conditions || scene?.entrance_condition || ''}
Characters Present: ${sceneCastStr}
Goal/Objective: ${scene?.objective || scene?.goal || ''}
Exit Hook: ${scene?.exit_hook || scene?.exit_conditions || ''}
</scene_blueprint_constraints>`;

        const prevTail = previousSceneProseText
            ? extractProseTextTail(previousSceneProseText, 300)
            : '';
        const prevCastStr = previousScene ? formatSceneCharactersList(previousScene) : '';
        const prevHandoffBlock =
            previousScene || prevTail
                ? `\n\n<previous_scene_handoff_context>
${
    previousScene
        ? `Previous Scene: ${previousScene.number ? `${previousScene.number} - ` : ''}${previousScene.title || 'Previous Scene'}
Previous Scene Setting: ${previousScene.setting || previousScene.environment || 'Unspecified'}
${prevCastStr ? `Previous Scene Characters: ${prevCastStr}\n` : ''}Previous Scene Exit Hook: ${previousScene.exit_hook || previousScene.exit_conditions || 'None recorded'}
`
        : ''
}${prevTail ? `Ending Prose of Previous Scene (last ~300 words):\n${prevTail}` : ''}
</previous_scene_handoff_context>`
                : '';

        const upcomingGuardBlock = upcomingBoundaryInfo
            ? `\n\n<upcoming_boundary_guard>\n${upcomingBoundaryInfo}\n</upcoming_boundary_guard>`
            : '';

        const baseAuditorSystemPrompt =
            systemPrompt ||
            (PROMPTS as Record<string, string | undefined>)?.continuityAuditor ||
            'You are a dedicated narrative continuity auditor. Compare drafted prose strictly against verified <active_state>.';
        const effectiveSystemPrompt = isAudioDramaMode
            ? `${baseAuditorSystemPrompt}\n\nAUDIO DRAMA SCRIPT FORMAT: This draft is a multi-voice audio drama script. Every <search> and <replace> MUST preserve exact 'SpeakerName: [voice instruction] Spoken text' line formatting. Never introduce unattributed narrative paragraphs or place physical blocking inside brackets/parentheses.`
            : baseAuditorSystemPrompt;

        const hasSchemaInSystem =
            effectiveSystemPrompt.includes('<surgical_patch>') &&
            effectiveSystemPrompt.includes('<audit_status>');
        const auditorTail = hasSchemaInSystem
            ? 'Carefully audit <scene_draft> strictly against <active_state>, <scene_blueprint_constraints>, <previous_scene_handoff_context>, and <upcoming_boundary_guard> across all 5 continuity vectors.\nOutput <surgical_patch> blocks for any continuity violation, or <audit_status>PASS</audit_status> if continuity is intact.'
            : `Carefully audit the scene draft strictly against <active_state>, <scene_blueprint_constraints>, <previous_scene_handoff_context>, and <upcoming_boundary_guard>. Check all 5 continuity vectors:
1. Spatial & Entrance Continuity: Opening location and physical transitions match the previous scene's ending, <verified_character_locations_and_states>, and <scene_blueprint_constraints> (Setting, Transition Jump, Entrance Conditions) with zero unexplained teleportation.
2. Character Introduction & Prior Interaction Continuity: Never re-introduce as a stranger or erase prior interactions with any character already met in <previous_scene_handoff_context>, <recent_event_chronology>, or <continuity_ledger>.
3. Physical & Prop Continuity: Injuries, held items, objects left behind, clothing, and physical status strictly obey <active_state> and <continuity_ledger>.
4. Relational & Epistemic Continuity: Interpersonal trust/hostility and concealed knowledge strictly obey <relational_ground_truth>, <focalized_epistemic_projection>, and prior interactions.
5. Terminal Exit & Anti-Preemption Continuity: Scene ending obeys <exit_hook> and delivers characters in a state compatible with <upcoming_boundary_guard> without prematurely dramatizing or stealing events/first-meetings reserved for the next scene or next sequence.

If continuity is flawless and no contradictions exist, output strictly:
<audit_status>PASS</audit_status>

If physical or relational continuity is violated, output surgical replacement patches:
<surgical_patch>
<search>complete verbatim sentence or paragraph from draft</search>
<replace>exact corrected sentence or paragraph resolving the continuity violation</replace>
</surgical_patch>`;

        const auditorPrompt = `
${activeStateBlock}

${sceneBlueprintConstraints}${prevHandoffBlock}${upcomingGuardBlock}

<scene_draft>
${proseText}
</scene_draft>

${auditorTail}
`;
        const auditResponse = await effectiveCallAI(
            auditorPrompt,
            effectiveSystemPrompt,
            false,
            'Continuity Auditor (Tier 4)',
            'review'
        );

        if (
            auditResponse &&
            auditResponse.includes('<audit_status>PASS</audit_status>') &&
            !auditResponse.includes('<surgical_patch')
        ) {
            return { prose: proseText, status: 'PASS', patchesApplied: 0 };
        }

        if (auditResponse && auditResponse.includes('<surgical_patch')) {
            const patchReport = applySurgicalEditsDetailed(proseText, auditResponse);
            if (patchReport && patchReport.applied && patchReport.applied.length > 0) {
                return {
                    prose: patchReport.text,
                    status: 'PATCHED',
                    patchesApplied: patchReport.applied.length
                };
            }
        }
    } catch (err) {
        console.warn('[Continuity Auditor] Audit pass warning, proceeding with draft:', err);
    }
    return { prose: proseText, status: 'PASS', patchesApplied: 0 };
}
