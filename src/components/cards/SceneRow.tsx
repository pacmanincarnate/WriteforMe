/**
 * @module components/cards/SceneRow
 * Shared scene card row used by both Structure Outline (`variant="structure"`) and
 * Sequence Dashboard (`variant="dashboard"`).
 */

import {
    ChevronDown,
    ChevronUp,
    Download,
    Edit3,
    Icon,
    Loader2,
    Pause,
    Play,
    Plus,
    Trash2
} from '@/components/icons';
import { parseValueShiftInput } from '@/domain/story';
import { isSerializationPlaceholder } from '@/utils';
import { EditButton } from '../common/EditButton';

export interface SceneRowData {
    number?: string | number;
    title?: string;
    scene_type?: string;
    pov_character?: string;
    setting?: string;
    value_shift?: unknown;
    objective?: string;
    goal?: string;
    scene_events?: string;
    transition_jump?: string;
    dominant_narrative_mode?: string;
    user_edited?: boolean;
    is_bridge_scene?: boolean;
    characters_present?: unknown;
    cast_names?: unknown;
    causality?: {
        interaction_type?: string;
        justification?: string;
        rationale?: string;
    };
    surface_activity?: string;
    the_hinge_moment?: string;
}

export interface SceneRowProps {
    variant: 'structure' | 'dashboard' | string;
    scene: SceneRowData;
    sceneIdx: number;
    seqIdx: number;
    totalScenes?: number;
    sequence: { number?: number };
    proseStale?: { reason?: string } | null;
    getModeIcon: (modeKey: string) => string;
    allNarrativeModes?: Record<string, unknown>;
    openEditModal?: (
        title: string,
        initialValue: string,
        onSave: (val: string) => void
    ) => void;
    onUpdateField?: (seqIdx: number, sceneIdx: number, patch: Record<string, unknown>) => void;
    onMoveScene?: (seqIdx: number, sceneIdx: number, delta: number) => void;
    onAddSceneAfter?: (seqIdx: number, insertIdx: number) => void;
    setStory?: (
        updater: (prev: {
            scenes: Record<string, Array<Record<string, unknown>>>;
            [key: string]: unknown;
        }) => {
            scenes: Record<string, Array<Record<string, unknown>>>;
            [key: string]: unknown;
        }
    ) => void;
    showToast?: (message: string) => void;
    setSelectedSequence?: (seqIdx: number) => void;
    setSelectedScene: (sceneIdx: number) => void;
    setView: (view: string) => void;
    handleDeleteScene: (seqIdx: number, sceneIdx: number) => void;
    enableNarrativeLenses?: boolean;
    handleDownloadSceneAudio?: (seqIdx: number, sceneIdx: number) => void;
    isExportingSceneAudio?: boolean;
    hasProse?: boolean;
    availableSceneAudioMap?: Record<string, unknown>;
    playStoredOrLiveSceneAudio?: (
        seqIdx: number,
        sceneIdx: number,
        opts?: { enterReader?: boolean; syncView?: boolean }
    ) => void;
    getSceneAudioStatus?: (
        seqIdx: number,
        sceneIdx: number
    ) => string | { status?: string } | null | undefined;
    isAnyAudioPlaying?: boolean;
    stopAllAudioPlayback?: () => void;
}

function extractCleanCastList(rawCast: unknown): string[] {
    if (Array.isArray(rawCast)) {
        return rawCast
            .map((n) => {
                if (typeof n === 'string') return n.trim();
                const obj = n as { name?: unknown } | null;
                return String(obj?.name || n || '').trim();
            })
            .filter((n) => Boolean(n) && !isSerializationPlaceholder(n));
    }
    if (typeof rawCast === 'string') {
        return rawCast
            .split(/[,;\n]+/)
            .map((n) => n.trim().replace(/^-\s*/, ''))
            .filter((n) => Boolean(n) && !isSerializationPlaceholder(n));
    }
    return [];
}

