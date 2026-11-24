/**
 * @module domain/continuity/ledger
 * Scene coordinate parsing/comparison, chronological fact visibility,
 * continuity ledger ingestion, and 3-tier cache-aligned prompt formatting.
 */

import type { CastMember, Story } from '@/types';
import { STOPWORDS, parseNum, tokenMatch } from '@/utils';
import { actForSequence, isLegacyValenceEntry, resolveCharacter } from '@/domain/story';

export interface SceneCoordinates {
    act: number;
    sequence: number;
    scene: number;
}

export interface ContinuityStoryState extends Partial<Story> {
    continuity_ledger?: Array<Record<string, unknown>>;
    epistemic_graph?: Record<string, unknown> | null;
    [key: string]: unknown;
}

export interface BeliefEdgeLike {
    archived?: boolean;
    acquired_at_scene?: string | number | null;
    invalidated_at_scene?: string | number | null;
    [key: string]: unknown;
}

/** Parses heterogeneous scene coordinate inputs into `{ act, sequence, scene }`. */
export function parseSceneCoordinates(
    coord: unknown,
    storyState: ContinuityStoryState = {}
): SceneCoordinates {
    if (coord === null || coord === undefined) return { act: 1, sequence: 1, scene: 1 };
    if (coord === '0.0' || coord === '0.0.0' || coord === 'baseline' || coord === 0) {
        return { act: 0, sequence: 0, scene: 0 };
    }
    if (typeof coord === 'number') {
        return { act: 1, sequence: 1, scene: coord || 1 };
    }
    if (typeof coord === 'object') {
        const obj = coord as Record<string, unknown>;
        const actIdx = parseNum(obj.actIndex) ?? parseNum(obj.act_index) ?? parseNum(obj.actIdx);
        const seqIdx =
            parseNum(obj.sequenceIndex) ?? parseNum(obj.sequence_index) ?? parseNum(obj.seqIdx);
        const scnIdx =
            parseNum(obj.sceneIndex) ?? parseNum(obj.scene_index) ?? parseNum(obj.sceneIdx);

        const act =
            parseNum(obj.act) ??
            parseNum(obj.valid_from_act) ??
            parseNum(obj.parent_act) ??
            (actIdx !== null ? actIdx + 1 : null);
        const seq =
            parseNum(obj.sequence) ??
            parseNum(obj.seq) ??
            parseNum(obj.valid_from_sequence) ??
            parseNum(obj.parent_sequence) ??
            (seqIdx !== null ? seqIdx + 1 : null);
        const scn =
            parseNum(obj.scene) ??
            parseNum(obj.valid_from_scene) ??
            (scnIdx !== null ? scnIdx + 1 : null);

        if (act !== null || seq !== null || scn !== null) {
            if (seq === 0 && scn === 0) {
                return { act: 0, sequence: 0, scene: 0 };
            }
            const finalSeq = seq !== null ? seq : 1;
            const seqObj = (storyState.sequences || []).find((s) => s.number === finalSeq);
            const finalAct =
                act !== null ? act : seqObj?.parent_act || actForSequence(finalSeq);
            return {
                act: finalAct || 1,
                sequence: finalSeq,
                scene: scn !== null ? scn : 1
            };
        }
        if (obj.number || obj.id) {
            const fromId = parseSceneCoordinates(obj.number || obj.id, storyState);
            if (fromId.sequence !== 1 || fromId.scene !== 1 || fromId.act !== 1 || obj.number || obj.id) {
                return fromId;
            }
        }
    }
    const str = String(coord).trim();
    if (str === '0.0' || str === '0-0' || str === '0' || str.toLowerCase() === 'baseline') {
        return { act: 0, sequence: 0, scene: 0 };
    }
    const fullMatch = str.match(/Act\s*(\d+)[,\s]+(?:Seq|Sequence)\s*(\d+)[,\s]+Scene\s*(\d+)/i);
    if (fullMatch) {
        return {
            act: parseInt(fullMatch[1], 10) || 1,
            sequence: parseInt(fullMatch[2], 10) || 1,
            scene: parseInt(fullMatch[3], 10) || 1
        };
    }
    const seqSceneMatch = str.match(/(?:(?:Seq|Sequence)\s*(\d+)[,\s]+)?(?:Scene\s*)?(\d+)\.(\d+)/i);
    if (seqSceneMatch) {
        const parsedSeq = parseInt(seqSceneMatch[2], 10);
        const parsedScn = parseInt(seqSceneMatch[3], 10);
        const seq = isNaN(parsedSeq) ? 1 : parsedSeq;
        const scn = isNaN(parsedScn) ? 1 : parsedScn;
        if (seq === 0 && scn === 0) {
            return { act: 0, sequence: 0, scene: 0 };
        }
        const seqObj = (storyState.sequences || []).find((s) => s.number === seq);
        const act = seqObj?.parent_act || actForSequence(seq);
        return { act: act || 1, sequence: seq, scene: scn };
    }
    const seqAndSceneMatch = str.match(/(?:Seq|Sequence)\s*(\d+)[,\s]+Scene\s*(\d+)/i);
    if (seqAndSceneMatch) {
        const seq = parseInt(seqAndSceneMatch[1], 10) || 1;
        const scn = parseInt(seqAndSceneMatch[2], 10) || 1;
        const seqObj = (storyState.sequences || []).find((s) => s.number === seq);
        const act = seqObj?.parent_act || actForSequence(seq);
        return { act: act || 1, sequence: seq, scene: scn };
    }
    const actSceneMatch = str.match(/Act\s*(\d+)[,\s]+Scene\s*(\d+)/i);
    if (actSceneMatch) {
        const act = parseInt(actSceneMatch[1], 10) || 1;
        const scn = parseInt(actSceneMatch[2], 10) || 1;
        return { act, sequence: act, scene: scn };
    }
    const seqOnlyMatch = str.match(/^(?:Seq|Sequence)\s*(\d+)$/i);
    if (seqOnlyMatch) {
        const seq = parseInt(seqOnlyMatch[1], 10) || 1;
        const seqObj = (storyState.sequences || []).find((s) => s.number === seq);
        const act = seqObj?.parent_act || actForSequence(seq);
        return { act: act || 1, sequence: seq, scene: 1 };
    }
    const actOnlyMatch = str.match(/^Act\s*(\d+)$/i);
    if (actOnlyMatch) {
        const act = parseInt(actOnlyMatch[1], 10) || 1;
        return { act, sequence: act, scene: 1 };
    }
    const hyphenMatch = str.match(/^(?:scene[-_\s]*)?(\d+)[-_](\d+)$/i);
    if (hyphenMatch) {
        let seq = parseInt(hyphenMatch[1], 10);
        let scn = parseInt(hyphenMatch[2], 10);
        if (seq === 0 || scn === 0) {
            seq += 1;
            scn += 1;
        }
        const seqObj = (storyState.sequences || []).find((s) => s.number === seq);
        const act = seqObj?.parent_act || actForSequence(seq);
        return { act: act || 1, sequence: seq, scene: scn };
    }
    const sceneMatch = str.match(/^(?:Scene\s*)?(\d+)$/i);
    if (sceneMatch) {
        return { act: 1, sequence: 1, scene: parseInt(sceneMatch[1], 10) || 1 };
    }
    return { act: 1, sequence: 1, scene: 1 };
}

