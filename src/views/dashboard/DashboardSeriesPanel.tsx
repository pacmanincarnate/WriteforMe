/**
 * @module views/dashboard/DashboardSeriesPanel
 * Series Plan card of the Story Overview. Shown for a story that is part of a series: the rolling
 * series plan, the board of threads that run across books, ending contract warnings, and the
 * "Start next book" action. For a standalone story with drafted prose it shrinks to one line that
 * offers to start a sequel.
 */

import { Book, EditButton, GitBranch, Layers, Plus, Trash2 } from '@/components';
import {
    describeViolation,
    getCurrentBookPlan,
    getNextBookPlan,
    hasDraftedProse,
    isSeriesStory,
    isThreadOpen,
    nextSeriesThreadId
} from '@/domain/series';
import type { BookPlan, OpenThread, OpenThreadStatus, SeriesInfo, SeriesPlan, Story, ThreadIntent } from '@/types';
import type { DashboardOpenFormOptions, DashboardRequestConfirmOptions, DashboardStory } from './types';

export interface StartNextBookFormInput {
    title?: string;
    concept: string;
    seriesTitle?: string;
}

export interface DashboardSeriesPanelProps {
    story: DashboardStory;
    setStory: (updaterOrValue: DashboardStory | ((prev: DashboardStory) => DashboardStory)) => void;
    loading: boolean;
    startNextBook?: (input: StartNextBookFormInput) => void | Promise<unknown>;
    openEditModal: (title: string, initialVal: string, onSave: (val: string) => void) => void;
    openFormModal: (opts: DashboardOpenFormOptions) => unknown;
    requestConfirm: (opts: DashboardRequestConfirmOptions) => unknown;
}

const STATUS_OPTIONS: OpenThreadStatus[] = ['open', 'advanced', 'resolved', 'abandoned'];
const INTENT_OPTIONS: ThreadIntent[] = ['introduce', 'advance', 'complicate', 'pay_off', 'rest', 'defer'];
const INTENT_LABELS: Record<ThreadIntent, string> = {
    introduce: 'Introduce',
    advance: 'Advance',
    complicate: 'Complicate',
    pay_off: 'Pay off in this book',
    rest: 'Rest',
    defer: 'Keep open for later'
};
const SELECT_CLASS =
    'bg-surface border border-edge-strong rounded-lg px-2 py-1 text-xs text-ink-700 focus:border-gold outline-none cursor-pointer';

function seriesOf(story: DashboardStory): SeriesInfo | null {
    return isSeriesStory(story as Partial<Story>) ? (story.series as SeriesInfo) : null;
}

