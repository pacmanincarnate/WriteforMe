/**
 * @module components/common/StoryResetDropdown
 * Viewport-aware dropdown menu for rolling back story stages (tts, prose, scenes, sequences, acts).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    ChevronDown,
    Feather,
    Film,
    Layers,
    List,
    RotateCcw,
    VolumeX,
    type LucideIcon
} from '@/components/icons';
import type { StoryResetStageKey } from '@/domain/lifecycle';

export interface StoryResetDropdownProps {
    story?: {
        scenes?: Record<string, unknown[]>;
        prose?: Record<string, unknown>;
        sequences?: unknown[];
        acts?: unknown[];
    } | null;
    onResetStage?: (stage: StoryResetStageKey) => void;
    availableSceneAudioMap?: Record<string, unknown>;
    disabled?: boolean;
    compact?: boolean;
    align?: 'left' | 'right';
    fullWidth?: boolean;
    dropUp?: boolean;
}

interface ResetOption {
    stage: StoryResetStageKey;
    label: string;
    description: string;
    badge: string;
    icon: LucideIcon;
    isFullReset?: boolean;
}

export function StoryResetDropdown({
    story,
    onResetStage,
    availableSceneAudioMap = {},
    disabled = false,
    compact = false,
    align = 'right',
    fullWidth = false,
    dropUp = false
}: StoryResetDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuHorizontalStyle, setMenuHorizontalStyle] = useState<{
        left: string;
        right: string;
        maxHeight: string;
    } | null>(null);
    const [effectiveDropUp, setEffectiveDropUp] = useState(Boolean(dropUp));
    const dropdownRef = useRef<HTMLDivElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        if (!isOpen) {
            setMenuHorizontalStyle(null);
            setEffectiveDropUp(Boolean(dropUp));
            return;
        }
        const updatePosition = () => {
            if (!dropdownRef.current || !menuRef.current) return;
            const triggerRect = dropdownRef.current.getBoundingClientRect();
            const vw = window.innerWidth || document.documentElement.clientWidth || 390;
            const vh = window.innerHeight || document.documentElement.clientHeight || 844;
            const pad = 12;
            const menuWidth = menuRef.current.offsetWidth || Math.min(320, vw - 32);
            const menuHeight = menuRef.current.offsetHeight || 360;
            const preferredLeft =
                align === 'left' ? triggerRect.left : triggerRect.right - menuWidth;
            const maxLeft = Math.max(pad, vw - pad - menuWidth);
            const clampedLeft = Math.min(Math.max(preferredLeft, pad), maxLeft);
            const spaceBelow = vh - triggerRect.bottom - pad;
            const spaceAbove = triggerRect.top - pad;
            const nextDropUp = dropUp
                ? !(spaceAbove < menuHeight && spaceBelow > spaceAbove)
                : spaceBelow < menuHeight && spaceAbove > spaceBelow;
            const availableVerticalSpace = (nextDropUp ? spaceAbove : spaceBelow) - 8;
            setMenuHorizontalStyle({
                left: `${Math.round(clampedLeft - triggerRect.left)}px`,
                right: 'auto',
                maxHeight: `${Math.max(160, Math.floor(availableVerticalSpace))}px`
            });
            setEffectiveDropUp(nextDropUp);
        };
        updatePosition();
        window.addEventListener('resize', updatePosition);
        return () => window.removeEventListener('resize', updatePosition);
    }, [isOpen, align, dropUp]);

    useEffect(() => {
        if (!isOpen) return;
        const handlePointerDown = (e: MouseEvent | TouchEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('touchstart', handlePointerDown, { passive: true });
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('touchstart', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const scenesMap = story?.scenes && typeof story.scenes === 'object' ? story.scenes : {};
    const sceneCount = Object.values(scenesMap).reduce(
        (total, list) => total + (Array.isArray(list) ? list.length : 0),
        0
    );
    const proseMap = story?.prose && typeof story.prose === 'object' ? story.prose : {};
    const proseCount = Object.values(proseMap).reduce<number>((count, entry) => {
        if (typeof entry === 'string') return count + (entry.trim() ? 1 : 0);
        if (entry && typeof entry === 'object') {
            const rec = entry as { final?: unknown; draft?: unknown };
            if (
                (rec.final && String(rec.final).trim()) ||
                (rec.draft && String(rec.draft).trim())
            ) {
                return count + 1;
            }
        }
        return count;
    }, 0);
    const seqCount = Array.isArray(story?.sequences) ? story.sequences.length : 0;
    const actCount = Array.isArray(story?.acts) ? story.acts.length : 0;
    const ttsAudioCount =
        availableSceneAudioMap && typeof availableSceneAudioMap === 'object'
            ? Object.keys(availableSceneAudioMap).length
            : 0;

    const resetOptions: ResetOption[] = [
        {
            stage: 'tts',
            label: 'Delete All Scene TTS',
            description:
                'Keep all prose, scenes, sequences & acts; remove all generated and stored scene TTS audio.',
            badge: `${ttsAudioCount} audio`,
            icon: VolumeX
        },
        {
            stage: 'prose',
            label: 'Delete All Prose',
            description: 'Keep planned scenes, sequences & acts; remove prose & writing-time data.',
            badge: `${proseCount} written`,
            icon: Feather
        },
        {
            stage: 'scenes',
            label: 'Delete All Scenes',
            description: 'Keep sequences & acts; remove all scenes, beats, prose & writing data.',
            badge: `${sceneCount} scenes`,
            icon: Film
        },
        {
            stage: 'sequences',
            label: 'Delete All Sequences',
            description: 'Keep acts & initial arc; remove sequences, scenes & prose.',
            badge: `${seqCount} seqs`,
            icon: List
        },
        {
            stage: 'acts',
            label: 'Delete All Acts (Full Structure Reset)',
            description:
                'Roll back to pre-act structure; keep concept, initial cast, story arc & uploaded docs.',
            badge: `${actCount} acts`,
            icon: Layers,
            isFullReset: true
        }
    ];

    const handleSelect = (stage: StoryResetStageKey) => {
        setIsOpen(false);
        if (typeof onResetStage === 'function') {
            onResetStage(stage);
        }
    };

    return (
        <div ref={dropdownRef} className={`relative ${fullWidth ? 'w-full' : 'inline-block'}`}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                data-testid="story-reset-dropdown-trigger"
                className={`${fullWidth ? 'w-full justify-between' : 'justify-center'} ${
                    compact ? 'px-3 py-2 text-xs' : 'px-3.5 py-2.5 text-xs'
                } min-h-[38px] rounded-xl font-bold bg-surface hover:bg-blush-tint border border-edge-strong hover:border-blush-edge text-ink-700 hover:text-blush-800 shadow-2xs transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 cursor-pointer`}
                title="Roll back the story to an earlier pipeline stage"
            >
                <span className="flex items-center gap-1.5">
                    <RotateCcw size={13} className="text-blush-600 shrink-0" />
                    <span>{compact ? 'Reset Story' : 'Reset Story Stage'}</span>
                </span>
                <ChevronDown
                    size={13}
                    className={`text-ink-400 transition-transform duration-200 shrink-0 ${
                        isOpen ? 'rotate-180' : ''
                    }`}
                />
            </button>

            {isOpen && (
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label="Reset story rollback options"
                    data-testid="story-reset-dropdown-menu"
                    style={menuHorizontalStyle || undefined}
                    className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} ${
                        effectiveDropUp ? 'bottom-full mb-2' : 'top-full mt-2'
                    } w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto z-50 rounded-2xl border border-edge-strong bg-surface shadow-2xl p-2 space-y-1 animate-fade-in`}
                >
                    <div className="px-2.5 py-1.5 border-b border-edge-soft flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider font-mono text-ink-500">
                            Rollback Stage
                        </span>
                        <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                            Keeps uploaded docs &amp; concept
                        </span>
                    </div>
                    {resetOptions.map((opt) => {
                        const IconComp = opt.icon;
                        return (
                            <button
                                key={opt.stage}
                                type="button"
                                role="menuitem"
                                data-testid={`reset-stage-${opt.stage}`}
                                onClick={() => handleSelect(opt.stage)}
                                className={`w-full text-left px-3 py-2.5 rounded-xl min-h-[44px] flex items-start gap-2.5 transition-colors cursor-pointer ${
                                    opt.isFullReset
                                        ? 'hover:bg-blush-tint/80 border-t border-edge-soft/60 mt-1 pt-2.5'
                                        : 'hover:bg-wash'
                                }`}
                            >
                                <IconComp
                                    size={15}
                                    className={`${
                                        opt.isFullReset ? 'text-crimson-600' : 'text-gold-ink'
                                    } mt-0.5 shrink-0`}
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <span
                                            className={`text-xs font-bold ${
                                                opt.isFullReset
                                                    ? 'text-blush-900 dark:text-rose-300'
                                                    : 'text-ink-900'
                                            }`}
                                        >
                                            {opt.label}
                                        </span>
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-inset border border-edge-soft text-ink-500 shrink-0">
                                            {opt.badge}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-ink-500 leading-snug mt-0.5">
                                        {opt.description}
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
