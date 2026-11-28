/**
 * @module views/setup/SetupView
 * New Story Setup screen: title, manuscript format (Novel vs Audio Drama), archetype inspiration,
 * target length selector, concept, author's note, and drag-and-drop setup lore ingestion.
 */

import React from 'react';
import {
    Book,
    ChevronDown,
    Headphones,
    Loader2,
    LoreFileCard,
    Sparkles,
    Upload,
    Feather,
    type LoreFileItem
} from '@/components';
import { generateRandomArchetypes, VIEW_LABELS, type ArchetypeOption } from '@/config';
import { WRITING_MODE_LABELS, WRITING_MODE_TITLE } from '@/config';
import { LENGTH_CONTROL } from '@/domain/story';

export interface SetupViewProps {
    inputTitle: string;
    setInputTitle: (title: string) => void;
    inputConcept: string;
    setInputConcept: (concept: string) => void;
    inputAuthorNote: string;
    setInputAuthorNote: (note: string) => void;
    inputBookType: string;
    setInputBookType: (bookType: string) => void;
    inputCustomWords: number;
    setInputCustomWords: (words: number) => void;
    /** True when the story is planned as Book 1 of a series. Optional so older callers still fit. */
    inputSeriesOpener?: boolean;
    setInputSeriesOpener?: (opener: boolean) => void;
    inputSeriesTitle?: string;
    setInputSeriesTitle?: (title: string) => void;
    /** True when the story is a serial: ongoing arcs released in episodes. A serial is always a series. */
    inputSerial?: boolean;
    setInputSerial?: (serial: boolean) => void;
    inputSerialRotation?: 'anchored' | 'ensemble';
    setInputSerialRotation?: (rotation: 'anchored' | 'ensemble') => void;
    inputWritingMode: string;
    setInputWritingMode: (mode: string) => void;
    archetypeOptions: ArchetypeOption[];
    setArchetypeOptions: (options: ArchetypeOption[]) => void;
    importedLoreFiles: LoreFileItem[];
    importingLore: boolean;
    isDraggingSetupLore: boolean;
    setIsDraggingSetupLore: (dragging: boolean) => void;
    loreInputRef: React.RefObject<HTMLInputElement>;
    handleLoreImport: (
        eOrFiles: React.ChangeEvent<HTMLInputElement> | File[]
    ) => void | Promise<void>;
    handleUpdateLoreFile: (id: string, nextText: string) => void;
    handleRemoveLoreFile: (id: string) => void;
    clearImportedLore: () => void;
    loading: boolean;
    continuousAutopilot: boolean;
    initStory: (
        isAutopilotOrEvent?: boolean,
        options?: Record<string, unknown>
    ) => void | Promise<void>;
    handleAutopilot: (options?: Record<string, unknown>) => void | Promise<void>;
}

