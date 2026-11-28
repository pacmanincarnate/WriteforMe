/**
 * @module views/library/LibraryView
 * Bookshelf / Library view displaying story cards, covers, reading/studio quick actions,
 * completion progress, search filtering, duplication, import, and deletion.
 */

import type React from 'react';
import {
    Activity,
    BookCoverAudioArt,
    BookOpen,
    CheckCircle,
    Copy,
    Download,
    Loader2,
    Plus,
    Search,
    Sparkles,
    StylizedBlankCover,
    Trash2,
    X
} from '@/components';
import { seriesBadgeLabel } from '@/domain/series';
import { calculateStoryStats, getCoverStyleIndex } from '@/domain/story';
import type { Story } from '@/types';

export interface LibraryStoryRecord {
    id: string;
    timestamp?: number;
    data: {
        title?: string;
        concept?: string;
        logline?: string;
        coverStyle?: number;
        writing_mode?: string;
        style?: {
            genre?: string;
            [key: string]: unknown;
        };
        cast?: Array<{ name: string; [key: string]: unknown }>;
        prose?: Record<string, string | { final?: string; draft?: string }>;
        [key: string]: unknown;
    };
}

export interface LibraryViewProps {
    activeStoryId: string;
    theme: string;
    libraryStories: LibraryStoryRecord[];
    libraryCovers: Record<string, string>;
    libraryAudioCounts: Record<string, number>;
    librarySearchQuery: string;
    setLibrarySearchQuery: (query: string) => void;
    initializingStoryId: string | null;
    setView: (viewId: string) => void;
    handleImport: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
    handleDeleteLibraryStory: (
        item: LibraryStoryRecord,
        e: React.MouseEvent<HTMLButtonElement>
    ) => void | Promise<void>;
    handleDuplicateStory: (item: LibraryStoryRecord) => void | Promise<void>;
    handleUpdateStoryCoverStyle: (storyId: string, nextStyle: number) => void | Promise<void>;
    onSelectStory: (item: LibraryStoryRecord, targetView?: string) => void;
}

