/**
 * @module domain/lore/graphManager
 * Undirected in-memory lore adjacency graph for related topic traversal.
 */

import type { LoreItem } from '@/types';

/** Coerces a `related_to` metadata value into a trimmed list of non-empty topic strings. */
export function normalizeLoreRelations(value: unknown): string[] {
    const relations: unknown[] = Array.isArray(value)
        ? value
        : typeof value === 'string'
          ? [value]
          : [];
    return relations
        .filter((rel): rel is string => typeof rel === 'string')
        .map((rel) => rel.trim())
        .filter(Boolean);
}

/** Undirected adjacency list manager for linking related world-bible entries. */
export class GraphManager {
    public adjList: Map<string, string[]>;

    constructor() {
        this.adjList = new Map();
    }

    /** Rebuilds the undirected graph from an array of lore entries. */
    buildGraph(loreItems: ReadonlyArray<Partial<LoreItem>>): void {
        this.adjList.clear();
        (Array.isArray(loreItems) ? loreItems : []).forEach((item) => {
            if (!item || typeof item.topic !== 'string' || !item.topic.trim()) return;
            if (!this.adjList.has(item.topic)) {
                this.adjList.set(item.topic, []);
            }
            const topicList = this.adjList.get(item.topic)!;
            normalizeLoreRelations(item.related_to).forEach((rel) => {
                topicList.push(rel);
                if (!this.adjList.has(rel)) this.adjList.set(rel, []);
                this.adjList.get(rel)!.push(item.topic!);
            });
        });
    }

    /** Returns adjacent topic names connected to the queried topic. */
    getNeighbors(topic: string): string[] {
        return this.adjList.get(topic) || [];
    }
}
