/**
 * @module components/cover/StylizedBlankCover
 * 8 editorial typographic book cover compositions with adaptive font scaling.
 */

import type React from 'react';
import { useEffect } from 'react';
import { Sparkles } from '@/components/icons';
import { getAdaptiveCoverTypography, getCoverStyleIndex } from '@/domain/story';
import { ensureCoverFontsLoaded } from '@/services/browser';

export interface CoverStoryInput {
    id?: string;
    title?: string;
    coverStyle?: number;
}

export interface StylizedBlankCoverProps {
    story?: CoverStoryInput;
    theme?: 'light' | 'dark' | string;
    isLarge?: boolean;
    onCycleStyle?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export function StylizedBlankCover({
    story = {},
    theme = 'light',
    isLarge = false,
    onCycleStyle
}: StylizedBlankCoverProps) {
    useEffect(() => {
        ensureCoverFontsLoaded();
    }, []);

    const title = (story.title || 'Untitled Novel').trim();
    const styleIdx =
        typeof story.coverStyle === 'number'
            ? Math.abs(story.coverStyle) % 8
            : getCoverStyleIndex(story.id || title);
    const isDark = theme === 'dark';
    const typo = getAdaptiveCoverTypography(styleIdx, title, isLarge);

    const cycleBtn = onCycleStyle ? (
        <button
            onClick={onCycleStyle}
            className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-black/20 hover:bg-black/50 text-white/80 hover:text-white backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            title="Cycle Typography & Orientation"
        >
            <Sparkles size={11} />
        </button>
    ) : null;

    // --- STYLE 0: The Monumental Vertical Spine Run (Vertical 90° Axis + Bodoni Serif) ---
    if (styleIdx === 0) {
        return (
            <div
                className={`w-full h-full relative p-4 sm:p-5 flex overflow-hidden ${
                    isDark
                        ? 'bg-gradient-to-br from-[#222228] via-[#16161A] to-[#0E0E10] text-[#F5F0E8]'
                        : 'bg-gradient-to-br from-[#FAF8F5] via-[#F2ECE1] to-[#E5DDD0] text-ink-900'
                }`}
            >
                {cycleBtn}
                <div
                    className={`absolute top-3 bottom-3 right-3 left-6 sm:left-7 border ${
                        isDark ? 'border-[#C9A96E]/20' : 'border-gold-edge'
                    } pointer-events-none`}
                />

                <div className="h-full flex items-center justify-center z-10 pl-5 sm:pl-6">
                    <h2
                        style={{
                            fontFamily: "'Bodoni Moda', 'DM Serif Display', Georgia, serif",
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            fontSize: typo.fontSize,
                            letterSpacing: typo.letterSpacing,
                            lineHeight: typo.lineHeight,
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word'
                        }}
                        className={`font-bold uppercase max-h-[90%] ${
                            isDark ? 'text-[#F5F0E8] [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]' : 'text-ink-900'
                        }`}
                    >
                        {title}
                    </h2>
                </div>

                <div className="flex-1 h-full flex flex-col justify-between items-end z-10 pr-1 sm:pr-2">
                    <div className="text-right pt-1">
                        <span
                            className={`text-base ${
                                isDark
                                    ? 'text-[#C9A96E] [text-shadow:0_0_8px_rgba(201,169,110,0.8)]'
                                    : 'text-gold'
                            }`}
                        >
                            ✦
                        </span>
                        <div
                            className={`text-[7.5px] font-mono tracking-[0.25em] uppercase font-bold mt-1 ${
                                isDark ? 'text-[#C9A96E]' : 'text-gold-ink'
                            }`}
                        >
                            FOLIO 01
                        </div>
                    </div>

                    <div className="text-right pb-1">
                        <div
                            className={`w-6 h-[1px] ml-auto mb-2 ${
                                isDark ? 'bg-[#C9A96E]/40' : 'bg-gold/40'
                            }`}
                        />
                        <span
                            className={`text-[7.5px] font-mono tracking-[0.3em] uppercase block ${
                                isDark ? 'text-[#8C7A58]' : 'text-ink-400'
                            }`}
                        >
                            ELLIPSIS
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    // --- STYLE 1: The Massive Graphic Chunk (Syne Hyper-Display Sans) ---
    if (styleIdx === 1) {
        return (
            <div
                className={`w-full h-full relative p-4 sm:p-5 pl-7 sm:pl-8 flex flex-col justify-between overflow-hidden ${
                    isDark
                        ? 'bg-gradient-to-br from-[#1A1C24] via-[#121318] to-[#0A0B0E] text-[#F5F0E8]'
                        : 'bg-gradient-to-br from-[#F5F2EC] via-[#EAE4DA] to-[#DCD5C7] text-ink-900'
                }`}
            >
                {cycleBtn}
                <div className="flex justify-between items-start z-10">
                    <div
                        className={`px-2 py-0.5 rounded-xs text-[7.5px] font-mono uppercase font-black tracking-wider ${
                            isDark
                                ? 'bg-[#C9A96E] text-ink-950 shadow-[0_0_10px_rgba(201,169,110,0.5)]'
                                : 'bg-stone-900 text-white'
                        }`}
                    >
                        NOVEL // 01
                    </div>
                    <span className={`text-[8px] font-mono tracking-widest ${isDark ? 'text-ink-500' : 'text-ink-400'}`}>
                        SPEC.2026
                    </span>
                </div>

                <div className="my-auto z-10 text-left py-1">
                    <h2
                        style={{
                            fontFamily: "'Syne', 'Unbounded', 'Plus Jakarta Sans', sans-serif",
                            fontSize: typo.fontSize,
                            lineHeight: typo.lineHeight,
                            letterSpacing: typo.letterSpacing,
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word'
                        }}
                        className={`font-black uppercase ${isDark ? 'text-[#F5F0E8]' : 'text-ink-900'}`}
                    >
                        {title}
                    </h2>
                    <div
                        className={`w-12 sm:w-16 h-1.5 mt-3 sm:mt-4 rounded-full ${
                            isDark ? 'bg-gradient-to-r from-[#C9A96E] to-[#F4E2B8]' : 'bg-gold'
                        }`}
                    />
                </div>

                <div className="flex justify-between items-end z-10 font-mono text-[7px] tracking-widest text-ink-400">
                    <span>ATELIER EDITION</span>
                    <span>ELLIPSIS PROSE</span>
                </div>
            </div>
        );
    }

    // --- STYLE 2: The Tilted Script & Lunar Disc (Angled Pinyon Calligraphy) ---
    if (styleIdx === 2) {
        return (
            <div
                className={`w-full h-full relative p-4 sm:p-5 pl-6 sm:pl-7 flex flex-col justify-between overflow-hidden ${
                    isDark
                        ? 'bg-gradient-to-br from-[#241A28] via-[#16101B] to-[#0D0812] text-[#F5F0E8]'
                        : 'bg-gradient-to-br from-[#FAF4F0] via-[#EFE2DA] to-[#E2D2C8] text-ink-900'
                }`}
            >
                {cycleBtn}
                <div
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full blur-xl pointer-events-none ${
                        isDark ? 'bg-[#C9A96E]/20' : 'bg-gold-tint'
                    }`}
                />

                <div className="text-center z-10 pt-1">
                    <span
                        className={`text-[8px] font-mono tracking-[0.28em] uppercase ${
                            isDark ? 'text-[#C9A96E]' : 'text-gold-ink'
                        }`}
                    >
                        ✦ A TALE OF ✦
                    </span>
                </div>

                <div className="my-auto z-10 text-center px-1 py-2 transform -rotate-6 sm:-rotate-8 scale-105">
                    <h2
                        style={{
                            fontFamily: "'Pinyon Script', cursive",
                            fontSize: typo.fontSize,
                            lineHeight: typo.lineHeight,
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word'
                        }}
                        className={
                            isDark ? 'text-[#FAF5E8] [text-shadow:0_0_14px_rgba(201,169,110,0.7)]' : 'text-ink-900'
                        }
                    >
                        {title}
                    </h2>
                </div>

                <div className="text-center z-10 pb-1">
                    <span className={`text-base ${isDark ? 'text-[#C9A96E]' : 'text-gold'}`}>❦</span>
                </div>
            </div>
        );
    }

    // --- STYLE 3: The Architectural Monolith (Antonio / Oswald Ultra-Tall Condensed) ---
    if (styleIdx === 3) {
        return (
            <div
                className={`w-full h-full relative p-4 sm:p-5 pl-6 sm:pl-7 flex flex-col justify-between overflow-hidden ${
                    isDark
                        ? 'bg-gradient-to-br from-[#1A1A1E] via-[#111114] to-[#08080A] text-[#F5F0E8]'
                        : 'bg-gradient-to-br from-[#F6F4F0] via-[#EAE6DD] to-[#DDD7CA] text-ink-900'
                }`}
            >
                {cycleBtn}
                <div className="flex justify-between items-center z-10">
                    <span
                        className={`text-[8px] font-mono tracking-[0.25em] uppercase font-semibold ${
                            isDark ? 'text-ink-400' : 'text-ink-500'
                        }`}
                    >
                        ARCHIVE // 01
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full ${isDark ? 'bg-[#C9A96E]' : 'bg-gold'}`} />
                </div>

                <div className="my-auto z-10 text-center py-2">
                    <h2
                        style={{
                            fontFamily: "'Antonio', 'Oswald', sans-serif",
                            fontSize: typo.fontSize,
                            letterSpacing: typo.letterSpacing,
                            lineHeight: typo.lineHeight,
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word'
                        }}
                        className={`font-light uppercase ${isDark ? 'text-[#F5F0E8]' : 'text-ink-900'}`}
                    >
                        {title}
                    </h2>

                    <div className="relative w-12 sm:w-14 h-12 sm:h-14 mx-auto my-3 flex items-center justify-center opacity-75">
                        <div
                            className={`absolute inset-0 rounded-full border border-dashed ${
                                isDark ? 'border-[#C9A96E]/50' : 'border-gold/50'
                            }`}
                        />
                        <div
                            className={`w-6 sm:w-7 h-6 sm:h-7 rounded-full border ${
                                isDark ? 'border-[#C9A96E]' : 'border-gold'
                            }`}
                        />
                        <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-[#C9A96E]' : 'bg-gold'}`} />
                        <div className={`absolute w-full h-[1px] ${isDark ? 'bg-[#C9A96E]/30' : 'bg-gold/30'}`} />
                    </div>
                </div>

                <div className="text-center z-10">
                    <span
                        className={`text-[7.5px] font-mono tracking-[0.35em] uppercase px-2.5 py-0.5 border ${
                            isDark ? 'border-stone-700 text-ink-300' : 'border-edge-300 text-ink-700'
                        }`}
                    >
                        [ ELLIPSIS // PROSE ]
                    </span>
                </div>
            </div>
        );
    }

    // --- STYLE 4: The 70px Drop Initial Monogram (Cinzel Decorative Monogram) ---
    if (styleIdx === 4) {
        const firstLetter = title.charAt(0) || 'E';
        return (
            <div
                className={`w-full h-full relative p-4 sm:p-5 pl-6 sm:pl-7 flex flex-col justify-between overflow-hidden ${
                    isDark
                        ? 'bg-gradient-to-br from-[#221B27] via-[#16111C] to-[#0C0812] text-[#F5F0E8]'
                        : 'bg-gradient-to-br from-[#F8F5EE] via-[#EBE2D2] to-[#DECDB7] text-ink-900'
                }`}
            >
                {cycleBtn}
                <div
                    className={`absolute top-3 bottom-3 right-3 left-6 sm:left-7 border ${
                        isDark ? 'border-[#C9A96E]/30' : 'border-gold/35'
                    } pointer-events-none`}
                >
                    <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[#C9A96E]" />
                    <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[#C9A96E]" />
                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-[#C9A96E]" />
                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[#C9A96E]" />
                </div>

                <div className="flex justify-between items-center z-10 pt-1 px-1">
                    <span
                        className={`text-[8px] font-serif tracking-[0.2em] uppercase font-bold ${
                            isDark ? 'text-[#C9A96E]' : 'text-gold-ink'
                        }`}
                    >
                        LIBER PRIMUS
                    </span>
                    <span className={`text-[10px] ${isDark ? 'text-[#C9A96E]' : 'text-gold-ink'}`}>✹</span>
                </div>

                <div className="my-auto z-10 text-center px-2 py-1">
                    <div
                        style={{
                            fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
                            fontSize: typo.dropCapSize
                        }}
                        className={`font-black leading-none ${
                            isDark
                                ? 'bg-gradient-to-b from-[#FFF0D0] via-[#C9A96E] to-[#99783D] bg-clip-text text-transparent [filter:drop-shadow(0_0_12px_rgba(201,169,110,0.5))]'
                                : 'bg-gradient-to-b from-[#8C6B32] to-[#4D3A1B] bg-clip-text text-transparent'
                        }`}
                    >
                        {firstLetter}
                    </div>

                    <h2
                        style={{
                            fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
                            fontSize: typo.fontSize,
                            letterSpacing: typo.letterSpacing,
                            lineHeight: typo.lineHeight,
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word'
                        }}
                        className={`font-bold uppercase mt-2 ${isDark ? 'text-[#F5F0E8]' : 'text-ink-900'}`}
                    >
                        {title}
                    </h2>
                </div>

                <div className="text-center z-10 pb-1">
                    <span
                        className={`text-[7px] font-mono tracking-[0.25em] uppercase ${
                            isDark ? 'text-[#8C7A58]' : 'text-ink-400'
                        }`}
                    >
                        • ELLIPSIS PROSE •
                    </span>
                </div>
            </div>
        );
    }

    // --- STYLE 5: The 90° Rotated Bauhaus Modernist (Space Grotesk Dual-Axis) ---
    if (styleIdx === 5) {
        return (
            <div
                className={`w-full h-full relative p-4 sm:p-5 pl-6 sm:pl-7 flex overflow-hidden ${
                    isDark
                        ? 'bg-gradient-to-br from-[#16181E] via-[#0E1014] to-[#07080A] text-[#F5F0E8]'
                        : 'bg-gradient-to-br from-[#F4F2EB] via-[#E7E1D4] to-[#D9D1C0] text-ink-900'
                }`}
            >
                {cycleBtn}
                <div className="h-full flex items-center justify-center z-10 w-10 sm:w-12 border-r border-edge-bold pr-2">
                    <h2
                        style={{
                            fontFamily: "'Space Grotesk', sans-serif",
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            fontSize: typo.fontSize,
                            letterSpacing: typo.letterSpacing,
                            lineHeight: typo.lineHeight,
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word'
                        }}
                        className={`font-black uppercase max-h-[90%] ${
                            isDark ? 'text-[#F5F0E8]' : 'text-ink-900'
                        }`}
                    >
                        {title}
                    </h2>
                </div>

                <div className="flex-1 h-full flex flex-col justify-between pl-3 sm:pl-4 z-10 py-1">
                    <div className="flex justify-between items-start">
                        <span
                            className={`text-[8px] font-mono uppercase font-bold ${
                                isDark ? 'text-[#C9A96E]' : 'text-gold-ink'
                            }`}
                        >
                            SPEC.01
                        </span>
                        <div className={`w-3 h-3 ${isDark ? 'bg-[#C9A96E]' : 'bg-black'}`} />
                    </div>

                    <div className="my-auto">
                        <div
                            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                            className={`font-black ${
                                isLarge ? 'text-5xl sm:text-6xl' : 'text-4xl sm:text-5xl'
                            } leading-none ${isDark ? 'text-[#C9A96E]' : 'text-ink-900'}`}
                        >
                            01
                        </div>
                        <div
                            className={`text-[7.5px] font-mono uppercase tracking-widest mt-1.5 ${
                                isDark ? 'text-ink-400' : 'text-ink-600'
                            }`}
                        >
                            ORIGINAL MANUSCRIPT
                        </div>
                    </div>

                    <div className="font-mono text-[7px] text-ink-400 tracking-wider">SYS.NARRATIVE // EP</div>
                </div>
            </div>
        );
    }

    // --- STYLE 6: The Offset Crescent Moon & Drift (Newsreader Elegant Italic) ---
    if (styleIdx === 6) {
        return (
            <div
                className={`w-full h-full relative p-4 sm:p-5 pl-6 sm:pl-7 flex flex-col justify-between overflow-hidden ${
                    isDark
                        ? 'bg-gradient-to-br from-[#161822] via-[#0E1018] to-[#07080E] text-[#F5F0E8]'
                        : 'bg-gradient-to-br from-[#FAF7F2] via-[#EFE7DC] to-[#E1D7C8] text-ink-900'
                }`}
            >
                {cycleBtn}
                <div
                    className={`absolute -top-6 -right-6 w-32 sm:w-36 h-32 sm:h-36 rounded-full pointer-events-none ${
                        isDark
                            ? 'bg-gradient-to-br from-[#C9A96E]/30 via-[#F4E2B8]/15 to-transparent shadow-[0_0_30px_rgba(201,169,110,0.25)]'
                            : 'bg-gradient-to-br from-[#B8935A]/35 via-[#EAD49E]/20 to-transparent'
                    }`}
                />

                <div className="flex justify-between items-center z-10 pt-1">
                    <span
                        className={`text-[8px] font-mono tracking-[0.2em] uppercase ${
                            isDark ? 'text-ink-400' : 'text-ink-500'
                        }`}
                    >
                        Novella
                    </span>
                    <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-[#C9A96E]' : 'bg-gold'}`} />
                </div>

                <div className="my-auto z-10 text-left pt-6 pb-2 pr-2">
                    <h2
                        style={{
                            fontFamily: "'Newsreader', 'Cormorant Garamond', Georgia, serif",
                            fontSize: typo.fontSize,
                            lineHeight: typo.lineHeight,
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word'
                        }}
                        className={`italic font-normal ${
                            isDark ? 'text-[#FAF6EE] [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]' : 'text-ink-900'
                        }`}
                    >
                        {title}
                    </h2>
                </div>

                <div className="flex justify-between items-end z-10 pb-1">
                    <span
                        className={`text-[7px] font-mono tracking-[0.2em] uppercase ${
                            isDark ? 'text-ink-500' : 'text-ink-400'
                        }`}
                    >
                        Edition Primus
                    </span>
                    <span
                        className={`w-4 h-4 rounded-xs flex items-center justify-center text-[8.5px] font-bold ${
                            isDark
                                ? 'bg-[#C9A96E]/20 text-[#C9A96E] border border-[#C9A96E]/40'
                                : 'bg-gold-tint text-gold-ink border border-gold-edge'
                        }`}
                    >
                        印
                    </span>
                </div>
            </div>
        );
    }

    // --- STYLE 7: The Angled Vintage Sash & Headline (Prata Slanted Sash) ---
    return (
        <div
            className={`w-full h-full relative p-4 sm:p-5 flex flex-col justify-between overflow-hidden ${
                isDark
                    ? 'bg-gradient-to-br from-[#1C1917] via-[#12100F] to-[#0A0908] text-[#F5F0E8]'
                    : 'bg-gradient-to-br from-[#F8F4EB] via-[#EAE0CE] to-[#DCCEB8] text-ink-900'
            }`}
        >
            {cycleBtn}
            <span className={`absolute top-2.5 left-6 sm:left-7 text-xs ${isDark ? 'text-[#C9A96E]/60' : 'text-gold/60'}`}>
                ⌜
            </span>
            <span className={`absolute top-2.5 right-2.5 text-xs ${isDark ? 'text-[#C9A96E]/60' : 'text-gold/60'}`}>
                ⌝
            </span>
            <span
                className={`absolute bottom-2.5 left-6 sm:left-7 text-xs ${isDark ? 'text-[#C9A96E]/60' : 'text-gold/60'}`}
            >
                ⌞
            </span>
            <span className={`absolute bottom-2.5 right-2.5 text-xs ${isDark ? 'text-[#C9A96E]/60' : 'text-gold/60'}`}>
                ⌟
            </span>

            <div className="text-center z-10 pt-1 pl-4">
                <span className={`text-[8px] font-mono tracking-widest ${isDark ? 'text-[#C9A96E]' : 'text-gold-ink'}`}>
                    ◈ ─── ❖ ─── ◈
                </span>
            </div>

            <div className="my-auto z-10 transform -rotate-6 sm:-rotate-7 -mx-10 w-[calc(100%+5rem)] py-3 sm:py-3.5 bg-black/80 dark:bg-black/90 border-y-2 border-[#C9A96E]/80 shadow-[0_4px_24px_rgba(0,0,0,0.55)] backdrop-blur-sm text-center">
                <h2
                    style={{
                        fontFamily: "'Prata', 'Merriweather', Georgia, serif",
                        fontSize: typo.fontSize,
                        letterSpacing: typo.letterSpacing,
                        lineHeight: typo.lineHeight,
                        overflowWrap: 'break-word',
                        wordBreak: 'break-word'
                    }}
                    className="font-bold uppercase px-6 text-[#FDF8F0] [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]"
                >
                    {title}
                </h2>
                <div className="flex items-center justify-center gap-2 mt-1 px-4">
                    <div className="w-5 h-[1px] bg-[#C9A96E]/60" />
                    <span className="text-[7.5px] font-mono tracking-[0.25em] uppercase text-[#C9A96E] font-semibold whitespace-nowrap">
                        A NOVEL OF INTRIGUE
                    </span>
                    <div className="w-5 h-[1px] bg-[#C9A96E]/60" />
                </div>
            </div>

            <div className="text-center z-10 pb-1 pl-4">
                <span className={`text-[8px] font-mono tracking-widest ${isDark ? 'text-[#C9A96E]' : 'text-gold-ink'}`}>
                    ◈ ─── ❖ ─── ◈
                </span>
            </div>
        </div>
    );
}
