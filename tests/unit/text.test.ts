import { describe, expect, it } from 'vitest';
import { countBannedPhrases } from '@/utils/text';

describe('countBannedPhrases', () => {
    it('counts case-insensitive whole-word matches without partial-word false positives', () => {
        const res = countBannedPhrases('Ozone filled the ozone-heavy room, while ozones stayed ignored.', ['ozone']);
        expect(res.count).toBe(2);
        expect(res.matches).toEqual([{ phrase: 'ozone', occurrences: 2 }]);
    });

    it('matches punctuated phrases safely and handles empty inputs', () => {
        expect(countBannedPhrases('', ['ozone'])).toEqual({ count: 0, matches: [] });
        expect(countBannedPhrases('ozone', [])).toEqual({ count: 0, matches: [] });

        const punct = countBannedPhrases('Not just cold—not just dark.', ['—not just']);
        expect(punct.count).toBe(1);
    });
});
