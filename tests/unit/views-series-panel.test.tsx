import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createSeriesOpener } from '@/domain/series';
import type { OpenThread } from '@/types';
import { DashboardSeriesPanel, type DashboardOpenFormOptions, type DashboardStory } from '@/views';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(element: React.ReactElement): void {
    act(() => root.render(element));
}

function button(label: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label));
}

const openThread: OpenThread = {
    id: 'S1',
    title: 'The missing ledger',
    description: 'Who took it?',
    promise: 'We will learn who took the ledger.',
    status: 'open',
    origin_book: 1,
    intent: 'advance',
    source: 'model',
    touches: [{ book: 1, scene: '2.3', note: 'A torn page turns up.' }]
};

describe('DashboardSeriesPanel', () => {
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    function props(story: DashboardStory) {
        return {
            story,
            setStory: vi.fn(),
            loading: false,
            startNextBook: vi.fn(),
            openEditModal: vi.fn(),
            openFormModal: vi.fn(),
            requestConfirm: vi.fn()
        };
    }

    it('renders nothing for a standalone story with no prose', () => {
        render(<DashboardSeriesPanel {...props({ id: 'solo', title: 'Solo' })} />);
        expect(container.innerHTML).toBe('');
    });

    it('offers a sequel for a standalone story that has prose', () => {
        const p = props({ id: 'solo', title: 'Solo', prose: { '0-0': { final: 'Written.' } } });
        render(<DashboardSeriesPanel {...p} />);
        expect(container.textContent).not.toContain('Series Plan');
        act(() => button('Start a sequel')?.click());
        const form = p.openFormModal.mock.calls[0][0] as DashboardOpenFormOptions;
        expect(form.fields.map((f) => f.key)).toEqual(['seriesTitle', 'title', 'concept']);
        form.onSubmit?.({ concept: '  ' });
        expect(p.startNextBook).not.toHaveBeenCalled();
        form.onSubmit?.({ title: 'Salt Debt', concept: ' The debt comes due. ', seriesTitle: 'Harbour' });
        expect(p.startNextBook).toHaveBeenCalledWith({ title: 'Salt Debt', concept: 'The debt comes due.', seriesTitle: 'Harbour' });
    });

    it('shows the plan, the thread board and contract warnings for a series', () => {
        const story: DashboardStory = {
            id: 'b1',
            title: 'Tide Ledger',
            open_threads: [openThread],
            series: {
                ...createSeriesOpener('The Harbour Books', 'Tide Ledger', 1),
                contract_violations: [{ rule: 'must_stay_open', subject: 'S1', evidence: 'The thief confesses.' }],
                plan: {
                    series_question: 'Can the harbour govern itself?',
                    series_thematic_argument: 'Trust is built by debts honestly kept.',
                    long_arcs: [],
                    endgame_note: 'The harbour stands alone.',
                    books: [
                        { book_number: 1, role: 'opener', book_question: 'Will Elena expose the fraud?', stakes_scope: 'Her post.', handoff_state: 'She runs the house.', thread_intents: {}, status: 'current' }
                    ],
                    secrets: [],
                    revisions: []
                }
            }
        };
        const p = props(story);
        render(<DashboardSeriesPanel {...p} />);
        const text = container.textContent || '';
        expect(text).toContain('Series Plan');
        expect(text).toContain('Can the harbour govern itself?');
        expect(text).toContain('Will Elena expose the fraud?');
        expect(text).toContain('The missing ledger');
        expect(text).toContain('opened by the model');
        expect(text).toContain('Last moved in Book 1, scene 2.3');
        expect(text).toContain('Ending contract warnings (1)');
        // No prose yet: the next book cannot be started.
        expect(button('Start Book 2')?.disabled).toBe(true);

        const status = container.querySelector('select') as HTMLSelectElement;
        act(() => {
            status.value = 'abandoned';
            status.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const updater = p.setStory.mock.calls[0][0] as (prev: DashboardStory) => DashboardStory;
        expect((updater(story).open_threads as OpenThread[])[0].status).toBe('abandoned');
    });
});
