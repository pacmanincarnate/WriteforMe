// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

interface VqCodeSummary {
    shape: [number, number];
    sha256: string;
    preview: number[];
}

interface Drama3AuditReference {
    index: number;
    speakerTag: string | null;
    text: string;
    incomingAudioPath: string | null;
    mode: string;
    wavSize: number | null;
    wavSha256: string | null;
    vqShape: [number, number] | null;
    vqSha256: string | null;
    sentField: string;
}

interface Drama3AuditRecord {
    ts: string;
    targetUrl: string;
    model: string;
    task: string;
    seed: number | null;
    temperature: number | null;
    top_p: number | null;
    top_k: number | null;
    max_tokens: number | null;
    response_format: string | null;
    input: string;
    references: Drama3AuditReference[];
    vqMeta: Record<string, unknown> | null;
    forwardedPayloadSummary: Record<string, unknown>;
    response: Record<string, unknown> | null;
}

interface AudioStudioBridgeModule {
    DRAMA3_LOG_FILE: string;
    summarizeVqCodes(vqCodes: unknown): VqCodeSummary | null;
    buildDrama3AuditRecord(params: {
        targetUrl: string;
        incomingBody: Record<string, unknown>;
        forwardedBody: Record<string, unknown>;
        vqMeta?: Record<string, unknown> | null;
    }): Drama3AuditRecord;
    formatDrama3AuditConsoleSummary(record: Drama3AuditRecord): string;
    appendDrama3AuditLog(record: Drama3AuditRecord, logFilePath?: string): boolean;
}

const bridge = createRequire(import.meta.url)(
    '../../audio-studio-bridge.js'
) as AudioStudioBridgeModule;

describe('audio-studio-bridge: Drama-3 request logging', () => {
    const tempDirs: string[] = [];

    afterEach(() => {
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop();
            if (dir) {
                rmSync(dir, { recursive: true, force: true });
            }
        }
    });

    it('summarizes VQ codes with shape, sha256, and short preview without dumping full arrays', () => {
        const fakeVq = Array.from({ length: 10 }, (_, row) =>
            Array.from({ length: 120 }, (_, col) => row * 1000 + col)
        );
        const summary = bridge.summarizeVqCodes(fakeVq);
        expect(summary).not.toBeNull();
        expect(summary?.shape).toEqual([10, 120]);
        expect(summary?.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(summary?.preview).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(bridge.summarizeVqCodes(null)).toBeNull();
    });

    it('builds audit records, formats console summaries, and writes compact JSONL without raw vq_codes', () => {
        const tempDir = mkdtempSync(path.join(tmpdir(), 'drama3-log-test-'));
        tempDirs.push(tempDir);
        const logPath = path.join(tempDir, 'drama3-requests.jsonl');

        const vq0 = Array.from({ length: 10 }, () => Array.from({ length: 50 }, (_, i) => i + 1));
        const vq1 = Array.from({ length: 10 }, () => Array.from({ length: 64 }, (_, i) => i + 100));
        const vq0Sum = bridge.summarizeVqCodes(vq0)!;
        const vq1Sum = bridge.summarizeVqCodes(vq1)!;

        const fullInput = '<|speaker:0|> Thunder rolled across the bay.\n<|speaker:1|> Lock the shutters.';
        const incomingBody = {
            model: 'drama-3',
            task: 'clon',
            input: fullInput,
            seed: 42,
            temperature: 0.9,
            top_p: 0.9,
            top_k: 30,
            max_tokens: 1400,
            response_format: 'wav',
            options: {
                references: JSON.stringify([
                    { text: '<|speaker:0|> Steady narrator.', audio_path: 'C:/voices/narrator.wav' },
                    { text: '<|speaker:1|> Sharp Elena.', audio_path: 'C:/voices/elena.wav' }
                ])
            }
        };
        const forwardedBody = {
            ...incomingBody,
            options: {
                references: JSON.stringify([
                    { text: '<|speaker:0|> Steady narrator.', vq_codes: vq0 },
                    { text: '<|speaker:1|> Sharp Elena.', vq_codes: vq1 }
                ])
            }
        };
        const vqMeta = {
            hits: 1,
            encoded: 1,
            total: 2,
            encodeMs: 120,
            active: true,
            refAudit: [
                {
                    index: 0,
                    speakerTag: '<|speaker:0|>',
                    text: '<|speaker:0|> Steady narrator.',
                    incomingAudioPath: 'C:/voices/narrator.wav',
                    mode: 'vq_cache_hit',
                    wavSize: 32000,
                    wavSha256: 'aaaa1111bbbb2222',
                    vqShape: vq0Sum.shape,
                    vqSha256: vq0Sum.sha256
                },
                {
                    index: 1,
                    speakerTag: '<|speaker:1|>',
                    text: '<|speaker:1|> Sharp Elena.',
                    incomingAudioPath: 'C:/voices/elena.wav',
                    mode: 'vq_encoded',
                    wavSize: 41000,
                    wavSha256: 'cccc3333dddd4444',
                    vqShape: vq1Sum.shape,
                    vqSha256: vq1Sum.sha256
                }
            ]
        };

        const record = bridge.buildDrama3AuditRecord({
            targetUrl: 'http://127.0.0.1:8080/v1/audio/speech',
            incomingBody,
            forwardedBody,
            vqMeta
        });

        expect(record.input).toBe(fullInput);
        expect(record.references).toHaveLength(2);
        expect(record.references[0]).toMatchObject({
            index: 0,
            speakerTag: '<|speaker:0|>',
            incomingAudioPath: 'C:/voices/narrator.wav',
            mode: 'vq_cache_hit',
            wavSha256: 'aaaa1111bbbb2222',
            vqSha256: vq0Sum.sha256,
            sentField: 'vq_codes'
        });
        expect(record.references[1]).toMatchObject({
            index: 1,
            speakerTag: '<|speaker:1|>',
            incomingAudioPath: 'C:/voices/elena.wav',
            mode: 'vq_encoded',
            wavSha256: 'cccc3333dddd4444',
            vqSha256: vq1Sum.sha256,
            sentField: 'vq_codes'
        });

        const consoleText = bridge.formatDrama3AuditConsoleSummary(record);
        expect(consoleText).toContain('[Drama-3 Dispatch -> Audio.cpp]');
        expect(consoleText).toContain('ref[0] | <|speaker:0|> | vq_cache_hit | wav=narrator.wav');
        expect(consoleText).toContain('ref[1] | <|speaker:1|> | vq_encoded | wav=elena.wav');
        expect(consoleText).toContain(fullInput);

        const written = bridge.appendDrama3AuditLog(record, logPath);
        expect(written).toBe(true);
        const lines = readFileSync(logPath, 'utf8').trim().split(/\r?\n/);
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0]) as Drama3AuditRecord;
        expect(parsed.input).toBe(fullInput);
        expect(parsed.references[0].wavSha256).toBe('aaaa1111bbbb2222');
        expect(parsed.references[1].vqSha256).toBe(vq1Sum.sha256);

        const summaryOpts = parsed.forwardedPayloadSummary.options as {
            references: Array<{ text: string; vq_codes: VqCodeSummary }>;
        };
        expect(summaryOpts.references[0].vq_codes.shape).toEqual([10, 50]);
        expect(summaryOpts.references[1].vq_codes.sha256).toBe(vq1Sum.sha256);
        expect(lines[0]).not.toContain(',49,50]');
    });
});