export function SetupView({
    inputTitle,
    setInputTitle,
    inputConcept,
    setInputConcept,
    inputAuthorNote,
    setInputAuthorNote,
    inputBookType,
    setInputBookType,
    inputCustomWords,
    setInputCustomWords,
    inputSeriesOpener = false,
    setInputSeriesOpener,
    inputSeriesTitle = '',
    setInputSeriesTitle,
    inputSerial = false,
    setInputSerial,
    inputSerialRotation = 'anchored',
    setInputSerialRotation,
    inputWritingMode,
    setInputWritingMode,
    archetypeOptions,
    setArchetypeOptions,
    importedLoreFiles,
    importingLore,
    isDraggingSetupLore,
    setIsDraggingSetupLore,
    loreInputRef,
    handleLoreImport,
    handleUpdateLoreFile,
    handleRemoveLoreFile,
    clearImportedLore,
    loading,
    continuousAutopilot,
    initStory,
    handleAutopilot
}: SetupViewProps) {
    return (
        <div className="max-w-xl mx-auto py-16 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-gold-tint border border-gold-edge text-gold-ink flex items-center justify-center mx-auto mb-6 shadow-sm">
                <Sparkles size={28} />
            </div>
            <h1 className="text-3xl font-bold font-serif text-ink-900 mb-8 tracking-tight">
                {VIEW_LABELS.setup}
            </h1>

            <input
                className="w-full bg-surface border border-edge-strong rounded-xl p-4 mb-4 focus:ring-2 focus:ring-gold/40 focus:border-gold outline-none font-bold text-ink-900 shadow-2xs placeholder:text-ink-400 font-serif text-lg"
                placeholder="Story Title (e.g. The Last Starship)"
                value={inputTitle}
                onChange={(e) => setInputTitle(e.target.value)}
            />

            <div className="mb-4 text-left">
                <label className="text-xs font-bold text-ink-400 uppercase tracking-wider font-mono mb-2 block">
                    {WRITING_MODE_TITLE}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => setInputWritingMode('novel')}
                        className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                            inputWritingMode !== 'audio_drama'
                                ? 'bg-surface border-gold ring-1 ring-gold/40 shadow-xs'
                                : 'bg-surface/50 border-edge-strong hover:border-stone-400 hover:bg-lift'
                        }`}
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                                <Book
                                    size={16}
                                    className={
                                        inputWritingMode !== 'audio_drama'
                                            ? 'text-gold-ink'
                                            : 'text-ink-400'
                                    }
                                />
                                <span className="font-bold text-sm text-ink-900 font-serif">
                                    {WRITING_MODE_LABELS.novel}
                                </span>
                            </div>
                            {inputWritingMode !== 'audio_drama' && (
                                <span className="w-2 h-2 rounded-full bg-gold" />
                            )}
                        </div>
                        <p className="text-xs text-ink-500 leading-snug">
                            Traditional narrative prose with rich scene description, narrative
                            pacing, and dialogue tags.
                        </p>
                    </button>

                    <button
                        type="button"
                        onClick={() => setInputWritingMode('audio_drama')}
                        className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                            inputWritingMode === 'audio_drama'
                                ? 'bg-surface border-gold ring-1 ring-gold/40 shadow-xs'
                                : 'bg-surface/50 border-edge-strong hover:border-stone-400 hover:bg-lift'
                        }`}
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                                <Headphones
                                    size={16}
                                    className={
                                        inputWritingMode === 'audio_drama'
                                            ? 'text-gold-ink'
                                            : 'text-ink-400'
                                    }
                                />
                                <span className="font-bold text-sm text-ink-900 font-serif">
                                    {WRITING_MODE_LABELS.audio_drama}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold font-mono uppercase px-2 py-0.5 rounded bg-gold/15 text-gold-ink border border-gold/30">
                                    Qwen 3 TTS
                                </span>
                                {inputWritingMode === 'audio_drama' && (
                                    <span className="w-2 h-2 rounded-full bg-gold" />
                                )}
                            </div>
                        </div>
                        <p className="text-xs text-ink-500 leading-snug">
                            Multi-voice script formatted as{' '}
                            <code className="text-xs bg-inset px-1.5 py-0.5 rounded text-ink-700 font-mono">
                                Speaker: (expression) Text
                            </code>{' '}
                            with automatic Narrator.
                        </p>
                    </button>
                </div>
            </div>

            {/* Archetype Dropdown */}
            <div className="mb-4 relative group">
                <div className="absolute right-3.5 top-3.5 text-ink-400 pointer-events-none">
                    <ChevronDown size={15} />
                </div>
                <select
                    className="w-full bg-surface border border-edge-strong rounded-xl p-3.5 pr-10 text-xs text-ink-700 focus:border-gold outline-none appearance-none cursor-pointer hover:bg-lift transition-colors shadow-2xs font-medium"
                    onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'random') {
                            setArchetypeOptions(generateRandomArchetypes(20));
                            e.target.value = '';
                        } else if (val) {
                            setInputConcept(val);
                        }
                    }}
                    defaultValue=""
                >
                    <option value="" disabled>
                        ✨ Need Inspiration? Select a Story Archetype...
                    </option>
                    {archetypeOptions.map((opt) => (
                        <option key={opt.id} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                    <option value="" disabled>
                        ---
                    </option>
                    <option value="random">🎲 Generate New List...</option>
                </select>
            </div>

            {/* Target Novel Length & Format Selector */}
            <div className="mb-4 text-left">
                <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                        <div className="absolute right-3.5 top-3.5 text-ink-400 pointer-events-none">
                            <ChevronDown size={15} />
                        </div>
                        <select
                            className="w-full bg-surface border border-edge-strong rounded-xl p-3.5 pr-10 text-xs text-ink-700 focus:border-gold outline-none appearance-none cursor-pointer hover:bg-lift transition-colors shadow-2xs font-medium"
                            value={inputBookType}
                            onChange={(e) => {
                                const newType = e.target.value;
                                setInputBookType(newType);
                                const preset =
                                    LENGTH_CONTROL.BOOK_TYPES[
                                        newType as keyof typeof LENGTH_CONTROL.BOOK_TYPES
                                    ];
                                if (newType !== 'custom' && preset) {
                                    setInputCustomWords(preset.words);
                                }
                            }}
                        >
                            <option value="short_story">Short Story (~20,000 words)</option>
                            <option value="novella">Novella (~40,000 words)</option>
                            <option value="popular">Popular (~80,000 words) — Recommended</option>
                            <option value="full_length">Full Length (~100,000 words)</option>
                            <option value="epic">Epic (~200,000 words)</option>
                            <option value="custom">Custom Target Length...</option>
                        </select>
                    </div>
                    {inputBookType === 'custom' && (
                        <div className="w-36 shrink-0">
                            <input
                                type="number"
                                min="5000"
                                max="500000"
                                step="1000"
                                value={inputCustomWords}
                                onChange={(e) =>
                                    setInputCustomWords(
                                        Math.max(1000, parseInt(e.target.value, 10) || 0)
                                    )
                                }
                                placeholder="Target words"
                                className="w-full bg-surface border border-edge-strong rounded-xl p-3 text-xs text-ink-800 font-mono font-bold focus:border-gold outline-none shadow-2xs"
                                title="Custom target word count"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Series option: Book 1 plans threads and secrets that outlast the book */}
            {setInputSeriesOpener && (
                <div className="mb-4 text-left">
                    <label className="flex items-start gap-2.5 text-xs text-ink-700 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="mt-0.5 accent-gold"
                            checked={inputSeriesOpener || inputSerial}
                            disabled={inputSerial}
                            onChange={(e) => setInputSeriesOpener(e.target.checked)}
                        />
                        <span>
                            <span className="font-semibold">This is Book 1 of a series</span>
                            <span className="block text-ink-500 mt-0.5">
                                The book still tells a complete story, and it also plants threads
                                and secrets for later books.
                            </span>
                        </span>
                    </label>
                    {setInputSerial && (
                        <label className="flex items-start gap-2.5 text-xs text-ink-700 cursor-pointer select-none mt-2.5">
                            <input
                                type="checkbox"
                                className="mt-0.5 accent-gold"
                                checked={inputSerial}
                                onChange={(e) => setInputSerial(e.target.checked)}
                            />
                            <span>
                                <span className="font-semibold">Run it as a serial</span>
                                <span className="block text-ink-500 mt-0.5">
                                    An ongoing story told in arcs and released in episodes. Each
                                    book is one arc, side plots open and close along the way, and
                                    the cast can change between arcs.
                                </span>
                            </span>
                        </label>
                    )}
                    {inputSerial && setInputSerialRotation && (
                        <select
                            aria-label="Cast rotation"
                            className="w-full mt-2.5 bg-surface border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none shadow-2xs"
                            value={inputSerialRotation}
                            onChange={(e) =>
                                setInputSerialRotation(e.target.value === 'ensemble' ? 'ensemble' : 'anchored')
                            }
                        >
                            <option value="anchored">The lead is in every arc; the rest of the cast rotates</option>
                            <option value="ensemble">Ensemble: anyone, the lead included, can sit an arc out</option>
                        </select>
                    )}
                    {(inputSeriesOpener || inputSerial) && (
                        <input
                            type="text"
                            className="w-full mt-2.5 bg-surface border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none shadow-2xs placeholder:text-ink-400"
                            placeholder="Series title (optional)"
                            value={inputSeriesTitle}
                            onChange={(e) => setInputSeriesTitle?.(e.target.value)}
                        />
                    )}
                </div>
            )}

            <textarea
                className="w-full bg-surface border border-edge-strong rounded-xl p-4 h-36 mb-4 focus:ring-2 focus:ring-gold/40 focus:border-gold outline-none text-ink-900 shadow-2xs placeholder:text-ink-400 text-sm leading-relaxed"
                placeholder="Concept (e.g. A fantasy world where magic costs memories...)"
                value={inputConcept}
                onChange={(e) => setInputConcept(e.target.value)}
            />

            <textarea
                className="w-full bg-surface border border-edge-strong rounded-xl p-4 h-24 mb-4 focus:ring-2 focus:ring-gold/40 focus:border-gold outline-none text-ink-900 shadow-2xs placeholder:text-ink-400 text-sm leading-relaxed"
                placeholder="Author's Note (e.g. Focus heavily on atmospheric tension. Make the protagonist more sarcastic.)"
                value={inputAuthorNote}
                onChange={(e) => setInputAuthorNote(e.target.value)}
            />

            {/* Import Lore UI */}
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingSetupLore(true);
                }}
                onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingSetupLore(true);
                }}
                onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingSetupLore(false);
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingSetupLore(false);
                    const droppedFiles = Array.from(e.dataTransfer?.files || []);
                    if (droppedFiles.length) handleLoreImport(droppedFiles);
                }}
                className={`mb-8 text-left p-4 rounded-xl border transition-all shadow-2xs ${
                    isDraggingSetupLore
                        ? 'border-dashed border-2 border-gold bg-gold-tint/25 ring-2 ring-gold/20 shadow-md'
                        : 'bg-surface border-edge-strong'
                }`}
            >
                <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                    <label className="text-xs font-bold text-ink-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
                        <span>Existing Lore / Notes / Bibles (Optional)</span>
                        {isDraggingSetupLore && (
                            <span className="text-gold-ink font-semibold animate-pulse">
                                — Drop files to import
                            </span>
                        )}
                    </label>
                    <button
                        onClick={() => loreInputRef.current?.click()}
                        disabled={loading || importingLore}
                        className="text-xs text-gold-ink hover:underline flex items-center gap-1 font-semibold disabled:opacity-50 cursor-pointer"
                    >
                        <Upload size={12} /> {importingLore ? 'Reading files...' : 'Add Documents'}
                    </button>
                    <input
                        type="file"
                        id="loreFileInput"
                        ref={loreInputRef}
                        onChange={handleLoreImport}
                        className="hidden"
                        accept=".txt,.md,.markdown,.docx,.pdf,.epub,.json,.csv"
                        multiple
                        disabled={loading || importingLore}
                        aria-label="Add lore files"
                    />
                </div>
                <p className="text-xs text-ink-500">
                    Select or drop multiple .txt, .md, .docx, .pdf, .epub, .json, or .csv files.
                    All files will be unified and grounded across your story.
                </p>
                {importedLoreFiles.length > 0 && (
                    <div className="animate-fade-in mt-3 space-y-2">
                        <div className="flex justify-between items-center gap-2 text-xs">
                            <span className="text-ink-500 font-mono" role="status">
                                {importedLoreFiles.length} document
                                {importedLoreFiles.length === 1 ? '' : 's'} added
                            </span>
                            <button
                                onClick={clearImportedLore}
                                className="text-ink-500 hover:text-blush-600 cursor-pointer font-mono text-[11px]"
                            >
                                Clear all
                            </button>
                        </div>
                        {importedLoreFiles.map((file) => (
                            <LoreFileCard
                                key={file.id}
                                file={file}
                                onUpdate={handleUpdateLoreFile}
                                onRemove={handleRemoveLoreFile}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="flex gap-4">
                <button
                    onClick={() => initStory(false, { fromSetup: true })}
                    disabled={loading || importingLore || !inputConcept}
                    className="flex-1 bg-surface border border-edge-300 hover:border-stone-400 text-ink-900 py-3.5 rounded-xl font-bold transition-all shadow-2xs hover:bg-lift disabled:opacity-50"
                >
                    Initialize Story
                </button>
                <button
                    onClick={() => handleAutopilot({ fromSetup: true })}
                    disabled={!continuousAutopilot && (loading || importingLore || !inputConcept)}
                    className={`flex-1 py-3.5 rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2 ${
                        continuousAutopilot
                            ? 'bg-blush-tint border border-blush-edge text-blush-800 hover:bg-blush-tint-strong'
                            : 'bg-btn hover:bg-btn-hover text-btn-ink disabled:opacity-50'
                    }`}
                >
                    {continuousAutopilot ? (
                        <>
                            <Loader2 className="animate-spin text-blush-600" size={18} /> Stop
                            Autopilot
                        </>
                    ) : (
                        <>
                            <Feather size={18} className="text-amber-300" /> Start
                            Autopilot
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
