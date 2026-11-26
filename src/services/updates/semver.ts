/**
 * @module services/updates/semver
 * Lightweight SemVer 2.0.0 parser and comparator used by the web and update services.
 */

export interface ParsedSemver {
    major: number;
    minor: number;
    patch: number;
    prerelease: string[];
}

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Parses a version string (with optional leading `v`) into numeric components and prerelease tags. */
export function parseSemver(raw: string | null | undefined): ParsedSemver | null {
    const trimmed = String(raw || '').trim();
    const match = SEMVER_RE.exec(trimmed);
    if (!match) return null;
    return {
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
        patch: Number.parseInt(match[3], 10),
        prerelease: match[4] ? match[4].split('.').filter(Boolean) : []
    };
}

function comparePrereleaseIdentifier(a: string, b: string): number {
    const aNum = /^\d+$/.test(a);
    const bNum = /^\d+$/.test(b);
    if (aNum && bNum) {
        const diff = Number.parseInt(a, 10) - Number.parseInt(b, 10);
        return diff === 0 ? 0 : diff < 0 ? -1 : 1;
    }
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

/**
 * Compares two SemVer strings, returning `-1` if `a < b`, `0` if equal, or `1` if `a > b`.
 * Invalid versions fall back to normalized string comparison.
 */
export function compareSemver(a: string | null | undefined, b: string | null | undefined): number {
    const pa = parseSemver(a);
    const pb = parseSemver(b);
    if (!pa || !pb) {
        const sa = String(a || '').trim().replace(/^v/, '');
        const sb = String(b || '').trim().replace(/^v/, '');
        if (sa === sb) return 0;
        return sa < sb ? -1 : 1;
    }

    if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
    if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
    if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;

    if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0;
    if (pa.prerelease.length === 0) return 1;
    if (pb.prerelease.length === 0) return -1;

    const len = Math.max(pa.prerelease.length, pb.prerelease.length);
    for (let i = 0; i < len; i++) {
        const ai = pa.prerelease[i];
        const bi = pb.prerelease[i];
        if (ai === undefined) return -1;
        if (bi === undefined) return 1;
        const cmp = comparePrereleaseIdentifier(ai, bi);
        if (cmp !== 0) return cmp;
    }
    return 0;
}

/** Returns true when `candidate` is strictly newer than `current`. */
export function isNewerSemver(
    candidate: string | null | undefined,
    current: string | null | undefined
): boolean {
    if (!candidate || !current) return false;
    return compareSemver(candidate, current) > 0;
}
