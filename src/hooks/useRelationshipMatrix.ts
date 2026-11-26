/**
 * @module hooks/useRelationshipMatrix
 * Relationships view state: the relationship open in the editor, and whether the grid can still
 * scroll left or right (drives the edge fades).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Relationship } from '@/types';

export interface RelationshipHistoryItem {
    chapter: string;
    change: string;
}

/** The relationship being edited, flattened from the story's `"<from>-><to>"` record. */
export interface SelectedRelationship {
    key: string;
    from: string;
    to: string;
    current: string;
    hidden_tension?: string;
    trust_level: number;
    history: RelationshipHistoryItem[];
}

export interface MatrixScrollState {
    left: boolean;
    right: boolean;
}

export interface UseRelationshipMatrixParams {
    relationships: Record<string, Relationship> | undefined;
    view: string;
    matrixView: string;
    storyId: string | undefined;
    castCount: number | undefined;
}

export interface UseRelationshipMatrixResult {
    selectedRel: SelectedRelationship | null;
    setSelectedRel: Dispatch<SetStateAction<SelectedRelationship | null>>;
    matrixScroll: MatrixScrollState;
    matrixScrollRef: RefObject<HTMLDivElement>;
    measureMatrixScroll: () => void;
    selectMatrixRelationship: (fromChar: { name: string }, toChar: { name: string }) => void;
}

/** Editor state for the relationship from one character to another; blank when none is stored. */
export function toSelectedRelationship(
    relationships: Record<string, Relationship> | undefined,
    fromName: string,
    toName: string
): SelectedRelationship {
    const key = `${fromName}->${toName}`;
    const rel = relationships?.[key];
    return {
        from: fromName,
        to: toName,
        key,
        current: rel?.current || '',
        hidden_tension: rel?.hidden_tension || '',
        trust_level: parseInt(String(rel?.trust_level), 10) || 5,
        history: (rel?.history || []) as RelationshipHistoryItem[]
    };
}

/** Which edges of a horizontally scrolling element still have content beyond them. */
export function readScrollEdges(
    el: Pick<HTMLElement, 'scrollWidth' | 'clientWidth' | 'scrollLeft'> | null
): MatrixScrollState {
    const overflow = !!el && el.scrollWidth > el.clientWidth + 1;
    return {
        left: overflow && !!el && el.scrollLeft > 1,
        right: overflow && !!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    };
}

export function useRelationshipMatrix({
    relationships,
    view,
    matrixView,
    storyId,
    castCount
}: UseRelationshipMatrixParams): UseRelationshipMatrixResult {
    const [selectedRel, setSelectedRel] = useState<SelectedRelationship | null>(null);
    const [matrixScroll, setMatrixScroll] = useState<MatrixScrollState>({ left: false, right: false });
    const matrixScrollRef = useRef<HTMLDivElement>(null);

    const measureMatrixScroll = useCallback(() => {
        const { left, right } = readScrollEdges(matrixScrollRef.current);
        setMatrixScroll((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    }, []);

    const selectMatrixRelationship = (fromChar: { name: string }, toChar: { name: string }): void => {
        setSelectedRel(toSelectedRelationship(relationships, fromChar.name, toChar.name));
    };

    useEffect(() => {
        const el = matrixScrollRef.current;
        measureMatrixScroll();
        if (!el || view !== 'relationships' || matrixView !== 'grid') return;
        const observer =
            typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureMatrixScroll);
        observer?.observe(el);
        if (el.firstElementChild) observer?.observe(el.firstElementChild);
        window.addEventListener('resize', measureMatrixScroll);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', measureMatrixScroll);
        };
    }, [view, matrixView, storyId, castCount, measureMatrixScroll]);

    return {
        selectedRel,
        setSelectedRel,
        matrixScroll,
        matrixScrollRef,
        measureMatrixScroll,
        selectMatrixRelationship
    };
}
