import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createSerialInfo } from '@/domain/serial';
import { createSeriesOpener } from '@/domain/series';
import { DashboardSerialPanel, type DashboardStory } from '@/views';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(element: React.ReactElement): void {
    act(() => root.render(element));
}

describe('DashboardSerialPanel', () => {
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('renders nothing for a standalone story or a plain series book', () => {
        render(<DashboardSerialPanel story={{ id: 'solo', title: 'Solo' }} />);
        expect(container.innerHTML).toBe('');
        render(<DashboardSerialPanel story={{ id: 'book', title: 'Book', series: createSeriesOpener('S', 'Book', 1) } as DashboardStory} />);
        expect(container.innerHTML).toBe('');
    });

    it('shows the arc, the threads by state and who is on stage', () => {
        const serial = createSerialInfo({ rotation: 'ensemble' });
        serial.thread_meta = { S2: { scope: 'side', opened_episode: 1, last_touched_episode: 2, weight: 2, moves: 2, parked: { episode: 2, note: 'Quill sailed north.' } } };
        const story = {
            id: 'arc1',
            title: 'The Harbour',
            series: createSeriesOpener('The Harbour Serial', 'The Harbour', 1),
            serial,
            cast: [{ name: 'Mara', corner_role: 'MAIN_CHARACTER' }, { name: 'Quill' }],
            threads: [{ id: 'T1', name: 'The fire' }],
            sequences: [{ number: 1 }, { number: 2 }, { number: 3 }],
            open_threads: [
                { id: 'S1', title: 'The missing ledger', description: '', status: 'open', origin_book: 1, owners: ['Mara'], intent: 'advance', source: 'plan' },
                { id: 'S2', title: 'The stolen boat', description: '', status: 'open', origin_book: 1, owners: ['Quill'], source: 'model' }
            ]
        } as unknown as DashboardStory;
        render(<DashboardSerialPanel story={story} />);
        const text = container.textContent || '';
        expect(text).toContain('Arc 1');
        expect(text).toContain('0 of 6 episodes');
        expect(text).toContain('Opening');
        expect(text).toContain('Next up: episode 1.');
        expect(text).toContain('Ensemble cast');
        expect(text).toContain('The missing ledger');
        expect(text).toContain('On hold since episode 2: Quill sailed north.');
        expect(text).toContain('On stage: Mara, Quill');
    });
});
