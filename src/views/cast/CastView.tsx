/**
 * @module views/cast/CastView
 * Cast & Character Web view: displays Four-Corner character cards, introduces new cast members,
 * and handles dossier edits, portrait actions, and Breeze 2 / Kokoro voice audition updates.
 */

import type React from 'react';
import { VIEW_LABELS } from '@/config';
import {
    CharacterCard,
    EditorialSubNav,
    Plus,
    Upload,
    Users,
    type CharacterCardCharacter,
    type EditorialSubNavProps,
    type StudioFormField
} from '@/components';
import {
    cleanCharacterNameFromVoiceProfile,
    extractPersonalizedReferenceTextFromInterview,
    sanitizeVoiceReferenceText,
    type AudioStoryLike
} from '@/domain/audio';
import { CAST_FILE_ACCEPT, useCastImport } from '@/hooks';
import { DeadRecordPanel } from './DeadRecordPanel';

export type CastCharacterRecord = CharacterCardCharacter & {
    name: string;
};

export interface CastStory extends AudioStoryLike {
    cast?: CastCharacterRecord[];
    character_states?: Record<string, Record<string, unknown>>;
    user_edited?: Record<string, boolean>;
    [key: string]: unknown;
}

export interface CastOpenFormOptions {
    title: string;
    subtitle?: string;
    submitLabel?: string;
    cancelLabel?: string;
    fields: StudioFormField[];
    onSubmit?: (data: Record<string, string>) => void;
}

export interface CastViewProps {
    view: string;
    setView: (viewId: string) => void;
    story: CastStory;
    storyRef: React.MutableRefObject<CastStory>;
    setStory: (updaterOrValue: CastStory | ((prev: CastStory) => CastStory)) => CastStory | void;
    isInspectorMode: boolean;
    selectedSequence: number | null;
    selectedScene: number | null;
    loadedImages: {
        portraits?: Record<string, string | null>;
        [key: string]: unknown;
    };
    portraitLoading: Record<string, boolean>;
    isAnyAudioPlaying: boolean;
    isAuditioningVoice: boolean;
    openEditModal: (title: string, currentVal: string, onSave: (val: string) => void) => void;
    openFormModal: (opts: CastOpenFormOptions) => unknown;
    showToast: (msg: string, type?: string) => void;
    findCastIndexForChar: (castList: CharacterCardCharacter[], char: CharacterCardCharacter) => number;
    commitVoiceEditUpdate: (
        speakerName: string,
        updater: (prev: CastStory) => CastStory | null
    ) => void;
    generateCharacterPortrait: (char: CharacterCardCharacter) => void;
    uploadCharacterPortrait: (char: CharacterCardCharacter, file: File) => void;
    removeCharacterPortrait: (char: CharacterCardCharacter) => void;
    handleRerollCharacterSeed: (char: CharacterCardCharacter) => void;
    handleResetCharacterReferenceText: (char: CharacterCardCharacter) => void;
    testAuditionCharacterVoice: (
        char: CharacterCardCharacter,
        opts?: { forceRecalibrate?: boolean }
    ) => void;
    stopAllAudioPlayback: () => void;
}