function formatStoryDate(item: LibraryStoryRecord): string {
    const idMatch = (item.id || '').match(/story_(\d+)/);
    const ts = idMatch ? parseInt(idMatch[1], 10) : item.timestamp || Date.now();
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}.${dd}.${yy}`;
}

export function LibraryView({
    activeStoryId,
    theme,
    libraryStories,
    libraryCovers,
    libraryAudioCounts,
    librarySearchQuery,
    setLibrarySearchQuery,
    initializingStoryId,
    setView,
    handleImport,
    handleDeleteLibraryStory,
    handleDuplicateStory,
    handleUpdateStoryCoverStyle,
    onSelectStory
}: LibraryViewProps) {
    // Enrich stories with computed stats
    const enrichedStories = libraryStories.map((item) => {
        const stats = calculateStoryStats(item.data);
        return { ...item, stats };
    });

    // Search filter (covers title, concept, genre, cast names)
    const q = (librarySearchQuery || '').trim().toLowerCase();
    const filteredStories = enrichedStories.filter((item) => {
        const s = item.data || {};
        const title = (s.title || 'Untitled').toLowerCase();
        const concept = (s.concept || s.logline || '').toLowerCase();
        const genre = (s.style?.genre || '').toLowerCase();
        const castNames = Array.isArray(s.cast)
            ? s.cast.map((c) => (c.name || '').toLowerCase()).join(' ')
            : '';
        return (
            !q ||
            title.includes(q) ||
            concept.includes(q) ||
            genre.includes(q) ||
            castNames.includes(q)
        );
    });

    // Sort: most recently active first
    filteredStories.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return (
        <div className="lib-magazine-root animate-fade-in">
            {/* ── Header ── */}
            <header className="lib-header">
                <div className="lib-header-top">
                    <div>
                        <h1 className="lib-title font-serif">Library</h1>
                        {libraryStories.length > 0 && (
                            <p className="lib-count">
                                {libraryStories.length}{' '}
                                {libraryStories.length === 1 ? 'story' : 'stories'}
                            </p>
                        )}
                    </div>
                    <div className="lib-header-actions">
                        <label className="lib-import-link">
                            Import
                            <input
                                type="file"
                                onChange={handleImport}
                                className="hidden"
                                accept=".json,.epub"
                            />
                        </label>
                        <button onClick={() => setView('setup')} className="lib-new-btn">
                            <Plus size={15} />
                            <span>New Story</span>
                        </button>
                    </div>
                </div>

                {/* Search */}
                {libraryStories.length > 0 && (
                    <div className="lib-search-wrap">
                        <Search className="lib-search-icon" size={15} />
                        <input
                            type="text"
                            placeholder="Search stories…"
                            value={librarySearchQuery}
                            onChange={(e) => setLibrarySearchQuery(e.target.value)}
                            className="lib-search-input"
                        />
                        {librarySearchQuery && (
                            <button
                                onClick={() => setLibrarySearchQuery('')}
                                className="lib-search-clear"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>
                )}
            </header>

            {/* ── Content ── */}
            {libraryStories.length === 0 ? (
                /* Empty state */
                <div className="lib-empty">
                    <h2 className="lib-empty-title font-serif">No stories yet</h2>
                    <p className="lib-empty-desc">
                        Begin your first novel from a concept, or import an existing manuscript.
                    </p>
                    <div className="lib-empty-actions">
                        <button onClick={() => setView('setup')} className="lib-empty-primary">
                            <Plus size={16} /> New Story
                        </button>
                        <label className="lib-empty-secondary">
                            <Download size={14} /> Import
                            <input
                                type="file"
                                onChange={handleImport}
                                className="hidden"
                                accept=".json,.epub"
                            />
                        </label>
                    </div>
                </div>
            ) : filteredStories.length === 0 ? (
                /* No search results */
                <div className="lib-no-results">
                    <p>No stories match your search.</p>
                    <button
                        onClick={() => setLibrarySearchQuery('')}
                        className="lib-clear-link"
                    >
                        Clear search
                    </button>
                </div>
            ) : (
                /* Story cards */
                <div className="lib-card-list">
                    {filteredStories.map((item) => {
                        const s = item.data || {};
                        const isActive = item.id === activeStoryId;
                        const stats = item.stats;
                        const coverSrc = libraryCovers[item.id];
                        const seriesBadge = seriesBadgeLabel(
                            s as Partial<Story>,
                            libraryStories.map((other) => other.data as Partial<Story>)
                        );
                        const seriesTitle = seriesBadge
                            ? String((s.series as { title?: string } | undefined)?.title || '')
                            : '';

                        // Sequence-based completion: each sequence contributes equally,
                        // with partial credit based on completed scenes / total scenes.
                        const seqPct = (() => {
                            const seqs = stats.sequencesStatus;
                            if (!seqs || seqs.length === 0) return 0;
                            const frac = seqs.reduce(
                                (sum, sq) => sum + (sq.total > 0 ? sq.completed / sq.total : 0),
                                0
                            );
                            return Math.round((frac / seqs.length) * 100);
                        })();
                        const isComplete = seqPct === 100;

                        const defaultDest = stats?.words > 0 ? 'reader' : 'dashboard';

                        return (
                            <article
                                key={item.id}
                                className={`lib-card group${isActive ? ' lib-card--active' : ''}`}
                            >
                                {/* Physical 3D Book Object - 1-Click Open */}
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectStory(item, defaultDest);
                                    }}
                                    className="lib-book-obj"
                                    title={`Open ${s.title || 'Novel'}`}
                                >
                                    {/* Spine crease & shading overlays */}
                                    <div className="book-spine-shadow" />
                                    <div className="book-spine-crease" />
                                    <div className="book-edge-trim" />

                                    {/* Quick Action Toolbar on Book Cover (Reveals on hover / tap) */}
                                    <div
                                        className="lib-card-actions"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectStory(item, 'reader');
                                            }}
                                            className="lib-card-action-btn lib-card-action-btn--gold"
                                            title="Read Novel"
                                        >
                                            <BookOpen size={13} />
                                        </button>
                                        {!coverSrc && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const currentStyle =
                                                        typeof s.coverStyle === 'number'
                                                            ? s.coverStyle
                                                            : getCoverStyleIndex(
                                                                  item.id || s.title
                                                              );
                                                    const nextStyle = (currentStyle + 1) % 8;
                                                    handleUpdateStoryCoverStyle(item.id, nextStyle);
                                                }}
                                                className="lib-card-action-btn"
                                                title="Cycle Typography & Palette"
                                            >
                                                <Sparkles size={13} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDuplicateStory(item);
                                            }}
                                            className="lib-card-action-btn"
                                            title="Duplicate Story"
                                        >
                                            <Copy size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteLibraryStory(item, e);
                                            }}
                                            className="lib-card-action-btn lib-card-action-btn--danger"
                                            title="Delete Story"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>

                                    {coverSrc ? (
                                        <img
                                            src={coverSrc}
                                            alt={s.title || 'Story cover'}
                                            className="lib-cover-img"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <StylizedBlankCover
                                            story={{
                                                id: item.id,
                                                title: s.title,
                                                coverStyle: s.coverStyle
                                            }}
                                            theme={theme}
                                            isLarge={false}
                                        />
                                    )}

                                    {/* Compositional Cover Art: Audio Drama Rings + Offline Audio Progress Arc */}
                                    <BookCoverAudioArt
                                        story={s}
                                        audioCount={libraryAudioCounts[item.id] || 0}
                                        totalScenes={
                                            Object.values(s.prose || {}).filter((p) =>
                                                (typeof p === 'string'
                                                    ? p
                                                    : p?.final || p?.draft || ''
                                                ).trim()
                                            ).length
                                        }
                                    />
                                </div>

                                {/* Card body below book */}
                                <div className="lib-card-body">
                                    {/* Full-width Title Row */}
                                    <div className="lib-title-row">
                                        {isActive && (
                                            <span
                                                className="lib-active-dot"
                                                title="Active project"
                                            />
                                        )}
                                        <h2
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectStory(item, defaultDest);
                                            }}
                                            className="lib-card-title font-serif cursor-pointer"
                                            title={s.title || 'Untitled'}
                                        >
                                            {s.title || 'Untitled'}
                                        </h2>
                                    </div>
                                    {seriesBadge && (
                                        <div
                                            className="text-xs font-mono text-ink-500 -mt-1 mb-1 truncate"
                                            title={`${seriesBadge} of the series ${seriesTitle}`}
                                        >
                                            <span className="font-bold text-gold-ink">{seriesBadge}</span>
                                            {seriesTitle ? ` · ${seriesTitle}` : ''}
                                        </div>
                                    )}

                                    {/* Concept preview */}
                                    <p
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSelectStory(item, defaultDest);
                                        }}
                                        className="lib-concept cursor-pointer"
                                    >
                                        {s.concept || s.logline || 'No concept written yet.'}
                                    </p>

                                    {/* Metadata row */}
                                    <div className="lib-meta">
                                        <div className="lib-meta-left">
                                            <span>{stats.words.toLocaleString()} words</span>
                                            <span className="lib-meta-sep">&middot;</span>
                                            <span>{formatStoryDate(item)}</span>
                                        </div>
                                        <div className="lib-meta-right">
                                            {initializingStoryId === item.id &&
                                            !isComplete &&
                                            seqPct === 0 ? (
                                                <span
                                                    className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-gold-ink"
                                                    title="Initializing Story Bible"
                                                >
                                                    <Loader2 size={11} className="animate-spin" />
                                                    Building…
                                                </span>
                                            ) : isComplete ? (
                                                <span
                                                    className="lib-meta-complete"
                                                    title="All sequences completed"
                                                >
                                                    <CheckCircle size={12} />
                                                    Done
                                                </span>
                                            ) : (
                                                <span
                                                    className="lib-meta-progress"
                                                    title={`Completion: ${seqPct}%`}
                                                >
                                                    <span className="text-xs font-mono font-medium">
                                                        {seqPct}%
                                                    </span>
                                                    <span className="lib-progress-track">
                                                        <span
                                                            className="lib-progress-fill"
                                                            style={{
                                                                width: `${Math.max(seqPct, 4)}%`
                                                            }}
                                                        />
                                                    </span>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Editorial Action Row: Read & Studio */}
                                    <div className="lib-card-footer-actions pt-2.5 mt-1 flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectStory(item, 'reader');
                                            }}
                                            className="flex-1 py-1 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all bg-gold-tint hover:bg-gold-tint border border-gold-edge text-gold-ink active:scale-95 shadow-2xs cursor-pointer"
                                            title="Read Manuscript"
                                        >
                                            <BookOpen size={12} />
                                            <span>Read</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectStory(item, 'dashboard');
                                            }}
                                            className="flex-1 py-1 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all bg-surface hover:bg-wash border border-edge-strong text-ink-700 active:scale-95 shadow-2xs cursor-pointer"
                                            title="Open Studio"
                                        >
                                            <Activity size={12} />
                                            <span>Studio</span>
                                        </button>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