/** Formats `{ sequence, scene }` into canonical coordinate string (`"0.0"` or `"seq.scn"`). */
export function formatSceneCoord(seq: unknown, scn: unknown): string {
    const s = Number(seq);
    const c = Number(scn);
    if (s === 0 && c === 0) return '0.0';
    return `${s || 1}.${c || 1}`;
}

/** Compares two scene coordinates chronologically (`-1`, `0`, or `1`). */
export function compareSceneCoordinates(
    coordA: unknown,
    coordB: unknown,
    storyState: ContinuityStoryState = {}
): -1 | 0 | 1 {
    const a = parseSceneCoordinates(coordA, storyState);
    const b = parseSceneCoordinates(coordB, storyState);
    const aSeq = a.sequence ?? 1;
    const bSeq = b.sequence ?? 1;
    if (aSeq !== bSeq) return aSeq < bSeq ? -1 : 1;
    const aScn = a.scene ?? 1;
    const bScn = b.scene ?? 1;
    if (aScn !== bScn) return aScn < bScn ? -1 : 1;
    return 0;
}

/** Checks bi-temporal validity `[acquired_at_scene, invalidated_at_scene)` for a GESM belief edge. */
export function isBeliefActiveAt(
    edge: BeliefEdgeLike | null | undefined,
    targetCoord: unknown,
    storyState: ContinuityStoryState = {}
): boolean {
    if (!edge || edge.archived) return false;
    const acq = edge.acquired_at_scene || '0.0';
    if (compareSceneCoordinates(acq, targetCoord, storyState) > 0) return false;
    if (edge.invalidated_at_scene !== null && edge.invalidated_at_scene !== undefined) {
        if (compareSceneCoordinates(edge.invalidated_at_scene, targetCoord, storyState) <= 0) {
            return false;
        }
    }
    return true;
}

