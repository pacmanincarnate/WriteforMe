/**
 * @module domain/lore/chunking
 * Boundary-aware worldbuilding document chunking, semantic topic derivation,
 * lore title migration, and 5-tier map-reduce section partitioning.
 */

import type { LoreItem } from '@/types';

export interface BoundaryAwareChunk {
    text: string;
    heading: string;
}

export interface ChunkedLoreEntry extends LoreItem {
    topic: string;
    title: string;
    detail: string;
    text: string;
    docTitle: string;
    sectionTitle: string;
    valid_from_act: number;
    valid_from_scene: number;
    related_to: string[];
    description: string;
}

export interface SemanticLoreSection {
    index: number;
    total: number;
    title: string;
    charCount: number;
    text: string;
}

/** Derives a concise title from the leading sentence of a lore text passage. */
export function deriveLoreTitle(text: unknown, max = 60): string {
    let title = String(text || '')
        .trim()
        .replace(/\s+/g, ' ')
        .split(/[.!?](?:\s|$)/)[0];
    if (title.length > max) {
        const clipped = title.slice(0, max);
        title = /\s/.test(title[max] || '')
            ? clipped
            : clipped.slice(0, Math.max(0, clipped.lastIndexOf(' ')));
    }
    return title.replace(/[\p{P}\s]+$/gu, '').trim() || 'Fact';
}

/** Repairs legacy lore entries whose topic ended with an ellipsis (`...`). */
export function migrateLoreTitles<T extends Partial<LoreItem>>(lore: T[]): T[] {
    if (!Array.isArray(lore)) return lore;
    let count = 0;
    const migrated = lore.map((entry) => {
        if (!entry || typeof entry.topic !== 'string' || !entry.topic.endsWith('...')) return entry;
        const prefix = entry.topic.match(/^([^:]+:)\s*/);
        count++;
        return {
            ...entry,
            topic: `${prefix ? prefix[1] + ' ' : ''}${deriveLoreTitle(entry.detail)}`
        };
    });
    if (count > 0) console.info(`Repaired ${count} truncated lore title(s).`);
    return count > 0 ? migrated : lore;
}

/** Splits an oversized paragraph along sentence and word boundaries. */
export function splitParagraphIntoSentenceChunks(
    paragraph: string,
    targetSize = 1800,
    maxSize = 2500
): string[] {
    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let current = '';

    for (const s of sentences) {
        const sTrim = s.trim();
        if (!sTrim) continue;

        if (!current) {
            current = sTrim;
        } else if (current.length + sTrim.length + 1 <= targetSize) {
            current += ' ' + sTrim;
        } else {
            chunks.push(current);
            current = sTrim;
        }

        while (current.length > maxSize) {
            let splitAt = current.lastIndexOf(' ', maxSize);
            if (splitAt === -1 || splitAt < targetSize * 0.5) {
                splitAt = current.indexOf(' ', targetSize);
            }
            if (splitAt === -1) {
                splitAt = maxSize;
            }
            chunks.push(current.substring(0, splitAt).trim());
            current = current.substring(splitAt).trim();
        }
    }
    if (current && current.trim()) {
        chunks.push(current.trim());
    }
    return chunks;
}

