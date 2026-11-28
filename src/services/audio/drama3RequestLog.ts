/**
 * @module services/audio/drama3RequestLog
 * Full-fidelity audit builder, formatter, and logger for every Drama-3 synthesis request
 * dispatched to Audio.cpp (via Audio Studio Bridge or directly) so character-to-voice
 * slot assignments and exact wire payloads can be inspected without truncation.
 */

import type { MasterVoiceRecordLike } from '@/domain/audio';
import { logAudioStageStart } from './logger';
import {
    findSpeakerAnchor,
    type Drama3Payload,
    type Drama3ReferenceEntry
} from './masterVoices';

export type Drama3DispatchSource = 'studio_render' | 'live_reader' | 'single_line';
export type Drama3DispatchRoute = 'bridge' | 'direct_audiocpp';

export interface Drama3SpeakerSlotAudit {
    slot: number;
    tag: string;
    speaker: string;
    resolvedSpeakerKey: string | null;
    uploadKey: string | null;
    audioPath: string | null;
    referenceText: string | null;
    seed: number | null;
    signatureHash: string | null;
    promptInstruction: string | null;
}

export interface Drama3RequestAuditRecord {
    timestamp: string;
    source: Drama3DispatchSource;
    route: Drama3DispatchRoute;
    endpoint: string;
    chunkIndex: number;
    totalChunks: number;
    chunkId: string | null;
    seqIdx: number | null;
    sceneIdx: number | null;
    attempt: number;
    splitReason: string | null;
    wordCount: number | null;
    estimatedDurationSec: number | null;
    model: string;
    task: string;
    seed: number | null;
    temperature: number | null;
    top_p: number | null;
    top_k: number | null;
    max_tokens: number | null;
    response_format: string | null;
    speakerSlots: Drama3SpeakerSlotAudit[];
    missingRefSpeakers: string[];
    allRefsValid: boolean;
    references: Drama3ReferenceEntry[];
    input: string;
    wireBody: Record<string, unknown>;
}

export interface Drama3ChunkAuditMeta {
    chunkId?: string | null;
    id?: string | null;
    seqIdx?: number | null;
    sceneIdx?: number | null;
    splitReason?: string | null;
    wordCount?: number | null;
    estimatedDurationSec?: number | null;
}

export interface BuildDrama3RequestAuditParams {
    source: Drama3DispatchSource;
    route: Drama3DispatchRoute;
    endpoint: string;
    chunk?: Drama3ChunkAuditMeta | null;
    chunkIndex?: number;
    totalChunks?: number;
    attempt?: number;
    dramaPayload?: Drama3Payload | null;
    wireBody: Record<string, unknown>;
    anchorsMap?: Map<string, MasterVoiceRecordLike> | null;
    singleSpeaker?: string | null;
    singleAnchor?: MasterVoiceRecordLike | null;
}

function parseWireReferences(wireBody: Record<string, unknown>): Drama3ReferenceEntry[] {
    const opts =
        wireBody.options && typeof wireBody.options === 'object'
            ? (wireBody.options as Record<string, unknown>)
            : null;
    const rawRefs = opts?.references;
    if (Array.isArray(rawRefs)) {
        return rawRefs.filter(
            (r): r is Drama3ReferenceEntry =>
                Boolean(r && typeof r === 'object' && typeof (r as Drama3ReferenceEntry).audio_path === 'string')
        );
    }
    if (typeof rawRefs === 'string' && rawRefs.trim()) {
        try {
            const parsed = JSON.parse(rawRefs) as unknown;
            if (Array.isArray(parsed)) {
                return parsed.filter(
                    (r): r is Drama3ReferenceEntry =>
                        Boolean(
                            r &&
                                typeof r === 'object' &&
                                typeof (r as Drama3ReferenceEntry).audio_path === 'string'
                        )
                );
            }
        } catch {
            return [];
        }
    }
    return [];
}

