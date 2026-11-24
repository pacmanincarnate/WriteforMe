/**
 * @module views/reader/ReaderAppearanceDrawer
 * Reader typography, palette theme, flow mode, margins, and alignment settings drawer.
 */

import { AlignJustify, AlignLeft, Check, SlidersHorizontal, X } from '@/components/icons';
import type { ReaderSettings } from './types';

export interface ReaderAppearanceDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    readerSettings: ReaderSettings;
    updateReaderSetting: (key: string, val: unknown) => void;
}

const READER_THEMES = [
    { id: 'light', label: 'Folio', bg: '#FAF8F5', text: '#1C1917', border: '#E5E0D8' },
    { id: 'sepia', label: 'Sepia', bg: '#F5EEDB', text: '#382E24', border: '#E4D8BE' },
    { id: 'dark', label: 'Atelier', bg: '#18181B', text: '#EDE8E0', border: '#27272A' },
    { id: 'oled', label: 'Midnight', bg: '#000000', text: '#D4D0C8', border: '#1F1F1F' }
] as const;

const READER_FONTS = [
    { id: 'Merriweather', label: 'Merriweather' },
    { id: 'Cormorant Garamond', label: 'Cormorant' },
    { id: 'Newsreader', label: 'Newsreader' },
    { id: 'Playfair Display', label: 'Playfair' },
    { id: 'Inter', label: 'Inter Sans' },
    { id: 'Plus Jakarta Sans', label: 'Jakarta Sans' }
] as const;

