/**
 * @module views/relationships/RelationshipsView
 * Character Relationships & Dynamics matrix view (grid and mobile-friendly list modes)
 * paired with a Directional Dynamics & Evolutionary History inspector panel.
 */

import React from 'react';
import { STORAGE_KEYS, VIEW_LABELS } from '@/config';
import { exportRelationshipMermaid } from '@/services/export';
import {
    Activity,
    EditorialSubNav,
    Heart,
    History,
    Layers,
    Plus,
    Users,
    type EditorialSubNavProps,
    type StudioFormField
} from '@/components';

export interface RelationshipHistoryEntry {
    chapter: string;
    change: string;
}

export interface RelationshipRecord {
    current: string;
    hidden_tension?: string;
    trust_level?: number | string;
    history?: RelationshipHistoryEntry[];
    [key: string]: unknown;
}

export interface SelectedRelationshipState {
    key: string;
    from: string;
    to: string;
    current: string;
    hidden_tension?: string;
    trust_level: number;
    history: RelationshipHistoryEntry[];
}

export interface RelationshipsCastMember {
    id?: string;
    name: string;
    [key: string]: unknown;
}

export interface RelationshipsStory {
    cast?: RelationshipsCastMember[];
    relationships?: Record<string, RelationshipRecord>;
    lore?: unknown[];
    sequences?: Array<{ number?: number }>;
    [key: string]: unknown;
}

export interface RelationshipsOpenFormOptions {
    title: string;
    subtitle?: string;
    submitLabel?: string;
    cancelLabel?: string;
    fields: StudioFormField[];
    onSubmit?: (data: Record<string, string>) => void;
}

export interface RelationshipsRequestConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm?: () => void;
}

export interface RelationshipsViewProps {
    view: string;
    setView: (viewId: string) => void;
    story: RelationshipsStory;
    setStory: (
        updaterOrValue:
            | RelationshipsStory
            | ((prev: RelationshipsStory) => RelationshipsStory)
    ) => void;
    isInspectorMode: boolean;
    selectedSequence: number | null;
    selectedScene: number | null;
    loadedImages: {
        portraits?: Record<string, string | null>;
        [key: string]: unknown;
    };
    matrixView: string;
    setMatrixView: (mode: 'grid' | 'list' | string) => void;
    matrixScroll: { left: boolean; right: boolean };
    matrixScrollRef: React.RefObject<HTMLDivElement>;
    measureMatrixScroll: () => void;
    selectedRel: SelectedRelationshipState | null;
    setSelectedRel: (
        nextOrUpdater:
            | SelectedRelationshipState
            | null
            | ((prev: SelectedRelationshipState | null) => SelectedRelationshipState | null)
    ) => void;
    selectMatrixRelationship: (
        fromChar: RelationshipsCastMember,
        toChar: RelationshipsCastMember
    ) => void;
    openFormModal: (opts: RelationshipsOpenFormOptions) => unknown;
    requestConfirm: (opts: RelationshipsRequestConfirmOptions) => unknown;
    showToast: (msg: string, type?: string) => void;
}