export function SceneRow({
    variant,
    scene: s,
    sceneIdx: si,
    seqIdx,
    totalScenes = 1,
    sequence,
    proseStale,
    getModeIcon,
    allNarrativeModes = {},
    openEditModal,
    onUpdateField,
    onMoveScene,
    onAddSceneAfter,
    setStory,
    showToast,
    setSelectedSequence,
    setSelectedScene,
    setView,
    handleDeleteScene,
    enableNarrativeLenses = false,
    handleDownloadSceneAudio,
    isExportingSceneAudio,
    hasProse,
    availableSceneAudioMap = {},
    playStoredOrLiveSceneAudio,
    getSceneAudioStatus,
    isAnyAudioPlaying = false,
    stopAllAudioPlayback
}: SceneRowProps) {
    const isStructure = variant === 'structure';
    const isProactive =
        String(s.scene_type || '').toLowerCase().includes('proactive') ||
        s.scene_type === 'scene';
    const parsedVS = parseValueShiftInput(s.value_shift);
    const vsLabel =
        parsedVS.start_state && parsedVS.end_state
            ? `${parsedVS.start_state} ➔ ${parsedVS.end_state}`
            : parsedVS.start_state || parsedVS.end_state || '';
    const objectiveText = s.objective || s.goal || '';
    const eventsText = s.scene_events || '';

    const applyPatch = (patch: Record<string, unknown>, toastMsg?: string) => {
        if (typeof onUpdateField === 'function') {
            onUpdateField(seqIdx, si, patch);
        } else if (typeof setStory === 'function') {
            setStory((prev) => {
                const newScenes = { ...prev.scenes };
                newScenes[`${seqIdx}`] = [...(newScenes[`${seqIdx}`] || [])];
                newScenes[`${seqIdx}`][si] = {
                    ...(newScenes[`${seqIdx}`][si] || {}),
                    ...patch,
                    user_edited: true
                };
                return { ...prev, scenes: newScenes };
            });
        }
        if (toastMsg && typeof showToast === 'function') showToast(toastMsg);
    };

    const openFieldEdit = (
        label: string,
        currentVal: string | undefined,
        buildPatch: (val: string) => Record<string, unknown>
    ) => {
        if (typeof openEditModal !== 'function') return;
        openEditModal(`Scene ${s.number || si + 1} ${label}`, currentVal || '', (val) => {
            applyPatch(buildPatch(val), `Updated ${label}`);
        });
    };

    const presList = extractCleanCastList(s.characters_present);
    const castList = presList.length > 0 ? presList : extractCleanCastList(s.cast_names);

    return (
        <div
            className={
                isStructure
                    ? 'p-5 hover:bg-inset group transition-colors'
                    : 'p-4 sm:p-5 hover:bg-lift transition-colors group'
            }
        >
            <div
                className={
                    isStructure
                        ? 'flex flex-col md:flex-row md:justify-between md:items-start gap-4'
                        : 'flex flex-col md:flex-row md:justify-between md:items-start gap-3'
                }
            >
                <div className="flex gap-3.5 flex-1 min-w-0">
                    <div
                        className={
                            isStructure
                                ? 'w-8 h-8 rounded-full bg-mist-100 border border-edge-strong flex items-center justify-center text-xs font-bold font-mono text-ink-700 shrink-0 mt-0.5'
                                : 'w-8 h-8 rounded-full bg-mist-100 border border-edge-strong flex items-center justify-center text-xs font-bold text-ink-700 shrink-0 font-mono'
                        }
                    >
                        {s.number || `${sequence.number || seqIdx + 1}.${si + 1}`}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold font-serif text-base text-ink-900 flex items-center gap-2">
                                <Icon
                                    name={getModeIcon(s.dominant_narrative_mode || 'BASELINE_NEUTRAL')}
                                    className={`w-4 h-4 shrink-0 ${
                                        enableNarrativeLenses ? 'text-gold-ink' : 'text-ink-400'
                                    }`}
                                />
                                <span
                                    onClick={() => {
                                        if (setSelectedSequence) setSelectedSequence(seqIdx);
                                        setSelectedScene(si);
                                        setView('writer');
                                    }}
                                    className="cursor-pointer hover:text-gold-ink transition-colors"
                                    title="Open Scene View"
                                >
                                    {s.title || `Scene ${si + 1}`}
                                </span>
                                {openEditModal && (
                                    <EditButton
                                        title={`Scene ${s.number || si + 1} Title`}
                                        value={s.title}
                                        onSave={() =>
                                            openFieldEdit('Title', s.title, (val) => ({ title: val }))
                                        }
                                    />
                                )}
                            </h4>

                            {proseStale && (
                                <span
                                    title={proseStale.reason}
                                    className="text-xs font-bold px-2.5 py-0.5 rounded-full border bg-tangerine-tint text-tangerine-800 border-tangerine-edge"
                                >
                                    Prose out of date
                                </span>
                            )}
                            {s.user_edited && (
                                <span
                                    className="text-[11px] font-bold font-mono uppercase px-2 py-0.5 rounded-full border bg-gold-tint/50 text-gold-ink border-gold-edge"
                                    title="Manually edited by user — protected from Continuity Bridge overwrites"
                                >
                                    Edited
                                </span>
                            )}
                            {s.is_bridge_scene && (
                                <span className="text-[11px] font-bold font-mono uppercase px-2 py-0.5 rounded-full border bg-plum-tint/40 text-plum-800 border-plum-edge">
                                    Bridge
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={() =>
                                    applyPatch(
                                        { scene_type: isProactive ? 'REACTIVE' : 'PROACTIVE' },
                                        `Scene type set to ${isProactive ? 'REACTIVE' : 'PROACTIVE'}`
                                    )
                                }
                                className={`text-xs font-bold uppercase px-2.5 py-0.5 cursor-pointer transition-opacity hover:opacity-80 ${
                                    isStructure ? 'rounded-md border font-mono' : 'rounded-full border'
                                } ${
                                    isProactive
                                        ? 'bg-sage-tint border-sage-edge text-sage-800'
                                        : 'bg-ember-tint border-ember-edge text-ember-800'
                                }`}
                                title="Click to toggle Proactive / Reactive scene type"
                            >
                                {isProactive
                                    ? isStructure
                                        ? 'Proactive Scene (Action)'
                                        : 'Proactive Scene'
                                    : isStructure
                                      ? 'Reactive Sequel (Reflection)'
                                      : 'Reactive Sequel'}
                            </button>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-700 bg-mist-100 border border-edge-strong px-2 py-0.5 rounded-md font-mono">
                                <span>POV: {s.pov_character || 'Unset'}</span>
                                {openEditModal && (
                                    <EditButton
                                        title="POV Character"
                                        value={s.pov_character}
                                        onSave={() =>
                                            openFieldEdit('POV Character', s.pov_character, (val) => ({
                                                pov_character: val
                                            }))
                                        }
                                    />
                                )}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-700 bg-mist-100 border border-edge-strong px-2 py-0.5 rounded-md font-mono max-w-[260px]">
                                <span className="truncate" title={s.setting || 'No setting'}>
                                    Setting: {s.setting || 'Unset'}
                                </span>
                                {openEditModal && (
                                    <EditButton
                                        title="Setting"
                                        value={s.setting}
                                        onSave={() =>
                                            openFieldEdit('Setting', s.setting, (val) => ({
                                                setting: val
                                            }))
                                        }
                                    />
                                )}
                            </span>
                            {vsLabel && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-700 bg-mist-100 border border-edge-strong px-2 py-0.5 rounded-md font-mono">
                                    <span>Shift: {vsLabel}</span>
                                </span>
                            )}
                            {(s.transition_jump || openEditModal) && (
                                <span
                                    className={
                                        isStructure
                                            ? 'inline-flex items-center gap-1 text-xs font-medium text-ink-600 bg-mist-100 border border-edge-strong px-2 py-0.5 rounded-md font-mono'
                                            : 'inline-flex items-center gap-1 text-xs font-medium text-ink-600 bg-mist-100 border border-edge-strong px-2.5 py-0.5 rounded-full font-mono'
                                    }
                                >
                                    <span>Jump: {s.transition_jump || 'Unset'}</span>
                                    {openEditModal && (
                                        <EditButton
                                            title="Transition Jump"
                                            value={s.transition_jump}
                                            onSave={() =>
                                                openFieldEdit(
                                                    'Transition Jump',
                                                    s.transition_jump,
                                                    (val) => ({ transition_jump: val })
                                                )
                                            }
                                        />
                                    )}
                                </span>
                            )}
                        </div>

                        {allNarrativeModes && Object.keys(allNarrativeModes).length > 0 && (
                            <div
                                className={`flex items-center gap-1.5 text-xs text-ink-600 ${
                                    enableNarrativeLenses ? '' : 'opacity-80'
                                }`}
                            >
                                <span className="text-xs font-mono uppercase text-ink-500 font-bold">
                                    Lens:
                                </span>
                                <select
                                    value={s.dominant_narrative_mode || 'BASELINE_NEUTRAL'}
                                    onChange={(e) =>
                                        applyPatch(
                                            { dominant_narrative_mode: e.target.value },
                                            `Scene lens set to ${e.target.value}`
                                        )
                                    }
                                    className="bg-surface border border-edge-strong text-ink-800 rounded px-2.5 py-0.5 text-xs font-mono focus:border-gold outline-none cursor-pointer"
                                >
                                    {Object.keys(allNarrativeModes).map((modeKey) => (
                                        <option key={modeKey} value={modeKey}>
                                            {modeKey.replace(/_/g, ' ')}
                                        </option>
                                    ))}
                                </select>
                                {!enableNarrativeLenses && (
                                    <span
                                        className="text-xs font-mono text-ink-400 italic bg-mist-100 px-1.5 py-0.5 rounded border border-edge"
                                        title="Narrative lenses are temporarily disabled for generation in Settings / Writer header"
                                    >
                                        bypassed
                                    </span>
                                )}
                            </div>
                        )}

                        <div className="flex items-start gap-1.5 text-xs text-ink-800 font-medium">
                            <div className="flex-1 min-w-0">
                                <span className="text-ink-500 font-bold uppercase font-mono text-xs mr-1.5">
                                    Objective:
                                </span>
                                <span className={objectiveText ? '' : 'italic text-ink-400'}>
                                    {objectiveText || 'No objective set'}
                                </span>
                            </div>
                            {openEditModal && (
                                <EditButton
                                    title="Objective"
                                    value={objectiveText}
                                    onSave={() =>
                                        openFieldEdit('Objective', objectiveText, (val) => ({
                                            objective: val,
                                            goal: val
                                        }))
                                    }
                                />
                            )}
                        </div>

                        <div className="flex items-start gap-1.5">
                            <div className="flex-1 min-w-0">
                                {eventsText ? (
                                    <p
                                        className={
                                            isStructure
                                                ? 'text-xs sm:text-sm text-ink-700 leading-relaxed font-serif break-words whitespace-pre-wrap'
                                                : 'text-sm text-ink-700 leading-relaxed line-clamp-3 font-serif break-words whitespace-pre-wrap'
                                        }
                                    >
                                        {eventsText}
                                    </p>
                                ) : (
                                    <p className="text-xs italic text-ink-400 font-serif">
                                        No scene events planned yet.
                                    </p>
                                )}
                            </div>
                            {openEditModal && (
                                <EditButton
                                    title="Scene Events"
                                    value={eventsText}
                                    onSave={() =>
                                        openFieldEdit('Scene Events', eventsText, (val) => ({
                                            scene_events: val
                                        }))
                                    }
                                />
                            )}
                        </div>

                        {castList.length > 0 && (
                            <div
                                className={
                                    isStructure
                                        ? 'flex flex-wrap gap-1.5 pt-1'
                                        : 'flex flex-wrap gap-1.5 mt-1'
                                }
                            >
                                {castList.map((name, ni) => (
                                    <span
                                        key={ni}
                                        className="text-xs bg-mist-100 border border-edge-strong text-ink-600 px-2 py-0.5 rounded-full font-medium"
                                    >
                                        {name}
                                    </span>
                                ))}
                            </div>
                        )}

                        {isStructure && s.causality && (
                            <div className="text-xs text-ember-900 italic bg-ember-tint p-2 rounded-lg border border-ember-edge mt-1">
                                <span className="font-bold text-ember-800 uppercase not-italic font-mono text-xs mr-1">
                                    Causality ({s.causality.interaction_type || 'interaction'}):
                                </span>
                                {s.causality.justification || s.causality.rationale}
                            </div>
                        )}
                        {(s.surface_activity || s.the_hinge_moment) && (
                            <div className="text-xs bg-gold-tint/25 border border-gold-edge/50 p-2.5 rounded-lg mt-1.5 space-y-1">
                                {s.surface_activity && (
                                    <div className="text-ink-800">
                                        <span className="font-bold text-gold-ink font-mono text-[10px] uppercase mr-1">
                                            Activity:
                                        </span>
                                        <span className="font-serif">{s.surface_activity}</span>
                                    </div>
                                )}
                                {s.the_hinge_moment && (
                                    <div className="text-ink-800">
                                        <span className="font-bold text-gold-ink font-mono text-[10px] uppercase mr-1">
                                            Hinge Moment:
                                        </span>
                                        <span className="font-serif italic">{s.the_hinge_moment}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 self-end md:self-auto shrink-0">
                    {hasProse &&
                        (() => {
                            const rawAudioStatus =
                                typeof getSceneAudioStatus === 'function'
                                    ? getSceneAudioStatus(seqIdx, si)
                                    : availableSceneAudioMap?.[`${seqIdx}-${si}`]
                                      ? 'ready'
                                      : 'none';
                            const audioStatus =
                                typeof rawAudioStatus === 'string'
                                    ? rawAudioStatus
                                    : rawAudioStatus?.status || 'none';
                            const hasSaved = audioStatus !== 'none';
                            const isStale = audioStatus === 'stale';
                            return (
                                <div className="flex items-center gap-1.5">
                                    {playStoredOrLiveSceneAudio && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                isAnyAudioPlaying && stopAllAudioPlayback
                                                    ? stopAllAudioPlayback()
                                                    : playStoredOrLiveSceneAudio(seqIdx, si, {
                                                          enterReader: true,
                                                          syncView: true
                                                      })
                                            }
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold shadow-2xs hover:shadow-xs transition-all cursor-pointer border ${
                                                isAnyAudioPlaying
                                                    ? 'bg-gold-tint hover:bg-gold-tint/80 border-gold-edge text-gold-ink'
                                                    : isStale
                                                      ? 'bg-amber-50/90 hover:bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:border-amber-700/60 dark:text-amber-300'
                                                      : hasSaved
                                                        ? 'bg-sage-tint hover:bg-sage-tint-strong border-sage-edge text-sage-800'
                                                        : 'bg-surface hover:bg-lift border-edge-strong text-ink-700 hover:text-ink-900'
                                            }`}
                                            title={
                                                isAnyAudioPlaying
                                                    ? 'Pause / Stop playing audio'
                                                    : isStale
                                                      ? 'Listen in Reader (saved audio is outdated — prose changed)'
                                                      : hasSaved
                                                        ? 'Listen in Reader (saved offline MP3 ready)'
                                                        : 'Listen in Reader'
                                            }
                                        >
                                            {isAnyAudioPlaying ? (
                                                <Pause size={12} className="fill-current text-gold-ink" />
                                            ) : (
                                                <Play
                                                    size={12}
                                                    className={`fill-current ${
                                                        isStale
                                                            ? 'text-amber-600'
                                                            : hasSaved
                                                              ? 'text-sage-700'
                                                              : 'text-gold-ink'
                                                    }`}
                                                />
                                            )}
                                            <span className="hidden sm:inline text-[11px]">
                                                {isAnyAudioPlaying ? 'Pause' : 'Listen'}
                                            </span>
                                        </button>
                                    )}
                                    {handleDownloadSceneAudio && (
                                        <button
                                            type="button"
                                            onClick={() => handleDownloadSceneAudio(seqIdx, si)}
                                            disabled={isExportingSceneAudio}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold shadow-2xs hover:shadow-xs transition-all disabled:opacity-40 cursor-pointer border ${
                                                isStale
                                                    ? 'bg-amber-50/90 hover:bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:border-amber-700/60 dark:text-amber-300'
                                                    : hasSaved
                                                      ? 'bg-sage-tint hover:bg-sage-tint-strong border-sage-edge text-sage-800'
                                                      : 'bg-surface hover:bg-lift border-edge-strong text-ink-600 hover:text-ink-900'
                                            }`}
                                            title={
                                                isStale
                                                    ? 'Download saved MP3 (prose changed since generation — regenerate in Writer to update)'
                                                    : hasSaved
                                                      ? 'Download saved Scene MP3'
                                                      : 'Generate & Download Scene MP3'
                                            }
                                        >
                                            {isExportingSceneAudio ? (
                                                <Loader2 size={12} className="animate-spin text-gold-ink" />
                                            ) : (
                                                <Download
                                                    size={12}
                                                    className={
                                                        isStale
                                                            ? 'text-amber-600'
                                                            : hasSaved
                                                              ? 'text-sage-700'
                                                              : 'text-gold-ink'
                                                    }
                                                />
                                            )}
                                            <span className="text-[11px] font-mono">
                                                {isStale ? 'MP3 ↻' : hasSaved ? 'MP3 ✓' : 'MP3'}
                                            </span>
                                        </button>
                                    )}
                                </div>
                            );
                        })()}
                    {onMoveScene && (
                        <div className="inline-flex items-center rounded-xl border border-edge-strong bg-surface overflow-hidden">
                            <button
                                type="button"
                                onClick={() => onMoveScene(seqIdx, si, -1)}
                                disabled={si === 0}
                                className="p-1.5 text-ink-500 hover:text-ink-900 hover:bg-lift disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                title="Move Scene Up"
                            >
                                <ChevronUp size={13} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onMoveScene(seqIdx, si, 1)}
                                disabled={si >= totalScenes - 1}
                                className="p-1.5 text-ink-500 hover:text-ink-900 hover:bg-lift disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-l border-edge cursor-pointer"
                                title="Move Scene Down"
                            >
                                <ChevronDown size={13} />
                            </button>
                        </div>
                    )}
                    {onAddSceneAfter && (
                        <button
                            type="button"
                            onClick={() => onAddSceneAfter(seqIdx, si + 1)}
                            className="p-1.5 text-ink-600 hover:text-gold-ink bg-surface hover:bg-gold-tint/30 border border-edge-strong rounded-xl transition-colors cursor-pointer"
                            title="Insert Scene Below"
                        >
                            <Plus size={14} />
                        </button>
                    )}
                    <button
                        onClick={() => {
                            if (setSelectedSequence) setSelectedSequence(seqIdx);
                            setSelectedScene(si);
                            setView('writer');
                        }}
                        className={
                            isStructure
                                ? 'text-ink-800 hover:text-ink-900 flex items-center gap-1.5 bg-surface border border-edge-strong hover:border-edge-300 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xs hover:shadow-xs transition-all cursor-pointer'
                                : 'bg-surface hover:bg-lift border border-edge-strong text-ink-800 px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-2xs hover:shadow-xs transition-all flex items-center gap-1.5 cursor-pointer'
                        }
                        title="Write Scene"
                    >
                        <Edit3 size={13} className="text-gold-ink" /> Write
                    </button>
                    <button
                        onClick={() => handleDeleteScene(seqIdx, si)}
                        className="text-ink-400 hover:text-blush-600 p-1.5 rounded-lg hover:bg-blush-tint transition-colors cursor-pointer"
                        title="Delete Scene"
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}
