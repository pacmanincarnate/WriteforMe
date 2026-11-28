/**
 * @module components/common/EditorialSubNav
 * Literary horizontal sub-navigation for Story Folio and Manuscript Studio view groups.
 */

import { VIEW_LABELS } from '@/config';
import {
    Activity,
    Feather,
    Globe,
    Heart,
    Layers,
    Scale,
    Search,
    Users,
    Wand2,
    type LucideIcon
} from '@/components/icons';

export interface EditorialSubNavProps {
    activeView: string;
    onSelectView: (viewId: string) => void;
    story?: {
        cast?: unknown[];
        lore?: unknown[];
        sequences?: Array<{ number?: number }>;
    } | null;
    isInspectorMode?: boolean;
    selectedSequence: number | null;
    selectedScene: number | null;
}

interface SubNavItem {
    id: string;
    targetView?: string;
    label: string;
    shortLabel?: string;
    icon: LucideIcon;
    badge: number | null;
    tooltip: string;
}

export function EditorialSubNav({
    activeView,
    onSelectView,
    story,
    selectedSequence,
    selectedScene
}: EditorialSubNavProps) {
    const isFolioGroup = ['dashboard', 'cast', 'relationships', 'lore', 'inspector'].includes(
        activeView
    );
    const isManuscriptGroup = [
        'structure',
        'sequence_dashboard',
        'chapter_dashboard',
        'writer',
        'directive',
        'editorial'
    ].includes(activeView);

    if (!isFolioGroup && !isManuscriptGroup) return null;

    const castCount = Array.isArray(story?.cast) ? story.cast.length : 0;
    const loreCount = Array.isArray(story?.lore) ? story.lore.length : 0;

    let items: SubNavItem[] = [];
    if (isFolioGroup) {
        items = [
            {
                id: 'dashboard',
                label: VIEW_LABELS.dashboard,
                icon: Activity,
                badge: null,
                tooltip: 'Story overview, premise, core thesis, and metrics'
            },
            {
                id: 'cast',
                label: VIEW_LABELS.cast,
                icon: Users,
                badge: castCount > 0 ? castCount : null,
                tooltip: 'Dramatis personae, voice profiles, and character arcs'
            },
            {
                id: 'relationships',
                label: VIEW_LABELS.relationships,
                icon: Heart,
                badge: null,
                tooltip: 'Interpersonal tensions, alliances, and relational axes'
            },
            {
                id: 'lore',
                label: VIEW_LABELS.lore,
                icon: Globe,
                badge: loreCount > 0 ? loreCount : null,
                tooltip: 'World bible, canon knowledge, and historical archives'
            },
            {
                id: 'inspector',
                label: VIEW_LABELS.inspector,
                icon: Search,
                badge: null,
                tooltip: 'Vector database semantic memory search'
            }
        ];
    } else if (isManuscriptGroup) {
        const hasSelectedScene = selectedSequence !== null && selectedScene !== null;
        const seqNum = hasSelectedScene
            ? story?.sequences?.[selectedSequence]?.number || selectedSequence + 1
            : null;
        const scnNum = hasSelectedScene ? selectedScene + 1 : null;
        items = [
            {
                id: 'structure',
                label: VIEW_LABELS.structure,
                shortLabel: 'Outline',
                icon: Layers,
                badge: null,
                tooltip: 'Acts, sequence architecture, and pacing outline'
            },
            {
                id: 'writer',
                targetView: hasSelectedScene ? 'writer' : 'structure',
                label: VIEW_LABELS.sequence_dashboard,
                shortLabel: VIEW_LABELS.sequence_dashboard,
                icon: Feather,
                badge: null,
                tooltip: hasSelectedScene
                    ? `Write and inspect Scene ${seqNum}.${scnNum}`
                    : 'Select a scene from outline or manuscript tree'
            },
            {
                id: 'directive',
                label: VIEW_LABELS.directive,
                shortLabel: 'Change',
                icon: Wand2,
                badge: null,
                tooltip:
                    'Request a change and the AI will evaluate how to implement that change into the novel'
            },
            {
                id: 'editorial',
                label: VIEW_LABELS.editorial,
                shortLabel: 'Polish',
                icon: Scale,
                badge: null,
                tooltip: 'Autonomous editorial review, surgical edits, and prose polish'
            }
        ];
    }

    return (
        <nav
            className="editorial-subnav mb-5 pb-2 border-b border-edge/70 flex items-center justify-between gap-3"
            aria-label="Editorial Section Navigation"
        >
            <div className="flex flex-nowrap items-center gap-1 sm:gap-1.5 p-1 bg-surface/90 backdrop-blur-md rounded-2xl border border-edge shadow-2xs w-full sm:w-auto overflow-x-auto no-scrollbar touch-scroll">
                {items.map((item) => {
                    const IconComponent = item.icon;
                    const isActive =
                        item.id === activeView ||
                        (item.id === 'writer' &&
                            ['writer', 'sequence_dashboard', 'chapter_dashboard'].includes(activeView));
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelectView(item.targetView || item.id)}
                            className={`px-2 sm:px-3 py-1.5 rounded-xl text-[11.5px] sm:text-xs font-medium flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-95 flex-1 sm:flex-none ${
                                isActive
                                    ? 'bg-gold-tint text-gold-ink font-bold shadow-2xs border border-gold-edge'
                                    : 'text-ink-600 hover:text-ink-900 hover:bg-wash border border-transparent'
                            }`}
                            title={item.tooltip}
                        >
                            <IconComponent
                                size={13}
                                className={`w-3.5 h-3.5 shrink-0 ${
                                    isActive ? 'text-gold-ink' : 'text-ink-400'
                                }`}
                            />
                            {item.shortLabel && item.shortLabel !== item.label ? (
                                <>
                                    <span className="sm:hidden">{item.shortLabel}</span>
                                    <span className="hidden sm:inline">{item.label}</span>
                                </>
                            ) : (
                                <span>{item.label}</span>
                            )}
                            {item.badge != null && (
                                <span
                                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                                        isActive
                                            ? 'bg-gold-ink/15 text-gold-ink font-bold'
                                            : 'bg-mist-200 text-ink-500'
                                    }`}
                                >
                                    {item.badge}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
