/**
 * @module views/writer/WriterView
 * Scene Studio view (`view === 'writer'`): Director Card, 6-cell Bento Metadata Grid,
 * and Unified Scene Workspace (Blueprint | Manuscript | Split View).
 */

import React from 'react';
import {
    AlertTriangle,
    BookOpen,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Compass,
    Download,
    FileText,
    Headphones,
    Image,
    Layers,
    Loader2,
    Mic,
    Pause,
    Play,
    RefreshCw,
    Scale,
    Shuffle,
    Wand2,
    X,
    Zap,
    EditButton,
    EditorialSubNav
} from '@/components';
import { STRUCTURAL_MODALITIES } from '@/config';
import { getSceneActiveCast, parseValueShiftInput } from '@/domain/story';
import { countWords, isSerializationPlaceholder } from '@/utils';
import { WriterBlueprintPane } from './WriterBlueprintPane';
import { WriterManuscriptPane } from './WriterManuscriptPane';
import type {
    SceneBlueprintDraft,
    WriterActiveCharacterState,
    WriterBeatRecord,
    WriterCharacterStateFields,
    WriterPlotCommitment,
    WriterProseRecord,
    WriterRelationshipChange,
    WriterSceneRecord,
    WriterTargetEpistemicDelta,
    WriterViewProps
} from './types';

function extractCleanNames(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((x) => {
            if (typeof x === 'string') return x.trim();
            if (x && typeof x === 'object' && 'name' in x) {
                return String((x as { name?: unknown }).name || '').trim();
            }
            return String(x || '').trim();
        })
        .filter((x) => Boolean(x) && !isSerializationPlaceholder(x));
}

function parseLooseCharacterList(val: unknown): string[] {
    if (!val) return [];
    if (Array.isArray(val)) {
        return val
            .map((item) => {
                if (typeof item === 'string') return item.trim();
                if (item && typeof item === 'object') {
                    const obj = item as { name?: unknown; character?: unknown };
                    return String(obj.name || obj.character || '');
                }
                return String(item || '');
            })
            .filter(Boolean);
    }
    if (typeof val === 'string') {
        return val
            .split(/[,;\n]+/)
            .map((s) => s.trim().replace(/^-\s*/, ''))
            .filter(Boolean);
    }
    return [];
}

function buildDraftFromScene(sc: WriterSceneRecord): SceneBlueprintDraft {
    const vs = parseValueShiftInput(sc.value_shift);
    const presDraftChars = extractCleanNames(sc.characters_present);
    const chars = presDraftChars.length > 0 ? presDraftChars : extractCleanNames(sc.cast_names);

    const deltas: WriterTargetEpistemicDelta[] = Array.isArray(sc.target_epistemic_deltas)
        ? sc.target_epistemic_deltas.map((d) => ({
              holder: d?.holder || '',
              proposition_id: d?.proposition_id || d?.proposition || '',
              operation: d?.operation || 'ELEVATE_SUSPICION',
              to_stance: d?.to_stance || 'SUSPECTS_TRUE',
              to_confidence: d?.to_confidence ?? 0.45,
              trigger_clue: d?.trigger_clue || ''
          }))
        : [];

    const commitments: WriterPlotCommitment[] = Array.isArray(sc.plot_commitments)
        ? sc.plot_commitments.map((pc) =>
              typeof pc === 'object' && pc !== null ? { ...pc } : String(pc || '')
          )
        : typeof sc.plot_commitments === 'string' && sc.plot_commitments.trim()
          ? [sc.plot_commitments.trim()]
          : [];

    const mapRel = (rc: WriterRelationshipChange | string): WriterRelationshipChange =>
        typeof rc === 'object' && rc !== null
            ? { ...rc }
            : { from: '', to: '', feeling: String(rc || ''), trigger: '' };

    const rels: WriterRelationshipChange[] =
        Array.isArray(sc.relationship_changes) && sc.relationship_changes.length > 0
            ? sc.relationship_changes.map(mapRel)
            : Array.isArray(sc.relationship_shifts)
              ? sc.relationship_shifts.map(mapRel)
              : [];

    return {
        title: sc.title || '',
        scene_type: String(sc.scene_type || 'PROACTIVE').toUpperCase(),
        pov_character: sc.pov_character || '',
        setting: sc.setting || '',
        transition_jump: sc.transition_jump || '',
        dominant_narrative_mode: sc.dominant_narrative_mode || 'BASELINE_NEUTRAL',
        characters_present: chars,
        objective: sc.objective || sc.goal || '',
        scene_events: sc.scene_events || '',
        value_shift_start: vs.start_state || '',
        value_shift_end: vs.end_state || '',
        exit_hook: sc.exit_hook || '',
        surface_activity: sc.surface_activity || '',
        the_hinge_moment: sc.the_hinge_moment || '',
        main_character_heart: sc.main_character_heart || '',
        other_character_heart: sc.other_character_heart || '',
        atmospheric_overview: sc.atmospheric_overview || '',
        modality_hand: Array.isArray(sc.modality_hand) ? [...sc.modality_hand] : [],
        entrance_conditions: sc.entrance_conditions || sc.entrance_condition || '',
        exit_conditions: sc.exit_conditions || sc.exit_condition || '',
        micro_conflict_and_tactic: sc.micro_conflict_and_tactic || '',
        sensory_palette: sc.sensory_palette || '',
        scene_pacing_tempo: sc.scene_pacing_tempo || '',
        character_voice_directives: sc.character_voice_directives || '',
        epistemic_friction_level: sc.epistemic_friction_level || '',
        activation_contexts_text: Array.isArray(sc.activation_contexts)
            ? sc.activation_contexts.join(', ')
            : sc.activation_contexts || '',
        target_epistemic_deltas: deltas,
        plot_commitments: commitments,
        relationship_changes: rels
    };
}

