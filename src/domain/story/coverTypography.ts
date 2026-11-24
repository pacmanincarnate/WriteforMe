/**
 * @module domain/story/coverTypography
 * Deterministic cover style selection and adaptive typography sizing for novel covers.
 */

export interface AdaptiveCoverTypography {
    fontSize: string;
    lineHeight: string;
    letterSpacing?: string;
    dropCapSize?: string;
}

/** Deterministically maps a story ID/seed into one of the 8 bespoke cover style presets. */
export function getCoverStyleIndex(seed: unknown): number {
    if (!seed) return 0;
    let hash = 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 8;
}

/** Calculates responsive font sizes, letter spacing, and line heights by cover style and title length. */
export function getAdaptiveCoverTypography(
    styleIdx: number,
    title: string | null | undefined,
    isLarge = false
): AdaptiveCoverTypography {
    const cleanTitle = (title || 'Untitled Novel').trim();
    const charCount = cleanTitle.length;
    const words = cleanTitle.split(/\s+/).filter(Boolean);
    const longestWord = words.reduce((max, w) => Math.max(max, w.length), 0);

    switch (styleIdx) {
        case 0: {
            let fontSize = isLarge ? '1.5rem' : '1.125rem';
            let letterSpacing = '0.18em';
            if (charCount > 36 || longestWord > 14) {
                fontSize = isLarge ? '0.75rem' : '0.625rem';
                letterSpacing = '0.06em';
            } else if (charCount > 24 || longestWord > 10) {
                fontSize = isLarge ? '0.9rem' : '0.75rem';
                letterSpacing = '0.10em';
            } else if (charCount > 14) {
                fontSize = isLarge ? '1.15rem' : '0.9rem';
                letterSpacing = '0.14em';
            }
            return { fontSize, letterSpacing, lineHeight: '1.2' };
        }

        case 1: {
            let fontSize = isLarge ? '3rem' : '2rem';
            let lineHeight = '0.88';
            if (charCount > 40 || longestWord > 14) {
                fontSize = isLarge ? '1.25rem' : '0.95rem';
                lineHeight = '1.05';
            } else if (charCount > 25 || longestWord > 10) {
                fontSize = isLarge ? '1.65rem' : '1.2rem';
                lineHeight = '0.98';
            } else if (charCount > 14 || longestWord > 7) {
                fontSize = isLarge ? '2.25rem' : '1.55rem';
                lineHeight = '0.92';
            }
            return { fontSize, lineHeight, letterSpacing: '-0.03em' };
        }

        case 2: {
            let fontSize = isLarge ? '3.25rem' : '2.25rem';
            let lineHeight = '1.0';
            if (charCount > 38 || longestWord > 13) {
                fontSize = isLarge ? '1.4rem' : '1.1rem';
                lineHeight = '1.1';
            } else if (charCount > 24 || longestWord > 9) {
                fontSize = isLarge ? '1.9rem' : '1.45rem';
                lineHeight = '1.05';
            } else if (charCount > 13) {
                fontSize = isLarge ? '2.5rem' : '1.8rem';
                lineHeight = '1.02';
            }
            return { fontSize, lineHeight };
        }

        case 3: {
            let fontSize = isLarge ? '2.75rem' : '1.85rem';
            let letterSpacing = '0.24em';
            let lineHeight = '0.9';
            if (charCount > 40 || longestWord > 14) {
                fontSize = isLarge ? '1.15rem' : '0.85rem';
                letterSpacing = '0.08em';
                lineHeight = '1.05';
            } else if (charCount > 25 || longestWord > 10) {
                fontSize = isLarge ? '1.55rem' : '1.15rem';
                letterSpacing = '0.14em';
                lineHeight = '0.98';
            } else if (charCount > 13) {
                fontSize = isLarge ? '2.1rem' : '1.45rem';
                letterSpacing = '0.18em';
                lineHeight = '0.94';
            }
            return { fontSize, letterSpacing, lineHeight };
        }

        case 4: {
            let dropCapSize = isLarge ? '5.5rem' : '4rem';
            let fontSize = isLarge ? '1.15rem' : '0.875rem';
            let letterSpacing = '0.14em';
            let lineHeight = '1.25';
            if (charCount > 35 || longestWord > 14) {
                dropCapSize = isLarge ? '3.75rem' : '2.75rem';
                fontSize = isLarge ? '0.75rem' : '0.625rem';
                letterSpacing = '0.06em';
                lineHeight = '1.35';
            } else if (charCount > 22 || longestWord > 10) {
                dropCapSize = isLarge ? '4.5rem' : '3.25rem';
                fontSize = isLarge ? '0.9rem' : '0.725rem';
                letterSpacing = '0.10em';
                lineHeight = '1.3';
            } else if (charCount > 12) {
                dropCapSize = isLarge ? '5rem' : '3.65rem';
                fontSize = isLarge ? '1.025rem' : '0.8rem';
                letterSpacing = '0.12em';
            }
            return { dropCapSize, fontSize, letterSpacing, lineHeight };
        }

        case 5: {
            let fontSize = isLarge ? '1.5rem' : '1.1rem';
            let letterSpacing = '-0.02em';
            if (charCount > 36 || longestWord > 14) {
                fontSize = isLarge ? '0.75rem' : '0.625rem';
                letterSpacing = '0em';
            } else if (charCount > 22 || longestWord > 10) {
                fontSize = isLarge ? '0.95rem' : '0.75rem';
                letterSpacing = '-0.01em';
            } else if (charCount > 12) {
                fontSize = isLarge ? '1.2rem' : '0.9rem';
                letterSpacing = '-0.02em';
            }
            return { fontSize, letterSpacing, lineHeight: '1.1' };
        }

        case 6: {
            let fontSize = isLarge ? '2.5rem' : '1.85rem';
            let lineHeight = '1.05';
            if (charCount > 40 || longestWord > 14) {
                fontSize = isLarge ? '1.15rem' : '0.875rem';
                lineHeight = '1.18';
            } else if (charCount > 24 || longestWord > 10) {
                fontSize = isLarge ? '1.55rem' : '1.15rem';
                lineHeight = '1.12';
            } else if (charCount > 12) {
                fontSize = isLarge ? '2rem' : '1.45rem';
                lineHeight = '1.08';
            }
            return { fontSize, lineHeight };
        }

        case 7:
        default: {
            let fontSize = isLarge ? '1.35rem' : '1.05rem';
            let letterSpacing = '0.14em';
            let lineHeight = '1.2';
            if (charCount > 42 || longestWord > 14) {
                fontSize = isLarge ? '0.75rem' : '0.625rem';
                letterSpacing = '0.04em';
                lineHeight = '1.28';
            } else if (charCount > 26 || longestWord > 10) {
                fontSize = isLarge ? '0.95rem' : '0.75rem';
                letterSpacing = '0.08em';
                lineHeight = '1.25';
            } else if (charCount > 14) {
                fontSize = isLarge ? '1.15rem' : '0.9rem';
                letterSpacing = '0.11em';
                lineHeight = '1.22';
            }
            return { fontSize, letterSpacing, lineHeight };
        }
    }
}
