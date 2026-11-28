// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FoldedSection } from '@/components/common';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('FoldedSection', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('starts closed, naming the section and summarising it', () => {
        act(() =>
            root.render(
                <FoldedSection title="Established facts" summary="20 facts">
                    <p>Body</p>
                </FoldedSection>
            )
        );
        const details = container.querySelector('details') as HTMLDetailsElement;
        expect(details.open).toBe(false);
        expect(details.querySelector('summary')?.textContent).toBe('Established facts20 facts');
    });

    it('can start open and leaves the summary line out when there is none', () => {
        act(() =>
            root.render(
                <FoldedSection title="Story arc" defaultOpen>
                    <p>Body</p>
                </FoldedSection>
            )
        );
        const details = container.querySelector('details') as HTMLDetailsElement;
        expect(details.open).toBe(true);
        expect(details.querySelector('summary')?.textContent).toBe('Story arc');
    });
});
