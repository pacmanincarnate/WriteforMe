// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COLLAPSE_AFTER_CHARS, CollapsibleProse } from '@/components/common';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('CollapsibleProse', () => {
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

    it('shows short text whole, with no toggle', () => {
        act(() => root.render(<CollapsibleProse html="<p>Short.</p>" />));
        expect(container.querySelector('button')).toBeNull();
        expect(container.textContent).toBe('Short.');
    });

    it('folds long text and opens it on request', () => {
        const html = `<p>${'x'.repeat(COLLAPSE_AFTER_CHARS + 1)}</p>`;
        act(() => root.render(<CollapsibleProse html={html} className="prose" />));

        const body = container.querySelector('.prose') as HTMLElement;
        const toggle = container.querySelector('button') as HTMLButtonElement;
        expect(body.className).toContain('overflow-hidden');
        expect(toggle.textContent).toBe('Show all');
        expect(toggle.getAttribute('aria-expanded')).toBe('false');

        act(() => toggle.click());
        expect(body.className).not.toContain('overflow-hidden');
        expect(toggle.textContent).toBe('Show less');
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });
});
