/** Seeded draws: the same seed and label always give the same result. */

/** A stable number in [0, 1) for a seed and its labels (cyrb53 over the joined text). */
export function unit(seed: string, ...parts: Array<string | number>): number {
    const text = [seed, ...parts].join('\x1f');
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)) / 9007199254740992;
}

/** Weighted choice that depends only on the seed, the label and the order of `items`. */
export function pick<T>(seed: string, label: string, items: readonly T[], weights?: readonly number[]): T | undefined {
    if (!items || items.length === 0) return undefined;
    const w = weights && weights.length === items.length ? weights : items.map(() => 1);
    const total = w.reduce((sum, x) => sum + x, 0);
    const target = unit(seed, label) * total;
    let running = 0;
    for (let i = 0; i < items.length; i++) {
        running += w[i];
        if (target < running) return items[i];
    }
    return items[items.length - 1];
}

/** Popular names come up more often: the first is about ten times as likely as the hundredth. */
export function rankWeights(names: readonly unknown[]): number[] {
    return names.map((_, rank) => 1 / (rank + 10));
}
