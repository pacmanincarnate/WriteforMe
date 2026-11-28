/**
 * @module services/rag/retrieval
 * Client-side Okapi BM25 lexical ranking and hybrid Vector + BM25 + Knowledge Graph lore retrieval.
 */

import { RAG_LIMITS } from '@/config';
import { STOP_WORDS, expandQueryLocally, type GraphManager } from '@/domain/lore';
import type { LoreItem } from '@/types';
import type { EmbeddingService } from './embeddingService';
import type { VectorStore } from './vectorStore';

export interface LoreSearchOptions {
    filterFn?: ((metadata: Record<string, unknown>) => boolean) | null;
    limit?: number;
    threshold?: number;
}

export interface LoreRetrievalResult {
    id: string;
    text: string;
    score: number;
    metadata: Record<string, unknown>;
}

export interface LoreRetrievalContextDeps {
    embeddingService?: Pick<EmbeddingService, 'isConfigured' | 'getEmbedding'> | null;
    vectorStore?: Pick<VectorStore, 'search'> | null;
    graphManager?: Pick<GraphManager, 'getNeighbors'> | null;
    fallbackLoreList?: LoreItem[] | null;
}

/** Ranks story lore entries using client-side Okapi BM25 with topic and relation boosting. */
export function searchLoreLexical(
    query: string,
    loreList: ReadonlyArray<Partial<LoreItem>> | null | undefined,
    { filterFn = null, limit = 3, threshold = 0.05 }: LoreSearchOptions = {}
): LoreRetrievalResult[] {
    if (!query || !loreList || !Array.isArray(loreList) || loreList.length === 0) return [];

    // 1. Filter candidates by validity (e.g. act/scene constraints or custom predicate)
    const candidates = loreList.filter((item) => {
        if (!item || (!item.detail && !item.topic)) return false;
        const meta =
            item.metadata && typeof item.metadata === 'object'
                ? (item.metadata as Record<string, unknown>)
                : (item as Record<string, unknown>);
        if (filterFn && !filterFn(meta)) return false;
        return true;
    });
    if (candidates.length === 0) return [];

    // 2. Tokenize and clean query
    let expandedQuery = query;
    if (!query.startsWith('Concept:')) {
        const extra = expandQueryLocally(query, RAG_LIMITS.queryExpansionLexical);
        if (extra) expandedQuery = `${query} ${extra}`;
    }

    const stopWordsSet = STOP_WORDS;
    const queryTokens = (expandedQuery.toLowerCase().match(/[a-z0-9]+(?:[-'][a-z0-9]+)*/g) || [])
        .filter((tok) => tok.length > 2 && !stopWordsSet.has(tok));
    if (queryTokens.length === 0) return [];

    // 3. Document pre-processing and corpus statistics
    const N = candidates.length;
    let totalLength = 0;
    const docData = candidates.map((item) => {
        const topicStr = (item.topic || '').toLowerCase();
        const detailStr = (item.detail || item.description || '').toLowerCase();
        const relatedStr = Array.isArray(item.related_to)
            ? item.related_to.join(' ').toLowerCase()
            : '';

        const topicTokens: string[] = (
            topicStr.match(/[a-z0-9]+(?:[-'][a-z0-9]+)*/g) ?? []
        ).filter((t: string) => !stopWordsSet.has(t));
        const detailTokens: string[] = (
            detailStr.match(/[a-z0-9]+(?:[-'][a-z0-9]+)*/g) ?? []
        ).filter((t: string) => !stopWordsSet.has(t));
        const relatedTokens: string[] = (
            relatedStr.match(/[a-z0-9]+(?:[-'][a-z0-9]+)*/g) ?? []
        ).filter((t: string) => !stopWordsSet.has(t));

        const docLen = topicTokens.length + detailTokens.length + relatedTokens.length;
        totalLength += docLen;

        return {
            item,
            topicStr,
            topicTokens,
            detailTokens,
            relatedTokens,
            docLen
        };
    });

    const avgdl = Math.max(1, totalLength / N);
    const k1 = RAG_LIMITS.bm25K1;
    const b = 0.75;

    // 4. Calculate Document Frequency (df) for query terms
    const dfMap = new Map<string, number>();
    for (const term of queryTokens) {
        let count = 0;
        for (const doc of docData) {
            if (
                doc.topicTokens.includes(term) ||
                doc.detailTokens.includes(term) ||
                doc.relatedTokens.includes(term)
            ) {
                count++;
            }
        }
        dfMap.set(term, count);
    }

    // 5. Score candidates
    const queryLower = query.toLowerCase();
    const scored = docData.map((doc) => {
        let score = 0;

        // Exact topic substring bonus (topic boosting +5.0)
        if (
            doc.topicStr.length > 3 &&
            (queryLower.includes(doc.topicStr) || doc.topicStr.includes(queryLower))
        ) {
            score += 5.0;
        }

        for (const term of queryTokens) {
            const df = dfMap.get(term) || 0;
            if (df === 0) continue;

            // BM25 IDF
            const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

            // Weighted term frequencies: topic 4.0x, detail 1.0x, related 2.0x
            const fTopic = doc.topicTokens.filter((t) => t === term).length;
            const fDetail = doc.detailTokens.filter((t) => t === term).length;
            const fRelated = doc.relatedTokens.filter((t) => t === term).length;
            const weightedTf =
                fTopic * RAG_LIMITS.bm25Weights.topic +
                fDetail * RAG_LIMITS.bm25Weights.detail +
                fRelated * RAG_LIMITS.bm25Weights.related;

            if (weightedTf > 0) {
                const tfComponent =
                    (weightedTf * (k1 + 1)) / (weightedTf + k1 * (1 - b + b * (doc.docLen / avgdl)));
                score += idf * tfComponent;
            }
        }

        return {
            item: doc.item,
            score
        };
    });

    // 6. Normalize scores to [0.0, 1.0] range
    const maxScore = Math.max(...scored.map((s) => s.score), 0);
    if (maxScore <= 0) return [];

    const ranked: LoreRetrievalResult[] = scored
        .filter((s) => s.score > 0)
        .map((s) => {
            const normalized = Math.min(0.99, (s.score / (maxScore + 0.001)) * 0.95);
            return {
                id: s.item.id || `lore_lexical_${Math.random().toString(36).substr(2, 7)}`,
                text: `${s.item.topic}: ${s.item.detail}`,
                score: normalized,
                metadata: {
                    ...s.item,
                    topic: s.item.topic,
                    detail: s.item.detail,
                    retrieval_mode: 'bm25_lexical'
                }
            };
        })
        .filter((r) => r.score >= threshold)
        .sort((a, b) => b.score - a.score);

    return ranked.slice(0, limit);
}

/**
 * Retrieves relevant lore via vector similarity search (when configured), falling back to
 * Okapi BM25 lexical ranking, and augmenting with immediate `GraphManager` neighbors.
 */
export async function retrieveLoreContext(
    query: string,
    deps: LoreRetrievalContextDeps = {},
    threshold = 0.5,
    filterFn: ((metadata: Record<string, unknown>) => boolean) | null = null,
    loreList: ReadonlyArray<Partial<LoreItem>> | null = null
): Promise<LoreRetrievalResult[]> {
    const effectiveLoreList = loreList || deps.fallbackLoreList || [];
    let results: LoreRetrievalResult[] = [];

    // 1. Attempt Vector Search if service is configured and store is available
    if (deps.embeddingService && deps.embeddingService.isConfigured() && deps.vectorStore) {
        try {
            let searchKey = query;
            if (!query.startsWith('Concept:')) {
                const expanded = expandQueryLocally(query, RAG_LIMITS.queryExpansionVector);
                if (expanded) searchKey = `${query} ${expanded}`;
            }

            const queryVector = await deps.embeddingService.getEmbedding(searchKey, 'query');
            if (queryVector && queryVector.length > 0) {
                results = await deps.vectorStore.search<Record<string, unknown>>(
                    queryVector,
                    3,
                    threshold,
                    filterFn
                );
            }
        } catch (e) {
            console.warn('[retrieveContext] Vector search failed, falling back to BM25 lexical search:', e);
        }
    }

    // 2. Fall back to client-side BM25 lexical ranking if vector search returned 0 results or failed
    if (!results || results.length === 0) {
        results = searchLoreLexical(query, effectiveLoreList, {
            filterFn,
            limit: 3,
            threshold: 0.05
        });
    }

    // 3. Graph Traversal (Immediate Neighbors of Top Results)
    const augmentedResults: LoreRetrievalResult[] = [...results];
    const processedTopics = new Set(
        results
            .map((r) => r.metadata?.topic)
            .filter((topic): topic is string => typeof topic === 'string' && topic.length > 0)
    );

    if (deps.graphManager) {
        for (const res of results) {
            const topic = res.metadata?.topic;
            if (typeof topic !== 'string' || !topic) continue;
            const neighbors = deps.graphManager.getNeighbors(topic) || [];
            for (const neighborTopic of neighbors) {
                if (!processedTopics.has(neighborTopic)) {
                    const neighborItem = effectiveLoreList.find(
                        (l) => l && l.topic === neighborTopic
                    );
                    if (neighborItem) {
                        augmentedResults.push({
                            id: neighborItem.id || `lore_graph_${neighborTopic}`,
                            text: `${neighborItem.topic}: ${neighborItem.detail}`,
                            score: 1.0,
                            metadata: {
                                ...neighborItem,
                                topic: neighborItem.topic,
                                relation: `Graph Neighbor of ${topic}`
                            }
                        });
                        processedTopics.add(neighborTopic);
                    }
                }
            }
        }
    }

    return augmentedResults;
}
