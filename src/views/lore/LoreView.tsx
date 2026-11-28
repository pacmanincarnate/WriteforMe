/**
 * @module views/lore/LoreView
 * World Lore & Story Archive view: drag-and-drop document ingestion, manual lore facts,
 * RAG index rebuild trigger, search/pagination toolbar, and temporal scoping controls.
 */

import {
    EditorialSubNav,
    Globe,
    LoreCard,
    Plus,
    RefreshCw,
    Search,
    Upload,
    type EditorialSubNavProps,
    type LoreActOption,
    type LoreEntryItem,
    type LoreSceneOption,
    type StudioFormField
} from '@/components';
import { VIEW_LABELS } from '@/config';

import { WorldBuilderPanel, type WorldBuilderPanelProps } from './WorldBuilderPanel';

export interface LoreItemRecord extends LoreEntryItem {
    id?: string;
    related_to?: string[];
    description?: string;
    [key: string]: unknown;
}

export interface LoreStory {
    acts?: LoreActOption[];
    lore?: LoreItemRecord[];
    cast?: unknown[];
    sequences?: Array<{ number?: number }>;
    [key: string]: unknown;
}

export interface LoreOpenFormOptions {
    title: string;
    subtitle?: string;
    submitLabel?: string;
    cancelLabel?: string;
    fields: StudioFormField[];
    onSubmit?: (data: Record<string, string>) => void;
}

const LOREBOOK_ACCEPT = '.json,.lorebook,.png,.charx';

export interface LoreViewProps {
    view: string;
    setView: (viewId: string) => void;
    story: LoreStory;
    setStory: (updaterOrValue: LoreStory | ((prev: LoreStory) => LoreStory)) => void;
    isInspectorMode: boolean;
    selectedSequence: number | null;
    selectedScene: number | null;
    loreSearch: string;
    setLoreSearch: (query: string) => void;
    lorePage: number;
    setLorePage: (nextOrUpdater: number | ((prev: number) => number)) => void;
    lorePageSize: number;
    filteredLore: LoreItemRecord[];
    paginatedLore: LoreItemRecord[];
    totalLorePages: number;
    scenesByAct: Record<number, LoreSceneOption[]>;
    isDraggingLoreTab: boolean;
    setIsDraggingLoreTab: (dragging: boolean) => void;
    ragStatus: string;
    isRebuildingRag: boolean;
    rebuildRagIndex: () => void | Promise<void>;
    handlePostGenLoreImport: (files: File[]) => void | Promise<void>;
    /** Brings in a lorebook from another app. The button is hidden when this is not given. */
    handleLorebookImport?: (file: File) => void | Promise<void>;
    /** Builds a world from a pitch into lore proposals. The panel is hidden when this is not given. */
    buildWorld?: WorldBuilderPanelProps['buildWorld'];
    ingestLore: (item: LoreItemRecord) => Promise<LoreItemRecord | null | undefined>;
    handleDeleteLore: (index: number) => void | Promise<void>;
    openEditModal: (title: string, currentVal: string, onSave: (val: string) => void) => void;
    openFormModal: (opts: LoreOpenFormOptions) => unknown;
    showToast: (msg: string, type?: string) => void;
}