export function CastView({
    view,
    setView,
    story,
    storyRef,
    setStory,
    isInspectorMode,
    selectedSequence,
    selectedScene,
    loadedImages,
    portraitLoading,
    isAnyAudioPlaying,
    isAuditioningVoice,
    openEditModal,
    openFormModal,
    showToast,
    findCastIndexForChar,
    commitVoiceEditUpdate,
    generateCharacterPortrait,
    uploadCharacterPortrait,
    removeCharacterPortrait,
    handleRerollCharacterSeed,
    handleResetCharacterReferenceText,
    testAuditionCharacterVoice,
    stopAllAudioPlayback
}: CastViewProps) {
    const handleIntroduceCharacter = () => {
        openFormModal({
            title: 'Introduce Character',
            subtitle: "Add a new dramatis personæ to the story's Four-Corner Character Web.",
            submitLabel: 'Add Character',
            fields: [
                {
                    key: 'name',
                    label: 'Character Name',
                    placeholder: 'e.g. Silas Thorne',
                    type: 'text',
                    required: true
                },
                {
                    key: 'corner_role',
                    label: 'Four-Corner Narrative Dynamic',
                    type: 'select',
                    defaultValue: 'SUPPORTING',
                    options: [
                        {
                            value: 'MAIN_CHARACTER',
                            label: 'Main Character (Protagonist · Center of moral dilemma)'
                        },
                        {
                            value: 'THE_CHALLENGER',
                            label: 'The Challenger (Foil · Directly tests protagonist assumptions)'
                        },
                        {
                            value: 'THE_COMFORTER',
                            label: 'The Comforter (Confidant · Safe ally validating habits)'
                        },
                        {
                            value: 'THE_WARNING',
                            label: 'The Warning (Opponent · Embodies destructive extreme)'
                        },
                        {
                            value: 'SUPPORTING',
                            label: 'Supporting Cast (Secondary presence)'
                        }
                    ]
                },
                {
                    key: 'role',
                    label: 'Story Role Title',
                    placeholder: 'e.g. Protagonist, Foil, Confidant, Chief Engineer',
                    type: 'text'
                },
                {
                    key: 'archetype',
                    label: 'Archetype',
                    defaultValue: 'Pragmatist',
                    placeholder: 'e.g. Reluctant Expert, Pragmatist, Traditionalist',
                    type: 'text'
                }
            ],
            onSubmit: (data) => {
                if (!data.name || !data.name.trim()) return;
                const name = data.name.trim();
                const resolvedCorner = data.corner_role || 'SUPPORTING';
                const defaultRole =
                    resolvedCorner === 'MAIN_CHARACTER'
                        ? 'Protagonist'
                        : resolvedCorner === 'THE_CHALLENGER'
                          ? 'Foil'
                          : resolvedCorner === 'THE_COMFORTER'
                            ? 'Confidant'
                            : resolvedCorner === 'THE_WARNING'
                              ? 'Opponent'
                              : 'Supporting';
                const role = data.role && data.role.trim() ? data.role.trim() : defaultRole;
                const archetype =
                    data.archetype && data.archetype.trim() ? data.archetype.trim() : 'Pragmatist';

                const newChar: CastCharacterRecord = {
                    id: `char_${Date.now()}`,
                    name,
                    role,
                    corner_role: resolvedCorner,
                    archetype,
                    logline: 'Newly introduced character.',
                    core_flaw: 'Defending their current comfort zone or safety habit.',
                    core_desire: 'Pursuing their personal goal within the story world.',
                    why_it_makes_sense: '',
                    what_it_costs_them: '',
                    way_of_living: '',
                    why_it_is_appealing: '',
                    shared_outlook: '',
                    the_hidden_trap: '',
                    how_they_ended_up: '',
                    the_wake_up_call: '',
                    details: {
                        history: 'Introduced by the author.',
                        goals: 'Pursuing their personal goal within the story world.',
                        story_events: 'Newly added to cast.'
                    },
                    voice: {
                        tone: 'Measured',
                        rhythm: 'Direct',
                        tics: []
                    }
                };

                setStory((prev) => ({
                    ...prev,
                    cast: [...(prev.cast || []), newChar]
                }));
                showToast(
                    `Added character "${name}" (${resolvedCorner.replace(/_/g, ' ')})`,
                    'success'
                );
            }
        });
    };

    const { importCastFiles } = useCastImport({ story, storyRef, setStory, showToast, uploadCharacterPortrait });

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-24">
            <EditorialSubNav
                activeView={view}
                onSelectView={setView}
                story={story as EditorialSubNavProps['story']}
                isInspectorMode={isInspectorMode}
                selectedSequence={selectedSequence}
                selectedScene={selectedScene}
            />
            {/* Cast Header */}
            <div className="bg-surface p-6 sm:p-7 rounded-2xl border border-edge shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold font-serif text-ink-900 flex items-center gap-2.5 tracking-tight">
                        <Users className="text-gold-ink" size={22} /> {VIEW_LABELS.cast}
                    </h2>
                </div>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <input
                        type="file"
                        id="characterCardFileInput"
                        accept={CAST_FILE_ACCEPT}
                        multiple
                        className="hidden"
                        onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            e.target.value = '';
                            if (files.length > 0) void importCastFiles(files);
                        }}
                    />
                    <button
                        onClick={() => document.getElementById('characterCardFileInput')?.click()}
                        className="text-xs bg-surface hover:bg-lift border border-edge-strong text-ink-700 font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                        title="Character sheets written as Markdown, and character cards (JSON, PNG or CHARX) from SillyTavern, Chub, Agnai, RisuAI and similar apps. Pick one file or many."
                    >
                        <Upload size={14} /> Import Characters
                    </button>
                    <button
                        onClick={handleIntroduceCharacter}
                        className="text-xs bg-btn hover:bg-btn-hover text-btn-ink font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                    >
                        <Plus size={14} /> Add Character
                    </button>
                </div>
            </div>

            <DeadRecordPanel story={story} setStory={(updater) => setStory(updater)} />

            {/* Cast Cards Grid */}
            <div className="flex flex-col gap-6">
                {story.cast &&
                    story.cast.map((c, i) => (
                        <CharacterCard
                            key={i}
                            c={c}
                            story={story}
                            onAuditionVoice={testAuditionCharacterVoice}
                            onRecalibrateVoice={(target) =>
                                testAuditionCharacterVoice(target, { forceRecalibrate: true })
                            }
                            onRerollVoiceSeed={handleRerollCharacterSeed}
                            isAuditioningVoice={isAuditioningVoice}
                            isAnyAudioPlaying={isAnyAudioPlaying}
                            stopAllAudioPlayback={stopAllAudioPlayback}
                            portraitSrc={loadedImages.portraits?.[c.id || ''] ?? null}
                            portraitLoading={!!portraitLoading[c.id || '']}
                            onGeneratePortrait={generateCharacterPortrait}
                            onUploadPortrait={uploadCharacterPortrait}
                            onRemovePortrait={removeCharacterPortrait}
                            onEdit={(field, title, val) => {
                                if (field === 'reset_reference_text') {
                                    handleResetCharacterReferenceText(c);
                                    return;
                                }
                                openEditModal(title, val || '', (newValue) => {
                                    const isVoiceEdit =
                                        field === 'vocal_cadence' ||
                                        field === 'reference_text' ||
                                        field === 'voice_seed';
                                    const applyCastField = (prev: CastStory): CastStory | null => {
                                        const newCast = [...(prev.cast || [])];
                                        const targetIdx = findCastIndexForChar(newCast, c);
                                        const idx = targetIdx !== -1 ? targetIdx : i;
                                        if (!newCast[idx]) return null;
                                        const targetChar: CastCharacterRecord &
                                            Record<string, unknown> = {
                                            ...newCast[idx]
                                        };
                                        const charName =
                                            targetChar.name || `Character ${idx + 1}`;
                                        const nextUserEdited: Record<string, boolean> = {
                                            ...(prev.user_edited || {})
                                        };
                                        const nextCharacterStates: Record<
                                            string,
                                            Record<string, unknown>
                                        > = {
                                            ...(prev.character_states || {})
                                        };

                                        if (field === 'vocal_cadence') {
                                            const cleaned = cleanCharacterNameFromVoiceProfile(
                                                String(newValue || '').trim(),
                                                [charName]
                                            );
                                            if (!cleaned) return null;
                                            targetChar.vocal_cadence = cleaned;
                                            targetChar.vocal_profile = cleaned;
                                            targetChar.voice_profile = cleaned;
                                            targetChar.voice_description = cleaned;
                                            targetChar.user_edited_cadence = true;
                                            targetChar.is_user_edited = true;
                                            targetChar.user_edited = true;
                                            if (
                                                targetChar.details &&
                                                typeof targetChar.details === 'object'
                                            ) {
                                                targetChar.details = {
                                                    ...targetChar.details,
                                                    vocal_profile: cleaned
                                                };
                                            }
                                            if (nextCharacterStates[charName]) {
                                                nextCharacterStates[charName] = {
                                                    ...nextCharacterStates[charName],
                                                    vocal_cadence: cleaned
                                                };
                                            }
                                            nextUserEdited[`cast.${charName}.vocal_cadence`] = true;
                                            nextUserEdited[`cast.${idx}.vocal_cadence`] = true;
                                            nextUserEdited[`cast.${charName}`] = true;
                                        } else if (field === 'reference_text') {
                                            const cleanedRef = sanitizeVoiceReferenceText(
                                                String(newValue || '').trim()
                                            );
                                            if (!cleanedRef) {
                                                showToast(
                                                    'Reference text cannot be empty',
                                                    'warning'
                                                );
                                                return null;
                                            }
                                            targetChar.reference_text = cleanedRef;
                                            targetChar.user_edited_reference_text = true;
                                            targetChar.is_user_edited = true;
                                            targetChar.user_edited = true;
                                            nextUserEdited[`cast.${charName}.reference_text`] =
                                                true;
                                            nextUserEdited[`cast.${idx}.reference_text`] = true;
                                            nextUserEdited[`cast.${charName}`] = true;
                                        } else if (field === 'voice_seed') {
                                            const parsed = parseInt(
                                                String(newValue || '').replace(/[^0-9]/g, ''),
                                                10
                                            );
                                            if (!Number.isFinite(parsed) || parsed <= 0) {
                                                showToast(
                                                    'Please enter a valid positive integer seed',
                                                    'warning'
                                                );
                                                return null;
                                            }
                                            targetChar.voice_seed = parsed;
                                            nextUserEdited[`cast.${charName}.voice_seed`] = true;
                                        } else if (field.includes('.')) {
                                            const [parent, child] = field.split('.');
                                            const parentObj =
                                                (targetChar[parent] as Record<string, unknown>) ||
                                                {};
                                            targetChar[parent] = {
                                                ...parentObj,
                                                [child]: newValue
                                            };
                                            if (
                                                field === 'details.deep_profile' &&
                                                !targetChar.user_edited_reference_text &&
                                                !nextUserEdited[`cast.${charName}.reference_text`]
                                            ) {
                                                const refreshedRef =
                                                    extractPersonalizedReferenceTextFromInterview(
                                                        newValue
                                                    );
                                                if (refreshedRef) {
                                                    targetChar.reference_text = refreshedRef;
                                                }
                                            }
                                        } else {
                                            targetChar[field] = newValue;
                                        }

                                        newCast[idx] = targetChar;
                                        return {
                                            ...prev,
                                            cast: newCast,
                                            character_states: nextCharacterStates,
                                            user_edited: nextUserEdited
                                        };
                                    };

                                    const baseCheck = storyRef.current || story;
                                    const existingRefEdited = Boolean(
                                        (c as unknown as Record<string, unknown>)
                                            .user_edited_reference_text ||
                                            baseCheck?.user_edited?.[
                                                `cast.${c.name}.reference_text`
                                            ]
                                    );
                                    const affectsVoice =
                                        isVoiceEdit ||
                                        (field === 'details.deep_profile' && !existingRefEdited);
                                    if (affectsVoice) {
                                        commitVoiceEditUpdate(
                                            c.name || `Character ${i + 1}`,
                                            applyCastField
                                        );
                                    } else {
                                        setStory((prev) => {
                                            const updated = applyCastField(prev);
                                            if (!updated) return prev;
                                            storyRef.current = updated;
                                            return updated;
                                        });
                                    }
                                });
                            }}
                        />
                    ))}
            </div>
        </div>
    );
}
