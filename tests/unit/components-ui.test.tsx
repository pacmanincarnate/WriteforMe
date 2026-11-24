import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    BookCoverAudioArt,
    BufferedTextarea,
    CharacterCard,
    CritiqueModal,
    EditButton,
    EditModal,
    EditorialSubNav,
    HumanStructuredValue,
    ICON_REGISTRY,
    Icon,
    InterventionModal,
    LiveCreationIsland,
    LogDetailModal,
    LoreCard,
    LoreFileCard,
    PIPELINE_STEPS,
    SceneRow,
    StoryResetDropdown,
    StudioConfirmModal,
    StudioFormModal,
    StylizedBlankCover,
    ToastNotification,
    UniversalModelSearch
} from '@/components';
import { useDebounce } from '@/hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function renderIntoRoot(element: React.ReactElement): void {
    act(() => {
        root.render(element);
    });
}

describe('components & hooks Phase 4A', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
        consoleErrorSpy.mockRestore();
        vi.restoreAllMocks();
    });

    it('renders all 152 ICON_REGISTRY entries as SVGs, supports title, and falls back safely for unknown names', () => {
        const keys = Object.keys(ICON_REGISTRY);
        expect(keys.length).toBe(152);

        renderIntoRoot(
            <div>
                {keys.map((k) => (
                    <Icon key={k} name={k} size={14} />
                ))}
                <Icon name="audio" title="Tooltip Title" size={16} />
                <Icon name="non-existent-icon-name" size={16} />
            </div>
        );

        const svgs = container.querySelectorAll('svg');
        expect(svgs.length).toBe(keys.length + 2);
        const titleEl = container.querySelector('svg title');
        expect(titleEl?.textContent).toBe('Tooltip Title');
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('debounces rapid value changes via useDebounce', () => {
        vi.useFakeTimers();

        function Harness({ val }: { val: string }) {
            const debounced = useDebounce(val, 250);
            return <span data-testid="debounced">{debounced}</span>;
        }

        renderIntoRoot(<Harness val="first" />);
        expect(container.querySelector('[data-testid="debounced"]')?.textContent).toBe('first');

        renderIntoRoot(<Harness val="second" />);
        expect(container.querySelector('[data-testid="debounced"]')?.textContent).toBe('first');

        act(() => {
            vi.advanceTimersByTime(249);
        });
        expect(container.querySelector('[data-testid="debounced"]')?.textContent).toBe('first');

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(container.querySelector('[data-testid="debounced"]')?.textContent).toBe('second');
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('renders EditButton, BufferedTextarea (debounced/blur flush), HumanStructuredValue, and ToastNotification', () => {
        vi.useFakeTimers();
        const onEditClick = vi.fn();
        const onTextareaSave = vi.fn();
        const onToastDismiss = vi.fn();

        renderIntoRoot(
            <div>
                <EditButton title="Chapter Title" value="Ch 1" onSave={onEditClick} />
                <BufferedTextarea value="initial" onSave={onTextareaSave} debounceMs={200} />
                <HumanStructuredValue
                    value={{
                        subtext_vector: 'Hidden longing',
                        tags: ['noir', 'harbor'],
                        active: true
                    }}
                />
                <ToastNotification
                    toast={{ type: 'success', message: 'Scene saved cleanly' }}
                    onDismiss={onToastDismiss}
                />
            </div>
        );

        const editBtn = container.querySelector('button[title="Edit Chapter Title"]');
        expect(editBtn).toBeTruthy();
        act(() => {
            editBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onEditClick).toHaveBeenCalledTimes(1);

        const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null;
        expect(textarea?.value).toBe('initial');
        const valueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
        )?.set;
        act(() => {
            valueSetter?.call(textarea, 'updated prose');
            textarea?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(onTextareaSave).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(onTextareaSave).toHaveBeenCalledWith('updated prose');

        expect(container.textContent).toContain('subtext vector'.replace(' ', '') ? 'Subtext' : '');
        expect(container.textContent).toContain('Hidden longing');
        expect(container.textContent).toContain('Scene saved cleanly');

        const dismissBtn = container.querySelector('button[title="Dismiss"]');
        act(() => {
            dismissBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onToastDismiss).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('mounts modals when isOpen={true}, returns null when isOpen={false}, and fires callbacks', () => {
        const onEditConfirm = vi.fn();
        const onEditCancel = vi.fn();
        const onConfirmOk = vi.fn();
        const onConfirmCancel = vi.fn();
        const onFormSubmit = vi.fn();
        const onFormCancel = vi.fn();
        const onCritiqueClose = vi.fn();
        const onInterventionResolve = vi.fn();
        const onInterventionCancel = vi.fn();
        const onLogClose = vi.fn();

        renderIntoRoot(
            <div>
                <EditModal isOpen={false} title="Hidden" value="x" onConfirm={onEditConfirm} onCancel={onEditCancel} />
                <StudioConfirmModal isOpen={false} title="Hidden Confirm" />
                <StudioFormModal isOpen={false} title="Hidden Form" fields={[]} />
                <CritiqueModal isOpen={false} onClose={onCritiqueClose} />
                <InterventionModal isOpen={false} tierName="Writer" onResolve={onInterventionResolve} onCancel={onInterventionCancel} />
                <LogDetailModal isOpen={false} onClose={onLogClose} />
            </div>
        );
        expect(container.textContent).toBe('');

        renderIntoRoot(
            <div>
                <EditModal isOpen={true} title="Beat 1" value="draft text" onConfirm={onEditConfirm} onCancel={onEditCancel} />
                <StudioConfirmModal
                    isOpen={true}
                    title="Reset Stage?"
                    message="Removes draft text."
                    onConfirm={onConfirmOk}
                    onCancel={onConfirmCancel}
                />
                <StudioFormModal
                    isOpen={true}
                    title="Add Note"
                    fields={[{ key: 'note', label: 'Note', defaultValue: 'hello' }]}
                    onSubmit={onFormSubmit}
                    onCancel={onFormCancel}
                />
                <CritiqueModal isOpen={true} beatNumber={2} critique="**Needs sharper subtext**" onClose={onCritiqueClose} />
                <InterventionModal
                    isOpen={true}
                    tierName="Sequence Agent"
                    deviationReasons={['Missing beat 3']}
                    rawOutput="<sequence />"
                    onResolve={onInterventionResolve}
                    onCancel={onInterventionCancel}
                />
                <LogDetailModal
                    isOpen={true}
                    type="response"
                    title="Log Inspector"
                    functionName="writeScene"
                    content="Generated response body"
                    tokens={412}
                    onClose={onLogClose}
                />
            </div>
        );

        expect(container.textContent).toContain('Beat 1');
        expect(container.textContent).toContain('Reset Stage?');
        expect(container.textContent).toContain('Add Note');
        expect(container.textContent).toContain('Needs sharper subtext');
        expect(container.textContent).toContain('Sequence Agent Failed');
        expect(container.textContent).toContain('Generated response body');

        const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Save Changes')
        );
        act(() => {
            saveBtn?.click();
        });
        expect(onEditConfirm).toHaveBeenCalledWith('draft text');

        const confirmBtn = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent?.trim() === 'Confirm'
        );
        act(() => {
            confirmBtn?.click();
        });
        expect(onConfirmOk).toHaveBeenCalledTimes(1);

        const dismissCritiqueBtn = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent?.trim() === 'Dismiss'
        );
        act(() => {
            dismissCritiqueBtn?.click();
        });
        expect(onCritiqueClose).toHaveBeenCalledTimes(1);

        const proceedBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Proceed Anyway')
        );
        act(() => {
            proceedBtn?.click();
        });
        expect(onInterventionResolve).toHaveBeenCalledWith('accept', '<sequence />');

        const logCloseBtn = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent?.trim() === 'Close'
        );
        act(() => {
            logCloseBtn?.click();
        });
        expect(onLogClose).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('mounts cover art, nav, creation island, reset dropdown, model search, cards, and PIPELINE_STEPS cleanly', () => {
        const onSelectView = vi.fn();
        const onResetStage = vi.fn();
        const onSelectModel = vi.fn();
        const setSearchQuery = vi.fn();
        const setIsDropdownOpen = vi.fn();
        const setSelectedScene = vi.fn();
        const handleDeleteScene = vi.fn();

        expect(PIPELINE_STEPS.length).toBeGreaterThan(5);

        renderIntoRoot(
            <div>
                <BookCoverAudioArt story={{ writing_mode: 'audio_drama' }} audioCount={2} totalScenes={4} />
                <StylizedBlankCover story={{ id: 's-1', title: 'Salt & Lantern', coverStyle: 3 }} />
                <EditorialSubNav
                    activeView="dashboard"
                    onSelectView={onSelectView}
                    story={{ cast: [{ name: 'Mara' }], lore: [{ topic: 'Harbor' }] }}
                    selectedSequence={0}
                    selectedScene={0}
                />
                <LiveCreationIsland loading={true} loadingStep="Drafting scene prose" />
                <StoryResetDropdown
                    story={{ acts: [{}], sequences: [{}], scenes: { '0': [{}] }, prose: { '0-0': 'Word' } }}
                    onResetStage={onResetStage}
                />
                <UniversalModelSearch
                    apiProvider="openrouter"
                    activeModel="anthropic/claude-sonnet-4"
                    onSelectModel={onSelectModel}
                    savedModels={['anthropic/claude-sonnet-4']}
                    searchQuery=""
                    setSearchQuery={setSearchQuery}
                    isDropdownOpen={false}
                    setIsDropdownOpen={setIsDropdownOpen}
                />
                <CharacterCard
                    c={{
                        id: 'c1',
                        name: 'Mara',
                        role: 'Protagonist',
                        corner_role: 'MAIN_CHARACTER',
                        vocal_cadence: 'Warm mezzo soprano, steady conversational cadence.'
                    }}
                    story={{ id: 's-1', genre: 'Mystery' }}
                />
                <LoreCard
                    lore={{ topic: 'Breakwater', detail: 'An old seawall built from basalt blocks.' }}
                    index={0}
                    acts={[{ number: 1, title: 'Arrival' }]}
                    scenesForAct={[{ number: 1, title: 'Dockside' }]}
                />
                <LoreFileCard file={{ id: 'f1', name: 'notes.md', text: 'Harbor map notes' }} />
                <SceneRow
                    variant="structure"
                    scene={{ number: 1, title: 'The Pier', scene_type: 'PROACTIVE', pov_character: 'Mara' }}
                    sceneIdx={0}
                    seqIdx={0}
                    sequence={{ number: 1 }}
                    getModeIcon={() => 'feather'}
                    setSelectedScene={setSelectedScene}
                    setView={onSelectView}
                    handleDeleteScene={handleDeleteScene}
                />
            </div>
        );

        expect(container.textContent).toContain('Salt & Lantern');
        expect(container.textContent).toContain('Drafting');
        expect(container.textContent).toContain('Mara');
        expect(container.textContent).toContain('Breakwater');
        expect(container.textContent).toContain('notes.md');
        expect(container.textContent).toContain('The Pier');

        const resetTrigger = container.querySelector(
            '[data-testid="story-reset-dropdown-trigger"]'
        ) as HTMLButtonElement | null;
        act(() => {
            resetTrigger?.click();
        });
        const resetTtsItem = container.querySelector(
            '[data-testid="reset-stage-tts"]'
        ) as HTMLButtonElement | null;
        act(() => {
            resetTtsItem?.click();
        });
        expect(onResetStage).toHaveBeenCalledWith('tts');
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
});