/** Extracts a leading markdown heading (`#`..`####`) without inline formatting characters. */
export function extractLeadingHeading(text: unknown): string {
    if (!text || typeof text !== 'string') return '';
    const m = text.match(/^#{1,4}\s+([^\n]+)/);
    return m ? m[1].replace(/[*_`]/g, '').trim() : '';
}

/** Splits lore text into chunks respecting markdown headings, paragraph breaks, and sentences. */
export function splitTextIntoBoundaryAwareChunks(
    text: unknown,
    targetSize = 1800,
    maxSize = 2500,
    minSize = 250
): BoundaryAwareChunk[] {
    if (!text || typeof text !== 'string') return [];
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.length <= maxSize) {
        return [{ text: trimmed, heading: extractLeadingHeading(trimmed) || '' }];
    }

    const rawBlocks: BoundaryAwareChunk[] = [];
    const lines = trimmed.split('\n');
    let currentBlock: string[] = [];
    let currentHeading = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
        if (headingMatch && currentBlock.length > 0) {
            rawBlocks.push({
                text: currentBlock.join('\n').trim(),
                heading: currentHeading
            });
            currentBlock = [line];
            currentHeading = headingMatch[1].trim();
        } else {
            if (headingMatch && currentBlock.length === 0) {
                currentHeading = headingMatch[1].trim();
            }
            currentBlock.push(line);
        }
    }
    if (currentBlock.length > 0) {
        rawBlocks.push({
            text: currentBlock.join('\n').trim(),
            heading: currentHeading
        });
    }

    const subBlocks: BoundaryAwareChunk[] = [];
    for (const b of rawBlocks) {
        if (!b.text) continue;
        if (b.text.length <= maxSize) {
            subBlocks.push(b);
        } else {
            const paragraphs = b.text.split(/\n\s*\n/);
            let accum: string[] = [];
            let accumLen = 0;
            for (const p of paragraphs) {
                const pTrimmed = p.trim();
                if (!pTrimmed) continue;
                if (accumLen + pTrimmed.length + 2 > maxSize && accum.length > 0) {
                    subBlocks.push({
                        text: accum.join('\n\n'),
                        heading: b.heading
                    });
                    accum = [pTrimmed];
                    accumLen = pTrimmed.length;
                } else if (pTrimmed.length > maxSize) {
                    if (accum.length > 0) {
                        subBlocks.push({ text: accum.join('\n\n'), heading: b.heading });
                        accum = [];
                        accumLen = 0;
                    }
                    const sentenceChunks = splitParagraphIntoSentenceChunks(
                        pTrimmed,
                        targetSize,
                        maxSize
                    );
                    for (const sc of sentenceChunks) {
                        subBlocks.push({ text: sc, heading: b.heading });
                    }
                } else {
                    accum.push(pTrimmed);
                    accumLen += pTrimmed.length + 2;
                }
            }
            if (accum.length > 0) {
                subBlocks.push({
                    text: accum.join('\n\n'),
                    heading: b.heading
                });
            }
        }
    }

    const finalChunks: BoundaryAwareChunk[] = [];
    let currentChunkText = '';
    let currentChunkHeading = '';

    for (let i = 0; i < subBlocks.length; i++) {
        const blk = subBlocks[i];
        if (!blk.text) continue;

        if (!currentChunkText) {
            currentChunkText = blk.text;
            currentChunkHeading = blk.heading;
        } else if (
            currentChunkText.length + blk.text.length + 2 <= targetSize ||
            (currentChunkText.length < minSize &&
                currentChunkText.length + blk.text.length + 2 <= maxSize)
        ) {
            currentChunkText += '\n\n' + blk.text;
            if (!currentChunkHeading && blk.heading) currentChunkHeading = blk.heading;
        } else {
            finalChunks.push({
                text: currentChunkText.trim(),
                heading: currentChunkHeading
            });
            currentChunkText = blk.text;
            currentChunkHeading = blk.heading;
        }
    }

    if (currentChunkText && currentChunkText.trim()) {
        if (
            finalChunks.length > 0 &&
            currentChunkText.trim().length < minSize &&
            finalChunks[finalChunks.length - 1].text.length + currentChunkText.trim().length + 2 <=
                maxSize
        ) {
            finalChunks[finalChunks.length - 1].text += '\n\n' + currentChunkText.trim();
        } else {
            finalChunks.push({
                text: currentChunkText.trim(),
                heading: currentChunkHeading
            });
        }
    }

    return finalChunks;
}

/** Derives a semantic topic title from chunk text, heading, document name, and part numbering. */
export function deriveSemanticChunkTopic(
    chunkText: string,
    explicitHeading = '',
    docContext = '',
    partIndex = 1,
    totalParts = 1
): string {
    let topic = explicitHeading
        ? explicitHeading.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim()
        : '';

    if (!topic) {
        const headingMatch = chunkText.match(/^(?:[\r\n\s]*)(?:#{1,4})\s+([^\r\n]+)/m);
        if (headingMatch) {
            topic = headingMatch[1].replace(/[*_`]/g, '').trim();
        }
    }

    if (!topic) {
        topic = deriveLoreTitle(chunkText, 60);
    }

    if (!topic || topic === 'Fact') {
        topic = docContext ? `${docContext} Section` : 'World Lore';
    }

    if (totalParts > 1) {
        topic = `${topic} (Part ${partIndex})`;
    }

    if (docContext && !topic.toLowerCase().includes(docContext.toLowerCase())) {
        topic = `${docContext}: ${topic}`;
    }

    return topic;
}

