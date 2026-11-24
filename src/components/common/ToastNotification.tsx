/**
 * @module components/common/ToastNotification
 * Standard alert toast and miniature 3D imported book notification card.
 */

import { AlertCircle, AlertTriangle, Activity, BookOpen, CheckCircle, Headphones, Sparkles, X } from '@/components/icons';
import { BookCoverAudioArt } from '../cover/BookCoverAudioArt';
import { StylizedBlankCover, type CoverStoryInput } from '../cover/StylizedBlankCover';

export interface ToastBookCardData {
    coverSrc?: string;
    title?: string;
    subtitle?: string;
    badge?: string;
    story?: CoverStoryInput & { writing_mode?: string };
    audioCount?: number;
    totalScenes?: number;
    onRead?: () => void;
    onListen?: () => void;
    onStudio?: () => void;
}

export interface ToastPayload {
    type?: 'success' | 'error' | 'warning' | 'info' | string;
    message?: string;
    actionLabel?: string;
    onAction?: () => void;
    bookCard?: ToastBookCardData;
}

export interface ToastNotificationProps {
    toast: ToastPayload | null;
    onDismiss: () => void;
    theme?: 'light' | 'dark' | string;
    position?: 'top' | 'bottom' | string;
}

export function ToastNotification({
    toast,
    onDismiss,
    theme = 'light',
    position = 'bottom'
}: ToastNotificationProps) {
    if (!toast) return null;

    if (toast.bookCard) {
        const bc = toast.bookCard;
        const audioCount = bc.audioCount || 0;
        return (
            <div
                className="fixed z-50 p-3.5 rounded-2xl shadow-2xl border border-edge-strong bg-surface/95 backdrop-blur-xl animate-fade-in transition-all w-[calc(100%-2rem)] max-w-md"
                style={{
                    bottom: 'max(1.25rem, calc(1rem + env(safe-area-inset-bottom, 0px)))',
                    right: 'max(1rem, calc(1rem + env(safe-area-inset-right, 0px)))',
                    left: 'max(1rem, calc(1rem + env(safe-area-inset-left, 0px)))',
                    margin: '0 auto'
                }}
                role="alert"
            >
                <div className="flex items-stretch gap-3.5">
                    {/* Miniature 3D Book Cover */}
                    <div
                        className="relative w-14 h-[84px] rounded-[2px_5px_5px_2px] overflow-hidden shrink-0 shadow-md border border-edge-strong bg-stone-900"
                        aria-hidden="true"
                    >
                        <div className="book-spine-shadow" />
                        <div className="book-spine-crease" />
                        {bc.coverSrc ? (
                            <img src={bc.coverSrc} alt={bc.title || 'Book cover'} className="w-full h-full object-cover" />
                        ) : (
                            <div
                                style={{
                                    width: '160px',
                                    height: '240px',
                                    transform: 'scale(0.35)',
                                    transformOrigin: 'top left'
                                }}
                            >
                                <StylizedBlankCover
                                    story={bc.story || { title: bc.title }}
                                    theme={theme}
                                    isLarge={false}
                                />
                            </div>
                        )}
                        <BookCoverAudioArt
                            story={bc.story}
                            audioCount={audioCount}
                            totalScenes={bc.totalScenes || 0}
                            isMini={true}
                        />
                    </div>

                    {/* Details + Quick Actions */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-gold-ink flex items-center gap-1.5">
                                    <CheckCircle size={11} className="text-sage-600 shrink-0" />
                                    <span>{bc.badge || 'Imported to Bookshelf'}</span>
                                </div>
                                <h4 className="font-serif font-bold text-sm text-ink-900 truncate mt-0.5">
                                    {bc.title || 'Untitled Story'}
                                </h4>
                                <p className="text-[11px] text-ink-500 truncate mt-0.5">
                                    {bc.subtitle ||
                                        (audioCount > 0
                                            ? `${audioCount} offline audio scene${audioCount === 1 ? '' : 's'} ready`
                                            : 'Ready to read & listen')}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onDismiss}
                                className="text-ink-400 hover:text-ink-800 p-1 rounded-lg hover:bg-wash transition-colors shrink-0 cursor-pointer"
                                title="Close"
                                aria-label="Close import notification"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="flex items-center gap-1.5 pt-2">
                            {bc.onRead && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onDismiss();
                                        bc.onRead?.();
                                    }}
                                    className="flex-1 py-1.5 px-2.5 rounded-xl bg-btn hover:bg-btn-hover text-btn-ink text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
                                >
                                    <BookOpen size={12} className="text-btn-accent" />
                                    <span>Read</span>
                                </button>
                            )}
                            {bc.onListen && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onDismiss();
                                        bc.onListen?.();
                                    }}
                                    className="flex-1 py-1.5 px-2.5 rounded-xl bg-gold-tint hover:bg-gold/25 border border-gold-edge text-gold-ink text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
                                >
                                    <Headphones size={12} />
                                    <span>Listen</span>
                                </button>
                            )}
                            {bc.onStudio && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onDismiss();
                                        bc.onStudio?.();
                                    }}
                                    className="py-1.5 px-2.5 rounded-xl bg-surface hover:bg-wash border border-edge-strong text-ink-700 text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                                    title="Open Story Overview"
                                >
                                    <Activity size={12} />
                                    <span>Studio</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`fixed z-50 px-5 py-3.5 rounded-2xl shadow-xl border flex items-center gap-3 animate-fade-in backdrop-blur-xl transition-all max-w-md ${
                toast.type === 'error'
                    ? 'bg-blush-tint border-blush-edge text-blush-900 shadow-rose-900/10'
                    : toast.type === 'warning'
                      ? 'bg-ember-tint border-ember-edge text-ember-900 shadow-amber-900/10'
                      : toast.type === 'info'
                        ? 'bg-stone-900 border-stone-800 text-white shadow-stone-950/20'
                        : 'bg-sage-tint border-sage-edge text-sage-900 shadow-emerald-900/10'
            }`}
            style={{
                ...(position === 'top'
                    ? { top: 'max(4.5rem, calc(3.75rem + env(safe-area-inset-top, 0px)))' }
                    : { bottom: 'max(1.5rem, calc(1rem + env(safe-area-inset-bottom, 0px)))' }),
                right: 'max(1rem, calc(1rem + env(safe-area-inset-right, 0px)))',
                left: 'max(1rem, calc(1rem + env(safe-area-inset-left, 0px)))',
                margin: '0 auto'
            }}
            role="alert"
        >
            <div className="shrink-0 p-1.5 rounded-xl bg-wash">
                {toast.type === 'error' ? (
                    <AlertTriangle size={18} className="text-blush-600" />
                ) : toast.type === 'warning' ? (
                    <AlertCircle size={18} className="text-ember-600" />
                ) : toast.type === 'info' ? (
                    <Sparkles size={18} className="text-gold" />
                ) : (
                    <CheckCircle size={18} className="text-sage-600" />
                )}
            </div>
            <div className="flex-1 min-w-0 pr-2">
                <h4 className="font-bold text-xs uppercase tracking-wider font-mono opacity-90">
                    {toast.type === 'error'
                        ? 'Error'
                        : toast.type === 'warning'
                          ? 'Notice'
                          : toast.type === 'info'
                            ? 'System'
                            : 'Success'}
                </h4>
                <p className="text-xs leading-snug break-words mt-0.5 opacity-95">{toast.message}</p>
            </div>
            {toast.actionLabel && toast.onAction && (
                <button
                    type="button"
                    onClick={() => {
                        const fn = toast.onAction;
                        onDismiss();
                        fn?.();
                    }}
                    className="px-2.5 py-1 rounded-xl bg-gold text-white text-[11px] font-bold hover:opacity-90 active:scale-95 transition-all shrink-0 cursor-pointer"
                >
                    {toast.actionLabel}
                </button>
            )}
            <button
                onClick={onDismiss}
                className="text-ink-400 hover:text-ink-700 p-1 rounded-lg hover:bg-wash transition-colors shrink-0"
                title="Dismiss"
            >
                <X size={14} />
            </button>
        </div>
    );
}
