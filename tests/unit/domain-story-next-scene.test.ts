import { describe, expect, it } from 'vitest';
import { findNextUnwrittenScene } from '@/domain/story';

const scene = (title: string) => ({ title });

describe('findNextUnwrittenScene', () => {
    it('returns null when nothing is planned', () => {
        expect(findNextUnwrittenScene(null)).toBeNull();
        expect(findNextUnwrittenScene({ scenes: {} })).toBeNull();
    });

    it('finds the first scene in reading order with no prose', () => {
        const story = {
            scenes: {
                '1': [scene('Low Tide'), scene('Tightening Net')],
                '0': [scene('The Ledger')]
            },
            prose: {
                '0-0': { final: 'Done.' },
                '1-0': { draft: 'Drafted.' },
                '1-1': {}
            }
        };
        expect(findNextUnwrittenScene(story)).toEqual({
            sequenceIndex: 1,
            sceneIndex: 1,
            label: '2.2',
            title: 'Tightening Net'
        });
    });

    it('returns null once every scene is written', () => {
        const story = {
            scenes: { '0': [scene('The Ledger')] },
            prose: { '0-0': { draft: 'Drafted.' } }
        };
        expect(findNextUnwrittenScene(story)).toBeNull();
    });
});
