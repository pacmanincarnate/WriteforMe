import { describe, expect, it } from 'vitest';
import {
    STOPWORDS,
    countBannedPhrases,
    countWords,
    escapeRegExp,
    parseNum,
    readingMinutes,
    safeEscapeRegex,
    tokenMatch
} from '@/utils/text';

describe('Text & Regex Primitives', () => {
    it('counts banned phrases cleanly without partial-word false positives', () => {
        const res = countBannedPhrases('Ozone filled the ozone-heavy room, while ozones stayed ignored.', ['ozone']);
        expect(res.count).toBe(2);
        expect(res.matches).toEqual([{ phrase: 'ozone', occurrences: 2 }]);

        expect(countBannedPhrases('', ['ozone'])).toEqual({ count: 0, matches: [] });
        expect(countBannedPhrases('ozone', [])).toEqual({ count: 0, matches: [] });

        const punct = countBannedPhrases('Not just cold—not just dark.', ['—not just']);
        expect(punct.count).toBe(1);
    });

    it('escapes regex metacharacters safely and provides matching/reading helpers', () => {
        expect(safeEscapeRegex('a.b+(c)?[d]')).toBe('a\\.b\\+\\(c\\)\\?\\[d\\]');
        expect(escapeRegExp('$100^')).toBe('\\$100\\^');
        expect(countWords('  one   two\nthree  ')).toBe(3);
        expect(countWords('   ')).toBe(0);
        expect(readingMinutes(100)).toBe(1);
        expect(readingMinutes(900)).toBe(4);
        expect(parseNum(7)).toBe(7);
        expect(parseNum('42')).toBe(42);
        expect(parseNum('abc')).toBeNull();
        expect(tokenMatch('Captain Maren stepped forward', 'maren')).toBe(true);
        expect(tokenMatch('Marina stepped forward', 'maren')).toBe(false);
        expect(STOPWORDS.has('captain')).toBe(true);
        expect(STOPWORDS.has('the')).toBe(true);
    });
});