/** Splits an imported lore document into boundary-aware RAG entries with Knowledge Graph sibling links. */
export function chunkLoreText(
    text: unknown,
    topicForPart?: ((partNum: number) => string) | null,
    relatedTo?: string[] | null,
    description?: string,
    docContext = ''
): ChunkedLoreEntry[] {
    if (!text || typeof text !== 'string' || !text.trim()) return [];

    const rawChunks = splitTextIntoBoundaryAwareChunks(text, 1800, 2500, 250);
    if (!rawChunks.length) return [];

    const headingCounts: Record<string, number> = {};
    rawChunks.forEach((c) => {
        const h = c.heading || 'General';
        headingCounts[h] = (headingCounts[h] || 0) + 1;
    });
    const headingIndices: Record<string, number> = {};

    const chunks: ChunkedLoreEntry[] = rawChunks.map((chunkObj, idx) => {
        const h = chunkObj.heading || '';
        const hKey = h || 'General';
        headingIndices[hKey] = (headingIndices[hKey] || 0) + 1;
        const partIdx = headingIndices[hKey];
        const totalParts = headingCounts[hKey] || 1;

        let topic: string;
        if (typeof topicForPart === 'function') {
            const candidateTopic = topicForPart(idx + 1);
            if (
                !candidateTopic ||
                candidateTopic.startsWith('User Upload Segment') ||
                /\(Part\s+\d+\)$/.test(candidateTopic)
            ) {
                topic = deriveSemanticChunkTopic(chunkObj.text, h, docContext, partIdx, totalParts);
            } else {
                topic = candidateTopic;
            }
        } else {
            topic = deriveSemanticChunkTopic(chunkObj.text, h, docContext, partIdx, totalParts);
        }

        let chunkBody = chunkObj.text.trim();
        const sectionName =
            h ||
            (topic ? topic.replace(new RegExp(`^${docContext}:?\\s*`, 'i'), '').trim() : '') ||
            'General';
        if (docContext && !chunkBody.startsWith('[Document: ')) {
            chunkBody = `[Document: ${docContext} | Section: ${sectionName}]\n\n${chunkBody}`;
        }

        return {
            topic,
            title: topic,
            detail: chunkBody,
            text: chunkBody,
            docTitle: docContext || '',
            sectionTitle: sectionName,
            valid_from_act: 1,
            valid_from_scene: 1,
            related_to: [],
            description: description || 'Imported Lore Segment'
        };
    });

    for (let i = 0; i < chunks.length; i++) {
        const rels: string[] = [];
        if (i > 0 && chunks[i - 1].topic && chunks[i - 1].topic !== chunks[i].topic) {
            rels.push(chunks[i - 1].topic);
        }
        if (i < chunks.length - 1 && chunks[i + 1].topic && chunks[i + 1].topic !== chunks[i].topic) {
            rels.push(chunks[i + 1].topic);
        }
        if (Array.isArray(relatedTo)) {
            relatedTo.forEach((r) => {
                if (r && typeof r === 'string' && r !== 'Author Upload' && r !== 'Manual Entry') {
                    if (!rels.includes(r) && r !== chunks[i].topic) {
                        rels.push(r);
                    }
                }
            });
        }
        chunks[i].related_to = rels;
    }

    return chunks;
}

/** Convenience wrapper producing RAG-ready upload lore chunks for Setup imports. */
export function buildUploadLoreChunks(text: unknown, docName = 'World Lore'): ChunkedLoreEntry[] {
    return chunkLoreText(text, null, null, 'Imported Lore Segment', docName);
}