export function ReaderAppearanceDrawer({
    isOpen,
    onClose,
    readerSettings,
    updateReaderSetting
}: ReaderAppearanceDrawerProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6 animate-fade-in">
            <div
                onClick={onClose}
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            />

            <div
                className="relative w-full max-w-lg reader-ui-card border rounded-2xl shadow-2xl p-5 sm:p-6 z-10 space-y-5 max-h-[85vh] overflow-y-auto"
                style={{
                    paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))'
                }}
            >
                <div className="flex items-center justify-between pb-3 border-b reader-ui-border">
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal size={16} className="text-gold" />
                        <h3 className="font-serif font-bold text-base">Reading Appearance</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:opacity-70 transition-opacity cursor-pointer"
                        aria-label="Close Reading Appearance"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold font-mono uppercase opacity-60 tracking-wider">
                        Palette Theme
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                        {READER_THEMES.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => updateReaderSetting('readerTheme', t.id)}
                                className={`p-2.5 rounded-xl flex flex-col items-center gap-1 text-xs font-semibold border transition-all active:scale-95 cursor-pointer ${
                                    readerSettings.readerTheme === t.id
                                        ? 'ring-2 ring-gold shadow-xs'
                                        : 'opacity-80 hover:opacity-100'
                                }`}
                                style={{
                                    backgroundColor: t.bg,
                                    color: t.text,
                                    borderColor: t.border
                                }}
                            >
                                <span className="font-serif font-bold">Aa</span>
                                <span className="text-[10px] font-sans">{t.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold font-mono uppercase opacity-60 tracking-wider">
                        Typeface
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {READER_FONTS.map((f) => (
                            <button
                                key={f.id}
                                onClick={() => updateReaderSetting('fontFamily', f.id)}
                                className={`p-2 rounded-xl text-xs border text-left flex items-center justify-between transition-all cursor-pointer ${
                                    readerSettings.fontFamily === f.id
                                        ? 'bg-gold-tint border-gold font-bold text-gold-ink'
                                        : 'bg-wash border-transparent opacity-80 hover:opacity-100'
                                }`}
                            >
                                <span style={{ fontFamily: f.id }}>{f.label}</span>
                                {readerSettings.fontFamily === f.id && <Check size={12} />}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-bold font-mono uppercase opacity-60">
                            <span>Font Size</span>
                            <span>{readerSettings.fontSize}px</span>
                        </div>
                        <div className="flex items-center gap-1 bg-wash p-1 rounded-xl">
                            <button
                                onClick={() =>
                                    updateReaderSetting(
                                        'fontSize',
                                        Math.max(14, readerSettings.fontSize - 1)
                                    )
                                }
                                className="flex-1 py-1.5 rounded-lg hover:bg-wash-strong font-bold text-xs cursor-pointer"
                            >
                                A-
                            </button>
                            <button
                                onClick={() =>
                                    updateReaderSetting(
                                        'fontSize',
                                        Math.min(28, readerSettings.fontSize + 1)
                                    )
                                }
                                className="flex-1 py-1.5 rounded-lg hover:bg-wash-strong font-bold text-sm cursor-pointer"
                            >
                                A+
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-bold font-mono uppercase opacity-60">
                            <span>Line Spacing</span>
                            <span>{readerSettings.lineHeight}x</span>
                        </div>
                        <div className="flex items-center gap-1 bg-wash p-1 rounded-xl">
                            {([1.45, 1.75, 2.05] as const).map((lh) => (
                                <button
                                    key={lh}
                                    onClick={() => updateReaderSetting('lineHeight', lh)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                        readerSettings.lineHeight === lh
                                            ? 'bg-surface shadow-2xs font-bold'
                                            : 'hover:bg-wash-strong opacity-70'
                                    }`}
                                >
                                    {lh === 1.45 ? 'Tight' : lh === 1.75 ? 'Mid' : 'Loose'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t reader-ui-border">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold font-mono uppercase opacity-60">
                            Flow Mode
                        </label>
                        <div className="flex items-center gap-1 bg-wash p-1 rounded-xl">
                            <button
                                onClick={() => updateReaderSetting('readingMode', 'paginated')}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                    readerSettings.readingMode === 'paginated'
                                        ? 'bg-surface shadow-2xs font-bold text-gold-ink'
                                        : 'opacity-70'
                                }`}
                            >
                                Pages
                            </button>
                            <button
                                onClick={() => updateReaderSetting('readingMode', 'scroll')}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                    readerSettings.readingMode === 'scroll'
                                        ? 'bg-surface shadow-2xs font-bold text-gold-ink'
                                        : 'opacity-70'
                                }`}
                            >
                                Scroll
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold font-mono uppercase opacity-60">
                            Paragraphs
                        </label>
                        <div className="flex items-center gap-1 bg-wash p-1 rounded-xl">
                            <button
                                onClick={() => updateReaderSetting('paragraphStyle', 'indented')}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                    readerSettings.paragraphStyle === 'indented'
                                        ? 'bg-surface shadow-2xs font-bold text-gold-ink'
                                        : 'opacity-70'
                                }`}
                            >
                                Indent
                            </button>
                            <button
                                onClick={() => updateReaderSetting('paragraphStyle', 'block')}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                    readerSettings.paragraphStyle === 'block'
                                        ? 'bg-surface shadow-2xs font-bold text-gold-ink'
                                        : 'opacity-70'
                                }`}
                            >
                                Block
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t reader-ui-border">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold font-mono uppercase opacity-60">
                            Margins
                        </label>
                        <div className="flex items-center gap-1 bg-wash p-1 rounded-xl">
                            {(['compact', 'standard', 'wide'] as const).map((w) => (
                                <button
                                    key={w}
                                    onClick={() => updateReaderSetting('contentWidth', w)}
                                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold capitalize cursor-pointer ${
                                        readerSettings.contentWidth === w
                                            ? 'bg-surface shadow-2xs font-bold text-gold-ink'
                                            : 'opacity-70'
                                    }`}
                                >
                                    {w === 'compact' ? 'Narrow' : w === 'standard' ? 'Normal' : 'Wide'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold font-mono uppercase opacity-60">
                            Alignment
                        </label>
                        <div className="flex items-center gap-1 bg-wash p-1 rounded-xl">
                            <button
                                onClick={() => updateReaderSetting('textAlign', 'left')}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                                    readerSettings.textAlign === 'left'
                                        ? 'bg-surface shadow-2xs font-bold'
                                        : 'opacity-70'
                                }`}
                            >
                                <AlignLeft size={13} /> Left
                            </button>
                            <button
                                onClick={() => updateReaderSetting('textAlign', 'justify')}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                                    readerSettings.textAlign === 'justify'
                                        ? 'bg-surface shadow-2xs font-bold'
                                        : 'opacity-70'
                                }`}
                            >
                                <AlignJustify size={13} /> Justify
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
