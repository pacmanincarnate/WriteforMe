/**
 * @module views/dashboard/DashboardEpistemicPanel
 * Secret Vault & Epistemic State Machine (GESM) card: timeline scrubber, character filter,
 * claim search, proposition/belief cards, dramatic irony indicators, Secret Vault clue seeding,
 * and provenance / neuro-symbolic sleep cycle logs.
 */

import {
    AlertTriangle,
    Brain,
    CheckCircle2,
    Clock,
    Edit3,
    EditButton,
    Eye,
    History,
    Key,
    Lock,
    Plus,
    Search,
    Share2,
    Trash2,
    Unlock,
    User,
    Users,
    FoldedSection
} from '@/components';
import {
    compareSceneCoordinates,
    ensureEpistemicGraph,
    formatSceneCoord,
    isBeliefActiveAt
} from '@/domain/continuity';
import type {
    DashboardEpistemicBeliefEdge,
    DashboardEpistemicProposition,
    DashboardStory
} from './types';

export interface DashboardEpistemicPanelProps {
    story: DashboardStory;
    setStory: (updaterOrValue: DashboardStory | ((prev: DashboardStory) => DashboardStory)) => void;
    isInspectorMode: boolean;
    epistemicViewTab: string;
    setEpistemicViewTab: (tab: string) => void;
    epistemicScrubberCoord: string;
    setEpistemicScrubberCoord: (coord: string) => void;
    epistemicFilterChar: string;
    setEpistemicFilterChar: (charId: string) => void;
    epistemicSearchQuery: string;
    setEpistemicSearchQuery: (query: string) => void;
    setEditingPropModal: (modalState: Record<string, unknown>) => void;
    setEditingBeliefModal: (modalState: Record<string, unknown>) => void;
    handleDeleteProposition: (propId: string) => void;
    handleInvalidateBelief: (belief: DashboardEpistemicBeliefEdge, coord: string) => void;
    retroactivelyInjectClue: (
        secretId: string | undefined,
        clueIdx: number,
        currentStory: DashboardStory
    ) => void | Promise<void>;
    openEditModal: (title: string, initialVal: string, onSave: (val: string) => void) => void;
}