export function DashboardSeriesPanel({
    story,
    setStory,
    loading,
    startNextBook,
    openEditModal,
    openFormModal,
    requestConfirm
}: DashboardSeriesPanelProps) {
    const series = seriesOf(story);
    const drafted = hasDraftedProse(story as Partial<Story>);

    const askForNextBook = () => {
        if (!startNextBook) return;
        const bookNumber = (series?.book_number || 1) + 1;
        openFormModal({
            title: `Start Book ${bookNumber}`,
            subtitle:
                'The next book keeps the cast, their voices, the world and every open thread. It gets its own story arc.',
            submitLabel: `Create Book ${bookNumber}`,
            fields: [
                ...(series
                    ? []
                    : [
                          {
                              key: 'seriesTitle',
                              label: 'Series title',
                              placeholder: 'Optional. Defaults to the title of this book.'
                          }
                      ]),
                { key: 'title', label: 'Title of the next book', placeholder: 'Optional' },
                {
                    key: 'concept',
                    label: 'What is the next book about?',
                    placeholder: 'A few sentences. Name the lead if it should change.',
                    type: 'textarea',
                    rows: 5,
                    required: true
                }
            ],
            onSubmit: (data) => {
                const concept = (data.concept || '').trim();
                if (!concept) return;
                void startNextBook({ title: data.title, concept, seriesTitle: data.seriesTitle });
            }
        });
    };

    if (!series) {
        if (!drafted || !startNextBook) return null;
        return (
            <div className="bg-surface p-5 sm:p-6 rounded-2xl border border-edge shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-ink-600 flex items-center gap-2">
                    <Book size={15} className="text-gold-ink" />
                    <span>Continue this story as a series, with the same cast and world.</span>
                </div>
                <button
                    type="button"
                    disabled={loading}
                    onClick={askForNextBook}
                    className="px-3.5 py-2 rounded-xl bg-gold text-white text-xs font-bold disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                    Start a sequel
                </button>
            </div>
        );
    }

    const plan = series.plan;
    const threads = (Array.isArray(story.open_threads) ? story.open_threads : []) as OpenThread[];
    const currentBook = getCurrentBookPlan(story as Partial<Story>);
    const nextBook = getNextBookPlan(story as Partial<Story>);
    const violations = series.contract_violations || [];
    const openCount = threads.filter(isThreadOpen).length;

    const updateSeries = (fn: (s: SeriesInfo) => SeriesInfo) =>
        setStory((prev) => {
            const current = seriesOf(prev);
            return current ? { ...prev, series: fn(current) } : prev;
        });
    const updatePlan = (fn: (p: SeriesPlan) => SeriesPlan) =>
        updateSeries((s) => (s.plan ? { ...s, plan: fn(s.plan) } : s));
    const updateBook = (bookNumber: number, patch: Partial<BookPlan>) =>
        updatePlan((p) => ({
            ...p,
            books: p.books.map((b) => (b.book_number === bookNumber ? { ...b, ...patch } : b))
        }));
    const updateThread = (id: string, patch: Partial<OpenThread>) =>
        setStory((prev) => ({
            ...prev,
            open_threads: ((Array.isArray(prev.open_threads) ? prev.open_threads : []) as OpenThread[]).map(
                (t) => (t.id === id ? { ...t, ...patch } : t)
            )
        }));

    const planField = (label: string, value: string, onSave: (val: string) => void) => (
        <div className="p-4 bg-inset rounded-xl border border-edge-strong space-y-1.5">
            <div className="flex justify-between items-center">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-ink-500">
                    {label}
                </span>
                <EditButton title={label} value={value} onSave={() => openEditModal(label, value, onSave)} />
            </div>
            <div className="text-xs sm:text-sm text-ink-700 leading-relaxed font-serif whitespace-pre-wrap">
                {value || <span className="text-ink-400 italic">Not set yet.</span>}
            </div>
        </div>
    );

    const bookFields = (book: BookPlan, heading: string) => (
        <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-ink-800 font-mono uppercase tracking-wider">
                {heading}
                <span className="ml-2 font-normal normal-case text-ink-400">{book.role.replace('_', ' ')}</span>
            </h4>
            <div className="grid gap-2.5 sm:grid-cols-2">
                {planField(`Book ${book.book_number}: question`, book.book_question, (val) =>
                    updateBook(book.book_number, { book_question: val })
                )}
                {planField(`Book ${book.book_number}: stakes`, book.stakes_scope, (val) =>
                    updateBook(book.book_number, { stakes_scope: val })
                )}
            </div>
            {planField(`Book ${book.book_number}: where things stand on the last page`, book.handoff_state, (val) =>
                updateBook(book.book_number, { handoff_state: val })
            )}
        </div>
    );

    return (
        <div className="bg-surface p-6 sm:p-8 rounded-2xl border border-edge shadow-sm space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
                <h3 className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono flex items-center gap-2">
                    <Layers size={15} /> Series Plan
                    <span className="px-2 py-0.5 rounded bg-mist-100 text-ink-600 normal-case tracking-normal">
                        Book {series.book_number}
                    </span>
                </h3>
                {startNextBook && (
                    <button
                        type="button"
                        disabled={loading || !drafted}
                        title={drafted ? '' : 'Write this book first. The next book starts from where it ends.'}
                        onClick={askForNextBook}
                        className="px-3.5 py-2 rounded-xl bg-gold text-white text-xs font-bold disabled:opacity-50 hover:opacity-90 transition-opacity"
                    >
                        Start Book {series.book_number + 1}
                    </button>
                )}
            </div>

            {planField('Series title', series.title, (val) =>
                updateSeries((s) => ({ ...s, title: val.trim() || s.title }))
            )}

            {violations.length > 0 && (
                <div className="p-4 rounded-xl border border-ember-edge bg-ember-tint text-ember-900 space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold font-mono uppercase tracking-wider">
                            Ending contract warnings ({violations.length})
                        </span>
                        <button
                            type="button"
                            className="text-xs underline"
                            onClick={() => updateSeries((s) => ({ ...s, contract_violations: [] }))}
                        >
                            Clear
                        </button>
                    </div>
                    <ul className="text-xs space-y-1 list-disc pl-4">
                        {violations.map((v, i) => (
                            <li key={`${v.rule}-${v.subject}-${i}`}>{describeViolation(v)}</li>
                        ))}
                    </ul>
                </div>
            )}

            {plan ? (
                <div className="space-y-5">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                        {planField('Series question', plan.series_question, (val) =>
                            updatePlan((p) => ({ ...p, series_question: val }))
                        )}
                        {planField('Series theme', plan.series_thematic_argument, (val) =>
                            updatePlan((p) => ({ ...p, series_thematic_argument: val }))
                        )}
                    </div>
                    {planField('Where the series is heading', plan.endgame_note, (val) =>
                        updatePlan((p) => ({ ...p, endgame_note: val }))
                    )}
                    {plan.long_arcs.length > 0 && (
                        <div className="p-4 bg-inset rounded-xl border border-edge-strong space-y-2">
                            <span className="text-xs font-bold font-mono uppercase tracking-wider text-ink-500">
                                Long character arcs
                            </span>
                            {plan.long_arcs.map((arc) => (
                                <div key={arc.char_name} className="text-xs sm:text-sm text-ink-700 font-serif">
                                    <span className="font-bold">{arc.char_name}:</span> from &ldquo;{arc.lie}&rdquo; to
                                    &ldquo;{arc.truth}&rdquo;
                                </div>
                            ))}
                        </div>
                    )}
                    {currentBook && bookFields(currentBook, `This book (Book ${currentBook.book_number})`)}
                    {nextBook && bookFields(nextBook, `Next book sketch (Book ${nextBook.book_number})`)}
                    {plan.secrets.length > 0 && (
                        <div className="p-4 bg-inset rounded-xl border border-edge-strong space-y-3">
                            <span className="text-xs font-bold font-mono uppercase tracking-wider text-ink-500">
                                Series secrets ({plan.secrets.length})
                            </span>
                            {plan.secrets.map((sec) => (
                                <div key={sec.id} className="space-y-1">
                                    <div className="text-sm font-bold font-serif text-ink-900">{sec.title}</div>
                                    <ol className="text-xs text-ink-700 space-y-1 list-decimal pl-4">
                                        {sec.layers.map((layer) => (
                                            <li key={layer.layer}>
                                                <span className="font-mono text-ink-500">
                                                    Book {layer.reveal_book},{' '}
                                                    {layer.status === 'revealed' ? 'revealed' : 'hidden'}:
                                                </span>{' '}
                                                {layer.truth}
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-xs text-ink-500">
                    The series plan is written together with the story arc. It appears here once the
                    story bible has been generated.
                </p>
            )}

            {series.previous_books.length > 0 && (
                <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-ink-800 font-mono uppercase tracking-wider">
                        Earlier books
                    </h4>
                    {series.previous_books.map((b) => (
                        <details key={b.book_number} className="p-4 bg-inset rounded-xl border border-edge-strong">
                            <summary className="text-sm font-serif font-bold text-ink-900 cursor-pointer">
                                Book {b.book_number}: {b.title}
                            </summary>
                            <div className="mt-2 text-xs sm:text-sm text-ink-700 leading-relaxed font-serif whitespace-pre-wrap">
                                {b.recap}
                            </div>
                        </details>
                    ))}
                </div>
            )}

            <div className="space-y-3.5">
                <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-ink-800 font-mono uppercase tracking-wider flex items-center gap-2">
                        <GitBranch size={14} /> Series threads ({openCount} open)
                    </h4>
                    <button
                        type="button"
                        className="text-xs font-bold text-gold-ink flex items-center gap-1 hover:underline"
                        onClick={() =>
                            openFormModal({
                                title: 'Add a series thread',
                                subtitle: 'A question or promise that runs across more than one book.',
                                submitLabel: 'Add thread',
                                fields: [
                                    { key: 'title', label: 'Short name', required: true },
                                    {
                                        key: 'promise',
                                        label: 'What does the reader expect to see answered?',
                                        type: 'textarea',
                                        rows: 3,
                                        required: true
                                    }
                                ],
                                onSubmit: (data) => {
                                    const title = (data.title || '').trim();
                                    if (!title) return;
                                    setStory((prev) => {
                                        const list = (
                                            Array.isArray(prev.open_threads) ? prev.open_threads : []
                                        ) as OpenThread[];
                                        const added: OpenThread = {
                                            id: nextSeriesThreadId(list),
                                            title,
                                            description: (data.promise || '').trim(),
                                            promise: (data.promise || '').trim(),
                                            status: 'open',
                                            origin_book: series.book_number,
                                            intent: 'introduce',
                                            source: 'user',
                                            touches: []
                                        };
                                        return { ...prev, open_threads: [...list, added] };
                                    });
                                }
                            })
                        }
                    >
                        <Plus size={13} /> Add thread
                    </button>
                </div>
                {threads.length === 0 && (
                    <p className="text-xs text-ink-500">
                        No series threads yet. The series plan opens the first ones, and the model may
                        open more while it writes.
                    </p>
                )}
                {threads.map((t) => {
                    const lastTouch = (t.touches || []).slice(-1)[0];
                    return (
                        <div
                            key={t.id}
                            className={`p-4 sm:p-5 bg-inset rounded-xl border border-edge-strong space-y-2.5 ${isThreadOpen(t) ? '' : 'opacity-60'}`}
                        >
                            <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-edge-strong">
                                <div className="flex flex-wrap items-center gap-2 font-bold font-serif text-ink-900 text-sm">
                                    <span>{t.title}</span>
                                    <span className="text-xs font-mono text-ink-400 font-bold px-1.5 py-0.5 rounded bg-mist-100">
                                        {t.id}
                                    </span>
                                    <span className="text-xs font-mono font-normal text-ink-500">
                                        from Book {t.origin_book}
                                    </span>
                                    {t.source === 'model' && (
                                        <span className="text-xs font-mono font-normal px-1.5 py-0.5 rounded bg-mist-100 text-ink-600">
                                            opened by the model
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <EditButton
                                        title={`Series thread: ${t.title}`}
                                        value={t.promise || t.description}
                                        onSave={() =>
                                            openEditModal(
                                                `Series thread: ${t.title}`,
                                                t.promise || t.description,
                                                (val) => updateThread(t.id, { promise: val, description: val })
                                            )
                                        }
                                    />
                                    <button
                                        type="button"
                                        title="Remove this thread"
                                        className="text-ink-400 hover:text-rose-600 transition-colors"
                                        onClick={() =>
                                            requestConfirm({
                                                title: 'Remove this series thread?',
                                                message: `"${t.title}" will no longer be tracked or planned into later books.`,
                                                confirmLabel: 'Remove',
                                                danger: true,
                                                onConfirm: () =>
                                                    setStory((prev) => ({
                                                        ...prev,
                                                        open_threads: (
                                                            (Array.isArray(prev.open_threads)
                                                                ? prev.open_threads
                                                                : []) as OpenThread[]
                                                        ).filter((x) => x.id !== t.id)
                                                    }))
                                            })
                                        }
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="text-xs sm:text-sm text-ink-700 leading-relaxed font-serif">
                                {t.promise || t.description}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
                                <label className="flex items-center gap-1.5">
                                    Status
                                    <select
                                        className={SELECT_CLASS}
                                        value={t.status}
                                        onChange={(e) =>
                                            updateThread(t.id, { status: e.target.value as OpenThreadStatus })
                                        }
                                    >
                                        {STATUS_OPTIONS.map((s) => (
                                            <option key={s} value={s}>
                                                {s}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex items-center gap-1.5">
                                    In this book
                                    <select
                                        className={SELECT_CLASS}
                                        value={t.intent || 'advance'}
                                        onChange={(e) =>
                                            updateThread(t.id, { intent: e.target.value as ThreadIntent })
                                        }
                                    >
                                        {INTENT_OPTIONS.map((intent) => (
                                            <option key={intent} value={intent}>
                                                {INTENT_LABELS[intent]}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                {(t.owners || []).length > 0 && <span>Carried by {(t.owners || []).join(', ')}</span>}
                            </div>
                            {lastTouch && (
                                <div className="text-xs text-ink-500">
                                    Last moved in Book {lastTouch.book}, scene {lastTouch.scene}: {lastTouch.note}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