export const WriterView: React.FC<WriterViewProps> = ({
    view,
    setView,
    story,
    storyRef,
    setStory,
    isInspectorMode,
    selectedSequence,
    selectedScene,
    setSelectedScene,
    activeSceneDropdown,
    setActiveSceneDropdown,
    sceneWorkspaceTab,
    setSceneWorkspaceTab,
    isSceneSplitView,
    setIsSceneSplitView,
    setIsBlueprintCollapsed,
    blueprintActiveTab,
    setBlueprintActiveTab,
    isEditingSceneBlueprint,
    setIsEditingSceneBlueprint,
    sceneBlueprintDraft,
    setSceneBlueprintDraft,
    isEditingProseInline,
    setIsEditingProseInline,
    inlineProseDraft,
    setInlineProseDraft,
    allNarrativeModes,
    enableNarrativeLenses,
    setEnableNarrativeLenses,
    collapsedBeats,
    toggleBeats,
    expandedBeatAnalysis,
    toggleBeatAnalysis,
    loading,
    loadingImages,
    loadedImages,
    isExportingSceneAudio,
    isRegeneratingSceneAudio,
    isDirectingVoices,
    isAnyAudioPlaying,
    isRunningEditorialHarness,
    isRunningManualSlopClean,
    writerSlopAudit,
    slopAuditDrawerOpen,
    setSlopAuditDrawerOpen,
    slopAuditFilter,
    setSlopAuditFilter,
    slopAllowlistExpanded,
    setSlopAllowlistExpanded,
    getSceneAudioStatus,
    updateSceneBlueprint,
    updateCharacterStateForScene,
    handleAutoGenerateScene,
    handleCascadeSceneToProse,
    handleDismissStaleProse,
    handleDownloadSceneAudio,
    handleRegenerateSceneAudio,
    handleDirectSceneVoices,
    handleAddBeat,
    handleBeatChange,
    handleDeleteBeat,
    generateSceneImage,
    generateBeatImage,
    deleteSceneImage,
    deleteBeatImage,
    copyFullScene,
    enterReaderMode,
    playSceneAudio,
    stopAllAudioPlayback,
    runAutonomousEditorialHarness,
    setEditorialScopeSceneId,
    handleRunManualSlopClean,
    handleAddStoryAllowlistItem,
    handleRemoveStoryAllowlistItem,
    openEditModal,
    openCritiqueModal,
    showToast
}) => {
    if (view !== 'writer' || selectedSequence === null || selectedScene === null) {
        return null;
    }

    const writerSceneKey = `${selectedSequence}`;
    const writerBeatKey = `${selectedSequence}-${selectedScene}`;
    const seqScenes = (story.scenes?.[writerSceneKey] || []) as WriterSceneRecord[];
    const writerAudioState = getSceneAudioStatus(selectedSequence, selectedScene);
    const hasSavedAudio = writerAudioState.status !== 'none';
    const currentScene = seqScenes[selectedScene];
    const currentSequence = (story.sequences || [])[selectedSequence];
    if (!currentScene) return null;

    const currentProseRaw = story.prose?.[writerBeatKey];
    const currentProseObj: WriterProseRecord | null =
        currentProseRaw && typeof currentProseRaw === 'object'
            ? (currentProseRaw as WriterProseRecord)
            : null;
    const hasSceneProse = Boolean(
        currentProseRaw &&
            ((currentProseObj &&
                (currentProseObj.final || currentProseObj.draft || currentProseObj.prose)) ||
                (typeof currentProseRaw === 'string' && currentProseRaw.trim()))
    );
    const proseStaleRaw = currentProseObj?.stale;
    const proseStale =
        proseStaleRaw && typeof proseStaleRaw === 'object'
            ? (proseStaleRaw as { reason?: string; changedFields?: string[] })
            : proseStaleRaw
              ? currentProseObj?.staleInfo || {}
              : null;

    const parsedVS = parseValueShiftInput(currentScene.value_shift);
    const isProactiveScene =
        String(currentScene.scene_type).toLowerCase().includes('proactive') ||
        currentScene.scene_type === 'scene';
    const allModalityNames = Object.values(STRUCTURAL_MODALITIES || {}).map((m) => m.name);

    const presentCharList = (() => {
        const pres = extractCleanNames(currentScene.characters_present);
        return pres.length > 0 ? pres : extractCleanNames(currentScene.cast_names);
    })();
    const availableCastToAdd = (story.cast || [])
        .map((c) => c?.name)
        .filter(
            (name): name is string =>
                Boolean(name) && !presentCharList.some((pc) => pc.toLowerCase() === name.toLowerCase())
        );

    const enterBlueprintEditMode = (
        targetTab: string | null = null,
        mutateDraft: ((base: SceneBlueprintDraft) => SceneBlueprintDraft) | null = null
    ) => {
        const baseDraft =
            isEditingSceneBlueprint && sceneBlueprintDraft
                ? sceneBlueprintDraft
                : buildDraftFromScene(currentScene);
        const nextDraft = mutateDraft ? mutateDraft(baseDraft) : baseDraft;
        setSceneBlueprintDraft(nextDraft);
        setIsEditingSceneBlueprint(true);
        setIsBlueprintCollapsed(false);
        setSceneWorkspaceTab('blueprint');
        if (targetTab) setBlueprintActiveTab(targetTab);
    };

    const handleSaveBlueprintDraft = () => {
        if (!sceneBlueprintDraft) return;
        const d = sceneBlueprintDraft;
        const parsedContexts = String(d.activation_contexts_text || '')
            .split(/[,;\n]+/)
            .map((x) => x.trim())
            .filter(Boolean);
        const cleanedDeltas = (Array.isArray(d.target_epistemic_deltas) ? d.target_epistemic_deltas : [])
            .map((item) => ({
                holder: String(item.holder || '').trim(),
                proposition_id: String(item.proposition_id || '').trim(),
                operation: String(item.operation || 'ELEVATE_SUSPICION').trim(),
                to_stance: String(item.to_stance || 'SUSPECTS_TRUE').trim(),
                to_confidence: Number.isFinite(parseFloat(String(item.to_confidence)))
                    ? parseFloat(String(item.to_confidence))
                    : 0.45,
                trigger_clue: String(item.trigger_clue || '').trim()
            }))
            .filter((item) => item.holder || item.proposition_id || item.trigger_clue);
        const cleanedCommitments = (Array.isArray(d.plot_commitments) ? d.plot_commitments : [])
            .map((pc) => (typeof pc === 'object' && pc !== null ? pc : String(pc || '').trim()))
            .filter((pc) =>
                typeof pc === 'object' ? Boolean(pc.description || pc.exact_terms || pc.consequence) : Boolean(pc)
            );
        const cleanedRels = (Array.isArray(d.relationship_changes) ? d.relationship_changes : []).filter(
            (rc) => rc && (rc.from || rc.to || rc.feeling || rc.trigger)
        );

        updateSceneBlueprint(selectedSequence, selectedScene, {
            title: d.title,
            scene_type: d.scene_type,
            pov_character: d.pov_character,
            setting: d.setting,
            transition_jump: d.transition_jump,
            dominant_narrative_mode: d.dominant_narrative_mode,
            characters_present: Array.isArray(d.characters_present) ? [...d.characters_present] : [],
            cast_names: Array.isArray(d.characters_present) ? [...d.characters_present] : [],
            objective: d.objective,
            goal: d.objective,
            scene_events: d.scene_events,
            value_shift: { start_state: d.value_shift_start, end_state: d.value_shift_end },
            exit_hook: d.exit_hook,
            surface_activity: d.surface_activity,
            the_hinge_moment: d.the_hinge_moment,
            main_character_heart: d.main_character_heart,
            other_character_heart: d.other_character_heart,
            atmospheric_overview: d.atmospheric_overview,
            modality_hand: d.modality_hand,
            entrance_conditions: d.entrance_conditions,
            exit_conditions: d.exit_conditions,
            micro_conflict_and_tactic: d.micro_conflict_and_tactic,
            sensory_palette: d.sensory_palette,
            scene_pacing_tempo: d.scene_pacing_tempo,
            character_voice_directives: d.character_voice_directives,
            epistemic_friction_level: d.epistemic_friction_level,
            activation_contexts: parsedContexts,
            target_epistemic_deltas: cleanedDeltas,
            plot_commitments: cleanedCommitments,
            relationship_changes: cleanedRels,
            relationship_shifts: cleanedRels
        });
        setIsEditingSceneBlueprint(false);
        setSceneBlueprintDraft(null);
        showToast('Scene Blueprint saved.', 'success');
    };

    const activeStates: WriterActiveCharacterState[] = (() => {
        const rawChars = [
            ...parseLooseCharacterList(currentScene.cast_names),
            ...parseLooseCharacterList(currentScene.characters_present),
            ...parseLooseCharacterList(currentScene.cast_ids)
        ];
        if (currentScene.pov_character) rawChars.push(currentScene.pov_character);
        const detectedCast = getSceneActiveCast(currentScene, story.cast || []);
        detectedCast.forEach((c) => {
            if (c && c.name) rawChars.push(c.name);
        });
        const sceneBeats = (story.beats?.[writerBeatKey] || []) as WriterBeatRecord[];
        sceneBeats.forEach((b) => {
            if (b.character) rawChars.push(b.character);
            if (b.target_character) rawChars.push(b.target_character);
            if (Array.isArray(b.characters_involved)) rawChars.push(...b.characters_involved);
        });

        const uniqueCharNames: string[] = [];
        rawChars.forEach((name) => {
            if (!name || typeof name !== 'string') return;
            const clean = name.trim();
            if (clean && !uniqueCharNames.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
                const castMatch = (story.cast || []).find(
                    (c) =>
                        c.name &&
                        (c.name.toLowerCase() === clean.toLowerCase() ||
                            (Array.isArray(c.aliases) &&
                                c.aliases.some((a) => String(a).toLowerCase() === clean.toLowerCase())))
                );
                const canonicalName = castMatch ? castMatch.name : clean;
                if (!uniqueCharNames.some((existing) => existing.toLowerCase() === canonicalName.toLowerCase())) {
                    uniqueCharNames.push(canonicalName);
                }
            }
        });

        const charStates: Record<string, WriterCharacterStateFields> = story.character_states || {};
        return uniqueCharNames.map((cn) => {
            const matchedState =
                charStates[cn] ||
                Object.values(charStates).find(
                    (s) =>
                        s &&
                        ((s.name && s.name.toLowerCase() === cn.toLowerCase()) ||
                            (s.character && String(s.character).toLowerCase() === cn.toLowerCase()))
                );
            const castMember = (story.cast || []).find(
                (c) =>
                    c.name &&
                    (c.name.toLowerCase() === cn.toLowerCase() ||
                        (Array.isArray(c.aliases) &&
                            c.aliases.some((a) => String(a).toLowerCase() === cn.toLowerCase())))
            );
            return {
                name: cn,
                state: matchedState || {
                    name: cn,
                    location: currentScene.setting || '',
                    emotional_state: castMember?.core_flaw || '',
                    unresolved_tension: castMember?.core_flaw || '',
                    physical_state: ''
                }
            };
        });
    })();

    const rawProsePreview =
        typeof currentProseRaw === 'string'
            ? currentProseRaw
            : currentProseObj?.final || currentProseObj?.draft || currentProseObj?.prose || '';
    const sceneWordCount = rawProsePreview ? countWords(rawProsePreview) : 0;
    const formattedWordBadge =
        sceneWordCount >= 1000
            ? `${(sceneWordCount / 1000).toFixed(1).replace(/\.0$/, '')}k`
            : sceneWordCount > 0
              ? String(sceneWordCount)
              : null;

    return (
        <div className="max-w-7xl mx-auto space-y-4 animate-fade-in pb-32">
            <EditorialSubNav
                activeView={view}
                onSelectView={setView}
                story={story}
                isInspectorMode={isInspectorMode}
                selectedSequence={selectedSequence}
                selectedScene={selectedScene}
            />

            {/* 1. Director Card: Inline Seq/Scene + Stepper, Title + 3 Square Action Tiles, Symmetrical 6-Cell Bento Grid */}
            <div className="bg-surface p-4 sm:p-5 rounded-2xl border border-edge shadow-sm">
                {/* Row 1: Inline Bold Highlight Seq. # · Scene # + Stepper */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <button
                            type="button"
                            onClick={() => setView('structure')}
                            className="inline-flex items-center gap-0.5 text-[11px] font-mono font-bold uppercase tracking-wider text-gold-ink hover:underline cursor-pointer"
                            title="Back to Story Outline"
                        >
                            <ChevronLeft size={12} className="w-3 h-3 shrink-0" /> Seq.{' '}
                            {currentSequence ? currentSequence.number : selectedSequence + 1}
                        </button>
                        <span className="text-[11px] font-mono font-bold text-gold-ink/60">·</span>
                        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-gold-ink">
                            Scene {currentScene.number || selectedScene + 1}
                        </span>
                        {currentScene.user_edited && (
                            <span
                                className="ml-1 text-[10px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-gold-tint text-gold-ink border border-gold-edge"
                                title="Manually edited by user — Continuity Bridge will not overwrite fields or splice bridge scenes"
                            >
                                Edited
                            </span>
                        )}
                        {currentScene.is_bridge_scene && (
                            <span className="ml-1 text-[10px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-plum-tint text-plum-800 border border-plum-edge">
                                Bridge
                            </span>
                        )}
                    </div>

                    <div className="inline-flex items-center rounded-lg border border-edge-strong bg-inset overflow-hidden text-xs shrink-0">
                        <button
                            type="button"
                            onClick={() => selectedScene > 0 && setSelectedScene(selectedScene - 1)}
                            disabled={selectedScene <= 0}
                            className="px-2 py-1 text-ink-600 hover:text-ink-900 hover:bg-wash disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer flex items-center"
                            title="Previous Scene"
                            aria-label="Previous Scene"
                        >
                            <ChevronLeft size={13} className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2 py-1 font-mono text-[11px] text-ink-500 border-x border-edge">
                            {selectedScene + 1} / {seqScenes.length || 1}
                        </span>
                        <button
                            type="button"
                            onClick={() => selectedScene < seqScenes.length - 1 && setSelectedScene(selectedScene + 1)}
                            disabled={selectedScene >= seqScenes.length - 1}
                            className="px-2 py-1 text-ink-600 hover:text-ink-900 hover:bg-wash disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer flex items-center"
                            title="Next Scene"
                            aria-label="Next Scene"
                        >
                            <ChevronRight size={13} className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Row 2: Title Left + 3 Square High-Priority Action Tiles Right (Write | Audio | Read) */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 pb-3.5 border-b border-edge">
                    <h2 className="text-2xl sm:text-3xl font-serif font-bold text-ink-900 flex items-baseline gap-2 tracking-tight min-w-0 flex-1">
                        <span className="truncate">{currentScene.title || `Scene ${selectedScene + 1}`}</span>
                        <EditButton
                            title="Scene Title"
                            value={currentScene.title || ''}
                            onSave={() =>
                                openEditModal('Scene Title', currentScene.title || '', (val) =>
                                    updateSceneBlueprint(selectedSequence, selectedScene, { title: val })
                                )
                            }
                        />
                    </h2>

                    <div className="scene-action-tiles-wrap relative grid grid-cols-3 gap-2 w-full lg:w-[264px] shrink-0">
                        {/* 1. Write Menu Tile (includes Re-Write, Run Editor, Illustrate, Export) */}
                        <button
                            type="button"
                            onClick={() => setActiveSceneDropdown((prev) => (prev === 'write' ? null : 'write'))}
                            className="h-[56px] rounded-xl bg-gold-tint hover:bg-gold/25 border border-gold-edge text-gold-ink flex flex-col items-center justify-center gap-1 transition-all cursor-pointer active:scale-95"
                            title="Write prose, run editorial review, illustrate, or export"
                        >
                            <Zap size={16} className="w-4 h-4 text-gold-ink" />
                            <span className="text-[11px] font-bold inline-flex items-center gap-0.5">
                                <span>Write</span>
                                <ChevronDown size={11} className="w-3 h-3 opacity-75" />
                            </span>
                        </button>

                        {/* 2. Audio Menu Tile */}
                        <button
                            type="button"
                            onClick={() => setActiveSceneDropdown((prev) => (prev === 'audio' ? null : 'audio'))}
                            className="relative h-[56px] rounded-xl bg-inset hover:bg-lift border border-edge-strong text-ink-900 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer active:scale-95"
                            title="Listen, download MP3, regenerate audio, or direct voices"
                        >
                            {writerAudioState.status !== 'none' && (
                                <span
                                    className={`absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full ${
                                        writerAudioState.status === 'ready' ? 'bg-emerald-500' : 'bg-amber-500'
                                    }`}
                                    title={
                                        writerAudioState.status === 'ready'
                                            ? 'Saved offline audio ready'
                                            : 'Saved audio outdated vs edited text'
                                    }
                                />
                            )}
                            <Headphones
                                size={16}
                                className={`w-4 h-4 ${
                                    writerAudioState.status === 'ready'
                                        ? 'text-sage-600'
                                        : writerAudioState.status === 'stale'
                                          ? 'text-amber-500'
                                          : 'text-ink-700'
                                }`}
                            />
                            <span className="text-[11px] font-bold inline-flex items-center gap-0.5">
                                <span>Audio</span>
                                <ChevronDown size={11} className="w-3 h-3 opacity-75" />
                            </span>
                        </button>

                        {/* 3. Read Direct Tile */}
                        <button
                            type="button"
                            onClick={() => {
                                setActiveSceneDropdown(null);
                                enterReaderMode(selectedSequence, selectedScene);
                            }}
                            className="h-[56px] rounded-xl bg-inset hover:bg-lift border border-edge-strong text-ink-900 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer active:scale-95"
                            title="Read this scene in Ebook Reader Mode"
                        >
                            <BookOpen size={16} className="w-4 h-4 text-ink-700" />
                            <span className="text-[11px] font-bold">Read</span>
                        </button>

                        {/* Write Popover */}
                        {activeSceneDropdown === 'write' && (
                            <div className="absolute left-0 top-[62px] w-56 z-40 bg-surface border border-edge-strong rounded-2xl p-1.5 shadow-xl space-y-0.5 animate-fade-in">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveSceneDropdown(null);
                                        handleAutoGenerateScene(selectedSequence, selectedScene, {
                                            forceFullRewrite: hasSceneProse
                                        });
                                    }}
                                    disabled={loading}
                                    className="w-full px-3 py-2 rounded-xl text-left text-xs font-bold text-ink-900 hover:bg-wash flex items-center gap-2.5 disabled:opacity-45 cursor-pointer"
                                >
                                    <Zap size={14} className="w-3.5 h-3.5 text-gold-ink shrink-0" />
                                    <span>{hasSceneProse ? 'Re-Write Prose' : 'Write Prose'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!hasSceneProse) return;
                                        setActiveSceneDropdown(null);
                                        const targetId = `sc_${selectedSequence}_${selectedScene}`;
                                        setEditorialScopeSceneId(targetId);
                                        setView('editorial');
                                        runAutonomousEditorialHarness({
                                            mode: 'full_pipeline',
                                            scopeSceneId: targetId
                                        });
                                    }}
                                    disabled={!hasSceneProse || loading || isRunningEditorialHarness}
                                    className="w-full px-3 py-2 rounded-xl text-left text-xs font-bold text-ink-900 hover:bg-wash flex items-center gap-2.5 disabled:opacity-40 cursor-pointer"
                                    title={
                                        hasSceneProse
                                            ? 'Run 5-Phase Editorial Review & 3-Wave Surgical Revision'
                                            : 'Write scene prose first to run editor'
                                    }
                                >
                                    <Scale size={14} className="w-3.5 h-3.5 text-gold-ink shrink-0" />
                                    <span>Run 5-Phase Editor</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveSceneDropdown(null);
                                        generateSceneImage(selectedSequence, selectedScene);
                                    }}
                                    disabled={Boolean(loadingImages[`scene_${writerBeatKey}`] || loading)}
                                    className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-ink-800 hover:bg-wash flex items-center gap-2.5 disabled:opacity-45 cursor-pointer"
                                >
                                    {loadingImages[`scene_${writerBeatKey}`] ? (
                                        <Loader2 size={14} className="w-3.5 h-3.5 animate-spin text-gold-ink shrink-0" />
                                    ) : (
                                        <Image size={14} className="w-3.5 h-3.5 text-ink-500 shrink-0" />
                                    )}
                                    <span>
                                        {loadedImages[`scene_${writerBeatKey}`]
                                            ? 'Re-Illustrate Scene'
                                            : 'Illustrate Scene'}
                                    </span>
                                </button>
                                <div className="my-1 border-t border-edge" />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveSceneDropdown(null);
                                        copyFullScene();
                                    }}
                                    className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-ink-800 hover:bg-wash flex items-center gap-2.5 cursor-pointer"
                                >
                                    <FileText size={14} className="w-3.5 h-3.5 text-ink-500 shrink-0" />
                                    <span>
                                        {story?.writing_mode === 'audio_drama'
                                            ? 'Export Drama Script'
                                            : 'Export Scene'}
                                    </span>
                                </button>
                            </div>
                        )}

                        {/* Audio Popover */}
                        {activeSceneDropdown === 'audio' && (
                            <div className="absolute left-1/2 -translate-x-1/2 top-[62px] w-56 z-40 bg-surface border border-edge-strong rounded-2xl p-1.5 shadow-xl space-y-0.5 animate-fade-in">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveSceneDropdown(null);
                                        if (isAnyAudioPlaying) {
                                            stopAllAudioPlayback();
                                            return;
                                        }
                                        if (!hasSceneProse && !hasSavedAudio) return;
                                        const seq = selectedSequence !== null ? selectedSequence : 0;
                                        const sc = selectedScene !== null ? selectedScene : 0;
                                        enterReaderMode(seq, sc);
                                        setTimeout(() => playSceneAudio(seq, sc, { autoplay: true, follow: true }), 80);
                                    }}
                                    disabled={!isAnyAudioPlaying && !hasSceneProse && !hasSavedAudio}
                                    className="w-full px-3 py-2 rounded-xl text-left text-xs font-bold text-ink-900 hover:bg-wash flex items-center gap-2.5 disabled:opacity-40 cursor-pointer"
                                >
                                    {isAnyAudioPlaying ? (
                                        <>
                                            <Pause
                                                size={14}
                                                className="w-3.5 h-3.5 text-gold-ink fill-current shrink-0"
                                            />
                                            <span>Pause Audio</span>
                                        </>
                                    ) : (
                                        <>
                                            <Play size={14} className="w-3.5 h-3.5 text-sage-600 shrink-0" />
                                            <span>
                                                {story?.writing_mode === 'audio_drama' ? 'Play Drama' : 'Listen Live'}
                                            </span>
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveSceneDropdown(null);
                                        handleDownloadSceneAudio(selectedSequence, selectedScene);
                                    }}
                                    disabled={!hasSceneProse || isExportingSceneAudio || isRegeneratingSceneAudio}
                                    className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-ink-800 hover:bg-wash flex items-center justify-between gap-2 disabled:opacity-40 cursor-pointer"
                                >
                                    <span className="flex items-center gap-2.5">
                                        {isExportingSceneAudio ? (
                                            <Loader2
                                                size={14}
                                                className="w-3.5 h-3.5 animate-spin text-gold-ink shrink-0"
                                            />
                                        ) : (
                                            <Download size={14} className="w-3.5 h-3.5 text-ink-500 shrink-0" />
                                        )}
                                        <span>Download MP3</span>
                                    </span>
                                    {writerAudioState.status === 'ready' && (
                                        <span className="font-mono text-[10px] font-bold text-sage-700">READY ✓</span>
                                    )}
                                    {writerAudioState.status === 'stale' && (
                                        <span className="font-mono text-[10px] font-bold text-amber-600">
                                            STALE ↻
                                        </span>
                                    )}
                                </button>
                                {hasSceneProse && hasSavedAudio && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActiveSceneDropdown(null);
                                            handleRegenerateSceneAudio(selectedSequence, selectedScene);
                                        }}
                                        disabled={isExportingSceneAudio || isRegeneratingSceneAudio}
                                        className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-ink-800 hover:bg-wash flex items-center gap-2.5 disabled:opacity-40 cursor-pointer"
                                    >
                                        {isRegeneratingSceneAudio ? (
                                            <Loader2
                                                size={14}
                                                className="w-3.5 h-3.5 animate-spin text-gold-ink shrink-0"
                                            />
                                        ) : (
                                            <RefreshCw size={14} className="w-3.5 h-3.5 text-ink-500 shrink-0" />
                                        )}
                                        <span>Regen Audio</span>
                                    </button>
                                )}
                                {story?.writing_mode === 'audio_drama' && hasSceneProse && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActiveSceneDropdown(null);
                                            handleDirectSceneVoices(selectedSequence, selectedScene);
                                        }}
                                        disabled={loading || isDirectingVoices}
                                        className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-ink-800 hover:bg-wash flex items-center gap-2.5 disabled:opacity-40 cursor-pointer"
                                    >
                                        {isDirectingVoices ? (
                                            <Loader2
                                                size={14}
                                                className="w-3.5 h-3.5 animate-spin text-gold-ink shrink-0"
                                            />
                                        ) : (
                                            <Mic size={14} className="w-3.5 h-3.5 text-ink-500 shrink-0" />
                                        )}
                                        <span>{isDirectingVoices ? 'Directing...' : 'Direct Voices'}</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Row 3: Symmetrical 6-Cell Bento Metadata Grid (Dotless Scene Type + Compact Cast Height) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-3.5">
                    {/* Cell 1: Scene Type (Dotless Toggle) */}
                    <div className="bg-inset border border-edge-strong rounded-xl px-2.5 py-1.5 min-h-[46px] flex flex-col justify-between min-w-0">
                        <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-ink-400">
                            Scene Type
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                const nextType = isProactiveScene ? 'REACTIVE' : 'PROACTIVE';
                                updateSceneBlueprint(selectedSequence, selectedScene, { scene_type: nextType });
                                showToast(`Scene type set to ${nextType}`, 'info');
                            }}
                            className={`w-full text-left text-xs font-bold flex items-center justify-between gap-1 pt-0.5 cursor-pointer truncate ${
                                isProactiveScene ? 'text-sage-700' : 'text-ember-700'
                            }`}
                            title="Click to toggle Proactive Action / Reactive Sequel"
                        >
                            <span className="truncate">
                                {isProactiveScene ? 'Proactive (Action)' : 'Reactive (Sequel)'}
                            </span>
                            <Shuffle size={11} className="w-3 h-3 opacity-60 shrink-0" />
                        </button>
                    </div>

                    {/* Cell 2: POV Character (Unified Selector) */}
                    <div className="bg-inset border border-edge-strong rounded-xl px-2.5 py-1.5 min-h-[46px] flex flex-col justify-between min-w-0">
                        <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-ink-400">
                            POV Character
                        </span>
                        <select
                            value={currentScene.pov_character || ''}
                            onChange={(e) => {
                                if (e.target.value === '__CUSTOM__') {
                                    openEditModal('POV Character', currentScene.pov_character || '', (val) =>
                                        updateSceneBlueprint(selectedSequence, selectedScene, { pov_character: val })
                                    );
                                } else {
                                    updateSceneBlueprint(selectedSequence, selectedScene, {
                                        pov_character: e.target.value
                                    });
                                }
                            }}
                            className="w-full bg-transparent text-ink-900 font-semibold text-xs outline-none cursor-pointer pt-0.5 truncate"
                            title="Change POV Character"
                        >
                            <option value="" className="bg-surface text-ink-900">
                                Unset
                            </option>
                            {currentScene.pov_character &&
                                !(story.cast || []).some(
                                    (c) => c.name?.toLowerCase() === currentScene.pov_character?.toLowerCase()
                                ) && (
                                    <option value={currentScene.pov_character} className="bg-surface text-ink-900">
                                        {currentScene.pov_character}
                                    </option>
                                )}
                            {(story.cast || []).map((c, ci) => (
                                <option key={ci} value={c.name} className="bg-surface text-ink-900">
                                    {c.name}
                                </option>
                            ))}
                            <option value="__CUSTOM__" className="bg-surface text-gold-ink">
                                Custom POV name...
                            </option>
                        </select>
                    </div>

                    {/* Cell 3: Narrative Lens + Active Toggle */}
                    <div
                        className={`bg-inset border rounded-xl px-2.5 py-1.5 min-h-[46px] flex flex-col justify-between min-w-0 transition-opacity ${
                            enableNarrativeLenses ? 'border-edge-strong' : 'border-dashed border-edge-300 opacity-80'
                        }`}
                    >
                        <div className="flex items-center justify-between gap-1">
                            <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-ink-400 truncate">
                                Lens
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    const nextVal = !enableNarrativeLenses;
                                    setEnableNarrativeLenses(nextVal);
                                    showToast(
                                        nextVal
                                            ? 'Narrative lenses enabled.'
                                            : 'Narrative lenses disabled for text generation.',
                                        nextVal ? 'success' : 'info'
                                    );
                                }}
                                className={`shrink-0 text-[9px] uppercase font-mono px-1.5 py-0 rounded font-bold cursor-pointer border ${
                                    enableNarrativeLenses
                                        ? 'bg-gold-tint border-gold-edge text-gold-ink'
                                        : 'bg-mist-200 border-edge text-ink-500'
                                }`}
                                title={
                                    enableNarrativeLenses
                                        ? 'Lenses active. Click to disable.'
                                        : 'Lenses off. Click to enable.'
                                }
                            >
                                {enableNarrativeLenses ? 'Active' : 'Off'}
                            </button>
                        </div>
                        <select
                            value={currentScene.dominant_narrative_mode || 'BASELINE_NEUTRAL'}
                            onChange={(e) => {
                                updateSceneBlueprint(selectedSequence, selectedScene, {
                                    dominant_narrative_mode: e.target.value
                                });
                                showToast(`Scene lens set to ${e.target.value}`, 'info');
                            }}
                            className="w-full bg-transparent text-ink-900 font-semibold text-xs outline-none cursor-pointer pt-0.5 truncate"
                        >
                            {Object.keys(allNarrativeModes).map((modeKey) => (
                                <option key={modeKey} value={modeKey} className="bg-surface text-ink-900">
                                    {modeKey.replace(/_/g, ' ')}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Cell 4: Transition Jump */}
                    <div className="bg-inset border border-edge-strong rounded-xl px-2.5 py-1.5 min-h-[46px] flex flex-col justify-between min-w-0">
                        <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-ink-400">
                            Transition Jump
                        </span>
                        <button
                            type="button"
                            onClick={() =>
                                openEditModal('Transition Jump', currentScene.transition_jump || '', (val) =>
                                    updateSceneBlueprint(selectedSequence, selectedScene, { transition_jump: val })
                                )
                            }
                            className="w-full text-left flex items-center justify-between gap-1 text-xs font-medium pt-0.5 cursor-pointer min-w-0"
                            title={currentScene.transition_jump || 'Edit Transition Jump'}
                        >
                            <span
                                className={`truncate ${
                                    currentScene.transition_jump ? 'text-ink-900 font-semibold' : 'text-ink-400'
                                }`}
                            >
                                {currentScene.transition_jump || 'Unset'}
                            </span>
                            <ChevronRight size={12} className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                        </button>
                    </div>

                    {/* Cell 5: Stage Setting */}
                    <div className="col-span-2 bg-inset border border-edge-strong rounded-xl px-2.5 py-1.5 min-h-[46px] flex flex-col justify-between min-w-0">
                        <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-ink-400">
                            Stage Setting
                        </span>
                        <button
                            type="button"
                            onClick={() =>
                                openEditModal('Scene Setting', currentScene.setting || '', (val) =>
                                    updateSceneBlueprint(selectedSequence, selectedScene, { setting: val })
                                )
                            }
                            className="w-full text-left flex items-center justify-between gap-1.5 text-xs font-medium pt-0.5 cursor-pointer min-w-0"
                            title={currentScene.setting || 'Edit Stage Setting'}
                        >
                            <span
                                className={`truncate ${
                                    currentScene.setting ? 'text-ink-900 font-medium' : 'text-ink-400'
                                }`}
                            >
                                {currentScene.setting || 'Unset'}
                            </span>
                            <ChevronRight size={12} className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                        </button>
                    </div>

                    {/* Cell 6: Cast Present (Compact height & non-stretching inline + Add) */}
                    <div className="col-span-2 bg-inset border border-edge-strong rounded-xl px-2.5 py-1.5 min-h-[46px] flex flex-col justify-between min-w-0">
                        <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-ink-400">
                            Cast Present ({presentCharList.length})
                        </span>
                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            {presentCharList.map((charName, cIdx) => (
                                <span
                                    key={cIdx}
                                    className="inline-flex items-center gap-1 text-[11px] leading-[18px] bg-surface border border-edge-strong text-ink-900 px-2 py-0 rounded-full font-semibold"
                                >
                                    <span>{charName}</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const nextList = presentCharList.filter((_, i) => i !== cIdx);
                                            updateSceneBlueprint(selectedSequence, selectedScene, {
                                                characters_present: [...nextList],
                                                cast_names: [...nextList]
                                            });
                                        }}
                                        className="text-ink-400 hover:text-blush-600 transition-colors cursor-pointer"
                                        title={`Remove ${charName} from scene`}
                                    >
                                        <X size={10} className="w-2.5 h-2.5" />
                                    </button>
                                </span>
                            ))}
                            <select
                                value=""
                                onChange={(e) => {
                                    const chosen = e.target.value;
                                    if (!chosen) return;
                                    if (chosen === '__CUSTOM__') {
                                        openEditModal('Add Character to Scene', '', (val) => {
                                            const added = String(val || '')
                                                .split(/[,;\n]+/)
                                                .map((x) => x.trim())
                                                .filter((x) => x && !isSerializationPlaceholder(x));
                                            if (added.length > 0) {
                                                const nextList = [
                                                    ...presentCharList,
                                                    ...added.filter(
                                                        (n) =>
                                                            !presentCharList.some(
                                                                (pc) => pc.toLowerCase() === n.toLowerCase()
                                                            )
                                                    )
                                                ];
                                                updateSceneBlueprint(selectedSequence, selectedScene, {
                                                    characters_present: [...nextList],
                                                    cast_names: [...nextList]
                                                });
                                            }
                                        });
                                    } else {
                                        const nextList = [...presentCharList, chosen];
                                        updateSceneBlueprint(selectedSequence, selectedScene, {
                                            characters_present: [...nextList],
                                            cast_names: [...nextList]
                                        });
                                    }
                                }}
                                className="w-auto max-w-[100px] shrink-0 text-[10.5px] leading-[18px] font-mono font-semibold bg-transparent hover:bg-wash border border-dashed border-gold-edge text-gold-ink rounded-full px-2 py-0 outline-none cursor-pointer"
                                title="Add character present in scene"
                            >
                                <option value="">+ Add</option>
                                {availableCastToAdd.map((cn, idx) => (
                                    <option key={idx} value={cn} className="bg-surface text-ink-900">
                                        {cn}
                                    </option>
                                ))}
                                <option value="__CUSTOM__" className="bg-surface text-gold-ink">
                                    Custom character name...
                                </option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Unified Scene Workspace Card (Blueprint | Manuscript | Desktop Split View + Integrated Stale Bar) */}
            <div className="bg-surface rounded-2xl border border-edge shadow-sm overflow-hidden">
                {/* Top Workspace Switcher Bar */}
                <div className="px-2 sm:px-3 bg-inset border-b border-edge flex items-center justify-between gap-2">
                    <div className="flex items-stretch flex-1 lg:flex-none">
                        <button
                            type="button"
                            onClick={() => {
                                setActiveSceneDropdown(null);
                                setSceneWorkspaceTab('blueprint');
                                setIsSceneSplitView(false);
                            }}
                            className={`flex-1 lg:flex-none px-3 sm:px-4 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                                sceneWorkspaceTab === 'blueprint' && !isSceneSplitView
                                    ? 'text-gold-ink border-gold'
                                    : 'text-ink-500 hover:text-ink-900 border-transparent'
                            }`}
                        >
                            <Compass size={14} className="w-3.5 h-3.5 shrink-0" />
                            <span>Blueprint</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveSceneDropdown(null);
                                setSceneWorkspaceTab('manuscript');
                                setIsSceneSplitView(false);
                            }}
                            className={`flex-1 lg:flex-none px-3 sm:px-4 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                                sceneWorkspaceTab === 'manuscript' && !isSceneSplitView
                                    ? 'text-gold-ink border-gold'
                                    : 'text-ink-500 hover:text-ink-900 border-transparent'
                            }`}
                        >
                            <FileText size={14} className="w-3.5 h-3.5 shrink-0" />
                            <span>Manuscript</span>
                            {formattedWordBadge && (
                                <span
                                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                                        sceneWorkspaceTab === 'manuscript' && !isSceneSplitView
                                            ? 'bg-gold-tint text-gold-ink'
                                            : 'bg-mist-200 text-ink-600'
                                    }`}
                                >
                                    {formattedWordBadge}
                                </span>
                            )}
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setActiveSceneDropdown(null);
                            setIsSceneSplitView((prev) => !prev);
                        }}
                        className={`hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
                            isSceneSplitView
                                ? 'bg-gold-tint border-gold-edge text-gold-ink'
                                : 'bg-surface hover:bg-lift border-edge-strong text-ink-700'
                        }`}
                        title="View Scene Blueprint and Manuscript Prose side by side"
                    >
                        <Layers size={13} className="w-3.5 h-3.5 shrink-0" />
                        <span>Split View</span>
                    </button>
                </div>

                {/* Integrated Stale-Blueprint Bar */}
                {proseStale && hasSceneProse && (
                    <div className="bg-ember-tint border-b border-ember-edge px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ember-900 animate-fade-in">
                        <div className="flex items-center gap-2 font-semibold min-w-0">
                            <AlertTriangle size={14} className="w-3.5 h-3.5 text-ember-700 shrink-0" />
                            <span
                                className="truncate"
                                title={
                                    proseStale.reason || 'Your blueprint edits are not yet reflected in the scene prose.'
                                }
                            >
                                Blueprint edited since draft
                                {Array.isArray(proseStale.changedFields) && proseStale.changedFields.length > 0
                                    ? ` (${proseStale.changedFields.slice(0, 3).join(', ')})`
                                    : ''}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                type="button"
                                onClick={() => handleCascadeSceneToProse(selectedSequence, selectedScene)}
                                disabled={loading}
                                className="bg-surface hover:bg-lift border border-ember-edge text-ink-900 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                            >
                                <Wand2 size={11} className="w-3 h-3 text-gold-ink" /> Patch Prose
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    handleAutoGenerateScene(selectedSequence, selectedScene, {
                                        forceFullRewrite: true
                                    })
                                }
                                disabled={loading}
                                className="bg-surface hover:bg-lift border border-ember-edge text-ink-900 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                            >
                                <RefreshCw size={11} className="w-3 h-3" /> Re-Write
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDismissStaleProse(selectedSequence, selectedScene)}
                                className="text-ember-800 hover:text-ember-950 p-1 rounded-lg hover:bg-ember-edge/20 cursor-pointer"
                                aria-label="Dismiss stale prose alert"
                                title="Dismiss"
                            >
                                <X size={13} className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Workspace Panes (Tabbed on Mobile, Tabbed or Split View on Desktop) */}
                <div className={isSceneSplitView ? 'grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-edge' : 'block'}>
                    <WriterBlueprintPane
                        isVisible={sceneWorkspaceTab === 'blueprint' || isSceneSplitView}
                        selectedSequence={selectedSequence}
                        selectedScene={selectedScene}
                        currentScene={currentScene}
                        activeStates={activeStates}
                        allModalityNames={allModalityNames}
                        parsedVS={parsedVS}
                        blueprintActiveTab={blueprintActiveTab}
                        setBlueprintActiveTab={setBlueprintActiveTab}
                        isEditingSceneBlueprint={isEditingSceneBlueprint}
                        setIsEditingSceneBlueprint={setIsEditingSceneBlueprint}
                        sceneBlueprintDraft={sceneBlueprintDraft}
                        setSceneBlueprintDraft={setSceneBlueprintDraft}
                        enterBlueprintEditMode={enterBlueprintEditMode}
                        handleSaveBlueprintDraft={handleSaveBlueprintDraft}
                        updateSceneBlueprint={updateSceneBlueprint}
                        updateCharacterStateForScene={updateCharacterStateForScene}
                        openEditModal={openEditModal}
                    />
                    <WriterManuscriptPane
                        isVisible={sceneWorkspaceTab === 'manuscript' || isSceneSplitView}
                        writerBeatKey={writerBeatKey}
                        selectedSequence={selectedSequence}
                        selectedScene={selectedScene}
                        story={story}
                        storyRef={storyRef}
                        setStory={setStory}
                        isInspectorMode={isInspectorMode}
                        collapsedBeats={collapsedBeats}
                        toggleBeats={toggleBeats}
                        expandedBeatAnalysis={expandedBeatAnalysis}
                        toggleBeatAnalysis={toggleBeatAnalysis}
                        loading={loading}
                        loadingImages={loadingImages}
                        loadedImages={loadedImages}
                        isRunningManualSlopClean={isRunningManualSlopClean}
                        writerSlopAudit={writerSlopAudit}
                        slopAuditDrawerOpen={slopAuditDrawerOpen}
                        setSlopAuditDrawerOpen={setSlopAuditDrawerOpen}
                        slopAuditFilter={slopAuditFilter}
                        setSlopAuditFilter={setSlopAuditFilter}
                        slopAllowlistExpanded={slopAllowlistExpanded}
                        setSlopAllowlistExpanded={setSlopAllowlistExpanded}
                        isEditingProseInline={isEditingProseInline}
                        setIsEditingProseInline={setIsEditingProseInline}
                        inlineProseDraft={inlineProseDraft}
                        setInlineProseDraft={setInlineProseDraft}
                        handleAutoGenerateScene={handleAutoGenerateScene}
                        handleAddBeat={handleAddBeat}
                        handleBeatChange={handleBeatChange}
                        handleDeleteBeat={handleDeleteBeat}
                        generateSceneImage={generateSceneImage}
                        generateBeatImage={generateBeatImage}
                        deleteSceneImage={deleteSceneImage}
                        deleteBeatImage={deleteBeatImage}
                        handleRunManualSlopClean={handleRunManualSlopClean}
                        handleAddStoryAllowlistItem={handleAddStoryAllowlistItem}
                        handleRemoveStoryAllowlistItem={handleRemoveStoryAllowlistItem}
                        openEditModal={openEditModal}
                        openCritiqueModal={openCritiqueModal}
                        showToast={showToast}
                    />
                </div>
            </div>
        </div>
    );
};
