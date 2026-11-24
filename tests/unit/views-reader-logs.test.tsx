import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { logStore, recoverOrphanedLogs } from '@/services/storage';
import {
    formatPlaybackTime,
    LogsView,
    measureReaderPages,
    ReaderView,
    type LogsViewEntry,
    type ReaderViewProps
} from '@/views';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function renderIntoRoot(element: React.ReactElement): void {
    act(() => {
        root.render(element);
    });
}

function buildReaderProps(overrides: Partial<ReaderViewProps> = {}): ReaderViewProps {
    const sampleChapter = {
        chapterIndex: 0,
        chapterNumber: 1,
        seqIdx: 0,
        title: 'Harbor Fog',
        summary: 'Mara searches the docks.',
        hasAnyProse: true,
        totalWords: 120,
        totalReadingTime: 1,
        scenes: [
            {
                sceneKey: '0-0',
                seqIdx: 0,
                sceneIdx: 0,
                hasProse: true,
                proseText: 'Lantern light pooled across wet timber.',
                title: 'Pier Nine',
                wordCount: 60,
                scene: { title: 'Pier Nine' }
            },
            {
                sceneKey: '0-1',
                seqIdx: 0,
                sceneIdx: 1,
                hasProse: true,
                proseText: 'Footsteps echoed behind the warehouse.',
                title: 'Warehouse Alley',
                wordCount: 60,
                scene: { title: 'Warehouse Alley' }
            }
        ]
    };

    return {
        story: { id: 'story-r1', title: 'Salt & Lantern', writing_mode: 'novel' },
        selectedSequence: 0,
        selectedScene: 0,
        currentReaderSceneItem: sampleChapter.scenes[0],
        flatStoryScenes: sampleChapter.scenes,
        storyChapters: [sampleChapter],
        currentChapterIndex: 0,
        currentChapter: sampleChapter,
        visibleScrollChapter: 0,
        jumpToReaderChapter: vi.fn(),
        goToNextReaderChapter: vi.fn(),
        readerSettings: {
            readerTheme: 'light',
            readingMode: 'paginated',
            fontFamily: 'Merriweather',
            fontSize: 18,
            lineHeight: 1.75,
            contentWidth: 'standard',
            textAlign: 'left',
            paragraphStyle: 'indented',
            ttsSpeed: 1.0,
            ttsAutoFollow: true,
            ttsVoice: 'af_heart'
        },
        updateReaderSetting: vi.fn(),
        readerPageIndex: 0,
        readerTotalPages: 3,
        readerContainerWidth: 640,
        readingProgress: { completedScenes: { '0-0': true } },
        saveReadingProgress: vi.fn(),
        isReaderHudVisible: true,
        toggleReaderHud: vi.fn(),
        isTocOpen: false,
        setIsTocOpen: vi.fn(),
        isAppearanceOpen: false,
        setIsAppearanceOpen: vi.fn(),
        tocSearchQuery: '',
        setTocSearchQuery: vi.fn(),
        isFullscreen: false,
        toggleFullscreen: vi.fn(),
        pageSlideDirection: null,
        isSceneTransitioning: false,
        readerColumnsContainerRef: createRef<HTMLDivElement>(),
        readerScrollContainerRef: createRef<HTMLDivElement>(),
        turnReaderPage: vi.fn(),
        jumpToReaderScene: vi.fn(),
        setView: vi.fn(),
        ttsStatus: 'idle',
        ttsProgress: 0,
        ttsIsMiniPlayerVisible: false,
        ttsQueue: [],
        ttsCurrentChunkIndex: 0,
        ttsCurrentTime: 0,
        ttsDuration: 0,
        toggleTtsPlayPause: vi.fn(),
        stopTtsPlayback: vi.fn(),
        skipTtsChunk: vi.fn(),
        ttsAudioRef: createRef<HTMLAudioElement>(),
        ...overrides
    };
}