/** Derives a human-readable section title from markdown headers or leading sentence. */
export function deriveSectionTitle(sectionText: unknown, fallbackIndex = 1): string {
    if (!sectionText || typeof sectionText !== 'string') return `Section ${fallbackIndex}`;
    const sourceMatch = sectionText.match(/##\s*Source:\s*([^\n\r]+)/i);
    if (sourceMatch) return sourceMatch[1].trim();

    const headingMatch = sectionText.match(/^(?:[\r\n\s]*)(?:#{1,3})\s+([^\r\n]+)/m);
    if (headingMatch) {
        return headingMatch[1].replace(/[*_`]/g, '').trim();
    }

    const firstSentence = sectionText.trim().split(/[.!?](?:\s|$)/)[0];
    if (firstSentence && firstSentence.length > 5) {
        return firstSentence.substring(0, 50).trim();
    }
    return `Section ${fallbackIndex}`;
}

/** Partitions large world bibles into 12k–25k character sections across a 5-tier boundary hierarchy. */
export function partitionLoreIntoSemanticSections(
    text: unknown,
    _targetLength = 20000,
    maxLength = 25000,
    minLength = 12000
): SemanticLoreSection[] {
    void _targetLength;
    if (!text || typeof text !== 'string') return [];
    const trimmed = text.trim();
    if (!trimmed) return [];
    const maxSize = maxLength || 25000;
    const minSize = minLength || 12000;
    if (trimmed.length <= maxSize) {
        return [
            {
                index: 1,
                total: 1,
                title: deriveSectionTitle(trimmed, 1),
                charCount: trimmed.length,
                text: trimmed
            }
        ];
    }

    const rawSections: string[] = [];
    let remaining = trimmed;

    while (remaining.length > 0) {
        if (remaining.length <= maxSize) {
            rawSections.push(remaining.trim());
            break;
        }

        let splitIdx = -1;

        const headingRegex = /\n(?=(?:#{1,2}\s+|##\s*Source:)[^\n]+)/g;
        let match: RegExpExecArray | null;
        let lastGoodHeading = -1;
        while ((match = headingRegex.exec(remaining)) !== null) {
            if (match.index >= minSize && match.index <= maxSize) {
                lastGoodHeading = match.index;
            }
            if (match.index > maxSize) break;
        }
        if (lastGoodHeading !== -1) splitIdx = lastGoodHeading;

        if (splitIdx === -1) {
            const subHeadingRegex = /\n(?=#{3,4}\s+[^\n]+)/g;
            let subMatch: RegExpExecArray | null;
            let lastSubHeading = -1;
            while ((subMatch = subHeadingRegex.exec(remaining)) !== null) {
                if (subMatch.index >= minSize && subMatch.index <= maxSize) {
                    lastSubHeading = subMatch.index;
                }
                if (subMatch.index > maxSize) break;
            }
            if (lastSubHeading !== -1) splitIdx = lastSubHeading;
        }

        if (splitIdx === -1) {
            const paraIdx = remaining.lastIndexOf('\n\n', maxSize);
            if (paraIdx >= minSize) splitIdx = paraIdx;
        }

        if (splitIdx === -1) {
            const sentenceRegex = /[.!?](?:\s+|$)/g;
            let sentMatch: RegExpExecArray | null;
            let lastGoodSentence = -1;
            while ((sentMatch = sentenceRegex.exec(remaining)) !== null) {
                const endPos = sentMatch.index + sentMatch[0].length;
                if (endPos >= minSize * 0.75 && endPos <= maxSize) {
                    lastGoodSentence = endPos;
                }
                if (endPos > maxSize) break;
            }
            if (lastGoodSentence !== -1) splitIdx = lastGoodSentence;
        }

        if (splitIdx === -1) {
            const spaceIdx = remaining.lastIndexOf(' ', maxSize);
            splitIdx = spaceIdx > minSize * 0.5 ? spaceIdx : maxSize;
        }

        const chunkText = remaining.substring(0, splitIdx).trim();
        if (chunkText) rawSections.push(chunkText);
        remaining = remaining.substring(splitIdx).trim();
    }

    const total = rawSections.length;
    return rawSections.map((secText, idx) => ({
        index: idx + 1,
        total,
        title: deriveSectionTitle(secText, idx + 1),
        charCount: secText.length,
        text: secText
    }));
}