/** Checks whether a continuity ledger fact is chronologically established at `targetScope`. */
export function isFactKnownAt(
    fact: Record<string, unknown> | null | undefined,
    targetScope: unknown = null,
    storyState: ContinuityStoryState = {}
): boolean {
    if (!fact) return false;
    if (fact.status === 'resolved') return false;
    if (!targetScope) return true;

    let factAct =
        parseNum(fact.valid_from_act) ?? parseNum(fact.act) ?? parseNum(fact.parent_act);
    let factSeq =
        parseNum(fact.valid_from_sequence) ??
        parseNum(fact.sequence) ??
        parseNum(fact.seq) ??
        parseNum(fact.parent_sequence);
    let factScn = parseNum(fact.valid_from_scene) ?? parseNum(fact.scene);

    if (factAct === null && factSeq === null && factScn === null) {
        const src = String(fact.source_scene || fact.scene_introduced || '');
        if (
            src &&
            !src.toLowerCase().includes('manual') &&
            !src.toLowerCase().includes('canon')
        ) {
            const parsed = parseSceneCoordinates(src, storyState);
            factAct = parsed.act;
            factSeq = parsed.sequence;
            factScn = parsed.scene;
        } else {
            factAct = 1;
            factSeq = 1;
            factScn = 1;
        }
    }

    factAct = factAct || 1;
    factSeq = factSeq || 1;
    factScn = factScn || 1;

    let targetAct: number | null = null;
    let targetSeq: number | null = null;
    let targetScn: number | null = null;

    if (typeof targetScope === 'object' && targetScope !== null) {
        const scope = targetScope as Record<string, unknown>;
        if (parseNum(scope.act) !== null) targetAct = parseNum(scope.act);
        if (parseNum(scope.parent_act) !== null) targetAct = parseNum(scope.parent_act);
        if (parseNum(scope.actIndex) !== null) targetAct = parseNum(scope.actIndex)! + 1;
        if (parseNum(scope.act_index) !== null) targetAct = parseNum(scope.act_index)! + 1;
        if (parseNum(scope.actIdx) !== null) targetAct = parseNum(scope.actIdx)! + 1;

        if (parseNum(scope.sequence) !== null) targetSeq = parseNum(scope.sequence);
        if (parseNum(scope.seq) !== null) targetSeq = parseNum(scope.seq);
        if (parseNum(scope.sequenceIndex) !== null) targetSeq = parseNum(scope.sequenceIndex)! + 1;
        if (parseNum(scope.sequence_index) !== null) targetSeq = parseNum(scope.sequence_index)! + 1;
        if (parseNum(scope.seqIdx) !== null) targetSeq = parseNum(scope.seqIdx)! + 1;

        if (parseNum(scope.scene) !== null) targetScn = parseNum(scope.scene);
        if (parseNum(scope.sceneIndex) !== null) targetScn = parseNum(scope.sceneIndex)! + 1;
        if (parseNum(scope.scene_index) !== null) targetScn = parseNum(scope.scene_index)! + 1;
        if (parseNum(scope.sceneIdx) !== null) targetScn = parseNum(scope.sceneIdx)! + 1;

        if (typeof scope.scene === 'string' || (typeof scope.scene === 'object' && scope.scene !== null)) {
            const p = parseSceneCoordinates(scope.scene, storyState);
            if (targetSeq === null) targetSeq = p.sequence;
            if (targetScn === null) targetScn = p.scene;
            if (targetAct === null) targetAct = p.act;
        }

        if (scope.sceneObj && typeof scope.sceneObj === 'object') {
            const p = parseSceneCoordinates(scope.sceneObj, storyState);
            if (targetSeq === null) targetSeq = p.sequence;
            if (targetScn === null) targetScn = p.scene;
            if (targetAct === null) targetAct = p.act;
        }

        if (Array.isArray(scope.scenes) && scope.scenes.length > 0) {
            let maxScn = 0;
            scope.scenes.forEach((sc) => {
                if (!sc) return;
                const p = parseSceneCoordinates(sc, storyState);
                if (p.scene && p.scene > maxScn) maxScn = p.scene;
                if (targetSeq === null && p.sequence) targetSeq = p.sequence;
                if (targetAct === null && p.act) targetAct = p.act;
            });
            if (maxScn > 0 && targetScn === null) targetScn = maxScn;
        }

        if (typeof scope.number === 'string' || typeof scope.id === 'string') {
            const p = parseSceneCoordinates(scope.number || scope.id, storyState);
            if (targetSeq === null) targetSeq = p.sequence;
            if (targetScn === null) targetScn = p.scene;
            if (targetAct === null) targetAct = p.act;
        }
    } else if (typeof targetScope === 'string' || typeof targetScope === 'number') {
        const p = parseSceneCoordinates(targetScope, storyState);
        targetAct = p.act;
        targetSeq = p.sequence;
        targetScn = p.scene;
    }

    if (targetSeq !== null && targetScn !== null) {
        if (factSeq > targetSeq) return false;
        if (factSeq === targetSeq && factScn > targetScn) return false;
        return true;
    }

    if (targetSeq !== null) {
        return factSeq <= targetSeq;
    }

    if (targetAct !== null) {
        return factAct <= targetAct;
    }

    return true;
}

/** Ingests structured hard facts, state changes, and relationship shifts from a scene into the ledger. */
export function ingestSceneContinuityData(
    scene: Record<string, unknown> | null | undefined,
    storyState: ContinuityStoryState = {}
): Array<Record<string, unknown>> {
    if (!scene) return storyState.continuity_ledger || [];

    const coords = parseSceneCoordinates(scene.number || scene.id || scene, storyState);
    const parentSeqNum = scene.parent_sequence ? Number(scene.parent_sequence) : null;
    const validFromAct =
        Number(
            scene.parent_act ||
                (parentSeqNum
                    ? (storyState.sequences || []).find((s) => s.number === parentSeqNum)
                          ?.parent_act || actForSequence(parentSeqNum)
                    : coords.act)
        ) || 1;
    const validFromSeq = Number(scene.parent_sequence || scene.sequence || coords.sequence) || 1;
    const validFromScn = coords.scene || 1;
    const sceneRef = scene.number
        ? `Scene ${scene.number}`
        : scene.id
          ? `Scene ${scene.id}`
          : `Scene ${validFromSeq}.${validFromScn}`;

    const cast = storyState.cast || [];
    const getCharName = (id: unknown): string => {
        const c = resolveCharacter(id, cast);
        return c ? c.name : String(id || '');
    };

    const existingLedger = (storyState.continuity_ledger || []).filter(
        (e) => e && !isLegacyValenceEntry(e)
    );
    const newEntries: Array<Record<string, unknown>> = [];
    const appendOrMoveLedgerEntry = (
        matchFn: (e: Record<string, unknown>) => boolean,
        entry: Record<string, unknown>
    ): void => {
        const existingIdx = existingLedger.findIndex(matchFn);
        if (existingIdx !== -1) existingLedger.splice(existingIdx, 1);
        const pendingIdx = newEntries.findIndex(matchFn);
        if (pendingIdx !== -1) newEntries.splice(pendingIdx, 1);
        newEntries.push(entry);
    };

    const hardFacts = (scene.hard_facts_introduced ||
        scene.continuity_facts ||
        scene.hard_facts ||
        scene.facts ||
        []) as Array<Record<string, unknown>>;
    hardFacts.forEach((hf) => {
        const category = String(hf.category || 'Fact');
        const key = String(hf.key || hf.subject || hf.name || 'Fact').trim();
        const value = String(hf.detail || hf.value || hf.fact || hf.description || '').trim();
        if (!key || !value) return;

        const entityId = String(hf.entity_id || hf.character_id || hf.character || '');
        const tag = String(
            hf.tracking_tag ||
                (entityId
                    ? `entity:${entityId}:${key.toLowerCase().replace(/\s+/g, '_')}`
                    : `fact:${category.toLowerCase()}:${key.toLowerCase().replace(/\s+/g, '_')}`)
        );
        const src = String(hf.source_scene || sceneRef);

        const entry: Record<string, unknown> = {
            key,
            value,
            category,
            source_scene: src,
            valid_from_act: hf.valid_from_act || validFromAct,
            valid_from_sequence: hf.valid_from_sequence || validFromSeq,
            valid_from_scene: hf.valid_from_scene || validFromScn,
            entity_id: entityId,
            tracking_tag: tag,
            created_at: Date.now(),
            status: 'active'
        };

        appendOrMoveLedgerEntry(
            (e) =>
                (Boolean(e.tracking_tag) && e.tracking_tag === tag) ||
                (Boolean(e.key) &&
                    String(e.key).toLowerCase() === key.toLowerCase() &&
                    String(e.category || '').toLowerCase() === category.toLowerCase()),
            entry
        );
    });

    const stateChanges = (scene.state_changes ||
        scene.state_changes_introduced ||
        []) as Array<Record<string, unknown>>;
    stateChanges.forEach((sc) => {
        if (!sc.entity_id || !sc.relation || !sc.target) return;
        const charName = getCharName(sc.entity_id);
        const key = `${charName} [${sc.relation}]`;
        let relVerb = String(sc.relation).toLowerCase();
        if (relVerb === 'defeats') relVerb = 'defeated';
        const val = `${charName} ${relVerb} ${sc.target} (established in ${sceneRef}).`;
        const tag = `entity:${sc.entity_id}`;

        const entry: Record<string, unknown> = {
            key,
            value: val,
            category: 'State Change',
            source_scene: sceneRef,
            valid_from_act: validFromAct,
            valid_from_sequence: validFromSeq,
            valid_from_scene: validFromScn,
            entity_id: sc.entity_id,
            relation: sc.relation,
            tracking_tag: tag,
            created_at: Date.now(),
            status: 'active'
        };
        appendOrMoveLedgerEntry((e) => e.key === key && e.tracking_tag === tag, entry);
    });

    const relShifts = (scene.relationship_shifts || []) as Array<Record<string, unknown>>;
    relShifts.forEach((rs) => {
        const fromId = rs.from || rs.source_id;
        const toId = rs.to || rs.target_id;
        const dynamic = rs.new_feeling || rs.new_dynamic || rs.dynamic;
        if (!fromId || !toId || !dynamic) return;

        const fromName = getCharName(fromId);
        const toName = getCharName(toId);
        if (!fromName || !toName) return;

        const key = `${fromName} -> ${toName}`;
        const val = `${fromName}'s attitude toward ${toName} shifted to "${dynamic}" in ${sceneRef}.`;
        const tag = `rel:${fromId}->${toId}`;

        const entry: Record<string, unknown> = {
            key,
            value: val,
            category: 'Relationship Shift',
            source_scene: sceneRef,
            valid_from_act: validFromAct,
            valid_from_sequence: validFromSeq,
            valid_from_scene: validFromScn,
            from_character: fromName,
            to_character: toName,
            entity_id: fromId,
            relation: 'RELATION_SHIFT',
            new_dynamic: dynamic,
            tracking_tag: tag,
            created_at: Date.now(),
            status: 'active'
        };
        appendOrMoveLedgerEntry((e) => e.key === key && e.tracking_tag === tag, entry);
    });

    return [...existingLedger, ...newEntries];
}

