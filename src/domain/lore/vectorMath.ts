/**
 * @module domain/lore/vectorMath
 * Vector cosine similarity and lore corpus fingerprint hashing for cache validation.
 */

export interface LoreFingerprintItem {
    topic?: string;
    detail?: string;
}

/** Computes cosine similarity between two equal-length numeric vectors. */
export function cosineSimilarity(
    vecA: ArrayLike<number>,
    vecB: ArrayLike<number>
): number {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magnitudeA += vecA[i] * vecA[i];
        magnitudeB += vecB[i] * vecB[i];
    }
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
}

/** Computes a deterministic cache key across story ID, embedding provider, and lore contents. */
export function computeLoreFingerprint(
    storyId: string,
    lore: readonly LoreFingerprintItem[],
    providerLabel: string
): string {
    let hash = 5381;
    for (const item of lore) {
        const text = `${item?.topic || ''}\u0000${item?.detail || ''}\u0000`;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
        }
    }
    return `${storyId}|${providerLabel}|${lore.length}|${hash.toString(36)}`;
}
