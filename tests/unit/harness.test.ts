import { describe, expect, it } from 'vitest';
import lamejs from '@breezystack/lamejs';

describe('Phase 0 Vitest Harness', () => {
    it('supports jsdom environment and fake-indexeddb', async () => {
        expect(typeof document).toBe('object');
        expect(typeof indexedDB).toBe('object');

        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open('EllipsisHarnessTestDB', 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore('kv', { keyPath: 'id' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        db.close();
    });

    it('encodes PCM audio into valid MP3 bytes using ESM @breezystack/lamejs', () => {
        const encoder = new lamejs.Mp3Encoder(1, 24000, 128);
        const samples = new Int16Array(2400);
        for (let i = 0; i < samples.length; i++) {
            samples[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / 24000) * 8000);
        }
        const chunks: Uint8Array[] = [];
        const first = encoder.encodeBuffer(samples);
        if (first.length > 0) chunks.push(first);
        const tail = encoder.flush();
        if (tail.length > 0) chunks.push(tail);
        const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
        expect(totalBytes).toBeGreaterThan(200);
    });
});