export function RelationshipsView({
    view,
    setView,
    story,
    setStory,
    isInspectorMode,
    selectedSequence,
    selectedScene,
    loadedImages,
    matrixView,
    setMatrixView,
    matrixScroll,
    matrixScrollRef,
    measureMatrixScroll,
    selectedRel,
    setSelectedRel,
    selectMatrixRelationship,
    openFormModal,
    requestConfirm,
    showToast
}: RelationshipsViewProps) {
    const handleEstablishRelationship = () => {
        const castNames = (story.cast || []).map((c) => c.name);
        if (castNames.length < 2) return;
        const defaultFrom = castNames[0];
        const defaultTo = castNames[1];

        openFormModal({
            title: 'Establish Character Dynamic',
            subtitle: 'Define how one character perceives or feels toward another.',
            submitLabel: 'Save Relationship',
            fields: [
                {
                    key: 'from',
                    label: 'From Character',
                    type: 'select',
                    defaultValue: defaultFrom,
                    options: castNames
                },
                {
                    key: 'to',
                    label: 'Toward Character',
                    type: 'select',
                    defaultValue: defaultTo,
                    options: castNames
                },
                {
                    key: 'feeling',
                    label: 'Current Feeling / Dynamic',
                    placeholder:
                        'e.g. Secretly in love, Grudging respect, Paranoid distrust',
                    type: 'text',
                    required: true
                }
            ],
            onSubmit: (data) => {
                const from = data.from;
                const to = data.to;
                const feeling = data.feeling ? data.feeling.trim() : '';
                if (!from || !to || !feeling) return;
                if (from.toLowerCase() === to.toLowerCase()) {
                    showToast('A character cannot have a relationship with themselves.', 'warning');
                    return;
                }

                setStory((prev) => {
                    const newRels = { ...(prev.relationships || {}) };
                    const key = `${from}->${to}`;
                    newRels[key] = {
                        current: feeling,
                        history: [{ chapter: 'Manual', change: `${feeling} (Created manually)` }]
                    };
                    return { ...prev, relationships: newRels };
                });
                showToast(`Established dynamic: ${from} ➔ ${to}`, 'success');
            }
        });
    };

    const handleEditActiveRelationship = () => {
        if (!selectedRel) return;
        openFormModal({
            title: 'Update Dynamic',
            subtitle: `${selectedRel.from} ➔ ${selectedRel.to}`,
            submitLabel: 'Update Feeling',
            fields: [
                {
                    key: 'feeling',
                    label: 'Current Dynamic / Feeling',
                    defaultValue: selectedRel.current || '',
                    placeholder: 'e.g. Grudging respect, Fragile alliance',
                    type: 'text',
                    required: true
                }
            ],
            onSubmit: (data) => {
                const val = data.feeling ? data.feeling.trim() : '';
                if (!val) return;

                const histEntry: RelationshipHistoryEntry = {
                    chapter: 'Manual Edit',
                    change: `${val} (Edited manually)`
                };
                setStory((prev) => {
                    const prevRels = prev.relationships || {};
                    const prevRel = prevRels[selectedRel.key] || { current: '', history: [] };
                    const newRel: RelationshipRecord = {
                        ...prevRel,
                        current: val,
                        history: [...(prevRel.history || []), histEntry]
                    };
                    return {
                        ...prev,
                        relationships: { ...prevRels, [selectedRel.key]: newRel }
                    };
                });
                const baseRel = (story.relationships || {})[selectedRel.key] || {
                    current: '',
                    history: []
                };
                setSelectedRel((prevSel) =>
                    prevSel
                        ? {
                              ...prevSel,
                              current: val,
                              history: [...(baseRel.history || []), histEntry]
                          }
                        : null
                );
                showToast('Relationship dynamic updated.', 'success');
            }
        });
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-24">
            <EditorialSubNav
                activeView={view}
                onSelectView={setView}
                story={story as EditorialSubNavProps['story']}
                isInspectorMode={isInspectorMode}
                selectedSequence={selectedSequence}
                selectedScene={selectedScene}
            />
            <div className="bg-surface p-6 sm:p-7 rounded-2xl border border-edge shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold font-serif text-ink-900 flex items-center gap-2.5 tracking-tight">
                        <Heart className="text-rose-500 fill-rose-500/20" size={22} />{' '}
                        {VIEW_LABELS.relationships}
                    </h2>
                </div>
                {story.cast && story.cast.length >= 2 && (
                    <button
                        onClick={handleEstablishRelationship}
                        className="text-xs bg-btn hover:bg-btn-hover text-btn-ink font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm self-start sm:self-auto active:scale-95"
                    >
                        <Plus size={14} /> Establish Relationship
                    </button>
                )}
            </div>

            {!story.cast || story.cast.length < 2 ? (
                <div className="text-center py-16 bg-surface border border-edge rounded-2xl max-w-2xl mx-auto space-y-4 shadow-sm p-8">
                    <div className="w-16 h-16 bg-inset rounded-2xl flex items-center justify-center mx-auto border border-edge-strong text-ink-400">
                        <Users size={32} />
                    </div>
                    <div className="space-y-1">
                        <h3 className="font-bold font-serif text-lg text-ink-900">
                            Roster Requirements
                        </h3>
                        <p className="text-xs text-ink-500 max-w-md mx-auto leading-relaxed">
                            You need at least 2 characters in your story&apos;s cast to establish
                            relationships and build the matrix. Add characters under the &quot;Cast
                            &amp; Roster&quot; tab first.
                        </p>
                    </div>
                    <button
                        onClick={() => setView('cast')}
                        className="text-xs bg-surface hover:bg-lift text-ink-700 font-bold px-4 py-2.5 rounded-xl transition-colors border border-edge-strong shadow-2xs"
                    >
                        Go to Cast Roster
                    </button>
                </div>
            ) : (
                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Matrix Grid Card (Left 2 cols) */}
                    <div className="lg:col-span-2 min-w-0 bg-surface border border-edge rounded-2xl overflow-hidden shadow-sm flex flex-col">
                        <div className="p-5 border-b border-edge bg-inset flex flex-wrap items-center justify-between gap-3">
                            <h3 className="font-bold text-ink-800 flex items-center gap-2 text-xs uppercase tracking-wider font-mono">
                                <Layers size={15} className="text-gold-ink" /> Directional{' '}
                                {matrixView === 'grid' ? 'Grid' : 'List'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => {
                                    const diagram = exportRelationshipMermaid(story);
                                    showToast(
                                        diagram
                                            ? 'Saved the relationship web as a Mermaid diagram (.mmd).'
                                            : 'No relationships to draw yet.',
                                        diagram ? 'success' : 'info'
                                    );
                                }}
                                className="text-xs px-2.5 py-1.5 rounded-lg border border-edge-strong text-ink-700 hover:bg-wash cursor-pointer"
                                title="Save the relationship web as a Mermaid flowchart, to paste into notes or a wiki"
                            >
                                Export Mermaid
                            </button>
                            <div
                                className="inline-flex gap-1 p-1 rounded-lg border border-edge-strong bg-surface"
                                role="group"
                                aria-label="Relationship view"
                            >
                                {(['grid', 'list'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        aria-pressed={matrixView === mode}
                                        onClick={() => {
                                            setMatrixView(mode);
                                            try {
                                                localStorage.setItem(
                                                    STORAGE_KEYS.matrixView,
                                                    mode
                                                );
                                            } catch {
                                                /* Keep the view toggle usable when storage is unavailable. */
                                            }
                                        }}
                                        className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                                            matrixView === mode
                                                ? 'bg-gold-tint text-gold-ink'
                                                : 'text-ink-500 hover:bg-inset'
                                        }`}
                                    >
                                        {mode === 'grid' ? 'Grid' : 'List'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {matrixView === 'grid' ? (
                            <React.Fragment>
                                <div className="rel-matrix">
                                    <div
                                        ref={matrixScrollRef}
                                        onScroll={measureMatrixScroll}
                                        className="rel-matrix-scroll custom-scrollbar"
                                        tabIndex={0}
                                        role="region"
                                        aria-label="Character relationship grid"
                                        aria-describedby={
                                            matrixScroll.left || matrixScroll.right
                                                ? 'matrix-scroll-hint'
                                                : undefined
                                        }
                                    >
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th
                                                        scope="col"
                                                        className="p-3 text-xs font-bold text-ink-500 uppercase border-b border-edge-strong text-left bg-inset font-mono"
                                                    >
                                                        Source ➔ Target
                                                    </th>
                                                    {story.cast.map((c) => (
                                                        <th
                                                            key={c.name}
                                                            scope="col"
                                                            className="p-3 text-[11px] font-bold text-ink-700 uppercase border-b border-edge-strong text-center bg-inset font-serif"
                                                        >
                                                            <div className="flex flex-col items-center gap-2">
                                                                <span className="w-8 h-8 rounded-lg overflow-hidden bg-gold-tint border border-gold-edge flex items-center justify-center text-gold-ink shrink-0">
                                                                    {c.id &&
                                                                    loadedImages.portraits?.[
                                                                        c.id
                                                                    ] ? (
                                                                        <img
                                                                            src={
                                                                                loadedImages
                                                                                    .portraits[
                                                                                    c.id
                                                                                ] || ''
                                                                            }
                                                                            alt=""
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                    ) : (
                                                                        c.name
                                                                            ?.charAt(0)
                                                                            .toUpperCase()
                                                                    )}
                                                                </span>
                                                                <span
                                                                    className="line-clamp-2"
                                                                    title={c.name}
                                                                >
                                                                    {c.name}
                                                                </span>
                                                            </div>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {story.cast.map((fromChar) => (
                                                    <tr
                                                        key={fromChar.name}
                                                        className="border-b border-edge-soft hover:bg-inset/60 transition-colors"
                                                    >
                                                        <th
                                                            scope="row"
                                                            className="p-3 font-bold text-left text-xs text-ink-900 bg-inset border-b border-edge-strong font-serif"
                                                        >
                                                            <span
                                                                className="line-clamp-2"
                                                                title={fromChar.name}
                                                            >
                                                                {fromChar.name}
                                                            </span>
                                                        </th>
                                                        {story.cast?.map((toChar) => {
                                                            const isSelf =
                                                                fromChar.name === toChar.name;
                                                            const relKey = `${fromChar.name}->${toChar.name}`;
                                                            const rel =
                                                                story.relationships?.[relKey];

                                                            if (isSelf) {
                                                                return (
                                                                    <td
                                                                        key={toChar.name}
                                                                        className="p-3 text-center bg-inset border-b border-edge text-xs text-ink-500 font-mono italic select-none"
                                                                    >
                                                                        Self
                                                                    </td>
                                                                );
                                                            }

                                                            return (
                                                                <td
                                                                    key={toChar.name}
                                                                    onClick={() =>
                                                                        selectMatrixRelationship(
                                                                            fromChar,
                                                                            toChar
                                                                        )
                                                                    }
                                                                    onKeyDown={(event) => {
                                                                        if (
                                                                            event.target ===
                                                                                event.currentTarget &&
                                                                            (event.key ===
                                                                                'Enter' ||
                                                                                event.key === ' ')
                                                                        ) {
                                                                            event.preventDefault();
                                                                            selectMatrixRelationship(
                                                                                fromChar,
                                                                                toChar
                                                                            );
                                                                        }
                                                                    }}
                                                                    tabIndex={
                                                                        rel?.current ? 0 : undefined
                                                                    }
                                                                    title={
                                                                        rel?.current ||
                                                                        `Set arc: ${fromChar.name} to ${toChar.name}`
                                                                    }
                                                                    className={`p-3 text-center text-xs cursor-pointer border-b border-edge transition-colors hover:bg-inset ${
                                                                        rel?.current
                                                                            ? 'text-ink-900 bg-gold-tint font-medium'
                                                                            : 'text-ink-400 hover:text-ink-700 italic'
                                                                    }`}
                                                                >
                                                                    {rel?.current ? (
                                                                        <div className="flex flex-col items-center gap-1 group/cell">
                                                                            <span
                                                                                className="line-clamp-2 text-[11px] font-medium text-ink-800"
                                                                                title={rel.current}
                                                                            >
                                                                                {rel.current}
                                                                            </span>
                                                                            <Heart
                                                                                size={10}
                                                                                className="text-gold-ink opacity-40 group-hover/cell:opacity-100 transition-opacity"
                                                                            />
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            className="px-2 py-1 rounded-lg text-xs font-medium text-ink-500 hover:text-gold-ink hover:bg-wash transition-colors"
                                                                            onClick={(event) => {
                                                                                event.stopPropagation();
                                                                                selectMatrixRelationship(
                                                                                    fromChar,
                                                                                    toChar
                                                                                );
                                                                            }}
                                                                        >
                                                                            + Set arc
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div
                                        aria-hidden="true"
                                        className="rel-matrix-fade rel-matrix-fade-left"
                                        hidden={!matrixScroll.left}
                                    />
                                    <div
                                        aria-hidden="true"
                                        className="rel-matrix-fade rel-matrix-fade-right"
                                        hidden={!matrixScroll.right}
                                    />
                                </div>
                                {(matrixScroll.left || matrixScroll.right) && (
                                    <p
                                        id="matrix-scroll-hint"
                                        className="px-5 py-2 text-xs text-ink-400"
                                    >
                                        Scroll sideways to see more characters
                                    </p>
                                )}
                            </React.Fragment>
                        ) : (
                            <div className="p-5 space-y-5">
                                {story.cast.map((fromChar) => (
                                    <section key={fromChar.name} className="space-y-2">
                                        <h4 className="text-sm font-bold font-serif text-ink-900 break-words">
                                            {fromChar.name}{' '}
                                            <span className="text-ink-400">➔</span>
                                        </h4>
                                        <div className="border border-edge rounded-xl overflow-hidden divide-y divide-edge">
                                            {story.cast
                                                ?.filter((toChar) => toChar.name !== fromChar.name)
                                                .map((toChar) => {
                                                    const rel =
                                                        story.relationships?.[
                                                            `${fromChar.name}->${toChar.name}`
                                                        ];
                                                    const trust = Math.min(
                                                        10,
                                                        Math.max(
                                                            1,
                                                            parseInt(
                                                                String(rel?.trust_level ?? ''),
                                                                10
                                                            ) || 5
                                                        )
                                                    );
                                                    return (
                                                        <div
                                                            key={toChar.name}
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() =>
                                                                selectMatrixRelationship(
                                                                    fromChar,
                                                                    toChar
                                                                )
                                                            }
                                                            onKeyDown={(event) => {
                                                                if (
                                                                    event.target ===
                                                                        event.currentTarget &&
                                                                    (event.key === 'Enter' ||
                                                                        event.key === ' ')
                                                                ) {
                                                                    event.preventDefault();
                                                                    selectMatrixRelationship(
                                                                        fromChar,
                                                                        toChar
                                                                    );
                                                                }
                                                            }}
                                                            aria-label={`${fromChar.name} to ${toChar.name}: ${rel?.current || 'Set arc'}`}
                                                            className="flex flex-wrap items-center gap-3 p-3 cursor-pointer hover:bg-inset focus-visible:bg-inset text-left"
                                                        >
                                                            <span className="w-10 h-10 rounded-xl bg-gold-tint border border-gold-edge flex items-center justify-center text-gold-ink font-serif font-bold overflow-hidden shrink-0">
                                                                {toChar.id &&
                                                                loadedImages.portraits?.[
                                                                    toChar.id
                                                                ] ? (
                                                                    <img
                                                                        src={
                                                                            loadedImages
                                                                                .portraits[
                                                                                toChar.id
                                                                            ] || ''
                                                                        }
                                                                        alt=""
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    toChar.name
                                                                        ?.charAt(0)
                                                                        .toUpperCase()
                                                                )}
                                                            </span>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-xs font-bold text-ink-900 break-words">
                                                                    {toChar.name}
                                                                </div>
                                                                <p
                                                                    className="text-xs text-ink-600 break-words"
                                                                    title={rel?.current || ''}
                                                                >
                                                                    {rel?.current ||
                                                                        'No current dynamic defined.'}
                                                                </p>
                                                            </div>
                                                            <span
                                                                role="meter"
                                                                aria-label="Trust level"
                                                                aria-valuemin={0}
                                                                aria-valuemax={10}
                                                                aria-valuenow={
                                                                    rel?.current ? trust : 0
                                                                }
                                                                aria-valuetext={
                                                                    rel?.current
                                                                        ? `${trust} out of 10`
                                                                        : 'Not defined'
                                                                }
                                                                title={
                                                                    rel?.current
                                                                        ? `Trust: ${trust}/10`
                                                                        : 'Trust not defined'
                                                                }
                                                                className="flex items-center gap-1 shrink-0"
                                                            >
                                                                {[1, 2, 3, 4, 5].map((dot) => (
                                                                    <span
                                                                        key={dot}
                                                                        aria-hidden="true"
                                                                        className={`w-2 h-2 rounded-full border ${
                                                                            rel?.current &&
                                                                            dot <=
                                                                                Math.ceil(trust / 2)
                                                                                ? 'bg-gold-tint border-gold-edge'
                                                                                : 'bg-surface border-edge-strong'
                                                                        }`}
                                                                    />
                                                                ))}
                                                            </span>
                                                            {!rel?.current && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        selectMatrixRelationship(
                                                                            fromChar,
                                                                            toChar
                                                                        );
                                                                    }}
                                                                    className="px-3 py-1.5 min-h-[36px] rounded-lg border border-gold-edge bg-gold-tint text-gold-ink text-xs font-semibold shrink-0"
                                                                >
                                                                    Set arc
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        )}
                        <div className="p-4 border-t border-edge-strong bg-inset flex gap-4 text-xs text-ink-500 font-mono">
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded bg-gold-tint border border-gold-edge inline-block" />{' '}
                                Established
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded bg-surface border border-edge-strong inline-block" />{' '}
                                Not Defined
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded bg-mist-100 border border-edge-strong inline-block" />{' '}
                                Diagonal (Self)
                            </div>
                        </div>
                    </div>

                    {/* Details & Evolution Panel (Right Col) */}
                    <div className="bg-surface border border-edge rounded-2xl shadow-sm flex flex-col overflow-hidden">
                        <div className="p-5 border-b border-edge bg-inset">
                            <h3 className="font-bold text-ink-800 flex items-center gap-2 text-xs uppercase tracking-wider font-mono">
                                <Activity size={15} className="text-gold-ink" /> Dynamics Inspector
                            </h3>
                        </div>

                        {!selectedRel ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-ink-400 italic space-y-3">
                                <Heart size={24} className="text-ink-300 animate-pulse" />
                                <p className="text-xs max-w-[200px]">
                                    Click any intersection cell in the matrix grid to inspect
                                    directional evolution.
                                </p>
                            </div>
                        ) : (
                            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                                <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-gold-ink uppercase font-mono">
                                            Current Feeling
                                        </span>
                                        <button
                                            onClick={handleEditActiveRelationship}
                                            className="text-xs bg-surface hover:bg-lift border border-edge-strong text-ink-700 font-bold px-3 py-1.5 rounded-lg transition-colors shadow-2xs"
                                        >
                                            Edit Active
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold font-serif text-ink-900">
                                            {selectedRel.from}
                                        </span>
                                        <span className="text-xs text-gold-ink font-mono">➔</span>
                                        <span className="text-xs font-bold font-serif text-ink-900">
                                            {selectedRel.to}
                                        </span>
                                    </div>
                                    <div className="text-sm font-serif italic text-ink-800 border-l-2 border-l-gold pl-3 py-1 bg-surface rounded-r border border-edge-strong">
                                        {selectedRel.current || 'No current dynamic defined.'}
                                    </div>
                                    {selectedRel.hidden_tension && (
                                        <div className="text-xs text-ink-600 mt-2">
                                            <span className="font-bold text-ink-400 uppercase font-mono text-xs block mb-0.5">
                                                Hidden Tension
                                            </span>
                                            <span className="italic leading-normal">
                                                {selectedRel.hidden_tension}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-edge-strong">
                                        <span className="font-bold text-ink-400 uppercase font-mono text-xs">
                                            Trust Level:
                                        </span>
                                        <span className="text-xs font-mono font-bold text-blush-600">
                                            {'★'.repeat(
                                                Math.min(10, Math.max(1, selectedRel.trust_level))
                                            )}{' '}
                                            ({selectedRel.trust_level}/10)
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between border-b border-edge-strong pb-2">
                                        <h4 className="text-xs font-bold text-ink-500 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                                            <History size={13} className="text-gold-ink" />{' '}
                                            Evolutionary History
                                        </h4>
                                        <button
                                            onClick={() => {
                                                requestConfirm({
                                                    title: 'Clear Milestone Logs?',
                                                    message:
                                                        'Clear all milestone logs for this relationship? The current dynamic value will remain.',
                                                    confirmLabel: 'Clear Logs',
                                                    danger: false,
                                                    onConfirm: () => {
                                                        setStory((prev) => {
                                                            const prevRels =
                                                                prev.relationships || {};
                                                            const prevRel =
                                                                prevRels[selectedRel.key];
                                                            if (!prevRel) return prev;
                                                            return {
                                                                ...prev,
                                                                relationships: {
                                                                    ...prevRels,
                                                                    [selectedRel.key]: {
                                                                        ...prevRel,
                                                                        history: []
                                                                    }
                                                                }
                                                            };
                                                        });
                                                        setSelectedRel((prevSel) =>
                                                            prevSel
                                                                ? { ...prevSel, history: [] }
                                                                : null
                                                        );
                                                    }
                                                });
                                            }}
                                            className="text-xs text-ink-400 hover:text-blush-600 font-bold uppercase transition-colors"
                                        >
                                            Reset Logs
                                        </button>
                                    </div>

                                    {selectedRel.history.length === 0 ? (
                                        <p className="text-xs text-ink-400 italic py-4 text-center">
                                            No historical milestones recorded yet.
                                        </p>
                                    ) : (
                                        <div className="relative border-l border-edge-strong ml-2.5 pl-4 space-y-5 py-2">
                                            {selectedRel.history.map((hist, hIdx) => (
                                                <div key={hIdx} className="relative">
                                                    <span className="absolute -left-[21.5px] top-1.5 w-2 h-2 rounded-full bg-surface border-2 border-gold" />
                                                    <div className="space-y-1">
                                                        <div className="text-xs font-mono font-bold text-ink-400 uppercase">
                                                            {hist.chapter}
                                                        </div>
                                                        <div className="text-xs text-ink-700 leading-relaxed font-serif">
                                                            {hist.change}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
