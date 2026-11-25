import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    CastView,
    InspectorView,
    LibraryView,
    LoreView,
    RelationshipsView,
    SetupView,
    StructureView,
    type LibraryStoryRecord
} from '@/views';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function renderIntoRoot(element: React.ReactElement): void {
    act(() => {
        root.render(element);
    });
}

describe('Phase 5D: Extracted core Studio views', () => {
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.restoreAllMocks();
    });

    it('renders SetupView and wires concept/bookType/archetype and start callbacks', () => {
        const setInputTitle = vi.fn();
        const setInputBookType = vi.fn();
        const setInputCustomWords = vi.fn();
        const setArchetypeOptions = vi.fn();
        const initStory = vi.fn();
        const handleAutopilot = vi.fn();

        renderIntoRoot(
            <SetupView
                inputTitle="Glass Harbor"
                setInputTitle={setInputTitle}
                inputConcept="A cartographer maps disappearing islands."
                setInputConcept={vi.fn()}
                inputAuthorNote=""
                setInputAuthorNote={vi.fn()}
                inputBookType="popular"
                setInputBookType={setInputBookType}
                inputCustomWords={80000}
                setInputCustomWords={setInputCustomWords}
                inputWritingMode="novel"
                setInputWritingMode={vi.fn()}
                archetypeOptions={[{ id: 1, value: 'Concept A', label: 'Concept A' }]}
                setArchetypeOptions={setArchetypeOptions}
                importedLoreFiles={[]}
                importingLore={false}
                isDraggingSetupLore={false}
                setIsDraggingSetupLore={vi.fn()}
                loreInputRef={createRef<HTMLInputElement>()}
                handleLoreImport={vi.fn()}
                handleUpdateLoreFile={vi.fn()}
                handleRemoveLoreFile={vi.fn()}
                clearImportedLore={vi.fn()}
                loading={false}
                continuousAutopilot={false}
                initStory={initStory}
                handleAutopilot={handleAutopilot}
            />
        );

        expect(container.textContent).toContain('New Story Setup');
        const selects = container.querySelectorAll('select');
        act(() => {
            (selects[0] as HTMLSelectElement).value = 'random';
            selects[0].dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(setArchetypeOptions).toHaveBeenCalledTimes(1);

        act(() => {
            (selects[1] as HTMLSelectElement).value = 'novella';
            selects[1].dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(setInputBookType).toHaveBeenCalledWith('novella');
        expect(setInputCustomWords).toHaveBeenCalled();

        const initBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Initialize Story')
        );
        const autopilotBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Start Autopilot')
        );
        act(() => {
            initBtn?.click();
            autopilotBtn?.click();
        });
        expect(initStory).toHaveBeenCalledWith(false, { fromSetup: true });
        expect(handleAutopilot).toHaveBeenCalledWith({ fromSetup: true });
    });

    it('renders InspectorView with World Primer and retrieval scores', () => {
        const handleRagTest = vi.fn();

        renderIntoRoot(
            <InspectorView
                view="inspector"
                setView={vi.fn()}
                story={{ cast: [], lore: [], sequences: [] }}
                isInspectorMode={true}
                selectedSequence={0}
                selectedScene={0}
                worldPrimer="Tide magic is banned inside the harbor."
                ragTestQuery="harbor magic"
                setRagTestQuery={vi.fn()}
                ragTestLoading={false}
                ragTestResults={[
                    {
                        score: 0.912,
                        text: 'Wards ring every lighthouse.',
                        metadata: { topic: 'Harbor Wards' }
                    }
                ]}
                handleRagTest={handleRagTest}
            />
        );

        expect(container.textContent).toContain('Story Memory Search (RAG Inspector)');
        expect(container.textContent).toContain('Active World Primer');
        expect(container.textContent).toContain('Score: 91.2%');
        expect(container.textContent).toContain('Topic: Harbor Wards');

        const searchBtn = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent?.trim() === 'Search'
        );
        act(() => {
            searchBtn?.click();
        });
        expect(handleRagTest).toHaveBeenCalledTimes(1);
    });

    it('renders LibraryView empty/search states and triggers onSelectStory & duplication', () => {
        const setLibrarySearchQuery = vi.fn();
        const onSelectStory = vi.fn();
        const handleDuplicateStory = vi.fn();
        const storyItem: LibraryStoryRecord = {
            id: 'story_1700000000000',
            timestamp: 1700000000000,
            data: {
                title: 'Amber Tides',
                concept: 'A diver recovers sunken clocks.',
                sequences: [{ number: 1, title: 'Seq 1' }],
                scenes: { '0': [{ number: 1, title: 'Scene 1' }] },
                prose: { '0-0': { final: 'Salt crusted the brass astrolabe in the harbor.' } }
            }
        };

        renderIntoRoot(
            <LibraryView
                activeStoryId="story_1700000000000"
                theme="light"
                libraryStories={[storyItem]}
                libraryCovers={{}}
                libraryAudioCounts={{}}
                librarySearchQuery=""
                setLibrarySearchQuery={setLibrarySearchQuery}
                initializingStoryId={null}
                setView={vi.fn()}
                handleImport={vi.fn()}
                handleDeleteLibraryStory={vi.fn()}
                handleDuplicateStory={handleDuplicateStory}
                handleUpdateStoryCoverStyle={vi.fn()}
                onSelectStory={onSelectStory}
            />
        );

        expect(container.textContent).toContain('Amber Tides');
        expect(container.textContent).toContain('1 story');

        const readBtn = Array.from(container.querySelectorAll('button')).find(
            (b) => b.getAttribute('title') === 'Read Manuscript'
        );
        const dupBtn = Array.from(container.querySelectorAll('button')).find(
            (b) => b.getAttribute('title') === 'Duplicate Story'
        );
        act(() => {
            readBtn?.click();
            dupBtn?.click();
        });
        expect(onSelectStory).toHaveBeenCalledWith(
            expect.objectContaining({ id: storyItem.id, data: storyItem.data }),
            'reader'
        );
        expect(handleDuplicateStory).toHaveBeenCalledWith(
            expect.objectContaining({ id: storyItem.id, data: storyItem.data })
        );

        // Filtered empty results state
        renderIntoRoot(
            <LibraryView
                activeStoryId="story_1700000000000"
                theme="light"
                libraryStories={[storyItem]}
                libraryCovers={{}}
                libraryAudioCounts={{}}
                librarySearchQuery="nonexistent"
                setLibrarySearchQuery={setLibrarySearchQuery}
                initializingStoryId={null}
                setView={vi.fn()}
                handleImport={vi.fn()}
                handleDeleteLibraryStory={vi.fn()}
                handleDuplicateStory={handleDuplicateStory}
                handleUpdateStoryCoverStyle={vi.fn()}
                onSelectStory={onSelectStory}
            />
        );
        expect(container.textContent).toContain('No stories match your search.');
        const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Clear search')
        );
        act(() => {
            clearBtn?.click();
        });
        expect(setLibrarySearchQuery).toHaveBeenCalledWith('');
    });

    it('renders CastView and opens Introduce Character form modal', () => {
        const openFormModal = vi.fn();

        renderIntoRoot(
            <CastView
                view="cast"
                setView={vi.fn()}
                story={{
                    cast: [{ id: 'c1', name: 'Mara Vance', role: 'Protagonist' }],
                    sequences: [],
                    lore: []
                }}
                storyRef={createRef() as React.MutableRefObject<never>}
                setStory={vi.fn()}
                isInspectorMode={false}
                selectedSequence={null}
                selectedScene={null}
                loadedImages={{}}
                portraitLoading={{}}
                isAnyAudioPlaying={false}
                isAuditioningVoice={false}
                openEditModal={vi.fn()}
                openFormModal={openFormModal}
                showToast={vi.fn()}
                findCastIndexForChar={() => 0}
                commitVoiceEditUpdate={vi.fn()}
                generateCharacterPortrait={vi.fn()}
                uploadCharacterPortrait={vi.fn()}
                removeCharacterPortrait={vi.fn()}
                handleRerollCharacterSeed={vi.fn()}
                handleResetCharacterReferenceText={vi.fn()}
                testAuditionCharacterVoice={vi.fn()}
                stopAllAudioPlayback={vi.fn()}
            />
        );

        expect(container.textContent).toContain('Mara Vance');
        const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Add Character')
        );
        act(() => {
            addBtn?.click();
        });
        expect(openFormModal).toHaveBeenCalledTimes(1);
    });

    it('renders LoreView with paginated cards, pagination buttons, and Rebuild RAG trigger', () => {
        const rebuildRagIndex = vi.fn();
        const setLorePage = vi.fn();
        const loreItems = [
            { id: 'l1', topic: 'Old Harbor Law', detail: 'Curfew at dusk.', valid_from_act: 1 }
        ];

        renderIntoRoot(
            <LoreView
                view="lore"
                setView={vi.fn()}
                story={{ acts: [{ number: 1, title: 'Act I' }], lore: loreItems }}
                setStory={vi.fn()}
                isInspectorMode={false}
                selectedSequence={null}
                selectedScene={null}
                loreSearch=""
                setLoreSearch={vi.fn()}
                lorePage={1}
                setLorePage={setLorePage}
                lorePageSize={20}
                filteredLore={loreItems}
                paginatedLore={loreItems}
                totalLorePages={2}
                scenesByAct={{ 1: [{ number: 1, title: 'Scene 1' }] }}
                isDraggingLoreTab={false}
                setIsDraggingLoreTab={vi.fn()}
                ragStatus="idle"
                isRebuildingRag={false}
                rebuildRagIndex={rebuildRagIndex}
                handlePostGenLoreImport={vi.fn()}
                ingestLore={vi.fn()}
                handleDeleteLore={vi.fn()}
                openEditModal={vi.fn()}
                openFormModal={vi.fn()}
                showToast={vi.fn()}
            />
        );

        expect(container.textContent).toContain('Old Harbor Law');
        const rebuildBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Rebuild RAG index')
        );
        const nextBtn = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent?.trim() === 'Next'
        );
        act(() => {
            rebuildBtn?.click();
            nextBtn?.click();
        });
        expect(rebuildRagIndex).toHaveBeenCalledTimes(1);
        expect(setLorePage).toHaveBeenCalledTimes(1);
    });

    it('renders RelationshipsView grid/list toggle and Establish Relationship button', () => {
        const setMatrixView = vi.fn();
        const openFormModal = vi.fn();

        renderIntoRoot(
            <RelationshipsView
                view="relationships"
                setView={vi.fn()}
                story={{
                    cast: [
                        { id: 'c1', name: 'Mara' },
                        { id: 'c2', name: 'Elias' }
                    ],
                    relationships: {
                        'Mara->Elias': { current: 'Guarded trust', trust_level: 7, history: [] }
                    }
                }}
                setStory={vi.fn()}
                isInspectorMode={false}
                selectedSequence={null}
                selectedScene={null}
                loadedImages={{}}
                matrixView="grid"
                setMatrixView={setMatrixView}
                matrixScroll={{ left: false, right: false }}
                matrixScrollRef={createRef<HTMLDivElement>()}
                measureMatrixScroll={vi.fn()}
                selectedRel={null}
                setSelectedRel={vi.fn()}
                selectMatrixRelationship={vi.fn()}
                openFormModal={openFormModal}
                requestConfirm={vi.fn()}
                showToast={vi.fn()}
            />
        );

        expect(container.textContent).toContain('Guarded trust');
        const listBtn = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent?.trim() === 'List'
        );
        const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Establish Relationship')
        );
        act(() => {
            listBtn?.click();
            addBtn?.click();
        });
        expect(setMatrixView).toHaveBeenCalledWith('list');
        expect(openFormModal).toHaveBeenCalledTimes(1);
    });

    it('renders StructureView outline & sequence_dashboard and handles expand & Add Scene Manually', () => {
        const toggleSequence = vi.fn();
        const handleAddScene = vi.fn();

        const sharedProps = {
            setView: vi.fn(),
            story: {
                acts: [{ number: 1, title: 'Act I', description: 'Setup' }],
                sequences: [
                    { number: 1, parent_act: 1, title: 'The Arrival', description: 'Arrive.' }
                ],
                scenes: {
                    '0': [{ number: 1, title: 'Harbor Pier', pov_character: 'Mara' }]
                },
                prose: {}
            },
            setStory: vi.fn(),
            isInspectorMode: false,
            selectedSequence: 0,
            setSelectedSequence: vi.fn(),
            selectedScene: null,
            setSelectedScene: vi.fn(),
            activeActTab: 0,
            setActiveActTab: vi.fn(),
            expandedSequences: { 0: true },
            toggleSequence,
            toggleAllSequencesInAct: vi.fn(),
            loading: false,
            enableNarrativeLenses: false,
            allNarrativeModes: {},
            getModeIcon: () => 'Feather',
            getSceneProseText: () => '',
            getSceneAudioStatus: () => ({ status: 'none' }),
            availableSceneAudioMap: {},
            availableSequenceAudioMap: {},
            isAnyAudioPlaying: false,
            isExportingSceneAudio: false,
            isExportingSequenceAudio: false,
            isExportingStoryAudio: false,
            enterReaderMode: vi.fn(),
            generateActsAndSequences: vi.fn(),
            handleResetStoryStage: vi.fn(),
            handleAddScene,
            handleDeleteScene: vi.fn(),
            handleMoveScene: vi.fn(),
            handleDownloadSceneAudio: vi.fn(),
            handleDownloadSequenceAudio: vi.fn(),
            playSceneAudio: vi.fn(),
            playStoredOrLiveSceneAudio: vi.fn(),
            stopAllAudioPlayback: vi.fn(),
            requestConfirm: vi.fn(),
            requestSceneWeaving: vi.fn(),
            requestSequenceWeaving: vi.fn(),
            updateSceneBlueprint: vi.fn(),
            openEditModal: vi.fn(),
            showToast: vi.fn()
        };

        renderIntoRoot(<StructureView view="structure" {...sharedProps} />);
        expect(container.textContent).toContain('The Arrival');
        expect(container.textContent).toContain('Harbor Pier');

        renderIntoRoot(
            <StructureView
                view="sequence_dashboard"
                {...sharedProps}
                story={{
                    ...sharedProps.story,
                    scenes: {}
                }}
            />
        );
        const manualBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Add Scene Manually')
        );
        act(() => {
            manualBtn?.click();
        });
        expect(handleAddScene).toHaveBeenCalledWith(0);
    });
});