export function DashboardEpistemicPanel({
    story,
    setStory,
    isInspectorMode,
    epistemicViewTab,
    setEpistemicViewTab,
    epistemicScrubberCoord,
    setEpistemicScrubberCoord,
    epistemicFilterChar,
    setEpistemicFilterChar,
    epistemicSearchQuery,
    setEpistemicSearchQuery,
    setEditingPropModal,
    setEditingBeliefModal,
    handleDeleteProposition,
    handleInvalidateBelief,
    retroactivelyInjectClue,
    openEditModal
}: DashboardEpistemicPanelProps) {
    return (
        <FoldedSection
            title={
                isInspectorMode
                    ? 'Secrets and beliefs (Bi-Temporal Hard Sandbox)'
                    : 'Secrets and beliefs'
            }
            summary={`${Array.isArray(story.secret_vault) ? story.secret_vault.length : 0} secrets`}
        >
            {/* Header with Title and Tab Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-edge">
                {/* Tab Switcher */}
                <div className="flex items-center gap-1 p-1 bg-inset rounded-xl border border-edge self-start sm:self-auto">
                    <button
                        type="button"
                        onClick={() => setEpistemicViewTab('gesm')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-colors flex items-center gap-1.5 ${
                            epistemicViewTab === 'gesm'
                                ? 'bg-surface text-ink-900 shadow-2xs font-bold border border-edge'
                                : 'text-ink-600 hover:text-ink-900'
                        }`}
                    >
                        <Share2 size={12} /> Epistemic Graph
                    </button>
                    <button
                        type="button"
                        onClick={() => setEpistemicViewTab('vault')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-colors flex items-center gap-1.5 ${
                            epistemicViewTab === 'vault'
                                ? 'bg-surface text-ink-900 shadow-2xs font-bold border border-edge'
                                : 'text-ink-600 hover:text-ink-900'
                        }`}
                    >
                        <Lock size={12} /> Secret Vault (
                        {Array.isArray(story.secret_vault) ? story.secret_vault.length : 0})
                    </button>
                    <button
                        type="button"
                        onClick={() => setEpistemicViewTab('log')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-colors flex items-center gap-1.5 ${
                            epistemicViewTab === 'log'
                                ? 'bg-surface text-ink-900 shadow-2xs font-bold border border-edge'
                                : 'text-ink-600 hover:text-ink-900'
                        }`}
                    >
                        <History size={12} /> Sleep &amp; Cascades (
                        {(
                            story.epistemic_graph?.cascade_log ||
                            story.epistemic_graph?.provenance_log ||
                            []
                        ).length + (story.epistemic_graph?.sleep_cycle_log || []).length}
                        )
                    </button>
                </div>
            </div>

            {/* TAB 1: EPISTEMIC GRAPH (GESM) */}
            {epistemicViewTab === 'gesm' &&
                (() => {
                    const currentGraph = ensureEpistemicGraph(
                        story as unknown as Parameters<typeof ensureEpistemicGraph>[0]
                    );
                    const availableCoords = ['0.0'];
                    (story.sequences || []).forEach((_seq, sIdx) => {
                        (story.scenes?.[String(sIdx)] || []).forEach((_scn, scnIdx) => {
                            const cStr = formatSceneCoord(sIdx + 1, scnIdx + 1);
                            if (!availableCoords.includes(cStr)) availableCoords.push(cStr);
                        });
                    });

                    const allPropsList: DashboardEpistemicProposition[] = Array.isArray(
                        currentGraph.propositions
                    )
                        ? (currentGraph.propositions as unknown as DashboardEpistemicProposition[])
                        : (Object.values(
                              currentGraph.propositions || {}
                          ) as unknown as DashboardEpistemicProposition[]);

                    const rawEdges = (Array.isArray(currentGraph.first_order_edges)
                        ? currentGraph.first_order_edges
                        : Array.isArray(currentGraph.holds_belief_edges)
                          ? currentGraph.holds_belief_edges
                          : []) as unknown as DashboardEpistemicBeliefEdge[];

                    const storyArg = story as unknown as Parameters<
                        typeof compareSceneCoordinates
                    >[2];

                    const activeProps = allPropsList.filter((p) => {
                        if (!p || typeof p !== 'object') return false;
                        const matchesQuery =
                            !epistemicSearchQuery ||
                            (p.claim_text || '')
                                .toLowerCase()
                                .includes(epistemicSearchQuery.toLowerCase()) ||
                            (p.id || '')
                                .toLowerCase()
                                .includes(epistemicSearchQuery.toLowerCase()) ||
                            (p.subject_id || '')
                                .toLowerCase()
                                .includes(epistemicSearchQuery.toLowerCase()) ||
                            (p.object_id || '')
                                .toLowerCase()
                                .includes(epistemicSearchQuery.toLowerCase());
                        if (!matchesQuery) return false;

                        const isFromValid =
                            compareSceneCoordinates(
                                p.world_valid_from_scene || '0.0',
                                epistemicScrubberCoord,
                                storyArg
                            ) <= 0;
                        const isToValid =
                            !p.world_valid_to_scene ||
                            compareSceneCoordinates(
                                p.world_valid_to_scene,
                                epistemicScrubberCoord,
                                storyArg
                            ) > 0;
                        return isFromValid && isToValid;
                    });

                    const beliefStoryArg = story as unknown as Parameters<
                        typeof isBeliefActiveAt
                    >[2];
                    const totalActiveBeliefs = rawEdges.filter((edge) =>
                        isBeliefActiveAt(
                            edge as unknown as Parameters<typeof isBeliefActiveAt>[0],
                            epistemicScrubberCoord,
                            beliefStoryArg
                        )
                    ).length;

                    return (
                        <div className="space-y-4">
                            {/* Scrubber and Filters Controls */}
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3.5 bg-inset rounded-xl border border-edge">
                                <div className="md:col-span-4 space-y-1">
                                    <label className="text-[10px] font-mono uppercase tracking-wider text-ink-500 font-bold flex items-center gap-1">
                                        <Clock size={11} /> Scene Timeline Scrubber
                                    </label>
                                    <select
                                        value={epistemicScrubberCoord}
                                        onChange={(e) => setEpistemicScrubberCoord(e.target.value)}
                                        className="w-full text-xs font-mono bg-surface border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                                    >
                                        {availableCoords.map((c) => {
                                            const isBaseline = c === '0.0';
                                            return (
                                                <option key={c} value={c}>
                                                    {isBaseline
                                                        ? 'Scene 0.0 (Pre-Story Baseline)'
                                                        : `Scene ${c}`}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>

                                <div className="md:col-span-3 space-y-1">
                                    <label className="text-[10px] font-mono uppercase tracking-wider text-ink-500 font-bold flex items-center gap-1">
                                        <Users size={11} /> Filter Character
                                    </label>
                                    <select
                                        value={epistemicFilterChar}
                                        onChange={(e) => setEpistemicFilterChar(e.target.value)}
                                        className="w-full text-xs font-mono bg-surface border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 focus:outline-none focus:border-gold-ink"
                                    >
                                        <option value="ALL">All Characters &amp; Reader</option>
                                        <option value="meta_reader">Reader (Dramatic Irony)</option>
                                        {(story.cast || []).map((c) => (
                                            <option key={c.id || c.name} value={c.id || c.name}>
                                                {c.name} ({c.role || 'Cast'})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="md:col-span-3 space-y-1">
                                    <label className="text-[10px] font-mono uppercase tracking-wider text-ink-500 font-bold flex items-center gap-1">
                                        <Search size={11} /> Search Claims
                                    </label>
                                    <input
                                        type="text"
                                        value={epistemicSearchQuery}
                                        onChange={(e) => setEpistemicSearchQuery(e.target.value)}
                                        placeholder="Filter claims or entities..."
                                        className="w-full text-xs font-sans bg-surface border border-edge rounded-lg px-2.5 py-1.5 text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-gold-ink"
                                    />
                                </div>

                                <div className="md:col-span-2 flex flex-col justify-end gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setEditingPropModal({
                                                isOpen: true,
                                                isNew: true,
                                                id: `prop_${Date.now()}`,
                                                claim_text: '',
                                                subject_id: story.cast?.[0]?.id || 'world',
                                                predicate: 'FACT',
                                                object_id: '',
                                                objective_truth: 'TRUE',
                                                world_valid_from_scene: epistemicScrubberCoord,
                                                world_valid_to_scene: ''
                                            })
                                        }
                                        className="w-full px-2.5 py-1.5 rounded-lg text-xs font-medium font-mono bg-btn text-btn-ink hover:opacity-90 transition-opacity flex items-center justify-center gap-1 shadow-2xs"
                                    >
                                        <Plus size={11} /> New Prop
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setEditingBeliefModal({
                                                isOpen: true,
                                                isNew: true,
                                                holder_id: story.cast?.[0]?.id || 'meta_reader',
                                                proposition_id: activeProps[0]?.id || '',
                                                stance: 'BELIEVES_TRUE',
                                                confidence: 0.85,
                                                source_type: 'DIRECT_OBSERVATION',
                                                source_agent_id: '',
                                                acquired_at_scene: epistemicScrubberCoord,
                                                invalidated_at_scene: ''
                                            })
                                        }
                                        className="w-full px-2.5 py-1 rounded-lg text-[11px] font-medium font-mono bg-surface hover:bg-wash border border-edge text-ink-700 transition-colors flex items-center justify-center gap-1 shadow-2xs"
                                    >
                                        <Plus size={10} /> Add Belief
                                    </button>
                                </div>
                            </div>

                            {/* Scrubber Stat Strip */}
                            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] font-mono text-ink-500">
                                <div className="flex items-center gap-3">
                                    <span>
                                        Active At Scene{' '}
                                        <strong className="text-ink-900">
                                            {epistemicScrubberCoord}
                                        </strong>
                                        :
                                    </span>
                                    <span className="text-gold-ink font-bold">
                                        {activeProps.length} Propositions
                                    </span>
                                    <span>·</span>
                                    <span className="text-ink-800 font-semibold">
                                        {totalActiveBeliefs} Character Beliefs
                                    </span>
                                </div>
                                <span className="text-[10px] text-ink-400">
                                    Total Graph Capacity: {allPropsList.length} propositions,{' '}
                                    {rawEdges.length} belief edges
                                </span>
                            </div>

                            {/* Active Propositions Cards List */}
                            {activeProps.length === 0 ? (
                                <div className="p-8 text-center bg-inset/60 rounded-xl border border-edge-dashed space-y-2">
                                    <p className="text-xs text-ink-500 font-medium">
                                        No propositions active at Scene {epistemicScrubberCoord}{' '}
                                        matching current filter.
                                    </p>
                                    <p className="text-[11px] text-ink-400">
                                        Click &quot;+ New Prop&quot; above to declare a world fact,
                                        secret, or lie at this coordinate.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {activeProps.map((p) => {
                                        const activeBeliefs = rawEdges.filter(
                                            (e) =>
                                                e.proposition_id === p.id &&
                                                isBeliefActiveAt(
                                                    e as unknown as Parameters<
                                                        typeof isBeliefActiveAt
                                                    >[0],
                                                    epistemicScrubberCoord,
                                                    beliefStoryArg
                                                ) &&
                                                (epistemicFilterChar === 'ALL' ||
                                                    e.holder_id === epistemicFilterChar)
                                        );

                                        const readerBelief = rawEdges.find(
                                            (e) =>
                                                e.proposition_id === p.id &&
                                                e.holder_id === 'meta_reader' &&
                                                isBeliefActiveAt(
                                                    e as unknown as Parameters<
                                                        typeof isBeliefActiveAt
                                                    >[0],
                                                    epistemicScrubberCoord,
                                                    beliefStoryArg
                                                )
                                        );

                                        const hasIrony =
                                            readerBelief &&
                                            (readerBelief.stance === 'BELIEVES_TRUE' ||
                                                readerBelief.stance === 'SUSPECTS_TRUE') &&
                                            activeBeliefs.some(
                                                (b) =>
                                                    b.holder_id !== 'meta_reader' &&
                                                    (b.stance === 'BELIEVES_FALSE' ||
                                                        b.stance === 'DOUBTS')
                                            );

                                        return (
                                            <div
                                                key={p.id}
                                                className="bg-inset rounded-xl p-4 border border-edge space-y-3 hover:border-edge-strong transition-colors"
                                            >
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-edge/60">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span
                                                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                                                                p.objective_truth === 'TRUE'
                                                                    ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20'
                                                                    : p.objective_truth === 'FALSE'
                                                                      ? 'bg-rose-500/10 text-rose-700 border border-rose-500/20'
                                                                      : 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                                                            }`}
                                                        >
                                                            {p.objective_truth}
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface text-ink-600 border border-edge">
                                                            {p.subject_id} · [{p.predicate}] ·{' '}
                                                            {p.object_id || 'world'}
                                                        </span>
                                                        <span className="text-[10px] font-mono text-ink-400">
                                                            Valid:{' '}
                                                            {p.world_valid_from_scene || '0.0'} →{' '}
                                                            {p.world_valid_to_scene || 'Present'}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setEditingBeliefModal({
                                                                    isOpen: true,
                                                                    isNew: true,
                                                                    holder_id:
                                                                        story.cast?.[0]?.id ||
                                                                        'meta_reader',
                                                                    proposition_id: p.id,
                                                                    stance: 'BELIEVES_TRUE',
                                                                    confidence: 0.85,
                                                                    source_type:
                                                                        'DIRECT_OBSERVATION',
                                                                    source_agent_id: '',
                                                                    acquired_at_scene:
                                                                        epistemicScrubberCoord,
                                                                    invalidated_at_scene: ''
                                                                })
                                                            }
                                                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface hover:bg-wash border border-edge text-ink-600 hover:text-ink-900 transition-colors"
                                                            title="Add character belief for this proposition"
                                                        >
                                                            + Belief
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setEditingPropModal({
                                                                    isOpen: true,
                                                                    isNew: false,
                                                                    ...p
                                                                })
                                                            }
                                                            className="p-1 text-ink-400 hover:text-ink-800 transition-colors"
                                                            title="Edit Proposition"
                                                        >
                                                            <Edit3 size={12} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleDeleteProposition(p.id)
                                                            }
                                                            className="p-1 text-ink-400 hover:text-rose-600 transition-colors"
                                                            title="Delete Proposition"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Claim Text */}
                                                <div className="text-xs sm:text-sm text-ink-900 font-serif leading-relaxed">
                                                    &quot;{p.claim_text}&quot;
                                                </div>

                                                {/* Dramatic Irony Badge */}
                                                {hasIrony && (
                                                    <div className="text-[10px] font-mono text-purple-700 bg-purple-500/10 px-2.5 py-1 rounded-md border border-purple-500/20 flex items-center gap-1.5">
                                                        <Eye
                                                            size={11}
                                                            className="text-purple-600 shrink-0"
                                                        />
                                                        <span>
                                                            <strong>Dramatic Irony:</strong> Reader
                                                            knows this proposition while active
                                                            scene character perspective holds
                                                            opposing or doubtful belief.
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Character Belief Matrix */}
                                                <div className="space-y-1.5 pt-1">
                                                    <div className="text-[10px] font-mono uppercase text-ink-400 tracking-wider font-semibold">
                                                        Active Character Beliefs (
                                                        {activeBeliefs.length}):
                                                    </div>
                                                    {activeBeliefs.length === 0 ? (
                                                        <p className="text-[11px] font-mono text-ink-400 italic">
                                                            No characters or reader currently hold
                                                            an active belief on this proposition at
                                                            Scene {epistemicScrubberCoord}.
                                                        </p>
                                                    ) : (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            {activeBeliefs.map((b, bIdx) => {
                                                                const isReader =
                                                                    b.holder_id === 'meta_reader';
                                                                const holderChar = (
                                                                    story.cast || []
                                                                ).find(
                                                                    (c) =>
                                                                        c.id === b.holder_id ||
                                                                        c.name === b.holder_id
                                                                );
                                                                const holderName = isReader
                                                                    ? 'Reader'
                                                                    : holderChar
                                                                      ? holderChar.name
                                                                      : b.holder_id;
                                                                const confPct = Math.round(
                                                                    (b.confidence ?? 0.8) * 100
                                                                );

                                                                return (
                                                                    <div
                                                                        key={bIdx}
                                                                        className="p-2.5 bg-surface rounded-lg border border-edge text-xs space-y-1.5"
                                                                    >
                                                                        <div className="flex items-center justify-between gap-1">
                                                                            <span className="font-semibold text-ink-900 text-xs font-sans flex items-center gap-1">
                                                                                {isReader ? (
                                                                                    <Eye
                                                                                        size={11}
                                                                                        className="text-purple-600"
                                                                                    />
                                                                                ) : (
                                                                                    <User
                                                                                        size={11}
                                                                                        className="text-gold-ink"
                                                                                    />
                                                                                )}
                                                                                {holderName}
                                                                            </span>
                                                                            <div className="flex items-center gap-1">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        setEditingBeliefModal(
                                                                                            {
                                                                                                isOpen: true,
                                                                                                isNew: false,
                                                                                                ...b
                                                                                            }
                                                                                        )
                                                                                    }
                                                                                    className="p-0.5 text-ink-400 hover:text-ink-800 transition-colors"
                                                                                    title="Edit belief edge"
                                                                                >
                                                                                    <Edit3
                                                                                        size={11}
                                                                                    />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        handleInvalidateBelief(
                                                                                            b,
                                                                                            epistemicScrubberCoord
                                                                                        )
                                                                                    }
                                                                                    className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
                                                                                    title="Invalidate belief at current scene"
                                                                                >
                                                                                    Invalidate
                                                                                </button>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex items-center justify-between text-[10px] font-mono">
                                                                            <span
                                                                                className={`px-1.5 py-0.5 rounded font-bold ${
                                                                                    b.stance ===
                                                                                    'BELIEVES_TRUE'
                                                                                        ? 'bg-emerald-500/10 text-emerald-700'
                                                                                        : b.stance ===
                                                                                            'SUSPECTS_TRUE'
                                                                                          ? 'bg-sky-500/10 text-sky-700'
                                                                                          : b.stance ===
                                                                                              'DOUBTS'
                                                                                            ? 'bg-amber-500/10 text-amber-700'
                                                                                            : 'bg-rose-500/10 text-rose-700'
                                                                                }`}
                                                                            >
                                                                                {b.stance}
                                                                            </span>
                                                                            <span className="text-ink-500">
                                                                                Confidence:{' '}
                                                                                <strong>
                                                                                    {confPct}%
                                                                                </strong>
                                                                            </span>
                                                                        </div>

                                                                        <div className="w-full bg-mist-200 rounded-full h-1 overflow-hidden">
                                                                            <div
                                                                                className={`h-full rounded-full transition-all ${
                                                                                    confPct > 70
                                                                                        ? 'bg-emerald-500'
                                                                                        : confPct >
                                                                                            40
                                                                                          ? 'bg-sky-500'
                                                                                          : 'bg-amber-500'
                                                                                }`}
                                                                                style={{
                                                                                    width: `${confPct}%`
                                                                                }}
                                                                            />
                                                                        </div>

                                                                        <div className="text-[10px] font-mono text-ink-400 flex items-center justify-between">
                                                                            <span>
                                                                                Source:{' '}
                                                                                {b.source_type ||
                                                                                    'INFERRED'}
                                                                                {b.source_agent_id
                                                                                    ? ` (via ${b.source_agent_id})`
                                                                                    : ''}
                                                                            </span>
                                                                            <span>
                                                                                Since{' '}
                                                                                {b.acquired_at_scene ||
                                                                                    '0.0'}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })()}

            {/* TAB 2: SECRET VAULT */}
            {epistemicViewTab === 'vault' && (
                <div className="space-y-3">
                    {!Array.isArray(story.secret_vault) || story.secret_vault.length === 0 ? (
                        <div className="p-8 text-center bg-inset/60 rounded-xl border border-edge-dashed">
                            <p className="text-xs text-ink-500 font-medium">
                                No secret vault entries defined yet.
                            </p>
                            <p className="text-[11px] text-ink-400 mt-1">
                                Secrets are generated during Story Setup or synchronized from
                                propositions.
                            </p>
                        </div>
                    ) : (
                        (story.secret_vault || []).map((sec, secIdx) => {
                            if (!sec || typeof sec !== 'object') return null;
                            const isRevealed = sec.status === 'revealed';
                            const isSeeded = sec.status === 'seeded';
                            const secretTitle =
                                typeof sec.title === 'string'
                                    ? sec.title
                                    : String(sec.title || `Secret ${secIdx + 1}`);
                            const secretTruth =
                                typeof sec.truth === 'string'
                                    ? sec.truth
                                    : typeof sec.description === 'string'
                                      ? sec.description
                                      : sec.truth != null
                                        ? String(sec.truth)
                                        : '';
                            const categoryLabel = String(sec.category || 'plot_mystery').replace(
                                /_/g,
                                ' '
                            );
                            const revAct =
                                sec.reveal_anchor?.act_number || sec.reveal_target_act || 3;
                            const revSeq =
                                sec.reveal_anchor?.sequence_number ||
                                sec.reveal_target_sequence ||
                                7;
                            const coverStoryObj =
                                sec.cover_story && typeof sec.cover_story === 'object'
                                    ? sec.cover_story
                                    : null;
                            const coverStoryText =
                                typeof sec.cover_story === 'string'
                                    ? sec.cover_story.trim()
                                    : typeof coverStoryObj?.public_belief === 'string'
                                      ? coverStoryObj.public_belief.trim()
                                      : typeof sec.public_cover_story === 'string'
                                        ? sec.public_cover_story.trim()
                                        : '';
                            const characterMasks =
                                coverStoryObj?.character_masks &&
                                typeof coverStoryObj.character_masks === 'object'
                                    ? Object.entries(coverStoryObj.character_masks).filter(
                                          ([, m]) => m != null
                                      )
                                    : [];
                            const clueList = Array.isArray(sec.clue_schedule)
                                ? sec.clue_schedule
                                : Array.isArray(sec.clues)
                                  ? sec.clues
                                  : [];

                            return (
                                <div
                                    key={sec.id || secIdx}
                                    className="bg-inset rounded-lg p-3.5 border border-edge space-y-3"
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-semibold text-ink-900 font-sans flex items-center gap-1.5">
                                                {secretTitle}
                                            </span>
                                            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-mist-100 text-ink-600 border border-edge">
                                                {categoryLabel}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {isRevealed ? (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 flex items-center gap-1">
                                                    <Unlock size={10} /> Revealed
                                                </span>
                                            ) : isSeeded ? (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-sky-500/10 text-sky-700 border border-sky-500/20 flex items-center gap-1">
                                                    <Key size={10} /> Seeded
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-amber-500/10 text-amber-700 border border-amber-500/20 flex items-center gap-1">
                                                    <Lock size={10} /> Dormant
                                                </span>
                                            )}
                                            <span className="text-[10px] font-mono text-ink-500">
                                                {typeof sec.reveal_book === 'number' && revSeq >= 99
                                                    ? `Held for Book ${sec.reveal_book}`
                                                    : `Reveal: Act ${revAct}, Seq ${revSeq}`}
                                            </span>
                                            <EditButton
                                                title={`Secret "${secretTitle}" Truth`}
                                                value={secretTruth}
                                                onSave={() =>
                                                    openEditModal(
                                                        `Secret "${secretTitle}" Truth`,
                                                        secretTruth,
                                                        (val) => {
                                                            setStory((prev) => {
                                                                const nextVault = (
                                                                    prev.secret_vault || []
                                                                ).map((s, idx) =>
                                                                    idx === secIdx
                                                                        ? { ...s, truth: val }
                                                                        : s
                                                                );
                                                                return {
                                                                    ...prev,
                                                                    secret_vault: nextVault
                                                                };
                                                            });
                                                        }
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <span className="text-[10px] font-mono uppercase tracking-wider text-ink-400 font-semibold">
                                            Withheld Truth (Sandboxed)
                                        </span>
                                        <p className="text-xs text-ink-800 font-serif leading-relaxed bg-surface/50 p-2.5 rounded border border-edge/60 break-words">
                                            {secretTruth}
                                        </p>
                                    </div>

                                    {(coverStoryText || characterMasks.length > 0) && (
                                        <div className="space-y-1.5">
                                            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-400 font-semibold">
                                                Active Cover Story / Public Assumption
                                            </span>
                                            {coverStoryText && (
                                                <p className="text-xs text-ink-700 font-serif italic bg-surface/30 p-2 rounded border border-edge/40 break-words">
                                                    {coverStoryText}
                                                </p>
                                            )}
                                            {characterMasks.length > 0 && (
                                                <div className="pt-1.5 border-t border-edge/60 space-y-0.5">
                                                    <span className="text-[9px] font-mono uppercase text-ink-400">
                                                        Character Masks:
                                                    </span>
                                                    {characterMasks.map(([cName, mask]) => {
                                                        const maskSummary =
                                                            typeof mask === 'string'
                                                                ? mask
                                                                : String(
                                                                      mask?.apparent_flaw ||
                                                                          mask?.trait_mask ||
                                                                          mask?.history_mask ||
                                                                          mask?.public_interview_voice ||
                                                                          'Masked trait'
                                                                  );
                                                        return (
                                                            <div
                                                                key={cName}
                                                                className="text-[10px] text-ink-600 font-mono break-words"
                                                            >
                                                                • {cName}: {maskSummary}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {clueList.length > 0 && (
                                        <div className="space-y-1.5 pt-1">
                                            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-400 font-semibold">
                                                Scheduled Clue Directives &amp; Breadcrumbs:
                                            </span>
                                            <div className="space-y-1">
                                                {clueList.map((clue, cIdx) => {
                                                    if (!clue || typeof clue !== 'object')
                                                        return null;
                                                    const targetSeqNum = Number(
                                                        clue.sequence_number || 2
                                                    );
                                                    const matchedSeqIdx = (
                                                        story.sequences || []
                                                    ).findIndex(
                                                        (sq) => Number(sq.number) === targetSeqNum
                                                    );
                                                    const actualSeqIdx =
                                                        matchedSeqIdx !== -1
                                                            ? matchedSeqIdx
                                                            : targetSeqNum - 1;
                                                    const seqScenes =
                                                        story.scenes?.[String(actualSeqIdx)] || [];
                                                    const hasProseForSeq = seqScenes.some(
                                                        (sc, scIdx) => {
                                                            const sId = `${actualSeqIdx}-${scIdx}`;
                                                            const proseEntry =
                                                                story.prose?.[sId] ||
                                                                (sc?.id
                                                                    ? story.prose?.[sc.id]
                                                                    : null);
                                                            if (
                                                                !proseEntry ||
                                                                typeof proseEntry === 'string'
                                                            ) {
                                                                return Boolean(proseEntry);
                                                            }
                                                            return Boolean(
                                                                proseEntry.final || proseEntry.prose
                                                            );
                                                        }
                                                    );
                                                    const clueDirective = String(
                                                        clue.behavioral_directive ||
                                                            clue.directive ||
                                                            ''
                                                    );

                                                    return (
                                                        <div
                                                            key={clue.id || cIdx}
                                                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs p-2 bg-surface/60 rounded border border-edge"
                                                        >
                                                            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-mist-100 text-ink-600 border border-edge shrink-0">
                                                                    Seq{' '}
                                                                    {Number(
                                                                        clue.sequence_number || 1
                                                                    )}
                                                                </span>
                                                                <span className="text-ink-800 font-serif truncate">
                                                                    &quot;{clueDirective}&quot;
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                                                                {clue.seeded_in_prose ? (
                                                                    <span className="text-[10px] font-mono text-emerald-600 flex items-center gap-1">
                                                                        <CheckCircle2 size={11} />{' '}
                                                                        Seeded in Prose
                                                                    </span>
                                                                ) : (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-[10px] font-mono text-ink-400">
                                                                            Pending Draft
                                                                        </span>
                                                                        {hasProseForSeq && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    retroactivelyInjectClue(
                                                                                        sec.id,
                                                                                        cIdx,
                                                                                        story
                                                                                    )
                                                                                }
                                                                                className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-lift hover:bg-lift-hover text-gold-ink border border-edge shadow-xs transition-colors"
                                                                                title="Surgically inject this breadcrumb into existing drafted scene prose for this sequence"
                                                                            >
                                                                                Seed via RSI
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* TAB 3: PROVENANCE & SLEEP LOG */}
            {epistemicViewTab === 'log' &&
                (() => {
                    const currentGraph = ensureEpistemicGraph(
                        story as unknown as Parameters<typeof ensureEpistemicGraph>[0]
                    );
                    const rawCascade = (
                        Array.isArray(currentGraph.cascade_log)
                            ? currentGraph.cascade_log
                            : Array.isArray(currentGraph.provenance_log)
                              ? currentGraph.provenance_log
                              : []
                    ) as Array<Record<string, unknown>>;
                    const provLogs = rawCascade.filter(
                        (l) => l && typeof l === 'object' && l.type !== 'SLEEP_CYCLE_CONSOLIDATION'
                    );
                    const rawSleepLog = Array.isArray(currentGraph.sleep_cycle_log)
                        ? (currentGraph.sleep_cycle_log as Array<Record<string, unknown>>).filter(
                              (l) => l && typeof l === 'object'
                          )
                        : [];
                    const sleepLogs = [
                        ...rawSleepLog,
                        ...rawCascade.filter(
                            (l) =>
                                l && typeof l === 'object' && l.type === 'SLEEP_CYCLE_CONSOLIDATION'
                        )
                    ];

                    return (
                        <div className="space-y-4">
                            {/* Provenance Cascades Section */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono uppercase tracking-wider text-gold-ink font-bold flex items-center gap-1">
                                        <AlertTriangle size={11} className="text-amber-600" />{' '}
                                        Provenance Invalidation Cascades ({provLogs.length})
                                    </span>
                                    <span className="text-[10px] font-mono text-ink-400">
                                        Triggered upon liar exposure
                                    </span>
                                </div>
                                {provLogs.length === 0 ? (
                                    <p className="text-xs text-ink-400 italic bg-inset/50 p-3 rounded-lg border border-edge">
                                        No provenance cascades recorded yet. When an agent is
                                        unmasked as deceptive, their downstream claims will appear
                                        here with calibrated confidence downgrades.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {provLogs.map((log, idx) => {
                                            const liarId = String(
                                                log.liar_agent_id ||
                                                    log.exposed_liar_id ||
                                                    'Unknown'
                                            );
                                            const sceneCoord = String(
                                                log.scene_coord || log.scene || '—'
                                            );
                                            const holderId = String(log.holder_id || 'Unknown');
                                            const downgradedCount = Number(
                                                log.downgraded_edges_count ??
                                                    log.affected_count ??
                                                    0
                                            );
                                            return (
                                                <div
                                                    key={idx}
                                                    className="p-3 bg-inset rounded-lg border border-edge text-xs space-y-1"
                                                >
                                                    <div className="flex items-center justify-between text-[10px] font-mono">
                                                        <span className="font-bold text-rose-700">
                                                            Liar Unmasked: {liarId}
                                                        </span>
                                                        <span className="text-ink-400">
                                                            At Scene {sceneCoord}
                                                        </span>
                                                    </div>
                                                    <p className="text-ink-800 font-sans">
                                                        Agent <strong>{holderId}</strong>{' '}
                                                        invalidated/downgraded{' '}
                                                        <strong>{downgradedCount}</strong> belief
                                                        edge(s) sourced from {liarId}.
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Sleep Cycle Consolidation Section */}
                            <div className="space-y-2 pt-2 border-t border-edge">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono uppercase tracking-wider text-gold-ink font-bold flex items-center gap-1">
                                        <Brain size={11} className="text-gold-ink" /> Neuro-Symbolic
                                        Sleep Cycle Deductions ({sleepLogs.length})
                                    </span>
                                    <span className="text-[10px] font-mono text-ink-400">
                                        Consolidated on 2-hop belief intersections
                                    </span>
                                </div>
                                {sleepLogs.length === 0 ? (
                                    <p className="text-xs text-ink-400 italic bg-inset/50 p-3 rounded-lg border border-edge">
                                        No sleep cycle consolidations recorded yet. When characters
                                        synthesize intersecting propositions between scenes,
                                        deductions and cognitive dissonance rationalizations are
                                        logged here.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {sleepLogs.map((log, idx) => {
                                            const charId = String(
                                                log.char_id || log.character || 'Unknown'
                                            );
                                            const sceneCoord = String(
                                                log.scene_coord || log.scene || '—'
                                            );
                                            const claimText = String(
                                                log.claim_text || log.claim || ''
                                            );
                                            const stanceLabel = String(
                                                log.stance || log.operation || 'DEDUCTION'
                                            );
                                            const deductionType = String(
                                                log.deduction_type || log.operation || 'INFERRED'
                                            );
                                            const rawConf =
                                                typeof log.confidence === 'number'
                                                    ? log.confidence
                                                    : 0.8;
                                            return (
                                                <div
                                                    key={idx}
                                                    className="p-3 bg-inset rounded-lg border border-edge text-xs space-y-1"
                                                >
                                                    <div className="flex items-center justify-between text-[10px] font-mono">
                                                        <span className="font-bold text-gold-ink">
                                                            Character: {charId}
                                                        </span>
                                                        <span className="text-ink-400">
                                                            At Scene {sceneCoord}
                                                        </span>
                                                    </div>
                                                    <p className="text-ink-900 font-serif italic">
                                                        &quot;{claimText}&quot;
                                                    </p>
                                                    <div className="flex items-center gap-2 text-[10px] font-mono text-ink-500">
                                                        <span>
                                                            Stance: <strong>{stanceLabel}</strong>
                                                        </span>
                                                        <span>·</span>
                                                        <span>
                                                            Confidence:{' '}
                                                            <strong>
                                                                {Math.round(rawConf * 100)}%
                                                            </strong>
                                                        </span>
                                                        <span>·</span>
                                                        <span>Type: {deductionType}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}
        </FoldedSection>
    );
}
