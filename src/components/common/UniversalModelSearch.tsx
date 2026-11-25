/**
 * @module components/common/UniversalModelSearch
 * Searchable model dropdown with saved-model chips and KoboldCPP status panel.
 */

import { useEffect, useRef } from 'react';
import { Bookmark, Loader2, RefreshCw, Search, X } from '@/components/icons';
import { getKoboldLoadedModelName, isCloudModelName } from '@/services/llm';

export interface SearchableModelEntry {
    id?: string;
    name?: string;
    description?: string;
    contextLength?: number;
    capabilities?: {
        vision?: boolean;
        reasoning?: boolean;
    };
}

export interface UniversalModelSearchProps {
    apiProvider: string;
    activeModel?: string;
    onSelectModel: (modelId: string) => void;
    savedModels?: string[];
    onSaveModel?: (modelId: string) => void;
    onDeleteModel?: (modelId: string) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    isSearching?: boolean;
    searchResults?: SearchableModelEntry[];
    isDropdownOpen: boolean;
    setIsDropdownOpen: (open: boolean) => void;
    label?: string;
    koboldStatus?: 'idle' | 'checking' | 'connected' | 'offline' | string;
    koboldError?: string | null;
    koboldLoadedModel?: string;
    onRefreshCatalog?: (() => void) | null;
}