/** Formats chronologically active continuity facts in prefix-cacheable Tier 3 -> Tier 1 -> Tier 2 order. */
export function formatContinuityLedgerForPrompt(
    storyState: ContinuityStoryState = {},
    targetScope: unknown = null
): string {
    const ledger = storyState.continuity_ledger || [];
    if (!Array.isArray(ledger) || ledger.length === 0) return 'No active continuity items.';

    const chronologicallyActive = ledger.filter(
        (e) =>
            e &&
            e.status !== 'resolved' &&
            !isLegacyValenceEntry(e) &&
            isFactKnownAt(e, targetScope, storyState)
    );
    if (chronologicallyActive.length === 0) return 'No active continuity items.';

    const formatEntryLine = (e: Record<string, unknown> | string): string => {
        if (typeof e === 'string') return `- ${e}`;
        if (!e || typeof e !== 'object') return `- ${String(e)}`;
        const cat = e.category ? `[${e.category}] ` : '';
        const src = e.source_scene ? ` (${e.source_scene})` : '';
        const key = e.key || e.fact || e.name || 'Fact';
        const valObj = typeof e.value === 'object' && e.value !== null ? (e.value as Record<string, unknown>) : null;
        const val = valObj
            ? valObj.description || valObj.detail || '[Object]'
            : e.value ?? e.detail ?? e.description ?? '';
        return `- ${cat}${key}: ${val}${src}`;
    };

    let targetAct: number | null = null;
    let targetSeq: number | null = null;
    let targetScn: number | null = null;
    let targetSceneObj: Record<string, unknown> | null = null;
    const targetScenesList: Array<Record<string, unknown>> = [];
    const activeCharacters = new Set<string>();
    const sceneSettings = new Set<string>();
    const activeItems = new Set<string>();

    const addCleanSetting = (st: unknown): void => {
        if (!st || typeof st !== 'string') return;
        const clean = st.trim().toLowerCase();
        if (!clean) return;
        sceneSettings.add(clean);
        const stripped = clean.replace(/^(?:the|a|an)\s+/i, '').trim();
        if (stripped && stripped.length >= 2) sceneSettings.add(stripped);
    };

    const addCleanItem = (it: unknown): void => {
        if (!it) return;
        const str =
            typeof it === 'string'
                ? it
                : typeof it === 'object' && (it as { name?: unknown }).name
                  ? String((it as { name: unknown }).name)
                  : '';
        const clean = str.trim().toLowerCase();
        if (!clean) return;
        activeItems.add(clean);
        const stripped = clean.replace(/^(?:the|a|an)\s+/i, '').trim();
        if (stripped && stripped.length >= 2) activeItems.add(stripped);
    };

    if (typeof targetScope === 'object' && targetScope !== null) {
        const scope = targetScope as Record<string, unknown>;
        if (parseNum(scope.act) !== null) targetAct = parseNum(scope.act);
        if (parseNum(scope.parent_act) !== null) targetAct = parseNum(scope.parent_act);
        if (parseNum(scope.actIndex) !== null) targetAct = parseNum(scope.actIndex)! + 1;
        if (parseNum(scope.act_index) !== null) targetAct = parseNum(scope.act_index)! + 1;
        if (parseNum(scope.actIdx) !== null) targetAct = parseNum(scope.actIdx)! + 1;

        if (parseNum(scope.sequence) !== null) targetSeq = parseNum(scope.sequence);
        if (parseNum(scope.seq) !== null) targetSeq = parseNum(scope.seq);
        if (parseNum(scope.sequenceIndex) !== null) targetSeq = parseNum(scope.sequenceIndex)! + 1;
        if (parseNum(scope.sequence_index) !== null) targetSeq = parseNum(scope.sequence_index)! + 1;
        if (parseNum(scope.seqIdx) !== null) targetSeq = parseNum(scope.seqIdx)! + 1;

        if (parseNum(scope.scene) !== null) targetScn = parseNum(scope.scene);
        if (parseNum(scope.sceneIndex) !== null) targetScn = parseNum(scope.sceneIndex)! + 1;
        if (parseNum(scope.scene_index) !== null) targetScn = parseNum(scope.scene_index)! + 1;
        if (parseNum(scope.sceneIdx) !== null) targetScn = parseNum(scope.sceneIdx)! + 1;

        if (typeof scope.scene === 'string') {
            const p = parseSceneCoordinates(scope.scene, storyState);
            if (targetSeq === null) targetSeq = p.sequence;
            if (targetScn === null) targetScn = p.scene;
            if (targetAct === null) targetAct = p.act;
        } else if (typeof scope.scene === 'object' && scope.scene !== null) {
            targetSceneObj = scope.scene as Record<string, unknown>;
        }

        if (scope.sceneObj && typeof scope.sceneObj === 'object') {
            targetSceneObj = scope.sceneObj as Record<string, unknown>;
        }
        if (scope.targetScene && typeof scope.targetScene === 'object') {
            targetSceneObj = scope.targetScene as Record<string, unknown>;
        }

        if (Array.isArray(scope.scenes)) {
            let maxScn = 0;
            scope.scenes.forEach((sc) => {
                if (!sc) return;
                targetScenesList.push(sc as Record<string, unknown>);
                const p = parseSceneCoordinates(sc, storyState);
                if (p.scene && p.scene > maxScn) maxScn = p.scene;
                if (targetSeq === null && p.sequence) targetSeq = p.sequence;
                if (targetAct === null && p.act) targetAct = p.act;
            });
            if (maxScn > 0 && targetScn === null) targetScn = maxScn;
        }

        const rawChars = [
            ...(Array.isArray(scope.activeCast) ? scope.activeCast : []),
            ...(Array.isArray(scope.active_cast) ? scope.active_cast : []),
            ...(Array.isArray(scope.cast) ? scope.cast : []),
            ...(Array.isArray(scope.characters) ? scope.characters : []),
            ...(Array.isArray(scope.cast_names) ? scope.cast_names : []),
            ...(Array.isArray(scope.characters_present) ? scope.characters_present : [])
        ];
        rawChars.forEach((ch) => {
            if (typeof ch === 'string') {
                const clean = ch.trim().toLowerCase();
                if (clean) {
                    activeCharacters.add(clean);
                    const stripped = clean.replace(/^(?:the|a|an)\s+/i, '').trim();
                    if (stripped && stripped.length >= 2) activeCharacters.add(stripped);
                }
            } else if (ch && typeof ch === 'object') {
                const chObj = ch as Record<string, unknown>;
                if (chObj.name) {
                    const clean = String(chObj.name).trim().toLowerCase();
                    activeCharacters.add(clean);
                    const stripped = clean.replace(/^(?:the|a|an)\s+/i, '').trim();
                    if (stripped && stripped.length >= 2) activeCharacters.add(stripped);
                }
                if (chObj.id) activeCharacters.add(String(chObj.id).trim().toLowerCase());
            }
        });

        ['setting', 'environment', 'location'].forEach((prop) => {
            addCleanSetting(scope[prop]);
        });

        ['items', 'active_items', 'inventory'].forEach((prop) => {
            if (Array.isArray(scope[prop])) {
                (scope[prop] as unknown[]).forEach(addCleanItem);
            }
        });
    } else if (typeof targetScope === 'string' || typeof targetScope === 'number') {
        const p = parseSceneCoordinates(targetScope, storyState);
        targetAct = p.act;
        targetSeq = p.sequence;
        targetScn = p.scene;
    }

    if (targetSceneObj) {
        targetScenesList.push(targetSceneObj);
        const p = parseSceneCoordinates(targetSceneObj, storyState);
        if (targetSeq === null && p.sequence) targetSeq = p.sequence;
        if (targetScn === null && p.scene) targetScn = p.scene;
        if (targetAct === null && p.act) targetAct = p.act;
    }

    if (typeof targetScope === 'object' && targetScope !== null) {
        const scope = targetScope as Record<string, unknown>;
        if (typeof scope.number === 'string' || typeof scope.id === 'string') {
            const p = parseSceneCoordinates(scope.number || scope.id, storyState);
            if (targetSeq === null && p.sequence) targetSeq = p.sequence;
            if (targetScn === null && p.scene) targetScn = p.scene;
            if (targetAct === null && p.act) targetAct = p.act;
        }
    }
    void targetAct;

    if (
        targetScenesList.length === 0 &&
        targetSeq !== null &&
        targetScn !== null &&
        storyState.scenes
    ) {
        const scenesRecord = storyState.scenes as Record<string, Array<Record<string, unknown>>>;
        const seqKeys = [
            `${targetSeq - 1}`,
            String(targetSeq - 1),
            `${targetSeq}`,
            `${targetSeq - 1}-0`,
            `0-${targetSeq - 1}`
        ];
        for (const k of seqKeys) {
            if (Array.isArray(scenesRecord[k])) {
                const found =
                    scenesRecord[k][targetScn - 1] ||
                    scenesRecord[k].find(
                        (s) =>
                            s &&
                            (s.number === targetScn ||
                                s.number === `${targetSeq}.${targetScn}` ||
                                s.id === `${targetSeq}.${targetScn}`)
                    );
                if (found) {
                    targetScenesList.push(found);
                    break;
                }
            }
        }
    }

    targetScenesList.forEach((sc) => {
        if (!sc) return;
        const collectField = (v: unknown): unknown[] =>
            Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\n]+/) : [];
        const scCast = [
            ...collectField(sc.cast_names),
            ...collectField(sc.characters_present),
            ...collectField(sc.cast_ids),
            ...collectField(sc.characters),
            ...collectField(sc.cast)
        ];
        scCast.forEach((c) => {
            if (typeof c === 'string') {
                const clean = c.trim().toLowerCase();
                if (clean) {
                    activeCharacters.add(clean);
                    const stripped = clean.replace(/^(?:the|a|an)\s+/i, '').trim();
                    if (stripped && stripped.length >= 2) activeCharacters.add(stripped);
                }
            } else if (c && typeof c === 'object') {
                const cObj = c as Record<string, unknown>;
                if (cObj.name) {
                    const clean = String(cObj.name).trim().toLowerCase();
                    activeCharacters.add(clean);
                    const stripped = clean.replace(/^(?:the|a|an)\s+/i, '').trim();
                    if (stripped && stripped.length >= 2) activeCharacters.add(stripped);
                } else if (cObj.id) {
                    activeCharacters.add(String(cObj.id).trim().toLowerCase());
                }
            }
        });
        ['setting', 'environment', 'location'].forEach((prop) => {
            addCleanSetting(sc[prop]);
        });
        ['items', 'active_items', 'inventory'].forEach((prop) => {
            if (Array.isArray(sc[prop])) {
                (sc[prop] as unknown[]).forEach(addCleanItem);
            }
        });
    });

    if (Array.isArray(storyState.cast)) {
        (storyState.cast as Array<CastMember & Record<string, unknown>>).forEach((c) => {
            if (!c) return;
            const cName = String(c.name || '').trim().toLowerCase();
            const cId = String(c.id || '').trim().toLowerCase();
            const cAliases = (
                Array.isArray(c.aliases)
                    ? (c.aliases as unknown[])
                    : Array.isArray(c.details?.aliases)
                      ? (c.details!.aliases as unknown[])
                      : []
            ).map((a) => String(a).trim().toLowerCase());
            const isMatched =
                (cId && activeCharacters.has(cId)) ||
                (cName && activeCharacters.has(cName)) ||
                cAliases.some((a) => activeCharacters.has(a));

            if (isMatched) {
                if (cName) {
                    activeCharacters.add(cName);
                    const stripped = cName.replace(/^(?:the|a|an)\s+/i, '').trim();
                    if (stripped && stripped.length >= 2) activeCharacters.add(stripped);
                }
                if (cId) activeCharacters.add(cId);
                cAliases.forEach((a) => {
                    if (a) activeCharacters.add(a);
                });
                const parts = cName.split(/\s+/);
                parts.forEach((p) => {
                    if (p.length >= 2 && !STOPWORDS.has(p)) {
                        activeCharacters.add(p);
                    }
                });
            }
        });
    }

    const isSceneScoped =
        targetScn !== null ||
        targetScenesList.length > 0 ||
        activeCharacters.size > 0 ||
        sceneSettings.size > 0;

    if (!isSceneScoped) {
        return chronologicallyActive.map(formatEntryLine).join('\n');
    }

    const tier1: Array<Record<string, unknown>> = [];
    const tier2: Array<Record<string, unknown>> = [];
    const tier3: Array<Record<string, unknown>> = [];

    chronologicallyActive.forEach((e) => {
        if (!e) return;
        const isStringEntry = typeof e === 'string';
        const cat = String(isStringEntry ? '' : e.category || '').toLowerCase();
        if (cat === 'opinion' && (storyState?.epistemic_graph as Record<string, unknown> | undefined)?.propositions) {
            return;
        }
        const key = String(isStringEntry ? e : e.key || e.fact || e.name || e.subject || '').toLowerCase();
        const valObj =
            !isStringEntry && typeof e.value === 'object' && e.value !== null
                ? (e.value as Record<string, unknown>)
                : null;
        const val = String(
            isStringEntry
                ? e
                : valObj
                  ? valObj.description || valObj.detail || JSON.stringify(e.value)
                  : e.value ?? e.detail ?? e.description ?? ''
        ).toLowerCase();
        const tag = String(isStringEntry ? '' : e.tracking_tag || '').toLowerCase();
        const entId = String(
            isStringEntry ? '' : e.entity_id ?? e.character_id ?? e.character ?? ''
        ).toLowerCase();
        const fromCh = String(isStringEntry ? '' : e.from_character || '').toLowerCase();
        const toCh = String(isStringEntry ? '' : e.to_character || '').toLowerCase();
        const srcScene = String(isStringEntry ? '' : e.source_scene || e.scene_introduced || '').toLowerCase();

        let isTier1 = false;
        for (const ch of activeCharacters) {
            if (!ch || ch.length < 1 || STOPWORDS.has(ch)) continue;
            if (
                entId === ch ||
                tokenMatch(entId, ch) ||
                tokenMatch(tag, ch) ||
                tokenMatch(fromCh, ch) ||
                tokenMatch(toCh, ch) ||
                tokenMatch(key, ch) ||
                tokenMatch(val, ch)
            ) {
                isTier1 = true;
                break;
            }
        }
        if (!isTier1) {
            for (const st of sceneSettings) {
                if (!st || st.length < 2) continue;
                if (
                    tokenMatch(key, st) ||
                    tokenMatch(val, st) ||
                    tokenMatch(tag, st) ||
                    (key && key.length >= 3 && !STOPWORDS.has(key) && tokenMatch(st, key))
                ) {
                    isTier1 = true;
                    break;
                }
                if (
                    (cat === 'place' ||
                        cat === 'location' ||
                        cat === 'setting' ||
                        cat === 'environment') &&
                    key &&
                    key.length >= 3 &&
                    (tokenMatch(st, key) || tokenMatch(key, st) || tokenMatch(val, st))
                ) {
                    isTier1 = true;
                    break;
                }
            }
        }
        if (!isTier1) {
            for (const it of activeItems) {
                if (!it || it.length < 2) continue;
                if (
                    tokenMatch(key, it) ||
                    tokenMatch(val, it) ||
                    tokenMatch(tag, it) ||
                    (key && key.length >= 3 && !STOPWORDS.has(key) && tokenMatch(it, key))
                ) {
                    isTier1 = true;
                    break;
                }
            }
        }

        if (isTier1) {
            tier1.push(e);
            return;
        }

        let isTier2 = false;
        let fSeq = parseNum(e.valid_from_sequence) ?? parseNum(e.sequence) ?? parseNum(e.seq);
        let fScn = parseNum(e.valid_from_scene) ?? parseNum(e.scene);
        if (fSeq === null && fScn === null && srcScene) {
            const p = parseSceneCoordinates(srcScene, storyState);
            fSeq = p.sequence;
            fScn = p.scene;
        }

        if (targetSeq !== null && fSeq !== null) {
            let prevSeqScenes: unknown[] = [];
            if (storyState.scenes) {
                const scenesRecord = storyState.scenes as Record<string, unknown[]>;
                const candidateKeys = [`${targetSeq - 2}`, `${targetSeq - 1}`];
                for (const k of candidateKeys) {
                    if (Array.isArray(scenesRecord[k])) {
                        prevSeqScenes = scenesRecord[k];
                        break;
                    }
                }
            }
            const prevSeqLen = prevSeqScenes.length;
            const isClimaxOrTrans =
                srcScene.includes('climax') ||
                srcScene.includes('transition') ||
                key.includes('climax') ||
                key.includes('transition') ||
                val.includes('climax') ||
                val.includes('transition') ||
                cat.includes('climax') ||
                cat.includes('transition');

            if (targetScn !== null) {
                if (fSeq === targetSeq) {
                    if (fScn !== null && fScn <= targetScn && fScn >= targetScn - 2) {
                        isTier2 = true;
                    }
                } else if (fSeq === targetSeq - 1) {
                    let maxPriorScn = 0;
                    if (Array.isArray(ledger)) {
                        for (const itm of ledger) {
                            if (!itm) continue;
                            const itmSeq = parseNum(itm.valid_from_sequence) ?? parseNum(itm.sequence);
                            const itmScn = parseNum(itm.valid_from_scene) ?? parseNum(itm.scene);
                            if (itmSeq === targetSeq - 1 && itmScn !== null && itmScn > maxPriorScn) {
                                maxPriorScn = itmScn;
                            }
                        }
                    }

                    if (targetScn === 1) {
                        if (prevSeqLen > 0) {
                            if (fScn !== null && fScn >= Math.max(1, prevSeqLen - 1)) isTier2 = true;
                        } else if (maxPriorScn > 1) {
                            if (fScn !== null && fScn >= maxPriorScn - 1) isTier2 = true;
                        } else if (fScn === null || isClimaxOrTrans) {
                            isTier2 = true;
                        }
                    } else if (targetScn === 2) {
                        if (prevSeqLen > 0) {
                            if (fScn !== null && fScn >= prevSeqLen) isTier2 = true;
                        } else if (maxPriorScn > 1) {
                            if (fScn !== null && fScn >= maxPriorScn) isTier2 = true;
                        } else if (isClimaxOrTrans) {
                            isTier2 = true;
                        }
                    }
                    if (!isTier2 && isClimaxOrTrans && targetScn <= 2) {
                        isTier2 = true;
                    }
                }
            } else if (
                fSeq === targetSeq ||
                (fSeq === targetSeq - 1 &&
                    (isClimaxOrTrans || (prevSeqLen > 0 && fScn !== null && fScn >= prevSeqLen)))
            ) {
                isTier2 = true;
            }
        }

        if (
            !isTier2 &&
            (srcScene.includes('transition') ||
                cat.includes('transition') ||
                key.includes('transition') ||
                val.includes('transition'))
        ) {
            isTier2 = true;
        }

        if (isTier2) {
            tier2.push(e);
            return;
        }

        const isAxiomCat =
            /^(?:lore|world|rule|rules|axiom|axioms|universal|global|law|laws|magic|physics|constraint|worldbuilding|canon)$/i.test(
                cat
            ) ||
            cat.includes('rule') ||
            cat.includes('axiom') ||
            cat.includes('law') ||
            cat.includes('world') ||
            cat.includes('magic') ||
            cat.includes('lore') ||
            cat.includes('physics') ||
            cat.includes('system');
        const isAxiomKey = /rule|axiom|law|world_rule|world rule|global rule|canon/i.test(key);
        const isAxiomSrc = /universal|global|story bible|canon|manual|world rule|axiom/i.test(
            srcScene
        );
        const isAxiomTag = /^(?:rule|lore|axiom|global|universal):/i.test(tag);
        const isAxiomFlag =
            e.valid_from_sequence === 0 ||
            e.is_universal === true ||
            e.universal === true ||
            e.is_axiom === true;

        if (isAxiomCat || isAxiomKey || isAxiomSrc || isAxiomTag || isAxiomFlag) {
            tier3.push(e);
        }
    });

    const stableChronoSort = (arr: Array<Record<string, unknown>>): Array<Record<string, unknown>> =>
        arr
            .map((item, idx) => ({ item, idx }))
            .sort((a, b) => {
                const ca = Number(a.item?.created_at) || 0;
                const cb = Number(b.item?.created_at) || 0;
                if (ca !== cb) return ca - cb;
                return a.idx - b.idx;
            })
            .map((x) => x.item);

    let orderedTier1 = stableChronoSort(tier1);
    const primaryProtagonist = Array.isArray(storyState.cast) ? storyState.cast[0] : null;
    if (primaryProtagonist && tier1.length > 1) {
        const protagTokens = new Set<string>();
        const addProtagToken = (raw: unknown): void => {
            const clean = String(raw || '').trim().toLowerCase();
            if (!clean || STOPWORDS.has(clean)) return;
            protagTokens.add(clean);
            const stripped = clean.replace(/^(?:the|a|an)\s+/i, '').trim();
            if (stripped && stripped.length >= 2 && !STOPWORDS.has(stripped)) {
                protagTokens.add(stripped);
            }
        };
        if (typeof primaryProtagonist === 'string') {
            addProtagToken(primaryProtagonist);
            (primaryProtagonist as string)
                .trim()
                .toLowerCase()
                .split(/\s+/)
                .forEach((p) => {
                    if (p.length >= 2) addProtagToken(p);
                });
        } else if (typeof primaryProtagonist === 'object') {
            const prot = primaryProtagonist as CastMember & Record<string, unknown>;
            if (prot.name) {
                addProtagToken(prot.name);
                String(prot.name)
                    .trim()
                    .toLowerCase()
                    .split(/\s+/)
                    .forEach((p) => {
                        if (p.length >= 2) addProtagToken(p);
                    });
            }
            if (prot.id) addProtagToken(prot.id);
            const pAliases = Array.isArray(prot.aliases)
                ? (prot.aliases as unknown[])
                : Array.isArray(prot.details?.aliases)
                  ? (prot.details!.aliases as unknown[])
                  : [];
            pAliases.forEach(addProtagToken);
        }
        if (protagTokens.size > 0) {
            const protagBucket: Array<Record<string, unknown>> = [];
            const otherBucket: Array<Record<string, unknown>> = [];
            orderedTier1.forEach((e) => {
                const isStr = typeof e === 'string';
                const k = String(isStr ? e : e.key || e.fact || e.name || e.subject || '').toLowerCase();
                const valObj =
                    !isStr && typeof e.value === 'object' && e.value !== null
                        ? (e.value as Record<string, unknown>)
                        : null;
                const v = String(
                    isStr
                        ? e
                        : valObj
                          ? valObj.description || valObj.detail || JSON.stringify(e.value)
                          : e.value ?? e.detail ?? e.description ?? ''
                ).toLowerCase();
                const t = String(isStr ? '' : e.tracking_tag || '').toLowerCase();
                const ent = String(
                    isStr ? '' : e.entity_id ?? e.character_id ?? e.character ?? ''
                ).toLowerCase();
                const fCh = String(isStr ? '' : e.from_character || '').toLowerCase();
                const tCh = String(isStr ? '' : e.to_character || '').toLowerCase();
                let matchesProtag = false;
                for (const pt of protagTokens) {
                    if (
                        ent === pt ||
                        tokenMatch(ent, pt) ||
                        tokenMatch(t, pt) ||
                        tokenMatch(fCh, pt) ||
                        tokenMatch(tCh, pt) ||
                        tokenMatch(k, pt) ||
                        tokenMatch(v, pt)
                    ) {
                        matchesProtag = true;
                        break;
                    }
                }
                if (matchesProtag) protagBucket.push(e);
                else otherBucket.push(e);
            });
            orderedTier1 = [...protagBucket, ...otherBucket];
        }
    }

    const tier1Lines = orderedTier1.map(formatEntryLine);
    const tier2Lines = stableChronoSort(tier2).map(formatEntryLine);
    const tier3Lines = stableChronoSort(tier3).map(formatEntryLine);

    if (tier1Lines.length === 0 && tier2Lines.length === 0 && tier3Lines.length === 0) {
        return 'No active continuity items.';
    }

    const sections: string[] = [];
    if (tier3Lines.length > 0) {
        sections.push(`### Tier 3 (Universal Axioms):\n${tier3Lines.join('\n')}`);
    }
    if (tier1Lines.length > 0) {
        sections.push(`### Tier 1 (Direct Entity Match):\n${tier1Lines.join('\n')}`);
    }
    if (tier2Lines.length > 0) {
        sections.push(`### Tier 2 (Temporal Recency):\n${tier2Lines.join('\n')}`);
    }
    return sections.join('\n\n');
}

/** Wraps active continuity ledger entries inside `<unresolved_continuity_mandates>`. */
export function getContinuityContext(
    storyState: ContinuityStoryState = {},
    targetScope: unknown = null
): string {
    const ledger = storyState.continuity_ledger || [];
    if (!Array.isArray(ledger) || ledger.length === 0) return '';
    const activeEntries = ledger.filter(
        (e) =>
            e &&
            (e.status === 'active' || !e.status) &&
            !isLegacyValenceEntry(e) &&
            isFactKnownAt(e, targetScope, storyState)
    );
    if (activeEntries.length === 0) return '';

    const formatted = formatContinuityLedgerForPrompt(storyState, targetScope);
    if (!formatted || formatted === 'No active continuity items.') return '';

    return `<unresolved_continuity_mandates>\nThe following physical traits, inventory items, locations, opinions, and plot agreements are ACTIVE CANON FACTS known at this point in the narrative and MUST NOT be contradicted:\n${formatted}\n</unresolved_continuity_mandates>`;
}
