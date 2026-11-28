import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { logStore, recoverOrphanedLogs } from '@/services/storage';
import {
    DEFAULT_AUDIO_BAR_CLEARANCE,
    formatPlaybackTime,
    LogsView,
    measureFloatingBarClearance,
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

    it('calculates floating audio bar clearance and caps at 55% of viewport height', () => {
        expect(measureFloatingBarClearance(null, 900)).toBeNull();

        const barEl = document.createElement('div');
        expect(measureFloatingBarClearance(barEl, 0)).toBeNull();

        // jsdom default rect has height 0 -> unmeasured
        expect(measureFloatingBarClearance(barEl, 900)).toBeNull();

        // Out-of-bounds rect (below viewport or larger than viewport)
        vi.spyOn(barEl, 'getBoundingClientRect').mockReturnValue({
            top: 910,
            bottom: 980,
            height: 70,
            left: 0,
            right: 500,
            width: 500,
            x: 0,
            y: 910,
            toJSON: () => ({})
        });
        expect(measureFloatingBarClearance(barEl, 900)).toBeNull();

        // Normal desktop bar: top 760 on 900px viewport => 140 occupied + 12 gap = 152
        vi.spyOn(barEl, 'getBoundingClientRect').mockReturnValue({
            top: 760,
            bottom: 838,
            height: 78,
            left: 400,
            right: 976,
            width: 576,
            x: 400,
            y: 760,
            toJSON: () => ({})
        });
        expect(measureFloatingBarClearance(barEl, 900)).toBe(152);
        expect(measureFloatingBarClearance(barEl, 900, 20)).toBe(160);

        // Short landscape viewport (360px): occupied 220 + 12 = 232, capped at floor(360 * 0.55) = 198
        vi.spyOn(barEl, 'getBoundingClientRect').mockReturnValue({
            top: 140,
            bottom: 290,
            height: 150,
            left: 50,
            right: 450,
            width: 400,
            x: 50,
            y: 140,
            toJSON: () => ({})
        });
        expect(measureFloatingBarClearance(barEl, 360)).toBe(198);
    });

    it('reserves bottom clearance on the reading surface when the audio mini-player is visible and freezes it while settings popover is open', () => {
        // 1. Mini-player hidden in paginated mode -> no bottom clearance on surface, default inner padding
        renderIntoRoot(
            <ReaderView
                {...buildReaderProps({
                    ttsIsMiniPlayerVisible: false
                })}
            />
        );
        const surfaceHidden = container.querySelector('[data-reader-surface="true"]') as HTMLElement;
        expect(surfaceHidden).not.toBeNull();
        expect(surfaceHidden.style.paddingBottom).toBe('');
        const paginatedInnerHidden = surfaceHidden.querySelector('.z-15') as HTMLElement;
        expect(paginatedInnerHidden.style.paddingBottom).toContain('3.75rem');

        // 2. Mini-player visible in paginated mode (jsdom zero-height rect -> fallback clearance)
        renderIntoRoot(
            <ReaderView
                {...buildReaderProps({
                    ttsIsMiniPlayerVisible: true,
                    ttsStatus: 'playing'
                })}
            />
        );
        const surfacePaginated = container.querySelector('[data-reader-surface="true"]') as HTMLElement;
        expect(surfacePaginated.style.paddingBottom).toBe(DEFAULT_AUDIO_BAR_CLEARANCE);
        const paginatedInnerVisible = surfacePaginated.querySelector('.z-15') as HTMLElement;
        expect(paginatedInnerVisible.style.paddingBottom).toBe('0.25rem');

        // 3. Mini-player visible in scroll mode -> fallback clearance + reduced inner paddingBottom
        const scrollProps = buildReaderProps({
            ttsIsMiniPlayerVisible: true,
            ttsStatus: 'playing'
        });
        scrollProps.readerSettings = {
            ...scrollProps.readerSettings,
            readingMode: 'scroll'
        };
        renderIntoRoot(<ReaderView {...scrollProps} />);
        const surfaceScroll = container.querySelector('[data-reader-surface="true"]') as HTMLElement;
        expect(surfaceScroll.style.paddingBottom).toBe(DEFAULT_AUDIO_BAR_CLEARANCE);
        const scrollContainer = surfaceScroll.querySelector('.overflow-y-auto') as HTMLElement;
        expect(scrollContainer.style.paddingBottom).toBe('1.5rem');

        // 4. Mocked real bar rect on window.innerHeight = 900 -> exact pixel clearance & frozen when popover opens
        // Unmount mini-player first so ReaderAudioPlayer mounts fresh after the getBoundingClientRect mock is installed.
        renderIntoRoot(
            <ReaderView
                {...buildReaderProps({
                    ttsIsMiniPlayerVisible: false
                })}
            />
        );
        Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
        let barHeight = 78;
        let barTop = 760;
        const rectSpy = vi
            .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
            .mockImplementation(function (this: HTMLElement) {
                if (this.classList?.contains('reader-tts-floating-bar')) {
                    return {
                        top: barTop,
                        bottom: barTop + barHeight,
                        height: barHeight,
                        left: 400,
                        right: 976,
                        width: 576,
                        x: 400,
                        y: barTop,
                        toJSON: () => ({})
                    } as DOMRect;
                }
                return {
                    top: 0,
                    bottom: 0,
                    height: 0,
                    left: 0,
                    right: 0,
                    width: 0,
                    x: 0,
                    y: 0,
                    toJSON: () => ({})
                } as DOMRect;
            });

        renderIntoRoot(
            <ReaderView
                {...buildReaderProps({
                    ttsIsMiniPlayerVisible: true,
                    ttsStatus: 'playing'
                })}
            />
        );
        const surfaceMeasured = container.querySelector('[data-reader-surface="true"]') as HTMLElement;
        expect(surfaceMeasured.style.paddingBottom).toBe('152px');

        // Simulate opening "Jump & Fast-Forward" popover growing bar upward
        barTop = 420;
        barHeight = 418;
        const popoverToggle = container.querySelector(
            'button[title="Jump to scene & audio controls"]'
        ) as HTMLButtonElement | null;
        expect(popoverToggle).not.toBeNull();
        act(() => {
            popoverToggle?.click();
        });
        expect(surfaceMeasured.style.paddingBottom).toBe('152px');

        rectSpy.mockRestore();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('renders color-coded speaker names and bracketed cues for audio_drama stories in paginated and scroll modes', () => {
        const dramaChapter = {
            chapterIndex: 0,
            chapterNumber: 1,
            seqIdx: 0,
            title: 'Dockside Frequency',
            summary: 'Priya and Tomas confront the forged log.',
            hasAnyProse: true,
            totalWords: 80,
            totalReadingTime: 1,
            scenes: [
                {
                    sceneKey: '0-0',
                    seqIdx: 0,
                    sceneIdx: 0,
                    hasProse: true,
                    proseText:
                        'Narrator: Rain hissed against the skylight.\n\nPriya: [quietly] Look at the ledger.\n\nTomas: [shaky breath] I had no choice.',
                    title: 'Vault',
                    wordCount: 40,
                    scene: { title: 'Vault' }
                },
                {
                    sceneKey: '0-1',
                    seqIdx: 0,
                    sceneIdx: 1,
                    hasProse: true,
                    proseText: 'Tomas: [low, tired] We burn the copy.',
                    title: 'Pier',
                    wordCount: 40,
                    scene: { title: 'Pier' }
                }
            ]
        };

        const baseDramaProps = buildReaderProps({
            story: {
                id: 'story-drama-1',
                title: 'Signal & Salt',
                writing_mode: 'audio_drama',
                cast: [{ name: 'Priya' }, { name: 'Tomas' }]
            },
            storyChapters: [dramaChapter],
            currentChapter: dramaChapter,
            flatStoryScenes: dramaChapter.scenes,
            currentReaderSceneItem: dramaChapter.scenes[0]
        });

        // Paginated mode
        renderIntoRoot(<ReaderView {...baseDramaProps} />);
        const pagSpeakers = Array.from(container.querySelectorAll('.drama-speaker-name'));
        expect(pagSpeakers.map((el) => el.textContent)).toEqual([
            'Narrator:',
            'Priya:',
            'Tomas:',
            'Tomas:'
        ]);
        expect(pagSpeakers[0].classList.contains('drama-speaker-narrator')).toBe(true);
        expect(pagSpeakers[1].className).not.toBe(pagSpeakers[2].className);
        expect(pagSpeakers[2].className).toBe(pagSpeakers[3].className);

        const pagCues = Array.from(container.querySelectorAll('.drama-bracket-cue'));
        expect(pagCues.map((el) => el.textContent)).toEqual([
            '[quietly]',
            '[shaky breath]',
            '[low, tired]'
        ]);

        // Scroll mode
        renderIntoRoot(
            <ReaderView
                {...baseDramaProps}
                readerSettings={{
                    ...baseDramaProps.readerSettings,
                    readingMode: 'scroll'
                }}
            />
        );
        const scrollSpeakers = Array.from(container.querySelectorAll('.drama-speaker-name'));
        expect(scrollSpeakers.map((el) => el.textContent)).toEqual([
            'Narrator:',
            'Priya:',
            'Tomas:',
            'Tomas:'
        ]);
        expect(scrollSpeakers[2].className).toBe(scrollSpeakers[3].className);
        expect(container.querySelectorAll('.drama-bracket-cue')).toHaveLength(3);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
});