export function UniversalModelSearch({
    apiProvider,
    activeModel,
    onSelectModel,
    savedModels = [],
    onSaveModel,
    onDeleteModel,
    searchQuery,
    setSearchQuery,
    isSearching = false,
    searchResults = [],
    isDropdownOpen,
    setIsDropdownOpen,
    label = 'Model Selection',
    koboldStatus = 'idle',
    koboldError = null,
    koboldLoadedModel = 'koboldcpp',
    onRefreshCatalog = null
}: UniversalModelSearchProps) {
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setIsDropdownOpen]);

    useEffect(() => {
        if (apiProvider === 'koboldcpp' && onSelectModel) {
            const candidate =
                koboldLoadedModel && koboldLoadedModel !== 'koboldcpp'
                    ? koboldLoadedModel
                    : getKoboldLoadedModelName() || 'koboldcpp';
            if (
                !activeModel ||
                isCloudModelName(activeModel) ||
                (activeModel === 'koboldcpp' && candidate !== 'koboldcpp')
            ) {
                onSelectModel(candidate);
            }
        }
    }, [apiProvider, koboldLoadedModel, activeModel, onSelectModel]);

    if (apiProvider === 'koboldcpp') {
        const isConnected = koboldStatus === 'connected';
        const isChecking = koboldStatus === 'checking';
        const displayModel =
            koboldLoadedModel ||
            getKoboldLoadedModelName() ||
            (activeModel && !isCloudModelName(activeModel) && activeModel !== 'koboldcpp'
                ? activeModel
                : 'koboldcpp');

        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 font-mono">
                        {label}
                    </label>
                    {onRefreshCatalog && (
                        <button
                            type="button"
                            onClick={onRefreshCatalog}
                            disabled={isChecking}
                            className="text-xs text-gold-ink hover:text-ink-900 font-medium flex items-center gap-1 transition-colors"
                        >
                            <RefreshCw size={12} className={isChecking ? 'animate-spin' : ''} />
                            Check Connection
                        </button>
                    )}
                </div>
                <div className="bg-inset border border-edge-strong rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-ink-500 font-medium">Loaded Model:</span>
                            <span className="font-mono text-xs text-ink-900 font-semibold truncate max-w-[240px]">
                                {displayModel}
                            </span>
                        </div>
                        <span
                            className={`text-[10px] px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 font-bold uppercase tracking-wider ${
                                isConnected
                                    ? 'bg-sage-tint border-sage-edge text-sage-800'
                                    : isChecking
                                      ? 'bg-ember-tint border-ember-edge text-ember-800'
                                      : 'bg-blush-tint border-blush-edge text-blush-800'
                            }`}
                        >
                            <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                    isConnected
                                        ? 'bg-emerald-500 animate-pulse'
                                        : isChecking
                                          ? 'bg-amber-500 animate-pulse'
                                          : 'bg-rose-500'
                                }`}
                            />
                            {isConnected ? 'Connected' : isChecking ? 'Checking...' : 'Offline'}
                        </span>
                    </div>
                    {koboldError && (
                        <p className="text-xs text-blush-700 bg-blush-tint border border-blush-edge p-2 rounded-lg">
                            {koboldError}
                        </p>
                    )}
                    <p className="text-[11px] text-ink-500 italic">
                        KoboldCPP hosts a single active model on localhost:5001. Model catalog search is disabled.
                    </p>
                </div>
            </div>
        );
    }

    const isCurrentSaved = activeModel && savedModels.includes(activeModel);

    return (
        <div className="space-y-2.5 relative" ref={dropdownRef}>
            <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 font-mono">
                    {label}
                </label>
                {onRefreshCatalog && (
                    <button
                        type="button"
                        onClick={onRefreshCatalog}
                        className="text-xs text-gold-ink hover:text-ink-900 font-medium flex items-center gap-1 transition-colors"
                        title="Refresh model catalog from server"
                    >
                        <RefreshCw size={12} className={isSearching ? 'animate-spin' : ''} />
                        Refresh Catalog
                    </button>
                )}
            </div>

            <div className="relative">
                <div className="relative flex items-center">
                    <Search size={15} className="absolute left-3.5 text-ink-400 pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setIsDropdownOpen(true);
                        }}
                        onFocus={() => setIsDropdownOpen(true)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && searchQuery.trim()) {
                                onSelectModel(searchQuery.trim());
                                setIsDropdownOpen(false);
                            }
                        }}
                        placeholder={`Search or enter ${apiProvider} model ID...`}
                        className="w-full bg-surface border border-edge-strong rounded-xl pl-9 pr-24 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono placeholder:text-ink-400 shadow-2xs"
                    />
                    <div className="absolute right-2.5 flex items-center gap-1.5">
                        {isSearching && <Loader2 size={14} className="animate-spin text-gold-ink" />}
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="text-ink-400 hover:text-ink-600 p-0.5"
                                title="Clear search"
                            >
                                <X size={13} />
                            </button>
                        )}
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => {
                                    onSelectModel(searchQuery.trim());
                                    setIsDropdownOpen(false);
                                }}
                                className="bg-btn hover:bg-btn-hover text-btn-ink text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
                                title="Use entered model ID"
                            >
                                Use
                            </button>
                        )}
                    </div>
                </div>

                {isDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1.5 bg-surface border border-edge-strong rounded-xl shadow-xl max-h-64 overflow-y-auto custom-scrollbar">
                        {searchResults.length === 0 ? (
                            <div className="p-4 text-xs text-ink-400 text-center italic">
                                {isSearching
                                    ? 'Fetching models...'
                                    : 'No matching models found. Press Enter to use typed ID.'}
                            </div>
                        ) : (
                            <div className="py-1 divide-y divide-edge-soft">
                                {searchResults.slice(0, 50).map((m) => {
                                    const modelId = m.id || m.name || '';
                                    const isSelected = activeModel === modelId;
                                    const isSaved = savedModels.includes(modelId);

                                    return (
                                        <div
                                            key={modelId}
                                            onClick={() => {
                                                onSelectModel(modelId);
                                                setIsDropdownOpen(false);
                                            }}
                                            className={`px-3.5 py-2.5 text-xs flex items-center justify-between cursor-pointer hover:bg-lift transition-colors ${
                                                isSelected ? 'bg-gold-tint text-ink-900 font-semibold' : 'text-ink-700'
                                            }`}
                                        >
                                            <div className="flex flex-col min-w-0 pr-2">
                                                <span className="font-mono text-xs font-medium truncate">
                                                    {modelId}
                                                </span>
                                                {m.name && m.name !== modelId && (
                                                    <span className="text-[10px] text-ink-500 truncate">
                                                        {m.name}
                                                    </span>
                                                )}
                                                {m.description && (
                                                    <span className="text-[10px] text-ink-400 line-clamp-1">
                                                        {m.description}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {m.capabilities && (
                                                    <div className="flex gap-1">
                                                        {m.capabilities.vision && (
                                                            <span className="text-[9px] bg-plum-tint text-plum-700 border border-plum-edge px-1.5 py-0.5 rounded-full font-bold">
                                                                Vision
                                                            </span>
                                                        )}
                                                        {m.capabilities.reasoning && (
                                                            <span className="text-[9px] bg-ember-tint text-ember-800 border border-ember-edge px-1.5 py-0.5 rounded-full font-bold">
                                                                Reasoning
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {m.contextLength && (
                                                    <span className="text-[10px] bg-mist-100 border border-edge-strong text-ink-600 px-1.5 py-0.5 rounded font-mono">
                                                        {Math.round(m.contextLength / 1024)}k ctx
                                                    </span>
                                                )}
                                                {onSaveModel && onDeleteModel && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (isSaved) {
                                                                onDeleteModel(modelId);
                                                            } else {
                                                                onSaveModel(modelId);
                                                            }
                                                        }}
                                                        className={`p-1 rounded-lg hover:bg-wash transition-colors ${
                                                            isSaved
                                                                ? 'text-gold-ink'
                                                                : 'text-ink-400 hover:text-ink-600'
                                                        }`}
                                                        title={
                                                            isSaved
                                                                ? 'Remove from saved models'
                                                                : 'Save model to quick chips'
                                                        }
                                                    >
                                                        <Bookmark
                                                            size={13}
                                                            fill={isSaved ? 'currentColor' : 'none'}
                                                        />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between text-xs text-ink-600 bg-inset border border-edge-strong rounded-xl px-3.5 py-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-ink-400 font-bold uppercase tracking-wider text-[10px] font-mono flex-shrink-0">
                        Active Model:
                    </span>
                    <span className="font-mono text-ink-900 font-semibold truncate text-xs">
                        {activeModel || '(None selected)'}
                    </span>
                </div>
                {activeModel && onSaveModel && onDeleteModel && (
                    <button
                        type="button"
                        onClick={() => {
                            if (isCurrentSaved) {
                                onDeleteModel(activeModel);
                            } else {
                                onSaveModel(activeModel);
                            }
                        }}
                        className={`text-[11px] flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold transition-all ${
                            isCurrentSaved
                                ? 'bg-gold-tint border-gold-edge text-gold-ink hover:bg-gold/25'
                                : 'bg-surface border-edge-strong text-ink-600 hover:text-ink-900 shadow-2xs'
                        }`}
                    >
                        <Bookmark size={11} fill={isCurrentSaved ? 'currentColor' : 'none'} />
                        {isCurrentSaved ? 'Saved' : 'Save Chip'}
                    </button>
                )}
            </div>

            {savedModels.length > 0 && onDeleteModel && (
                <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] font-bold text-ink-400 uppercase tracking-wider font-mono">
                        Saved Model Chips
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                        {savedModels.map((model) => (
                            <div
                                key={model}
                                onClick={() => onSelectModel(model)}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer transition-all ${
                                    activeModel === model
                                        ? 'bg-gold-tint border-gold-edge text-gold-ink font-semibold'
                                        : 'bg-surface border-edge-strong text-ink-600 hover:border-edge-300 shadow-2xs'
                                }`}
                            >
                                <span className="truncate max-w-[180px] font-mono text-[11px]">{model}</span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteModel(model);
                                    }}
                                    className="text-ink-400 hover:text-blush-600 p-0.5 rounded-full hover:bg-blush-tint transition-colors"
                                    title="Remove model chip"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