describe('views/reader, views/logs, and recoverOrphanedLogs', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(async () => {
        act(() => {
            root.unmount();
        });
        container.remove();
        consoleErrorSpy.mockRestore();
        vi.restoreAllMocks();
        await logStore.clearLogs('story_default');
        await logStore.clearLogs('story_target');
    });

    it('calculates pagination counts in measureReaderPages and formats timestamps via formatPlaybackTime', () => {
        expect(measureReaderPages(null)).toBeNull();

        const parent = document.createElement('div');
        const cols = document.createElement('div');
        parent.appendChild(cols);

        Object.defineProperty(parent, 'clientWidth', { value: 0, configurable: true });
        expect(measureReaderPages(cols)).toBeNull();

        // Desktop width (>640 => gap = 48): (scrollWidth + 48) / (600 + 48)
        Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
        Object.defineProperty(parent, 'clientWidth', { value: 600, configurable: true });
        Object.defineProperty(cols, 'scrollWidth', { value: 600 * 3 + 48 * 2, configurable: true });
        expect(measureReaderPages(cols)).toEqual({ width: 600, pages: 3 });

        // Mobile width (<=640 => gap = 24): (scrollWidth + 24) / (340 + 24)
        Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
        Object.defineProperty(parent, 'clientWidth', { value: 340, configurable: true });
        Object.defineProperty(cols, 'scrollWidth', { value: 340 * 2 + 24, configurable: true });
        expect(measureReaderPages(cols)).toEqual({ width: 340, pages: 2 });

        expect(formatPlaybackTime(0)).toBe('0:00');
        expect(formatPlaybackTime(-5)).toBe('0:00');
        expect(formatPlaybackTime(Number.NaN)).toBe('0:00');
        expect(formatPlaybackTime(125)).toBe('2:05');
    });

    it('recovers orphaned Character Developer & Conceptual Development logs without duplicating existing IDs', async () => {
        const emptyRes = await recoverOrphanedLogs('story_target');
        expect(emptyRes.recovered).toBe(0);

        await logStore.saveLogs('story_default', [
            { id: 'log-1', function: 'Character Developer (Maya)', response: 'ok' },
            { id: 'log-2', function: 'Conceptual Development Pass', response: 'ok' },
            { id: 'log-3', function: 'Writing Agent Scene 1', response: 'skip' }
        ]);
        await logStore.saveLogs('story_target', [
            { id: 'log-1', function: 'Character Developer (Maya)', response: 'already present' }
        ]);

        const res = await recoverOrphanedLogs('story_target');
        expect(res.recovered).toBe(1);
        expect(res.logs?.map((l) => l.id)).toEqual(['log-2']);

        const merged = (await logStore.loadLogs('story_target')) as Array<{ id?: string }>;
        expect(merged.map((m) => m.id)).toEqual(['log-1', 'log-2']);
    });

    it('renders LogsView token metrics, category filters, export menu, detail callback, and clear logs', () => {
        const setPromptLog = vi.fn();
        const setLogFilter = vi.fn();
        const openLogDetailModal = vi.fn();
        const showToast = vi.fn();

        const sampleLogs: LogsViewEntry[] = [
            {
                id: 'e1',
                timestamp: '10:00:01 AM',
                function: 'Writing Agent',
                status: 'success',
                promptTokens: 500,
                thinkingTokens: 120,
                responseTokens: 300,
                modelUsed: 'gemini-2.5-pro',
                prompt: 'Draft scene 1',
                response: 'The sea wall glistened.',
                validationSummary: 'Passed length and structure checks'
            },
            {
                id: 'e2',
                timestamp: '10:01:02 AM',
                function: 'Audio Drama TTS',
                status: 'error',
                isAudio: true,
                isError: true,
                error: 'Bridge offline',
                errors: [{ attempt: 1, timestamp: '10:01:00', error: 'ECONNREFUSED' }]
            }
        ];

        renderIntoRoot(
            <LogsView
                promptLog={sampleLogs}
                setPromptLog={setPromptLog}
                logFilter="all"
                setLogFilter={setLogFilter}
                openLogDetailModal={openLogDetailModal}
                showToast={showToast}
                storyTitle="Salt & Lantern"
            />
        );

        expect(container.textContent).toContain('2 entries');
        expect(container.textContent).toContain('Sent: 500 tok');
        expect(container.textContent).toContain('Think: 120 tok');
        expect(container.textContent).toContain('Resp: 300 tok');
        expect(container.textContent).toContain('ECONNREFUSED');

        const dossierBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Full Dossier')
        );
        act(() => {
            dossierBtn?.click();
        });
        expect(openLogDetailModal).toHaveBeenCalledWith('verbose', sampleLogs[0]);

        const exportBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Export Log')
        );
        act(() => {
            exportBtn?.click();
        });
        expect(container.textContent).toContain('Formatted Text (.txt)');

        const errorsTab = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.trim().startsWith('errors')
        );
        act(() => {
            errorsTab?.click();
        });
        expect(setLogFilter).toHaveBeenCalledWith('errors');

        // Re-render filtered to errors
        renderIntoRoot(
            <LogsView
                promptLog={sampleLogs}
                setPromptLog={setPromptLog}
                logFilter="errors"
                setLogFilter={setLogFilter}
                openLogDetailModal={openLogDetailModal}
                showToast={showToast}
            />
        );
        expect(container.textContent).toContain('Audio Drama TTS');
        expect(container.textContent).not.toContain('Passed length and structure checks');

        const clearBtn = container.querySelector('button[title="Clear logs"]') as HTMLButtonElement | null;
        act(() => {
            clearBtn?.click();
        });
        expect(setPromptLog).toHaveBeenCalledWith([]);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('renders ReaderView in paginated and scroll modes, TOC/Appearance drawers, and floating AudioPlayer', () => {
        const paginatedProps = buildReaderProps({
            ttsIsMiniPlayerVisible: true,
            ttsStatus: 'playing',
            ttsQueue: [{ speaker: 'Mara', text: 'Lantern light pooled across wet timber.' }],
            ttsDuration: 95,
            ttsCurrentTime: 30,
            isPlayingMasterSceneMp3: true
        });
        renderIntoRoot(<ReaderView {...paginatedProps} />);

        expect(container.textContent).toContain('Harbor Fog');
        expect(container.textContent).toContain('Lantern light pooled across wet timber.');
        expect(container.textContent).toContain('Page 1 of 3');
        expect(container.textContent).toContain('Saved Audio · 0:30 / 1:35');

        // Scroll mode + open TOC drawer
        const setIsTocOpen = vi.fn();
        const jumpToReaderScene = vi.fn();
        const scrollProps = buildReaderProps({
            readerSettings: {
                ...paginatedProps.readerSettings,
                readingMode: 'scroll'
            },
            isTocOpen: true,
            setIsTocOpen,
            jumpToReaderScene
        });
        renderIntoRoot(<ReaderView {...scrollProps} />);
        expect(container.textContent).toContain('Table of Contents');
        expect(container.textContent).toContain('Warehouse Alley');

        const closeTocBtn = container.querySelector(
            'button[aria-label="Close Table of Contents"]'
        ) as HTMLButtonElement | null;
        act(() => {
            closeTocBtn?.click();
        });
        expect(setIsTocOpen).toHaveBeenCalledWith(false);

        // Open Appearance drawer & update setting
        const updateReaderSetting = vi.fn();
        renderIntoRoot(
            <ReaderView
                {...buildReaderProps({
                    isAppearanceOpen: true,
                    updateReaderSetting
                })}
            />
        );
        expect(container.textContent).toContain('Reading Appearance');
        const sepiaBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Sepia')
        );
        act(() => {
            sepiaBtn?.click();
        });
        expect(updateReaderSetting).toHaveBeenCalledWith('readerTheme', 'sepia');
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
});
