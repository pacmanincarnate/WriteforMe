/**
 * @module views/writer/WriterBlueprintPane
 * Scene Blueprint editor and structured 4-tab view (Narrative, Hearts, Craft, Cast).
 */

import React from 'react';
import {
    Activity,
    Anchor,
    Check,
    Compass,
    Edit3,
    Heart,
    Layers,
    ListPlus,
    LogOut,
    Plus,
    Trash2,
    TrendingUp,
    X,
    EditButton
} from '@/components';
import { parseValueShiftInput } from '@/domain/story';
import type {
    WriterBlueprintPaneProps,
    WriterCharacterStateFields,
    WriterRelationshipChange,
    WriterSceneRecord
} from './types';

function toCleanStringArray(value: string[] | string | undefined): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
    if (typeof value === 'string') {
        return value
            .split(/[,;\n]+/)
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}

function normalizeReadRelationships(
    raw: Array<WriterRelationshipChange | string> | undefined
): WriterRelationshipChange[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) =>
        typeof item === 'object' && item !== null
            ? item
            : { from: '', to: '', feeling: String(item || ''), trigger: '' }
    );
}

export const WriterBlueprintPane: React.FC<WriterBlueprintPaneProps> = ({
    isVisible,
    selectedSequence,
    selectedScene,
    currentScene,
    activeStates,
    allModalityNames,
    parsedVS,
    blueprintActiveTab,
    setBlueprintActiveTab,
    setIsEditingSceneBlueprint,
    isEditingSceneBlueprint,
    sceneBlueprintDraft,
    setSceneBlueprintDraft,
    enterBlueprintEditMode,
    handleSaveBlueprintDraft,
    updateSceneBlueprint,
    updateCharacterStateForScene,
    openEditModal
}) => {
    const activationContexts = toCleanStringArray(currentScene.activation_contexts);
    const modalityHand = Array.isArray(currentScene.modality_hand) ? currentScene.modality_hand : [];
    const targetDeltas = Array.isArray(currentScene.target_epistemic_deltas)
        ? currentScene.target_epistemic_deltas
        : [];
    const plotCommitments = Array.isArray(currentScene.plot_commitments)
        ? currentScene.plot_commitments
        : typeof currentScene.plot_commitments === 'string' && currentScene.plot_commitments.trim()
          ? [currentScene.plot_commitments.trim()]
          : [];
    const relationshipChanges = normalizeReadRelationships(
        Array.isArray(currentScene.relationship_changes) && currentScene.relationship_changes.length > 0
            ? currentScene.relationship_changes
            : currentScene.relationship_shifts
    );

    const sandboxFields: Array<{
        field: keyof Pick<
            WriterSceneRecord,
            'surface_activity' | 'the_hinge_moment' | 'main_character_heart' | 'other_character_heart'
        >;
        label: string;
        accent: string;
        placeholder: string;
    }> = [
        {
            field: 'surface_activity',
            label: 'Surface Activity (Physical Action)',
            accent: 'text-ink-500',
            placeholder: 'No surface activity defined yet.'
        },
        {
            field: 'the_hinge_moment',
            label: 'The Hinge Moment (Turning Point)',
            accent: 'text-gold-ink',
            placeholder: 'No hinge moment defined yet.'
        },
        {
            field: 'main_character_heart',
            label: "POV / Main Character's Heart",
            accent: 'text-ink-500',
            placeholder: 'No POV heart subtext defined yet.'
        },
        {
            field: 'other_character_heart',
            label: "Counterpart's Heart",
            accent: 'text-ink-500',
            placeholder: 'No counterpart heart subtext defined yet.'
        }
    ];

    const craftFields: Array<{
        field: keyof Pick<
            WriterSceneRecord,
            | 'entrance_conditions'
            | 'exit_conditions'
            | 'micro_conflict_and_tactic'
            | 'sensory_palette'
            | 'scene_pacing_tempo'
            | 'character_voice_directives'
        >;
        label: string;
        placeholder: string;
    }> = [
        {
            field: 'entrance_conditions',
            label: 'Entrance Conditions',
            placeholder: 'No entrance conditions specified.'
        },
        {
            field: 'exit_conditions',
            label: 'Exit Conditions',
            placeholder: 'No exit conditions specified.'
        },
        {
            field: 'micro_conflict_and_tactic',
            label: 'Micro-Conflict & Tactic',
            placeholder: 'No micro-conflict / tactic specified.'
        },
        {
            field: 'sensory_palette',
            label: 'Sensory Palette (3 Anchors)',
            placeholder: 'No sensory palette anchors specified.'
        },
        {
            field: 'scene_pacing_tempo',
            label: 'Scene Pacing Tempo',
            placeholder: 'No pacing tempo specified.'
        },
        {
            field: 'character_voice_directives',
            label: 'Character Voice Directives',
            placeholder: 'No character voice directives specified.'
        }
    ];

    const stateFields: Array<{
        key: keyof Pick<
            WriterCharacterStateFields,
            | 'location'
            | 'emotional_state'
            | 'physical_state'
            | 'unresolved_tension'
            | 'holding'
            | 'immediate_objective'
            | 'epistemic_knowledge'
        >;
        label: string;
    }> = [
        { key: 'location', label: 'Location' },
        { key: 'emotional_state', label: 'Emotional State' },
        { key: 'physical_state', label: 'Physical State' },
        { key: 'unresolved_tension', label: 'Unresolved Tension' },
        { key: 'holding', label: 'Holding / Props' },
        { key: 'immediate_objective', label: 'Immediate Objective' },
        { key: 'epistemic_knowledge', label: 'Epistemic Knowledge' }
    ];

    return (
        <div className={isVisible ? 'block min-w-0' : 'hidden'}>
            {/* 4-Tab Blueprint Sub-Navigation + Inline Edit */}
            <div className="px-3 sm:px-5 pt-2.5 border-b border-edge bg-mist-50/30 flex items-center justify-between gap-2">
                <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto no-scrollbar min-w-0">
                    {[
                        { id: 'narrative', label: '1. Narrative' },
                        { id: 'sandbox', label: '2. Hearts' },
                        { id: 'atmosphere', label: '3. Craft' },
                        { id: 'continuity', label: `4. Cast (${activeStates.length})` }
                    ].map((tab) => {
                        const active = blueprintActiveTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setBlueprintActiveTab(tab.id)}
                                className={`px-1.5 sm:px-2.5 pt-1.5 pb-2 text-[11px] sm:text-xs font-bold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                                    active
                                        ? 'text-gold-ink border-gold'
                                        : 'text-ink-500 hover:text-ink-900 border-transparent'
                                }`}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 pb-1.5">
                    {isEditingSceneBlueprint ? (
                        <>
                            <button
                                type="button"
                                onClick={handleSaveBlueprintDraft}
                                className="bg-sage-tint hover:bg-sage-tint-strong border border-sage-edge text-sage-900 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                                <Check size={12} className="w-3 h-3" /> Save
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEditingSceneBlueprint(false);
                                    setSceneBlueprintDraft(null);
                                }}
                                className="bg-surface hover:bg-lift border border-edge-strong text-ink-700 px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={() => enterBlueprintEditMode(blueprintActiveTab)}
                            className="text-[11px] font-bold text-gold-ink bg-gold-tint hover:bg-gold/25 border border-gold-edge px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                        >
                            <Edit3 size={11} className="w-3 h-3" /> Edit
                        </button>
                    )}
                </div>
            </div>

            {/* Tab Body */}
            <div className="p-4 sm:p-5">
                {isEditingSceneBlueprint && sceneBlueprintDraft ? (
                    <div className="space-y-5 animate-fade-in">
                        {/* Edit Mode: Core Metadata Strip */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pb-4 border-b border-edge-soft">
                            <div className="space-y-1">
                                <label className="text-[11px] font-mono font-bold uppercase text-ink-500">Title</label>
                                <input
                                    type="text"
                                    value={sceneBlueprintDraft.title}
                                    onChange={(e) =>
                                        setSceneBlueprintDraft((prev) =>
                                            prev ? { ...prev, title: e.target.value } : prev
                                        )
                                    }
                                    className="w-full bg-inset border border-edge-strong rounded-xl px-3 py-2 text-sm text-ink-900 focus:border-gold outline-none"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-mono font-bold uppercase text-ink-500">
                                    POV Character
                                </label>
                                <input
                                    type="text"
                                    value={sceneBlueprintDraft.pov_character}
                                    onChange={(e) =>
                                        setSceneBlueprintDraft((prev) =>
                                            prev ? { ...prev, pov_character: e.target.value } : prev
                                        )
                                    }
                                    className="w-full bg-inset border border-edge-strong rounded-xl px-3 py-2 text-sm text-ink-900 focus:border-gold outline-none"
                                    placeholder="POV Character"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-mono font-bold uppercase text-ink-500">
                                    Setting
                                </label>
                                <input
                                    type="text"
                                    value={sceneBlueprintDraft.setting}
                                    onChange={(e) =>
                                        setSceneBlueprintDraft((prev) =>
                                            prev ? { ...prev, setting: e.target.value } : prev
                                        )
                                    }
                                    className="w-full bg-inset border border-edge-strong rounded-xl px-3 py-2 text-sm text-ink-900 focus:border-gold outline-none"
                                    placeholder="Physical location and time"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-mono font-bold uppercase text-ink-500">
                                    Transition Jump
                                </label>
                                <input
                                    type="text"
                                    value={sceneBlueprintDraft.transition_jump}
                                    onChange={(e) =>
                                        setSceneBlueprintDraft((prev) =>
                                            prev ? { ...prev, transition_jump: e.target.value } : prev
                                        )
                                    }
                                    className="w-full bg-inset border border-edge-strong rounded-xl px-3 py-2 text-sm text-ink-900 focus:border-gold outline-none"
                                    placeholder="Immediate continuation / transit..."
                                />
                            </div>
                        </div>

                        {blueprintActiveTab === 'narrative' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="space-y-1.5 lg:col-span-2">
                                    <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                        Objective / Dramatic Goal
                                    </label>
                                    <textarea
                                        value={sceneBlueprintDraft.objective}
                                        onChange={(e) =>
                                            setSceneBlueprintDraft((prev) =>
                                                prev ? { ...prev, objective: e.target.value } : prev
                                            )
                                        }
                                        rows={2}
                                        className="w-full bg-inset border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none font-serif"
                                        placeholder="What the POV character is trying to achieve or decide in this scene..."
                                    />
                                </div>
                                <div className="space-y-1.5 lg:col-span-2">
                                    <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                        Scene Events & Plot Points
                                    </label>
                                    <textarea
                                        value={sceneBlueprintDraft.scene_events}
                                        onChange={(e) =>
                                            setSceneBlueprintDraft((prev) =>
                                                prev ? { ...prev, scene_events: e.target.value } : prev
                                            )
                                        }
                                        rows={5}
                                        className="w-full bg-inset border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none font-serif leading-relaxed"
                                        placeholder="Concrete chronological plot events and dramatized beats..."
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                        Value Shift — Start State
                                    </label>
                                    <input
                                        type="text"
                                        value={sceneBlueprintDraft.value_shift_start}
                                        onChange={(e) =>
                                            setSceneBlueprintDraft((prev) =>
                                                prev ? { ...prev, value_shift_start: e.target.value } : prev
                                            )
                                        }
                                        className="w-full bg-inset border border-edge-strong rounded-xl px-3 py-2 text-sm text-ink-900 focus:border-gold outline-none"
                                        placeholder="Opening emotional/stakes charge (e.g. Safe)"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                        Value Shift — End State
                                    </label>
                                    <input
                                        type="text"
                                        value={sceneBlueprintDraft.value_shift_end}
                                        onChange={(e) =>
                                            setSceneBlueprintDraft((prev) =>
                                                prev ? { ...prev, value_shift_end: e.target.value } : prev
                                            )
                                        }
                                        className="w-full bg-inset border border-edge-strong rounded-xl px-3 py-2 text-sm text-ink-900 focus:border-gold outline-none"
                                        placeholder="Closing charge (e.g. Compromised)"
                                    />
                                </div>
                                <div className="space-y-1.5 lg:col-span-2">
                                    <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                        Exit Hook
                                    </label>
                                    <textarea
                                        value={sceneBlueprintDraft.exit_hook}
                                        onChange={(e) =>
                                            setSceneBlueprintDraft((prev) =>
                                                prev ? { ...prev, exit_hook: e.target.value } : prev
                                            )
                                        }
                                        rows={2}
                                        className="w-full bg-inset border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none font-serif"
                                        placeholder="The lingering turn or unresolved cliffhanger launching the next scene..."
                                    />
                                </div>
                            </div>
                        )}

                        {blueprintActiveTab === 'sandbox' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                        Surface Activity (Physical Action)
                                    </label>
                                    <textarea
                                        value={sceneBlueprintDraft.surface_activity}
                                        onChange={(e) =>
                                            setSceneBlueprintDraft((prev) =>
                                                prev ? { ...prev, surface_activity: e.target.value } : prev
                                            )
                                        }
                                        rows={3}
                                        className="w-full bg-inset border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none font-serif"
                                        placeholder="What the characters are physically doing with their hands/environment..."
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-mono font-bold uppercase text-gold-ink">
                                        The Hinge Moment (Turning Point)
                                    </label>
                                    <textarea
                                        value={sceneBlueprintDraft.the_hinge_moment}
                                        onChange={(e) =>
                                            setSceneBlueprintDraft((prev) =>
                                                prev ? { ...prev, the_hinge_moment: e.target.value } : prev
                                            )
                                        }
                                        rows={3}
                                        className="w-full bg-inset border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none font-serif"
                                        placeholder="Specific gesture, slip, or discovery where the balance shifts..."
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                        POV / Main Character&apos;s Heart
                                    </label>
                                    <textarea
                                        value={sceneBlueprintDraft.main_character_heart}
                                        onChange={(e) =>
                                            setSceneBlueprintDraft((prev) =>
                                                prev ? { ...prev, main_character_heart: e.target.value } : prev
                                            )
                                        }
                                        rows={3}
                                        className="w-full bg-inset border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none font-serif"
                                        placeholder="Quiet yearning, defense mechanism, or unspoken fear..."
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                        Counterpart&apos;s Heart
                                    </label>
                                    <textarea
                                        value={sceneBlueprintDraft.other_character_heart}
                                        onChange={(e) =>
                                            setSceneBlueprintDraft((prev) =>
                                                prev ? { ...prev, other_character_heart: e.target.value } : prev
                                            )
                                        }
                                        rows={3}
                                        className="w-full bg-inset border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none font-serif"
                                        placeholder="What the counterpart is quietly trying to offer, protect, or conceal..."
                                    />
                                </div>
                            </div>
                        )}

                        {blueprintActiveTab === 'atmosphere' && (
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                        Atmospheric Overview
                                    </label>
                                    <textarea
                                        value={sceneBlueprintDraft.atmospheric_overview}
                                        onChange={(e) =>
                                            setSceneBlueprintDraft((prev) =>
                                                prev ? { ...prev, atmospheric_overview: e.target.value } : prev
                                            )
                                        }
                                        rows={4}
                                        className="w-full bg-inset border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none font-serif leading-relaxed"
                                        placeholder="Rich environmental atmosphere, lighting, spatial mood..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-mono font-bold uppercase text-ink-600 block">
                                        Modality Hand (Click to toggle)
                                    </label>
                                    <div className="flex flex-wrap gap-1.5 bg-inset p-3 rounded-xl border border-edge-strong">
                                        {allModalityNames.map((modName, mIdx) => {
                                            const active = (sceneBlueprintDraft.modality_hand || []).some(
                                                (m) => m.toLowerCase() === modName.toLowerCase()
                                            );
                                            return (
                                                <button
                                                    key={mIdx}
                                                    type="button"
                                                    onClick={() => {
                                                        setSceneBlueprintDraft((prev) => {
                                                            if (!prev) return prev;
                                                            const cur = prev.modality_hand || [];
                                                            const next = active
                                                                ? cur.filter(
                                                                      (m) => m.toLowerCase() !== modName.toLowerCase()
                                                                  )
                                                                : [...cur, modName];
                                                            return { ...prev, modality_hand: next };
                                                        });
                                                    }}
                                                    className={`text-xs font-mono px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                                                        active
                                                            ? 'bg-gold-tint text-gold-ink border-gold-edge font-bold'
                                                            : 'bg-surface text-ink-600 border-edge hover:border-edge-strong'
                                                    }`}
                                                >
                                                    {active ? '✓ ' : '+ '}
                                                    {modName}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                            Entrance Conditions
                                        </label>
                                        <textarea
                                            value={sceneBlueprintDraft.entrance_conditions}
                                            onChange={(e) =>
                                                setSceneBlueprintDraft((prev) =>
                                                    prev ? { ...prev, entrance_conditions: e.target.value } : prev
                                                )
                                            }
                                            rows={2}
                                            className="w-full bg-inset border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none"
                                            placeholder="Starting locations, held props, prior awareness..."
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                            Exit Conditions
                                        </label>
                                        <textarea
                                            value={sceneBlueprintDraft.exit_conditions}
                                            onChange={(e) =>
                                                setSceneBlueprintDraft((prev) =>
                                                    prev ? { ...prev, exit_conditions: e.target.value } : prev
                                                )
                                            }
                                            rows={2}
                                            className="w-full bg-inset border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none"
                                            placeholder="Closing positions, outcomes, carry-over state..."
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                            Micro-Conflict & Tactic
                                        </label>
                                        <textarea
                                            value={sceneBlueprintDraft.micro_conflict_and_tactic}
                                            onChange={(e) =>
                                                setSceneBlueprintDraft((prev) =>
                                                    prev
                                                        ? { ...prev, micro_conflict_and_tactic: e.target.value }
                                                        : prev
                                                )
                                            }
                                            rows={2}
                                            className="w-full bg-inset border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none"
                                            placeholder="Immediate obstacle in the room and tactical maneuver..."
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                            Sensory Palette
                                        </label>
                                        <textarea
                                            value={sceneBlueprintDraft.sensory_palette}
                                            onChange={(e) =>
                                                setSceneBlueprintDraft((prev) =>
                                                    prev ? { ...prev, sensory_palette: e.target.value } : prev
                                                )
                                            }
                                            rows={2}
                                            className="w-full bg-inset border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none"
                                            placeholder="Acoustic, tactile, visual/lighting sensory anchors..."
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                            Scene Pacing Tempo
                                        </label>
                                        <input
                                            type="text"
                                            value={sceneBlueprintDraft.scene_pacing_tempo}
                                            onChange={(e) =>
                                                setSceneBlueprintDraft((prev) =>
                                                    prev ? { ...prev, scene_pacing_tempo: e.target.value } : prev
                                                )
                                            }
                                            className="w-full bg-inset border border-edge-strong rounded-xl px-3 py-2 text-sm text-ink-900 focus:border-gold outline-none"
                                            placeholder="Rhythm, sentence velocity, pause structure..."
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                            Character Voice Directives
                                        </label>
                                        <textarea
                                            value={sceneBlueprintDraft.character_voice_directives}
                                            onChange={(e) =>
                                                setSceneBlueprintDraft((prev) =>
                                                    prev
                                                        ? { ...prev, character_voice_directives: e.target.value }
                                                        : prev
                                                )
                                            }
                                            rows={2}
                                            className="w-full bg-inset border border-edge-strong rounded-xl p-3 text-sm text-ink-900 focus:border-gold outline-none"
                                            placeholder="Speech cadence, verbal deflection, subtext markers..."
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {blueprintActiveTab === 'continuity' && (
                            <div className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                            Epistemic Friction Level
                                        </label>
                                        <select
                                            value={sceneBlueprintDraft.epistemic_friction_level}
                                            onChange={(e) =>
                                                setSceneBlueprintDraft((prev) =>
                                                    prev ? { ...prev, epistemic_friction_level: e.target.value } : prev
                                                )
                                            }
                                            className="w-full bg-inset border border-edge-strong rounded-xl px-3 py-2 text-sm text-ink-900 focus:border-gold outline-none"
                                        >
                                            <option value="">Unspecified</option>
                                            <option value="HIGH">HIGH</option>
                                            <option value="MODERATE">MODERATE</option>
                                            <option value="LOW">LOW</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5 md:col-span-2">
                                        <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                            Activation Contexts (Comma-separated)
                                        </label>
                                        <input
                                            type="text"
                                            value={sceneBlueprintDraft.activation_contexts_text}
                                            onChange={(e) =>
                                                setSceneBlueprintDraft((prev) =>
                                                    prev ? { ...prev, activation_contexts_text: e.target.value } : prev
                                                )
                                            }
                                            className="w-full bg-inset border border-edge-strong rounded-xl px-3 py-2 text-sm text-ink-900 focus:border-gold outline-none"
                                            placeholder="INVESTIGATION, CONFRONTATION, PSYCHOLOGICAL_CORE..."
                                        />
                                    </div>
                                </div>

                                {/* Editable Target Epistemic Deltas */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                            Target Epistemic Deltas ({sceneBlueprintDraft.target_epistemic_deltas.length})
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSceneBlueprintDraft((prev) =>
                                                    prev
                                                        ? {
                                                              ...prev,
                                                              target_epistemic_deltas: [
                                                                  ...prev.target_epistemic_deltas,
                                                                  {
                                                                      holder: prev.pov_character || '',
                                                                      proposition_id: '',
                                                                      operation: 'ELEVATE_SUSPICION',
                                                                      to_stance: 'SUSPECTS_TRUE',
                                                                      to_confidence: 0.45,
                                                                      trigger_clue: ''
                                                                  }
                                                              ]
                                                          }
                                                        : prev
                                                )
                                            }
                                            className="text-xs font-bold text-gold-ink bg-gold-tint/60 border border-gold-edge px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                                        >
                                            <Plus size={12} /> Add Delta
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {sceneBlueprintDraft.target_epistemic_deltas.map((delta, dIdx) => (
                                            <div
                                                key={dIdx}
                                                className="bg-inset p-3 rounded-xl border border-edge-strong grid grid-cols-1 sm:grid-cols-6 gap-2 items-center"
                                            >
                                                <input
                                                    type="text"
                                                    value={delta.holder}
                                                    onChange={(e) =>
                                                        setSceneBlueprintDraft((prev) =>
                                                            prev
                                                                ? {
                                                                      ...prev,
                                                                      target_epistemic_deltas:
                                                                          prev.target_epistemic_deltas.map((it, i) =>
                                                                              i === dIdx
                                                                                  ? { ...it, holder: e.target.value }
                                                                                  : it
                                                                          )
                                                                  }
                                                                : prev
                                                        )
                                                    }
                                                    className="bg-surface border border-edge rounded-lg px-2 py-1 text-xs"
                                                    placeholder="Holder"
                                                />
                                                <input
                                                    type="text"
                                                    value={delta.proposition_id}
                                                    onChange={(e) =>
                                                        setSceneBlueprintDraft((prev) =>
                                                            prev
                                                                ? {
                                                                      ...prev,
                                                                      target_epistemic_deltas:
                                                                          prev.target_epistemic_deltas.map((it, i) =>
                                                                              i === dIdx
                                                                                  ? {
                                                                                        ...it,
                                                                                        proposition_id: e.target.value
                                                                                    }
                                                                                  : it
                                                                          )
                                                                  }
                                                                : prev
                                                        )
                                                    }
                                                    className="bg-surface border border-edge rounded-lg px-2 py-1 text-xs"
                                                    placeholder="Proposition ID"
                                                />
                                                <select
                                                    value={delta.operation}
                                                    onChange={(e) =>
                                                        setSceneBlueprintDraft((prev) =>
                                                            prev
                                                                ? {
                                                                      ...prev,
                                                                      target_epistemic_deltas:
                                                                          prev.target_epistemic_deltas.map((it, i) =>
                                                                              i === dIdx
                                                                                  ? { ...it, operation: e.target.value }
                                                                                  : it
                                                                          )
                                                                  }
                                                                : prev
                                                        )
                                                    }
                                                    className="bg-surface border border-edge rounded-lg px-2 py-1 text-xs"
                                                >
                                                    <option value="ELEVATE_SUSPICION">ELEVATE_SUSPICION</option>
                                                    <option value="ACQUIRE">ACQUIRE</option>
                                                    <option value="INVALIDATE">INVALIDATE</option>
                                                </select>
                                                <select
                                                    value={delta.to_stance}
                                                    onChange={(e) =>
                                                        setSceneBlueprintDraft((prev) =>
                                                            prev
                                                                ? {
                                                                      ...prev,
                                                                      target_epistemic_deltas:
                                                                          prev.target_epistemic_deltas.map((it, i) =>
                                                                              i === dIdx
                                                                                  ? { ...it, to_stance: e.target.value }
                                                                                  : it
                                                                          )
                                                                  }
                                                                : prev
                                                        )
                                                    }
                                                    className="bg-surface border border-edge rounded-lg px-2 py-1 text-xs"
                                                >
                                                    <option value="UNAWARE">UNAWARE</option>
                                                    <option value="SUSPECTS_TRUE">SUSPECTS_TRUE</option>
                                                    <option value="BELIEVES_TRUE">BELIEVES_TRUE</option>
                                                    <option value="BELIEVES_FALSE">BELIEVES_FALSE</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    value={delta.trigger_clue}
                                                    onChange={(e) =>
                                                        setSceneBlueprintDraft((prev) =>
                                                            prev
                                                                ? {
                                                                      ...prev,
                                                                      target_epistemic_deltas:
                                                                          prev.target_epistemic_deltas.map((it, i) =>
                                                                              i === dIdx
                                                                                  ? {
                                                                                        ...it,
                                                                                        trigger_clue: e.target.value
                                                                                    }
                                                                                  : it
                                                                          )
                                                                  }
                                                                : prev
                                                        )
                                                    }
                                                    className="bg-surface border border-edge rounded-lg px-2 py-1 text-xs"
                                                    placeholder="Trigger clue..."
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSceneBlueprintDraft((prev) =>
                                                            prev
                                                                ? {
                                                                      ...prev,
                                                                      target_epistemic_deltas:
                                                                          prev.target_epistemic_deltas.filter(
                                                                              (_, i) => i !== dIdx
                                                                          )
                                                                  }
                                                                : prev
                                                        )
                                                    }
                                                    className="text-ink-400 hover:text-blush-600 p-1 justify-self-end cursor-pointer"
                                                    title="Remove Delta"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Editable Plot Commitments */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                            Planned Plot Commitments ({sceneBlueprintDraft.plot_commitments.length})
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSceneBlueprintDraft((prev) =>
                                                    prev
                                                        ? {
                                                              ...prev,
                                                              plot_commitments: [...prev.plot_commitments, '']
                                                          }
                                                        : prev
                                                )
                                            }
                                            className="text-xs font-bold text-gold-ink bg-gold-tint/60 border border-gold-edge px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                                        >
                                            <Plus size={12} /> Add Commitment
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {sceneBlueprintDraft.plot_commitments.map((pc, pIdx) => (
                                            <div
                                                key={pIdx}
                                                className="bg-inset p-3 rounded-xl border border-edge-strong flex items-start gap-2"
                                            >
                                                {typeof pc === 'object' && pc !== null ? (
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                                                        <input
                                                            type="text"
                                                            value={pc.description || ''}
                                                            onChange={(e) =>
                                                                setSceneBlueprintDraft((prev) =>
                                                                    prev
                                                                        ? {
                                                                              ...prev,
                                                                              plot_commitments:
                                                                                  prev.plot_commitments.map((it, i) =>
                                                                                      i === pIdx &&
                                                                                      typeof it === 'object' &&
                                                                                      it !== null
                                                                                          ? {
                                                                                                ...it,
                                                                                                description:
                                                                                                    e.target.value
                                                                                            }
                                                                                          : it
                                                                                  )
                                                                          }
                                                                        : prev
                                                                )
                                                            }
                                                            className="bg-surface border border-edge rounded-lg px-2.5 py-1.5 text-xs"
                                                            placeholder="Commitment description"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={pc.exact_terms || ''}
                                                            onChange={(e) =>
                                                                setSceneBlueprintDraft((prev) =>
                                                                    prev
                                                                        ? {
                                                                              ...prev,
                                                                              plot_commitments:
                                                                                  prev.plot_commitments.map((it, i) =>
                                                                                      i === pIdx &&
                                                                                      typeof it === 'object' &&
                                                                                      it !== null
                                                                                          ? {
                                                                                                ...it,
                                                                                                exact_terms:
                                                                                                    e.target.value
                                                                                            }
                                                                                          : it
                                                                                  )
                                                                          }
                                                                        : prev
                                                                )
                                                            }
                                                            className="bg-surface border border-edge rounded-lg px-2.5 py-1.5 text-xs"
                                                            placeholder="Exact terms"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={pc.consequence || ''}
                                                            onChange={(e) =>
                                                                setSceneBlueprintDraft((prev) =>
                                                                    prev
                                                                        ? {
                                                                              ...prev,
                                                                              plot_commitments:
                                                                                  prev.plot_commitments.map((it, i) =>
                                                                                      i === pIdx &&
                                                                                      typeof it === 'object' &&
                                                                                      it !== null
                                                                                          ? {
                                                                                                ...it,
                                                                                                consequence:
                                                                                                    e.target.value
                                                                                            }
                                                                                          : it
                                                                                  )
                                                                          }
                                                                        : prev
                                                                )
                                                            }
                                                            className="bg-surface border border-edge rounded-lg px-2.5 py-1.5 text-xs"
                                                            placeholder="Consequence"
                                                        />
                                                    </div>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={String(pc || '')}
                                                        onChange={(e) =>
                                                            setSceneBlueprintDraft((prev) =>
                                                                prev
                                                                    ? {
                                                                          ...prev,
                                                                          plot_commitments: prev.plot_commitments.map(
                                                                              (it, i) =>
                                                                                  i === pIdx ? e.target.value : it
                                                                          )
                                                                      }
                                                                    : prev
                                                            )
                                                        }
                                                        className="flex-1 bg-surface border border-edge rounded-lg px-2.5 py-1.5 text-xs"
                                                        placeholder="Plot commitment..."
                                                    />
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSceneBlueprintDraft((prev) =>
                                                            prev
                                                                ? {
                                                                      ...prev,
                                                                      plot_commitments: prev.plot_commitments.filter(
                                                                          (_, i) => i !== pIdx
                                                                      )
                                                                  }
                                                                : prev
                                                        )
                                                    }
                                                    className="text-ink-400 hover:text-blush-600 p-1 cursor-pointer"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Editable Relationship Transformations */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-mono font-bold uppercase text-ink-600">
                                            Planned Relationship Transformations (
                                            {sceneBlueprintDraft.relationship_changes.length})
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSceneBlueprintDraft((prev) =>
                                                    prev
                                                        ? {
                                                              ...prev,
                                                              relationship_changes: [
                                                                  ...prev.relationship_changes,
                                                                  { from: '', to: '', feeling: '', trigger: '' }
                                                              ]
                                                          }
                                                        : prev
                                                )
                                            }
                                            className="text-xs font-bold text-blush-800 bg-blush-tint border border-blush-edge px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                                        >
                                            <Plus size={12} /> Add Relationship Shift
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {sceneBlueprintDraft.relationship_changes.map((rc, rIdx) => (
                                            <div
                                                key={rIdx}
                                                className="bg-inset p-3 rounded-xl border border-edge-strong grid grid-cols-1 sm:grid-cols-5 gap-2 items-center"
                                            >
                                                <input
                                                    type="text"
                                                    value={rc.from || ''}
                                                    onChange={(e) =>
                                                        setSceneBlueprintDraft((prev) =>
                                                            prev
                                                                ? {
                                                                      ...prev,
                                                                      relationship_changes:
                                                                          prev.relationship_changes.map((it, i) =>
                                                                              i === rIdx
                                                                                  ? { ...it, from: e.target.value }
                                                                                  : it
                                                                          )
                                                                  }
                                                                : prev
                                                        )
                                                    }
                                                    className="bg-surface border border-edge rounded-lg px-2 py-1 text-xs"
                                                    placeholder="From character"
                                                />
                                                <input
                                                    type="text"
                                                    value={rc.to || ''}
                                                    onChange={(e) =>
                                                        setSceneBlueprintDraft((prev) =>
                                                            prev
                                                                ? {
                                                                      ...prev,
                                                                      relationship_changes:
                                                                          prev.relationship_changes.map((it, i) =>
                                                                              i === rIdx
                                                                                  ? { ...it, to: e.target.value }
                                                                                  : it
                                                                          )
                                                                  }
                                                                : prev
                                                        )
                                                    }
                                                    className="bg-surface border border-edge rounded-lg px-2 py-1 text-xs"
                                                    placeholder="To character"
                                                />
                                                <input
                                                    type="text"
                                                    value={rc.feeling || ''}
                                                    onChange={(e) =>
                                                        setSceneBlueprintDraft((prev) =>
                                                            prev
                                                                ? {
                                                                      ...prev,
                                                                      relationship_changes:
                                                                          prev.relationship_changes.map((it, i) =>
                                                                              i === rIdx
                                                                                  ? { ...it, feeling: e.target.value }
                                                                                  : it
                                                                          )
                                                                  }
                                                                : prev
                                                        )
                                                    }
                                                    className="bg-surface border border-edge rounded-lg px-2 py-1 text-xs"
                                                    placeholder="Shifted feeling"
                                                />
                                                <input
                                                    type="text"
                                                    value={rc.trigger || ''}
                                                    onChange={(e) =>
                                                        setSceneBlueprintDraft((prev) =>
                                                            prev
                                                                ? {
                                                                      ...prev,
                                                                      relationship_changes:
                                                                          prev.relationship_changes.map((it, i) =>
                                                                              i === rIdx
                                                                                  ? { ...it, trigger: e.target.value }
                                                                                  : it
                                                                          )
                                                                  }
                                                                : prev
                                                        )
                                                    }
                                                    className="bg-surface border border-edge rounded-lg px-2 py-1 text-xs"
                                                    placeholder="Catalyst / Trigger"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSceneBlueprintDraft((prev) =>
                                                            prev
                                                                ? {
                                                                      ...prev,
                                                                      relationship_changes:
                                                                          prev.relationship_changes.filter(
                                                                              (_, i) => i !== rIdx
                                                                          )
                                                                  }
                                                                : prev
                                                        )
                                                    }
                                                    className="text-ink-400 hover:text-blush-600 p-1 justify-self-end cursor-pointer"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* View Mode (Every Field Always Visible & Directly Editable) */
                    <div className="space-y-4">
                        {blueprintActiveTab === 'narrative' && (
                            <div className="space-y-4">
                                <div className="bg-inset p-4 rounded-xl border border-edge-strong">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs font-mono font-bold uppercase text-ink-500">
                                            Objective / Dramatic Goal
                                        </span>
                                        <EditButton
                                            title="Objective / Goal"
                                            value={currentScene.objective || currentScene.goal || ''}
                                            onSave={() =>
                                                openEditModal(
                                                    'Objective / Dramatic Goal',
                                                    currentScene.objective || currentScene.goal || '',
                                                    (val) =>
                                                        updateSceneBlueprint(selectedSequence, selectedScene, {
                                                            objective: val,
                                                            goal: val
                                                        })
                                                )
                                            }
                                        />
                                    </div>
                                    {currentScene.objective || currentScene.goal ? (
                                        <p className="text-sm text-ink-900 font-medium leading-relaxed font-serif">
                                            {currentScene.objective || currentScene.goal}
                                        </p>
                                    ) : (
                                        <p className="text-xs italic text-ink-400">No objective specified yet.</p>
                                    )}
                                </div>

                                <div className="bg-inset p-4 rounded-xl border border-edge-strong">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs font-mono font-bold uppercase text-ink-500 flex items-center gap-1.5">
                                            <ListPlus size={13} className="text-gold-ink" /> Scene Events & Plot Points
                                        </span>
                                        <EditButton
                                            title="Scene Events & Plot Points"
                                            value={currentScene.scene_events || ''}
                                            onSave={() =>
                                                openEditModal(
                                                    'Scene Events & Plot Points',
                                                    currentScene.scene_events || '',
                                                    (val) =>
                                                        updateSceneBlueprint(selectedSequence, selectedScene, {
                                                            scene_events: val
                                                        })
                                                )
                                            }
                                        />
                                    </div>
                                    {currentScene.scene_events ? (
                                        <div className="text-sm text-ink-800 font-serif leading-relaxed whitespace-pre-wrap">
                                            {currentScene.scene_events}
                                        </div>
                                    ) : (
                                        <p className="text-xs italic text-ink-400">No scene events specified yet.</p>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-inset p-4 rounded-xl border border-edge-strong">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-mono font-bold uppercase text-ink-500 flex items-center gap-1.5">
                                                <TrendingUp size={13} className="text-gold-ink" /> Value Shift (Start ➔
                                                End)
                                            </span>
                                            <EditButton
                                                title="Value Shift"
                                                value={
                                                    parsedVS.start_state || parsedVS.end_state
                                                        ? `${parsedVS.start_state} -> ${parsedVS.end_state}`
                                                        : ''
                                                }
                                                onSave={() =>
                                                    openEditModal(
                                                        'Value Shift (Start -> End)',
                                                        parsedVS.start_state || parsedVS.end_state
                                                            ? `${parsedVS.start_state} -> ${parsedVS.end_state}`
                                                            : '',
                                                        (val) =>
                                                            updateSceneBlueprint(selectedSequence, selectedScene, {
                                                                value_shift: parseValueShiftInput(val)
                                                            })
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-sm font-mono font-bold text-ink-900">
                                            <span className="bg-surface px-2.5 py-1 rounded-lg border border-edge flex items-center gap-1.5">
                                                <span
                                                    className={parsedVS.start_state ? '' : 'italic font-normal text-ink-400'}
                                                >
                                                    {parsedVS.start_state || 'Start state'}
                                                </span>
                                                <EditButton
                                                    title="Start State"
                                                    value={parsedVS.start_state}
                                                    onSave={() =>
                                                        openEditModal(
                                                            'Value Shift — Start State',
                                                            parsedVS.start_state,
                                                            (val) =>
                                                                updateSceneBlueprint(selectedSequence, selectedScene, {
                                                                    value_shift: {
                                                                        start_state: val,
                                                                        end_state: parsedVS.end_state
                                                                    }
                                                                })
                                                        )
                                                    }
                                                />
                                            </span>
                                            <span className="text-gold-ink">➔</span>
                                            <span className="bg-surface px-2.5 py-1 rounded-lg border border-edge flex items-center gap-1.5">
                                                <span
                                                    className={parsedVS.end_state ? '' : 'italic font-normal text-ink-400'}
                                                >
                                                    {parsedVS.end_state || 'End state'}
                                                </span>
                                                <EditButton
                                                    title="End State"
                                                    value={parsedVS.end_state}
                                                    onSave={() =>
                                                        openEditModal(
                                                            'Value Shift — End State',
                                                            parsedVS.end_state,
                                                            (val) =>
                                                                updateSceneBlueprint(selectedSequence, selectedScene, {
                                                                    value_shift: {
                                                                        start_state: parsedVS.start_state,
                                                                        end_state: val
                                                                    }
                                                                })
                                                        )
                                                    }
                                                />
                                            </span>
                                        </div>
                                    </div>

                                    <div className="bg-inset p-4 rounded-xl border border-edge-strong">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs font-mono font-bold uppercase text-ink-500 flex items-center gap-1.5">
                                                <LogOut size={13} className="text-ink-400" /> Exit Hook
                                            </span>
                                            <EditButton
                                                title="Exit Hook"
                                                value={currentScene.exit_hook || ''}
                                                onSave={() =>
                                                    openEditModal('Exit Hook', currentScene.exit_hook || '', (val) =>
                                                        updateSceneBlueprint(selectedSequence, selectedScene, {
                                                            exit_hook: val
                                                        })
                                                    )
                                                }
                                            />
                                        </div>
                                        {currentScene.exit_hook ? (
                                            <p className="text-sm text-ink-800 font-serif leading-relaxed">
                                                {currentScene.exit_hook}
                                            </p>
                                        ) : (
                                            <p className="text-xs italic text-ink-400">No exit hook specified yet.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {blueprintActiveTab === 'sandbox' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {sandboxFields.map((item) => {
                                    const fieldValue = String(currentScene[item.field] || '');
                                    return (
                                        <div key={item.field} className="p-4 bg-inset rounded-xl border border-edge-strong">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className={`text-xs font-mono font-bold uppercase ${item.accent}`}>
                                                    {item.label}
                                                </span>
                                                <EditButton
                                                    title={item.label}
                                                    value={fieldValue}
                                                    onSave={() =>
                                                        openEditModal(item.label, fieldValue, (val) =>
                                                            updateSceneBlueprint(selectedSequence, selectedScene, {
                                                                [item.field]: val
                                                            })
                                                        )
                                                    }
                                                />
                                            </div>
                                            {fieldValue ? (
                                                <p className="text-sm text-ink-800 font-serif leading-relaxed whitespace-pre-wrap">
                                                    {fieldValue}
                                                </p>
                                            ) : (
                                                <p className="text-xs italic text-ink-400">{item.placeholder}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {blueprintActiveTab === 'atmosphere' && (
                            <div className="space-y-4">
                                <div className="bg-inset p-4 rounded-xl border border-edge-strong">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs font-mono font-bold uppercase text-ink-500 flex items-center gap-1.5">
                                            <Compass size={13} className="text-gold-ink" /> Atmospheric Overview
                                        </span>
                                        <EditButton
                                            title="Atmospheric Overview"
                                            value={currentScene.atmospheric_overview || ''}
                                            onSave={() =>
                                                openEditModal(
                                                    'Atmospheric Overview',
                                                    currentScene.atmospheric_overview || '',
                                                    (val) =>
                                                        updateSceneBlueprint(selectedSequence, selectedScene, {
                                                            atmospheric_overview: val
                                                        })
                                                )
                                            }
                                        />
                                    </div>
                                    {currentScene.atmospheric_overview ? (
                                        <p className="text-sm text-ink-800 font-serif leading-relaxed whitespace-pre-wrap">
                                            {currentScene.atmospheric_overview}
                                        </p>
                                    ) : (
                                        <p className="text-xs italic text-ink-400">No atmospheric overview written yet.</p>
                                    )}
                                </div>

                                <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-mono font-bold uppercase text-ink-500 flex items-center gap-1.5">
                                            <Layers size={13} className="text-gold-ink" /> Modality Hand
                                        </span>
                                        <EditButton
                                            title="Modality Hand"
                                            value={modalityHand.join(', ')}
                                            onSave={() =>
                                                openEditModal(
                                                    'Modality Hand (comma-separated)',
                                                    modalityHand.join(', '),
                                                    (val) =>
                                                        updateSceneBlueprint(selectedSequence, selectedScene, {
                                                            modality_hand: String(val || '')
                                                                .split(/[,;\n]+/)
                                                                .map((x) => x.trim())
                                                                .filter(Boolean)
                                                        })
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {modalityHand.map((mod, mIdx) => (
                                            <span
                                                key={mIdx}
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-gold-ink bg-gold-tint border border-gold-edge px-2.5 py-1 rounded-full font-mono"
                                            >
                                                <span>{mod}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const nextHand = modalityHand.filter((_, i) => i !== mIdx);
                                                        updateSceneBlueprint(selectedSequence, selectedScene, {
                                                            modality_hand: nextHand
                                                        });
                                                    }}
                                                    className="hover:text-blush-600 cursor-pointer"
                                                    title="Remove modality"
                                                >
                                                    <X size={11} />
                                                </button>
                                            </span>
                                        ))}
                                        <select
                                            value=""
                                            onChange={(e) => {
                                                if (!e.target.value) return;
                                                const cur = Array.isArray(currentScene.modality_hand)
                                                    ? currentScene.modality_hand
                                                    : [];
                                                if (
                                                    !cur.some(
                                                        (m) => m.toLowerCase() === e.target.value.toLowerCase()
                                                    )
                                                ) {
                                                    updateSceneBlueprint(selectedSequence, selectedScene, {
                                                        modality_hand: [...cur, e.target.value]
                                                    });
                                                }
                                            }}
                                            className="text-xs font-mono bg-surface border border-dashed border-edge-strong text-ink-700 rounded-full px-2.5 py-1 outline-none cursor-pointer"
                                        >
                                            <option value="">+ Add Modality</option>
                                            {allModalityNames
                                                .filter(
                                                    (mn) =>
                                                        !modalityHand.some(
                                                            (m) => m.toLowerCase() === mn.toLowerCase()
                                                        )
                                                )
                                                .map((mn, i) => (
                                                    <option key={i} value={mn} className="bg-surface text-ink-900">
                                                        {mn}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {craftFields.map((item) => {
                                        const fieldValue = String(currentScene[item.field] || '');
                                        return (
                                            <div key={item.field} className="p-4 bg-inset rounded-xl border border-edge-strong">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-xs font-mono font-bold uppercase text-ink-500">
                                                        {item.label}
                                                    </span>
                                                    <EditButton
                                                        title={item.label}
                                                        value={fieldValue}
                                                        onSave={() =>
                                                            openEditModal(item.label, fieldValue, (val) =>
                                                                updateSceneBlueprint(selectedSequence, selectedScene, {
                                                                    [item.field]: val
                                                                })
                                                            )
                                                        }
                                                    />
                                                </div>
                                                {fieldValue ? (
                                                    <p className="text-sm text-ink-800 leading-relaxed whitespace-pre-line">
                                                        {fieldValue}
                                                    </p>
                                                ) : (
                                                    <p className="text-xs italic text-ink-400">{item.placeholder}</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {blueprintActiveTab === 'continuity' && (
                            <div className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-inset p-4 rounded-xl border border-edge-strong">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-mono font-bold uppercase text-ink-500">
                                                Epistemic Friction Level
                                            </span>
                                            <select
                                                value={currentScene.epistemic_friction_level || ''}
                                                onChange={(e) =>
                                                    updateSceneBlueprint(selectedSequence, selectedScene, {
                                                        epistemic_friction_level: e.target.value
                                                    })
                                                }
                                                className="bg-surface border border-edge-strong text-ink-900 rounded-lg px-2.5 py-1 text-xs font-mono font-bold outline-none cursor-pointer"
                                            >
                                                <option value="">Unspecified</option>
                                                <option value="HIGH">HIGH</option>
                                                <option value="MODERATE">MODERATE</option>
                                                <option value="LOW">LOW</option>
                                            </select>
                                        </div>
                                        <p className="text-xs text-ink-600">
                                            Active Level:{' '}
                                            <span className="font-mono font-bold text-ink-900">
                                                {currentScene.epistemic_friction_level || 'Unset'}
                                            </span>
                                        </p>
                                    </div>

                                    <div className="bg-inset p-4 rounded-xl border border-edge-strong">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-mono font-bold uppercase text-ink-500">
                                                Activation Contexts
                                            </span>
                                            <EditButton
                                                title="Activation Contexts"
                                                value={activationContexts.join(', ')}
                                                onSave={() =>
                                                    openEditModal(
                                                        'Activation Contexts (comma-separated)',
                                                        activationContexts.join(', '),
                                                        (val) =>
                                                            updateSceneBlueprint(selectedSequence, selectedScene, {
                                                                activation_contexts: String(val || '')
                                                                    .split(/[,;\n]+/)
                                                                    .map((x) => x.trim())
                                                                    .filter(Boolean)
                                                            })
                                                    )
                                                }
                                            />
                                        </div>
                                        {activationContexts.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {activationContexts.map((ctx, cIdx) => (
                                                    <span
                                                        key={cIdx}
                                                        className="inline-flex items-center gap-1 text-xs font-mono bg-surface border border-edge-strong px-2 py-0.5 rounded-full text-ink-800"
                                                    >
                                                        <span>{ctx}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                updateSceneBlueprint(selectedSequence, selectedScene, {
                                                                    activation_contexts: activationContexts.filter(
                                                                        (_, i) => i !== cIdx
                                                                    )
                                                                })
                                                            }
                                                            className="text-ink-400 hover:text-blush-600 cursor-pointer"
                                                        >
                                                            <X size={11} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs italic text-ink-400">No activation contexts set.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Target Epistemic Deltas */}
                                <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-mono font-bold uppercase text-ink-500">
                                            Target Epistemic Deltas ({targetDeltas.length})
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                enterBlueprintEditMode('continuity', (prev) => ({
                                                    ...prev,
                                                    target_epistemic_deltas: [
                                                        ...prev.target_epistemic_deltas,
                                                        {
                                                            holder: currentScene.pov_character || '',
                                                            proposition_id: '',
                                                            operation: 'ELEVATE_SUSPICION',
                                                            to_stance: 'SUSPECTS_TRUE',
                                                            to_confidence: 0.45,
                                                            trigger_clue: ''
                                                        }
                                                    ]
                                                }))
                                            }
                                            className="text-xs font-bold text-gold-ink hover:underline flex items-center gap-1 cursor-pointer"
                                        >
                                            <Plus size={12} /> Add Epistemic Delta
                                        </button>
                                    </div>
                                    {targetDeltas.length > 0 ? (
                                        <div className="space-y-2">
                                            {targetDeltas.map((delta, dIdx) => (
                                                <div
                                                    key={dIdx}
                                                    className="bg-surface p-3 rounded-xl border border-edge flex items-start justify-between gap-3 text-xs"
                                                >
                                                    <div className="space-y-1">
                                                        <div className="font-mono font-bold text-ink-900">
                                                            {delta.holder || 'Character'} ·{' '}
                                                            {delta.proposition_id || 'Proposition'} ·{' '}
                                                            {delta.operation || 'UPDATE'} ➔{' '}
                                                            {delta.to_stance || 'SUSPECTS_TRUE'}
                                                        </div>
                                                        {delta.trigger_clue && (
                                                            <div className="text-ink-600 font-serif">
                                                                {delta.trigger_clue}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => enterBlueprintEditMode('continuity')}
                                                            className="text-ink-400 hover:text-gold-ink p-1 cursor-pointer"
                                                            title="Edit Delta"
                                                        >
                                                            <Edit3 size={13} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                updateSceneBlueprint(selectedSequence, selectedScene, {
                                                                    target_epistemic_deltas: targetDeltas.filter(
                                                                        (_, i) => i !== dIdx
                                                                    )
                                                                })
                                                            }
                                                            className="text-ink-400 hover:text-blush-600 p-1 cursor-pointer"
                                                            title="Remove Delta"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs italic text-ink-400">
                                            No epistemic deltas scheduled for this scene.
                                        </p>
                                    )}
                                </div>

                                {/* Planned Plot Commitments */}
                                <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-mono font-bold uppercase text-gold-ink flex items-center gap-1.5">
                                            <Anchor size={13} /> Planned Plot Commitments ({plotCommitments.length})
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                openEditModal('Add Plot Commitment', '', (val) => {
                                                    const clean = String(val || '').trim();
                                                    if (clean) {
                                                        updateSceneBlueprint(selectedSequence, selectedScene, {
                                                            plot_commitments: [...plotCommitments, clean]
                                                        });
                                                    }
                                                })
                                            }
                                            className="text-xs font-bold text-gold-ink hover:underline flex items-center gap-1 cursor-pointer"
                                        >
                                            <Plus size={12} /> Add Commitment
                                        </button>
                                    </div>
                                    {plotCommitments.length > 0 ? (
                                        <div className="space-y-2">
                                            {plotCommitments.map((pc, pci) => (
                                                <div
                                                    key={pci}
                                                    className="bg-gold-tint/50 p-3 rounded-xl border border-gold-edge flex items-start justify-between gap-3"
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        {typeof pc === 'object' && pc !== null ? (
                                                            <>
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="text-sm font-bold text-ink-900">
                                                                        {pc.description || 'Commitment'}
                                                                    </span>
                                                                    {pc.consequence && (
                                                                        <span className="text-xs bg-ember-tint border border-ember-edge text-ember-800 px-2 py-0.5 rounded-full font-mono">
                                                                            Consequence: {pc.consequence}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {pc.exact_terms && (
                                                                    <p className="text-xs text-ink-700 italic font-serif mt-1">
                                                                        &ldquo;{pc.exact_terms}&rdquo;
                                                                    </p>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <p className="text-sm text-ink-800 font-medium">
                                                                {String(pc)}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <EditButton
                                                            title="Plot Commitment"
                                                            value={
                                                                typeof pc === 'string' ? pc : pc?.description || ''
                                                            }
                                                            onSave={() =>
                                                                typeof pc === 'object'
                                                                    ? enterBlueprintEditMode('continuity')
                                                                    : openEditModal('Edit Plot Commitment', pc, (val) =>
                                                                          updateSceneBlueprint(
                                                                              selectedSequence,
                                                                              selectedScene,
                                                                              {
                                                                                  plot_commitments: plotCommitments.map(
                                                                                      (it, i) => (i === pci ? val : it)
                                                                                  )
                                                                              }
                                                                          )
                                                                      )
                                                            }
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                updateSceneBlueprint(selectedSequence, selectedScene, {
                                                                    plot_commitments: plotCommitments.filter(
                                                                        (_, i) => i !== pci
                                                                    )
                                                                })
                                                            }
                                                            className="text-ink-400 hover:text-blush-600 p-1 cursor-pointer"
                                                            title="Remove Commitment"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs italic text-ink-400">No plot commitments set.</p>
                                    )}
                                </div>

                                {/* Planned Relationship Transformations */}
                                <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-mono font-bold uppercase text-blush-700 flex items-center gap-1.5">
                                            <Heart size={13} className="fill-rose-500/20 text-blush-600" /> Planned
                                            Relationship Transformations ({relationshipChanges.length})
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                enterBlueprintEditMode('continuity', (prev) => ({
                                                    ...prev,
                                                    relationship_changes: [
                                                        ...prev.relationship_changes,
                                                        { from: '', to: '', feeling: '', trigger: '' }
                                                    ]
                                                }))
                                            }
                                            className="text-xs font-bold text-blush-700 hover:underline flex items-center gap-1 cursor-pointer"
                                        >
                                            <Plus size={12} /> Add Relationship Shift
                                        </button>
                                    </div>
                                    {relationshipChanges.length > 0 ? (
                                        <div className="grid sm:grid-cols-2 gap-3">
                                            {relationshipChanges.map((ch, chi) => (
                                                <div
                                                    key={chi}
                                                    className="bg-blush-tint p-3 rounded-xl border border-blush-edge flex flex-col justify-between gap-1.5"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-sm font-bold text-ink-900">
                                                                {ch.from || '?'}
                                                            </span>
                                                            <span className="text-xs text-blush-600 font-mono">➔</span>
                                                            <span className="text-sm font-bold text-ink-900">
                                                                {ch.to || '?'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            {ch.feeling && (
                                                                <span className="text-xs bg-surface border border-blush-edge text-blush-800 px-2 py-0.5 rounded-full font-serif italic">
                                                                    {ch.feeling}
                                                                </span>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => enterBlueprintEditMode('continuity')}
                                                                className="text-ink-400 hover:text-gold-ink p-1 cursor-pointer"
                                                            >
                                                                <Edit3 size={12} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const nextRels = relationshipChanges.filter(
                                                                        (_, i) => i !== chi
                                                                    );
                                                                    updateSceneBlueprint(
                                                                        selectedSequence,
                                                                        selectedScene,
                                                                        {
                                                                            relationship_changes: nextRels,
                                                                            relationship_shifts: nextRels
                                                                        }
                                                                    );
                                                                }}
                                                                className="text-ink-400 hover:text-blush-600 p-1 cursor-pointer"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {ch.trigger && (
                                                        <p className="text-xs text-ink-600 italic">
                                                            <span className="font-bold text-ink-500 not-italic uppercase text-xs mr-1.5 font-mono">
                                                                Catalyst:
                                                            </span>
                                                            {ch.trigger}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs italic text-ink-400">No relationship shifts set.</p>
                                    )}
                                </div>

                                {/* Living Character States (Always Editable) */}
                                <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-mono font-bold uppercase text-iris-800 flex items-center gap-1.5">
                                            <Activity size={13} className="text-iris-600" /> Living Character States (
                                            {activeStates.length})
                                        </span>
                                        <span className="text-xs text-ink-400">All fields directly editable</span>
                                    </div>
                                    {activeStates.length === 0 ? (
                                        <p className="text-xs italic text-ink-400">
                                            Assign characters in Cast Present above to inspect and edit their living
                                            scene states.
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {activeStates.map((as, asi) => (
                                                <div
                                                    key={asi}
                                                    className="bg-iris-tint/50 p-3.5 rounded-xl border border-iris-edge space-y-2 text-xs"
                                                >
                                                    <div className="font-bold text-sm text-ink-900 border-b border-iris-edge/50 pb-1.5">
                                                        {as.name}
                                                    </div>
                                                    {stateFields.map((sf) => {
                                                        const stateVal = String(as.state[sf.key] || '');
                                                        return (
                                                            <div
                                                                key={sf.key}
                                                                className="flex items-start justify-between gap-2"
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <span className="font-mono font-bold uppercase text-[10px] text-ink-500 mr-1.5">
                                                                        {sf.label}:
                                                                    </span>
                                                                    <span
                                                                        className={
                                                                            stateVal
                                                                                ? 'text-ink-800'
                                                                                : 'italic text-ink-400'
                                                                        }
                                                                    >
                                                                        {stateVal || 'Unset'}
                                                                    </span>
                                                                </div>
                                                                <EditButton
                                                                    title={`${as.name} — ${sf.label}`}
                                                                    value={stateVal}
                                                                    onSave={() =>
                                                                        openEditModal(
                                                                            `${as.name} — ${sf.label}`,
                                                                            stateVal,
                                                                            (val) =>
                                                                                updateCharacterStateForScene(as.name, {
                                                                                    [sf.key]: val
                                                                                })
                                                                        )
                                                                    }
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