export function LoreView({
    view,
    setView,
    story,
    setStory,
    isInspectorMode,
    selectedSequence,
    selectedScene,
    loreSearch,
    setLoreSearch,
    lorePage,
    setLorePage,
    lorePageSize,
    filteredLore,
    paginatedLore,
    totalLorePages,
    scenesByAct,
    isDraggingLoreTab,
    setIsDraggingLoreTab,
    ragStatus,
    isRebuildingRag,
    rebuildRagIndex,
    handlePostGenLoreImport,
    handleLorebookImport,
    buildWorld,
    ingestLore,
    handleDeleteLore,
    openEditModal,
    openFormModal,
    showToast
}: LoreViewProps) {
    const handleAddFactClick = () => {
        openFormModal({
            title: 'Add World Lore Entry',
            subtitle: 'Document historical facts, world rules, institutional background, or lore.',
            submitLabel: 'Ingest Lore',
            fields: [
                {
                    key: 'topic',
                    label: 'Lore Topic / Document Title',
                    placeholder: 'e.g. The Treaty of 1842, The Gilded Spire',
                    type: 'text',
                    required: true
                },
                {
                    key: 'detail',
                    label: 'Lore Detail / Text Content',
                    placeholder: 'Full lore description, background history, or rules...',
                    type: 'textarea',
                    rows: 4,
                    required: true
                }
            ],
            onSubmit: (data) => {
                if (!data.topic || !data.topic.trim() || !data.detail || !data.detail.trim()) return;
                const topic = data.topic.trim();
                const detail = data.detail.trim();

                const newItem: LoreItemRecord = {
                    topic,
                    detail,
                    valid_from_act: 1,
                    valid_from_scene: 1,
                    related_to: ['Manual Entry'],
                    description: 'User Added Lore'
                };

                ingestLore(newItem).then((processed) => {
                    setStory((prev) => ({
                        ...prev,
                        lore: [...(prev.lore || []), processed || newItem]
                    }));
                    showToast(`Added lore item "${topic}" to RAG`, 'success');
                });
            }
        });
    };

    return (
        <div
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingLoreTab(true);
            }}
            onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingLoreTab(true);
            }}
            onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingLoreTab(false);
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingLoreTab(false);
                const files = Array.from(e.dataTransfer?.files || []);
                if (files.length) handlePostGenLoreImport(files);
            }}
            className={`max-w-7xl mx-auto space-y-6 animate-fade-in pb-24 transition-all rounded-2xl ${
                isDraggingLoreTab ? 'ring-2 ring-gold/40 bg-gold-tint/10 p-2' : ''
            }`}
        >
            <EditorialSubNav
                activeView={view}
                onSelectView={setView}
                story={story as EditorialSubNavProps['story']}
                isInspectorMode={isInspectorMode}
                selectedSequence={selectedSequence}
                selectedScene={selectedScene}
            />
            <div
                className={`bg-surface p-6 sm:p-7 rounded-2xl border transition-all shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4 ${
                    isDraggingLoreTab
                        ? 'border-dashed border-2 border-gold bg-gold-tint/20'
                        : 'border-edge'
                }`}
            >
                <div>
                    <h2 className="text-2xl font-bold font-serif text-ink-900 flex items-center gap-2.5 tracking-tight">
                        <Globe className="text-gold-ink" size={22} /> {VIEW_LABELS.lore}
                        {ragStatus === 'indexing' && (
                            <span className="text-xs font-mono bg-gold-tint border border-gold-edge text-gold-ink px-2.5 py-0.5 rounded-full animate-pulse">
                                Indexing...
                            </span>
                        )}
                        {isDraggingLoreTab && (
                            <span className="text-xs font-mono bg-gold-tint border border-gold-edge text-gold-ink px-2.5 py-0.5 rounded-full animate-bounce">
                                Drop documents here
                            </span>
                        )}
                    </h2>
                    <p className="text-xs text-ink-500 mt-1">
                        Ingest world bibles, dossiers, character bios, and archives (.txt, .md,
                        .docx, .pdf, .epub, .json, .csv) into local RAG vector memory.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <input
                        type="file"
                        id="postGenLoreFileInput"
                        accept=".txt,.md,.markdown,.docx,.pdf,.epub,.json,.csv"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                            if (e.target.files && e.target.files.length) {
                                handlePostGenLoreImport(Array.from(e.target.files));
                                e.target.value = '';
                            }
                        }}
                    />
                    <button
                        onClick={() => document.getElementById('postGenLoreFileInput')?.click()}
                        disabled={ragStatus === 'indexing'}
                        className="text-xs bg-btn hover:bg-btn-hover text-btn-ink font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 active:scale-95 cursor-pointer"
                        title="Upload documents (.txt, .md, .docx, .pdf, .epub, .json, .csv) to chunk and ingest into RAG"
                    >
                        <Upload size={14} /> Import Document
                    </button>
                    {handleLorebookImport && (
                        <>
                            <input
                                type="file"
                                id="lorebookFileInput"
                                accept={LOREBOOK_ACCEPT}
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    if (file) void handleLorebookImport(file);
                                }}
                            />
                            <button
                                onClick={() => document.getElementById('lorebookFileInput')?.click()}
                                disabled={ragStatus === 'indexing'}
                                className="text-xs bg-surface hover:bg-lift border border-edge-strong text-ink-700 font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
                                title="Bring in a lorebook from SillyTavern, NovelAI, Agnai or RisuAI, or the one inside a character card. Each entry becomes a lore item."
                            >
                                <Upload size={14} /> Import Lorebook
                            </button>
                        </>
                    )}
                    <button
                        onClick={handleAddFactClick}
                        disabled={ragStatus === 'indexing'}
                        className="text-xs bg-surface hover:bg-lift border border-edge-strong text-ink-700 font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                    >
                        <Plus size={14} /> Add Fact
                    </button>
                    <button
                        onClick={rebuildRagIndex}
                        disabled={
                            isRebuildingRag ||
                            ragStatus === 'indexing' ||
                            ragStatus === 'indexing_batch'
                        }
                        className="text-xs bg-surface hover:bg-lift border border-edge-strong text-ink-700 font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
                        title="Re-embed all lore items into vector database"
                    >
                        <RefreshCw
                            size={12}
                            className={isRebuildingRag ? 'animate-spin text-gold-ink' : ''}
                        />{' '}
                        Rebuild RAG index
                    </button>
                </div>
            </div>

            {buildWorld && <WorldBuilderPanel buildWorld={buildWorld} showToast={showToast} />}

            {!story.lore || story.lore.length === 0 ? (
                <div className="text-center py-14 border border-dashed border-edge-strong rounded-2xl bg-surface p-8 space-y-4 shadow-sm">
                    <div className="w-14 h-14 rounded-2xl bg-gold-tint border border-gold-edge flex items-center justify-center mx-auto text-gold-ink">
                        <Globe size={28} />
                    </div>
                    <div className="space-y-1.5">
                        <h3 className="text-lg font-bold font-serif text-ink-900">
                            No World Lore Indexed Yet
                        </h3>
                        <p className="text-xs text-ink-500 max-w-md mx-auto leading-relaxed">
                            Upload documents or drop files here (.txt, .md, .docx, .pdf, .epub,
                            .json, .csv) to chunk and index them into semantic vector memory.
                        </p>
                    </div>
                    <div className="pt-2">
                        <button
                            onClick={() =>
                                document.getElementById('postGenLoreFileInput')?.click()
                            }
                            className="text-xs bg-btn hover:bg-btn-hover text-btn-ink font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-sm mx-auto active:scale-95 cursor-pointer"
                        >
                            <Upload size={14} /> Import Lore Document
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Search and Pagination Toolbar */}
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-surface p-4 rounded-xl border border-edge shadow-2xs">
                        <div className="relative w-full sm:w-80">
                            <input
                                type="text"
                                value={loreSearch}
                                onChange={(e) => setLoreSearch(e.target.value)}
                                placeholder="Search lore topics or details..."
                                className="w-full bg-inset border border-edge-strong rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink-900 focus:border-gold outline-none font-mono"
                            />
                            <Search size={13} className="absolute left-2.5 top-2.5 text-ink-400" />
                        </div>

                        <div className="flex items-center gap-3 text-xs font-mono">
                            <span className="text-ink-500">
                                {filteredLore.length} item{filteredLore.length === 1 ? '' : 's'}
                                {loreSearch ? ` matching "${loreSearch}"` : ''}
                            </span>
                            {totalLorePages > 1 && (
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        disabled={lorePage <= 1}
                                        onClick={() => setLorePage((p) => Math.max(1, p - 1))}
                                        className="px-2.5 py-1 rounded bg-inset border border-edge hover:bg-wash disabled:opacity-40 cursor-pointer font-bold"
                                    >
                                        Prev
                                    </button>
                                    <span className="text-ink-700 px-1">
                                        {lorePage} / {totalLorePages}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={lorePage >= totalLorePages}
                                        onClick={() =>
                                            setLorePage((p) => Math.min(totalLorePages, p + 1))
                                        }
                                        className="px-2.5 py-1 rounded bg-inset border border-edge hover:bg-wash disabled:opacity-40 cursor-pointer font-bold"
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Paginated Lore Cards using precomputed scenesByAct */}
                    <div className="grid gap-4">
                        {paginatedLore.map((l, localIdx) => {
                            const globalIdx = (lorePage - 1) * lorePageSize + localIdx;
                            const actNum = l.valid_from_act || 1;
                            return (
                                <LoreCard
                                    key={l.id || `${l.topic}-${globalIdx}`}
                                    lore={l}
                                    index={globalIdx}
                                    acts={story.acts || []}
                                    scenesForAct={scenesByAct[actNum] || []}
                                    onUpdateAct={(idx, newAct) => {
                                        setStory((prev) => {
                                            const newLore = [...(prev.lore || [])];
                                            newLore[idx] = {
                                                ...newLore[idx],
                                                valid_from_act: newAct,
                                                valid_from_scene: 1
                                            };
                                            return { ...prev, lore: newLore };
                                        });
                                    }}
                                    onUpdateScene={(idx, newScene) => {
                                        setStory((prev) => {
                                            const newLore = [...(prev.lore || [])];
                                            newLore[idx] = {
                                                ...newLore[idx],
                                                valid_from_scene: newScene
                                            };
                                            return { ...prev, lore: newLore };
                                        });
                                    }}
                                    onEditTopic={(curTopic) => {
                                        openEditModal(
                                            `Lore: ${curTopic}`,
                                            curTopic || '',
                                            (val) => {
                                                setStory((prev) => {
                                                    const newLore = [...(prev.lore || [])];
                                                    newLore[globalIdx] = {
                                                        ...newLore[globalIdx],
                                                        topic: val
                                                    };
                                                    return { ...prev, lore: newLore };
                                                });
                                            }
                                        );
                                    }}
                                    onEditDetail={(curDetail) => {
                                        openEditModal(
                                            `Lore Detail: ${l.topic}`,
                                            curDetail,
                                            (val) => {
                                                setStory((prev) => {
                                                    const newLore = [...(prev.lore || [])];
                                                    newLore[globalIdx] = {
                                                        ...newLore[globalIdx],
                                                        detail: val
                                                    };
                                                    return { ...prev, lore: newLore };
                                                });
                                            }
                                        );
                                    }}
                                    onDelete={handleDeleteLore}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
