/**
 * @module views/inspector/InspectorView
 * Memory Search (RAG Inspector) view displaying query testing, active World Primer, and match scores.
 */

import { Book, EditorialSubNav, Loader2, Search, type EditorialSubNavProps } from '@/components';
import { VIEW_LABELS } from '@/config';

export interface RagTestResultItem {
    score: number;
    text: string;
    metadata: {
        topic?: string;
        [key: string]: unknown;
    };
}

export interface InspectorViewProps {
    view: string;
    setView: (viewId: string) => void;
    story: EditorialSubNavProps['story'];
    isInspectorMode: boolean;
    selectedSequence: number | null;
    selectedScene: number | null;
    worldPrimer: string | null;
    ragTestQuery: string;
    setRagTestQuery: (query: string) => void;
    ragTestLoading: boolean;
    ragTestResults: RagTestResultItem[];
    handleRagTest: () => void | Promise<void>;
}

export function InspectorView({
    view,
    setView,
    story,
    isInspectorMode,
    selectedSequence,
    selectedScene,
    worldPrimer,
    ragTestQuery,
    setRagTestQuery,
    ragTestLoading,
    ragTestResults,
    handleRagTest
}: InspectorViewProps) {
    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <EditorialSubNav
                activeView={view}
                onSelectView={setView}
                story={story}
                isInspectorMode={isInspectorMode}
                selectedSequence={selectedSequence}
                selectedScene={selectedScene}
            />
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-ink-900 mb-6 flex items-center gap-2.5">
                <Search className="text-gold-ink" /> {VIEW_LABELS.inspector}{' '}
                {isInspectorMode ? '(RAG Inspector)' : ''}
            </h2>

            {/* Test Input */}
            <div className="bg-surface p-6 sm:p-7 rounded-2xl border border-edge shadow-sm">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-500 mb-2 font-mono">
                    Test Query
                </label>
                <div className="flex gap-2">
                    <input
                        className="flex-1 min-w-0 bg-inset border border-edge-strong rounded-xl px-4 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors"
                        placeholder="e.g., 'What acts of magic are illegal?'"
                        value={ragTestQuery}
                        onChange={(e) => setRagTestQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRagTest()}
                    />
                    <button
                        onClick={handleRagTest}
                        disabled={ragTestLoading}
                        className="shrink-0 bg-btn hover:bg-btn-hover text-btn-ink px-6 py-2 rounded-xl font-bold text-xs shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        {ragTestLoading ? <Loader2 className="animate-spin" size={14} /> : 'Search'}
                    </button>
                </div>
            </div>

            {/* World Primer Status */}
            {worldPrimer && (
                <div className="bg-inset border border-edge-strong p-5 rounded-2xl space-y-2">
                    <h3 className="text-xs font-bold text-ink-800 uppercase mb-2 flex items-center gap-2 font-mono">
                        <Book size={14} className="text-gold-ink" /> Active World Primer
                    </h3>
                    <div className="text-xs text-ink-700 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed font-serif">
                        {worldPrimer}
                    </div>
                </div>
            )}

            {/* Results */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold text-ink-400 uppercase tracking-wider font-mono">
                    Retrieval Results
                </h3>
                {ragTestResults.length === 0 ? (
                    <div className="text-center text-ink-400 italic py-12 bg-surface rounded-2xl border border-edge shadow-sm">
                        Run a search to inspect vector matches.
                    </div>
                ) : (
                    ragTestResults.map((res, i) => (
                        <div
                            key={i}
                            className="bg-surface rounded-2xl border border-edge p-5 shadow-sm space-y-3"
                        >
                            <div className="flex justify-between items-start">
                                <div className="text-xs font-bold text-sage-800 bg-sage-tint border border-sage-edge px-2.5 py-0.5 rounded-full font-mono">
                                    Score: {(res.score * 100).toFixed(1)}%
                                </div>
                                <div className="text-xs text-ink-500 font-mono">
                                    Topic: {res.metadata.topic}
                                </div>
                            </div>
                            <p className="text-ink-800 text-xs leading-relaxed font-serif">
                                {res.text}
                            </p>

                            {/* Metadata Debug */}
                            <div className="text-xs text-ink-500 font-mono bg-inset p-2.5 rounded-xl border border-edge-strong">
                                {JSON.stringify(res.metadata)}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