function toFiniteNumberOrNull(val: unknown): number | null {
    return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

function toNonEmptyStringOrNull(val: unknown): string | null {
    return typeof val === 'string' && val.trim() ? val : null;
}

function buildSlotAudit(
    slot: number,
    speaker: string,
    anchor: MasterVoiceRecordLike | null | undefined,
    refEntry: Drama3ReferenceEntry | undefined
): Drama3SpeakerSlotAudit {
    return {
        slot,
        tag: `<|speaker:${slot}|>`,
        speaker,
        resolvedSpeakerKey: toNonEmptyStringOrNull(anchor?.speakerKey),
        uploadKey: toNonEmptyStringOrNull(anchor?.uploadKey),
        audioPath:
            toNonEmptyStringOrNull(refEntry?.audio_path) ||
            (anchor?.refPath ? String(anchor.refPath).replace(/\\/g, '/') : null),
        referenceText:
            toNonEmptyStringOrNull(refEntry?.text) ||
            toNonEmptyStringOrNull(anchor?.referenceText),
        seed: toFiniteNumberOrNull(anchor?.seed),
        signatureHash: toNonEmptyStringOrNull(anchor?.signatureHash),
        promptInstruction: toNonEmptyStringOrNull(anchor?.promptInstruction)
    };
}

/** Builds a structured, untruncated audit record for a Drama-3 HTTP dispatch. */
export function buildDrama3RequestAudit({
    source,
    route,
    endpoint,
    chunk = null,
    chunkIndex = 0,
    totalChunks = 1,
    attempt = 1,
    dramaPayload = null,
    wireBody,
    anchorsMap = null,
    singleSpeaker = null,
    singleAnchor = null
}: BuildDrama3RequestAuditParams): Drama3RequestAuditRecord {
    const wireRefs = parseWireReferences(wireBody);
    const references: Drama3ReferenceEntry[] =
        dramaPayload && Array.isArray(dramaPayload.references_meta)
            ? dramaPayload.references_meta
            : wireRefs;

    const speakerSlots: Drama3SpeakerSlotAudit[] = [];
    if (dramaPayload && Array.isArray(dramaPayload.speaker_slots)) {
        dramaPayload.speaker_slots.forEach((spk, idx) => {
            const anchor = findSpeakerAnchor(anchorsMap, spk);
            speakerSlots.push(buildSlotAudit(idx, spk, anchor, references[idx]));
        });
    } else if (singleSpeaker || references.length > 0) {
        const spk = String(singleSpeaker || 'Narrator');
        const anchor = singleAnchor || findSpeakerAnchor(anchorsMap, spk);
        speakerSlots.push(buildSlotAudit(0, spk, anchor, references[0]));
    }

    const missingRefSpeakers = dramaPayload
        ? [...dramaPayload.missing_ref_speakers]
        : singleSpeaker && references.length === 0
          ? [String(singleSpeaker)]
          : [];
    const allRefsValid = dramaPayload
        ? dramaPayload.all_refs_valid
        : references.length > 0;

    return {
        timestamp: new Date().toISOString(),
        source,
        route,
        endpoint,
        chunkIndex: chunkIndex + 1,
        totalChunks: Math.max(1, totalChunks),
        chunkId: toNonEmptyStringOrNull(chunk?.chunkId) || toNonEmptyStringOrNull(chunk?.id),
        seqIdx: toFiniteNumberOrNull(chunk?.seqIdx),
        sceneIdx: toFiniteNumberOrNull(chunk?.sceneIdx),
        attempt,
        splitReason: toNonEmptyStringOrNull(chunk?.splitReason),
        wordCount: toFiniteNumberOrNull(chunk?.wordCount),
        estimatedDurationSec: toFiniteNumberOrNull(chunk?.estimatedDurationSec),
        model: String(wireBody.model || dramaPayload?.model || 'drama-3'),
        task: String(wireBody.task || dramaPayload?.task || 'tts'),
        seed: toFiniteNumberOrNull(wireBody.seed ?? dramaPayload?.seed),
        temperature: toFiniteNumberOrNull(wireBody.temperature ?? dramaPayload?.temperature),
        top_p: toFiniteNumberOrNull(wireBody.top_p ?? dramaPayload?.top_p),
        top_k: toFiniteNumberOrNull(wireBody.top_k ?? dramaPayload?.top_k),
        max_tokens: toFiniteNumberOrNull(wireBody.max_tokens ?? dramaPayload?.max_tokens),
        response_format: toNonEmptyStringOrNull(
            wireBody.response_format ?? dramaPayload?.response_format
        ),
        speakerSlots,
        missingRefSpeakers,
        allRefsValid,
        references,
        input: String(wireBody.input ?? dramaPayload?.input ?? ''),
        wireBody
    };
}

/** Formats a Drama-3 audit record into a complete, untruncated diagnostic dossier. */
export function formatDrama3RequestAuditText(record: Drama3RequestAuditRecord): string {
    const lines: string[] = [];
    const sceneLabel =
        record.seqIdx !== null && record.sceneIdx !== null
            ? `Scene ${record.seqIdx + 1}.${record.sceneIdx + 1}`
            : 'N/A';

    lines.push('=== DRAMA-3 -> AUDIO.CPP DISPATCH AUDIT ===');
    lines.push(`Timestamp:   ${record.timestamp}`);
    lines.push(`Source:      ${record.source}`);
    lines.push(`Route:       ${record.route} (${record.endpoint})`);
    lines.push(`Scene:       ${sceneLabel}`);
    lines.push(
        `Segment:     ${record.chunkIndex}/${record.totalChunks}${
            record.chunkId ? ` (${record.chunkId})` : ''
        }${record.splitReason ? ` | split=${record.splitReason}` : ''}${
            record.wordCount !== null ? ` | ${record.wordCount} words` : ''
        }${
            record.estimatedDurationSec !== null ? ` (~${record.estimatedDurationSec}s)` : ''
        }`
    );
    lines.push(
        `Model/Task:  model=${record.model} | task=${record.task} | attempt=${record.attempt}`
    );
    lines.push(
        `Sampling:    seed=${record.seed ?? 'none'} | temp=${record.temperature ?? 'N/A'} | top_p=${
            record.top_p ?? 'N/A'
        } | top_k=${record.top_k ?? 'N/A'} | max_tokens=${record.max_tokens ?? 'N/A'}`
    );

    lines.push('');
    lines.push(`=== SPEAKER SLOT -> VOICE REFERENCE MAP (${record.speakerSlots.length} slots) ===`);
    if (!record.allRefsValid || record.missingRefSpeakers.length > 0) {
        lines.push(
            `WARNING: Missing voice reference(s) for [${
                record.missingRefSpeakers.join(', ') || 'unknown'
            }] — Drama-3 cannot clone multi-speaker voices without all speaker anchors.`
        );
    }
    if (record.speakerSlots.length === 0) {
        lines.push('(No speaker slots recorded)');
    } else {
        for (const slot of record.speakerSlots) {
            lines.push(
                `${slot.tag} | Script Speaker: ${slot.speaker} | Master Key: ${
                    slot.resolvedSpeakerKey || 'none'
                } | Upload Key: ${slot.uploadKey || 'none'}`
            );
            lines.push(`  Audio Path:   ${slot.audioPath || '(MISSING)'}`);
            lines.push(
                `  Seed/SigHash: seed=${slot.seed ?? 'none'} | sig=${slot.signatureHash || 'none'}`
            );
            lines.push(`  Ref Text:     ${slot.referenceText || '(none)'}`);
            lines.push(`  Voice Profile: ${slot.promptInstruction || '(none)'}`);
        }
    }

    lines.push('');
    lines.push('=== DRAMA-3 INPUT SCRIPT SENT TO AUDIO.CPP ===');
    lines.push(record.input || '(empty)');

    lines.push('');
    lines.push('=== EXACT WIRE HTTP POST BODY (JSON) ===');
    lines.push(JSON.stringify(record.wireBody, null, 2));

    return lines.join('\n');
}

/**
 * Builds, console-logs, and dispatches a full Drama-3 request audit entry to the in-app Logs view
 * immediately before sending an HTTP request to Audio Studio Bridge or Audio.cpp.
 */
export function logDrama3RequestDispatch(
    params: BuildDrama3RequestAuditParams
): Drama3RequestAuditRecord {
    const record = buildDrama3RequestAudit(params);
    const formattedText = formatDrama3RequestAuditText(record);
    const speakerNames = record.speakerSlots.map((s) => s.speaker).filter(Boolean);
    const speakerLabel = speakerNames.length > 0 ? speakerNames.join(', ') : 'Narrator';
    const unitLabel = record.source === 'single_line' ? 'Line' : 'Segment';
    const stageTitle = `Drama-3 Request: ${unitLabel} ${record.chunkIndex}/${record.totalChunks} (${speakerLabel}) [attempt ${record.attempt}, ${record.route}]`;

    console.log(`[Drama-3 -> Audio.cpp]\n${formattedText}`, record);

    logAudioStageStart('drama3_request', stageTitle, record, {
        formattedPrompt: formattedText,
        modelUsed: record.model,
        provider: 'audio.cpp',
        endpoint: record.endpoint,
        route: record.route,
        source: record.source,
        attempt: record.attempt,
        temperature: record.temperature,
        maxTokens: record.max_tokens
    });

    return record;
}
