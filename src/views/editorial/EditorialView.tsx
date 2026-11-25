/**
 * @module views/editorial/EditorialView
 * Autonomous Editorial Harness (`view === 'editorial'`): 1-click orchestration bar,
 * convergence telemetry, 5-tab suite (Voice DNA & `.novelignore`, NSG/NLP & Layer 0 Blind Reader,
 * Adversarial Tribunal, 3-Wave Plan & 4-Gate CI/CD, 11-Tool XML Manuscript Inspector), and log stream.
 */

import {
    Activity,
    EditorialSubNav,
    Fingerprint,
    Gavel,
    GitBranch,
    GitMerge,
    Loader2,
    Microscope,
    Plus,
    RefreshCw,
    RotateCcw,
    Scale,
    ShieldCheck,
    Terminal,
    Trash2,
    Zap,
    type EditorialSubNavProps
} from '@/components';
import {
    compileAestheticConstitution,
    compileNarrativeStateGraph,
    computeEbbinghausMemoryDecay,
    getDraftedStoryScenesList,
    runFullManuscriptNlpTelemetry
} from '@/domain/editorial';
import { normalizeIntentionalOverrides } from '@/domain/story';
import type {
    EditorialSceneEntry,
    EditorialSceneTelemetry,
    EditorialStory,
    EditorialViewProps
} from './types';

interface ToolMetadataItem {
    id: string;
    label: string;
    desc: string;
}

const TOOL_METADATA_LIST: readonly ToolMetadataItem[] = [
    {
        id: 'inspect_narrative_hierarchy',
        label: '1. inspect_narrative_hierarchy',
        desc: 'Returns NSG scene contracts, causal edges, and active threads for a scene.'
    },
    {
        id: 'get_epistemic_ledger',
        label: '2. get_epistemic_ledger',
        desc: 'Queries GESM knowledge state and dramatic irony secrets at a scene boundary.'
    },
    {
        id: 'trace_thread_or_motif',
        label: '3. trace_thread_or_motif',
        desc: 'Computes Ebbinghaus memory retention S(W) and scene appearances for threads.'
    },
    {
        id: 'query_lore_contract',
        label: '4. query_lore_contract',
        desc: 'Searches World Primer, Lore entries, Continuity Ledger, and Cast dossiers.'
    },
    {
        id: 'grep_manuscript',
        label: '5. grep_manuscript',
        desc: 'Exact/regex search across canonical XML <s id="..."> coordinates.'
    },
    {
        id: 'semantic_passage_search',
        label: '6. semantic_passage_search',
        desc: 'TF-IDF lexical similarity search across all drafted manuscript paragraphs.'
    },
    {
        id: 'read_scene_span',
        label: '7. read_scene_span',
        desc: 'Returns canonical XML <Scene> with <p> and <s> coordinates.'
    },
    {
        id: 'extract_dialogue_slice',
        label: '8. extract_dialogue_slice',
        desc: 'Extracts all dialogue attributed to a character + 8D voice drift D_self.'
    },
    {
        id: 'diff_intent_vs_naive_reader',
        label: '9. diff_intent_vs_naive_reader',
        desc: 'Compares authorial blueprint against Layer 0 Blind Reader 5-axis divergence.'
    },
    {
        id: 'run_prose_telemetry',
        label: '10. run_prose_telemetry',
        desc: 'Runs deterministic NLP telemetry (CV, Psychic Distance, Echoes, Slop) on a scene.'
    },
    {
        id: 'simulate_blast_radius',
        label: '11. simulate_blast_radius',
        desc: 'Computes downstream causal, epistemic, and thread blast radius of modifying a scene.'
    }
];

export function EditorialView({
    view,
    setView,
    story,
    isInspectorMode,
    selectedSequence,
    selectedScene,
    bannedPhrases,
    slopConfig,
    editorialHarnessTab,
    setEditorialHarnessTab,
    editorialScopeSceneId,
    setEditorialScopeSceneId,
    editorialUseDeepLLM,
    setEditorialUseDeepLLM,
    enableEditorialHarnessAutopilot,
    setEnableEditorialHarnessAutopilot,
    isRunningEditorialHarness,
    editorialHarnessPhase,
    editorialHarnessProgress,
    runAutonomousEditorialHarness,
    revertAllHarnessTransactions,
    executeSingleHarnessTransaction,
    revertHarnessTransaction,
    novelIgnoreDraftRule,
    setNovelIgnoreDraftRule,
    handleAddNovelIgnoreRule,
    handleRemoveNovelIgnoreRule,
    editorialToolName,
    setEditorialToolName,
    editorialToolArgs,
    setEditorialToolArgs,
    editorialToolOutput,
    handleRunHarnessInspectorTool
}: EditorialViewProps) {
    const draftedList = getDraftedStoryScenesList(
        story as unknown as Parameters<typeof getDraftedStoryScenesList>[0]
    ) as unknown as EditorialSceneEntry[];
    const harness: NonNullable<EditorialStory['editorial_harness']> = story.editorial_harness || {};
    const customOverrides = normalizeIntentionalOverrides(
        harness.customConstitutionOverrides ||
            harness.constitution?.intentionalOverrides ||
            harness.novelignore
    );
    const constStoryArg = story as unknown as Parameters<typeof compileAestheticConstitution>[0];
    const rawConstitution =
        harness.constitution || compileAestheticConstitution(constStoryArg, customOverrides);
    const constitution = (rawConstitution
        ? {
              ...rawConstitution,
              intentionalOverrides: normalizeIntentionalOverrides(
                  rawConstitution.intentionalOverrides
              )
          }
        : compileAestheticConstitution(constStoryArg, customOverrides)) as NonNullable<
        NonNullable<EditorialStory['editorial_harness']>['constitution']
    >;
    const nlpStoryArg = story as unknown as Parameters<typeof runFullManuscriptNlpTelemetry>[0];
    const fullTelemetry = (harness.fullTelemetry ||
        (draftedList.length > 0
            ? runFullManuscriptNlpTelemetry(nlpStoryArg, bannedPhrases, slopConfig)
            : null)) as {
        sceneTelemetryMap?: Record<string, EditorialSceneTelemetry>;
        [key: string]: unknown;
    } | null;
    const voiceDna = harness.voiceDna || null;
    const nsg = (harness.nsg ||
        (fullTelemetry
            ? compileNarrativeStateGraph(
                  story as unknown as Parameters<typeof compileNarrativeStateGraph>[0],
                  fullTelemetry as unknown as Parameters<typeof compileNarrativeStateGraph>[1]
              )
            : null)) as NonNullable<EditorialStory['editorial_harness']>['nsg'] | null;
    const layer0Map = harness.layer0Map || {};
    const deliberations =
        harness.tribunalResult?.tribunalCases || harness.tribunalResult?.deliberations || [];
    const verifiedTickets = harness.tribunalResult?.verifiedTickets || [];
    const editPlan = harness.editPlan || null;
    const totalTransactionsCount =
        editPlan?.allTransactions?.length ?? editPlan?.total_transactions ?? 0;
    const logs = harness.logs || [];

    const telemetryValues = fullTelemetry ? Object.values(fullTelemetry.sceneTelemetryMap || {}) : [];
    const fallbackRhythmCV =
        telemetryValues.length > 0
            ? Number(
                  (
                      telemetryValues.reduce((s, t) => s + (t.sentenceLengthCV || 0), 0) /
                      telemetryValues.length
                  ).toFixed(2)
              )
            : '—';
    const fallbackPsychicDist =
        telemetryValues.length > 0
            ? Number(
                  (
                      telemetryValues.reduce((s, t) => s + (t.meanPsychicDistance || 3), 0) /
                      telemetryValues.length
                  ).toFixed(2)
              )
            : '—';

    const activeOverrides = normalizeIntentionalOverrides(constitution?.intentionalOverrides) as Array<{
        rule_type?: string;
        pattern?: string;
        phrase?: string;
        reason?: string;
    }>;

    const tabs = [
        { id: 'overview', label: 'Phase 1: Voice DNA & Constitution', icon: Fingerprint },
        { id: 'telemetry', label: 'Phase 2A–2B: NSG, NLP & Layer 0 Reader', icon: Activity },
        {
            id: 'tribunal',
            label: `Phase 2C–2D: Dossiers & Tribunal (${verifiedTickets.length})`,
            icon: Gavel
        },
        {
            id: 'waves',
            label: `Phases 3–5: 3-Wave Plan & 4-Gate CI/CD (${totalTransactionsCount})`,
            icon: GitMerge
        },
        { id: 'tools', label: '11-Tool XML Manuscript Inspector', icon: Microscope }
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-24">
            <EditorialSubNav
                activeView={view}
                onSelectView={setView}
                story={story as EditorialSubNavProps['story']}
                isInspectorMode={isInspectorMode}
                selectedSequence={selectedSequence}
                selectedScene={selectedScene}
            />
            {/* ── TOP HERO & 1-CLICK ORCHESTRATION BAR ── */}
            <div className="bg-surface p-6 sm:p-7 rounded-2xl border border-edge shadow-sm space-y-5">
                <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded-full bg-gold-tint border border-gold-edge text-gold-ink font-bold">
                                {isInspectorMode ? 'Tier 6.0 • Literary CI/CD' : 'Editorial Suite'}
                            </span>
                            {harness.lastRunAt && (
                                <span className="text-xs font-mono text-ink-400">
                                    Last run: {new Date(harness.lastRunAt).toLocaleTimeString()}
                                </span>
                            )}
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-bold font-serif text-ink-900 flex items-center gap-2.5 tracking-tight">
                            <Scale className="text-gold-ink" size={24} /> Developmental Novel Review
                            &amp; Manuscript Polish
                        </h2>
                        <p className="text-xs text-ink-500 max-w-3xl leading-relaxed">
                            Holistic manuscript analysis and developmental review: detects rhythm
                            fatigue, voice drift, and narrative inconsistencies, then refines prose
                            with surgical precision.
                        </p>
                    </div>

                    {/* Primary 1-Click Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <button
                            onClick={() =>
                                runAutonomousEditorialHarness({
                                    mode: 'full_pipeline',
                                    scopeSceneId: editorialScopeSceneId,
                                    useLLM: editorialUseDeepLLM
                                })
                            }
                            disabled={isRunningEditorialHarness || draftedList.length === 0}
                            className="px-5 py-2.5 rounded-xl bg-btn hover:bg-btn-hover text-btn-ink font-bold text-xs shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                            title="Run all 5 phases end-to-end: Diagnose, Convene Tribunal, Compile 3-Wave Plan, Apply Surgical Patches, and Verify via 4-Gate CI/CD"
                        >
                            {isRunningEditorialHarness ? (
                                <>
                                    <Loader2 size={14} className="animate-spin text-amber-300" />
                                    <span>Running Harness…</span>
                                </>
                            ) : (
                                <>
                                    <Zap size={14} className="text-amber-300 fill-amber-300" />
                                    <span>Run Full Review &amp; 3-Wave Revision</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={() =>
                                runAutonomousEditorialHarness({
                                    mode: 'review_only',
                                    scopeSceneId: editorialScopeSceneId,
                                    useLLM: editorialUseDeepLLM
                                })
                            }
                            disabled={isRunningEditorialHarness || draftedList.length === 0}
                            className="px-4 py-2.5 rounded-xl bg-gold-tint hover:bg-gold/20 border border-gold-edge text-gold-ink font-bold text-xs shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                            title="Run Phases 1–3 only (Voice DNA, Telemetry, Layer 0 Blind Reader, Tribunal, & 3-Wave Plan) without modifying prose"
                        >
                            <Microscope size={14} />
                            <span>Diagnostic Review Only (Phases 1–3)</span>
                        </button>

                        {editPlan && totalTransactionsCount > 0 && (
                            <button
                                onClick={() =>
                                    runAutonomousEditorialHarness({
                                        mode: 'execute_plan',
                                        scopeSceneId: editorialScopeSceneId,
                                        useLLM: editorialUseDeepLLM
                                    })
                                }
                                disabled={isRunningEditorialHarness}
                                className="px-4 py-2.5 rounded-xl bg-sage-tint hover:bg-sage-tint/80 border border-sage-edge text-sage-800 font-bold text-xs shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                                title="Execute pending transactions in the compiled 3-Wave Edit Plan through the 4-Gate CI/CD Suite"
                            >
                                <GitMerge size={14} />
                                <span>Execute 3-Wave Plan (Phases 4–5)</span>
                            </button>
                        )}

                        {Boolean(harness.preRunProseSnapshot) && (
                            <button
                                onClick={revertAllHarnessTransactions}
                                disabled={isRunningEditorialHarness}
                                className="px-3.5 py-2.5 rounded-xl bg-surface hover:bg-lift border border-edge-strong text-ink-700 font-bold text-xs shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                                title="Restore all scenes to their pre-harness prose snapshot"
                            >
                                <RotateCcw size={13} />
                                <span>Revert All</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Scope & Mode Controls Strip */}
                <div className="pt-4 border-t border-edge-soft flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <label
                                htmlFor="editorial-scope-select"
                                className="text-xs font-bold uppercase font-mono text-ink-500"
                            >
                                Target Scope:
                            </label>
                            <select
                                id="editorial-scope-select"
                                value={editorialScopeSceneId}
                                onChange={(e) => setEditorialScopeSceneId(e.target.value)}
                                disabled={isRunningEditorialHarness}
                                className="bg-inset border border-edge-strong rounded-xl px-3 py-1.5 text-xs font-mono text-ink-800 outline-none focus:border-gold cursor-pointer"
                            >
                                <option value="ALL">
                                    Full Manuscript ({draftedList.length} Drafted Scene
                                    {draftedList.length === 1 ? '' : 's'})
                                </option>
                                {draftedList.map((sc) => (
                                    <option key={sc.sceneId} value={sc.sceneId}>
                                        {sc.sceneId} — Seq {sc.seqIdx + 1}.{sc.sceneIdx + 1}:{' '}
                                        {sc.title} ({sc.normalized.wordCount}w)
                                    </option>
                                ))}
                            </select>
                        </div>

                        <label className="flex items-center gap-2 text-xs text-ink-700 font-medium cursor-pointer bg-inset px-3 py-1.5 rounded-xl border border-edge-strong">
                            <input
                                type="checkbox"
                                checked={editorialUseDeepLLM}
                                onChange={(e) => setEditorialUseDeepLLM(e.target.checked)}
                                disabled={isRunningEditorialHarness}
                                className="rounded border-stone-300 text-[#8C6B32] focus:ring-[#8C6B32]"
                            />
                            <span>
                                Deep Multi-Agent LLM Calls (When unchecked, uses fast deterministic
                                NLP &amp; surgical engine)
                            </span>
                        </label>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono text-ink-500">
                        <span>Autopilot Hook:</span>
                        <button
                            type="button"
                            onClick={() =>
                                setEnableEditorialHarnessAutopilot(
                                    !enableEditorialHarnessAutopilot
                                )
                            }
                            className={`px-2.5 py-1 rounded-full font-bold border transition-colors cursor-pointer ${
                                enableEditorialHarnessAutopilot
                                    ? 'bg-sage-tint border-sage-edge text-sage-800'
                                    : 'bg-mist-100 border-edge-strong text-ink-500'
                            }`}
                        >
                            {enableEditorialHarnessAutopilot
                                ? 'Enabled in Autopilot'
                                : 'Disabled in Autopilot'}
                        </button>
                    </div>
                </div>

                {/* Live Execution Progress Bar */}
                {(isRunningEditorialHarness || editorialHarnessPhase) && (
                    <div className="bg-inset p-4 rounded-xl border border-edge-strong space-y-2">
                        <div className="flex items-center justify-between text-xs font-mono">
                            <span className="font-bold text-gold-ink flex items-center gap-2">
                                {isRunningEditorialHarness && (
                                    <Loader2 size={13} className="animate-spin text-gold-ink" />
                                )}
                                {editorialHarnessPhase || 'Ready'}
                            </span>
                            <span className="font-bold text-ink-700">
                                {editorialHarnessProgress}%
                            </span>
                        </div>
                        <div className="w-full bg-mist-200 h-2 rounded-full overflow-hidden">
                            <div
                                className="bg-gold h-full transition-all duration-300"
                                style={{ width: `${editorialHarnessProgress}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Key Convergence Telemetry Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                        <span className="text-[11px] font-bold text-ink-500 uppercase font-mono block">
                            Drafted Scenes
                        </span>
                        <span className="text-lg font-bold font-serif text-ink-900">
                            {draftedList.length}
                        </span>
                    </div>
                    <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                        <span className="text-[11px] font-bold text-ink-500 uppercase font-mono block">
                            Rhythm CV Baseline
                        </span>
                        <span className="text-lg font-bold font-serif text-ink-900">
                            {voiceDna?.syntacticCadence?.coeffOfVariation ?? fallbackRhythmCV}
                        </span>
                    </div>
                    <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                        <span className="text-[11px] font-bold text-ink-500 uppercase font-mono block">
                            Psychic Distance
                        </span>
                        <span className="text-lg font-bold font-serif text-ink-900">
                            {voiceDna?.perceptualProfile?.baselinePsychicDistance ??
                                fallbackPsychicDist}
                        </span>
                    </div>
                    <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                        <span className="text-[11px] font-bold text-ink-500 uppercase font-mono block">
                            Layer 0 Divergence
                        </span>
                        <span className="text-lg font-bold font-serif text-ink-900">
                            {harness.summary?.meanDivergence !== undefined
                                ? `${harness.summary.meanDivergence} / 1.0`
                                : '—'}
                        </span>
                    </div>
                    <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                        <span className="text-[11px] font-bold text-ink-500 uppercase font-mono block">
                            Tribunal Tickets
                        </span>
                        <span className="text-lg font-bold font-serif text-gold-ink">
                            {verifiedTickets.length}{' '}
                            <span className="text-xs font-mono text-ink-400 font-normal">
                                ({harness.summary?.dismissedTicketsCount || 0} vetoed)
                            </span>
                        </span>
                    </div>
                    <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                        <span className="text-[11px] font-bold text-ink-500 uppercase font-mono block">
                            4-Gate CI/CD Commits
                        </span>
                        <span className="text-lg font-bold font-serif text-sage-800">
                            {harness.summary?.committedTransactions || 0} / {totalTransactionsCount}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── SUB-NAVIGATION TABS ── */}
            <div className="flex flex-wrap gap-2 bg-surface p-2 rounded-2xl border border-edge shadow-2xs">
                {tabs.map((tab) => {
                    const TabIcon = tab.icon;
                    const isActive = editorialHarnessTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setEditorialHarnessTab(tab.id)}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                                isActive
                                    ? 'bg-btn text-btn-ink shadow-2xs'
                                    : 'text-ink-600 hover:text-ink-900 hover:bg-wash'
                            }`}
                        >
                            <TabIcon
                                size={14}
                                className={isActive ? 'text-amber-300' : 'text-gold-ink'}
                            />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* ── TAB 1: PHASE 1 VOICE DNA & AESTHETIC CONSTITUTION ── */}
            {editorialHarnessTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* AuthorVoiceDNA Card */}
                    <div className="bg-surface p-6 rounded-2xl border border-edge shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-edge-soft pb-3">
                            <div>
                                <h3 className="text-base font-bold font-serif text-ink-900 flex items-center gap-2">
                                    <Fingerprint size={18} className="text-gold-ink" />{' '}
                                    &lt;AuthorVoiceDNA&gt; Profile
                                </h3>
                                <p className="text-xs text-ink-500">
                                    Extracted stylistic baseline and gold-standard exemplars locking
                                    all surgical editors.
                                </p>
                            </div>
                            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-gold-tint border border-gold-edge text-gold-ink font-bold">
                                Phase 1B
                            </span>
                        </div>

                        {!voiceDna ? (
                            <div className="p-8 text-center text-xs text-ink-400 italic bg-inset rounded-xl border border-edge-soft">
                                Click &quot;Run Full Review &amp; 3-Wave Revision&quot; or
                                &quot;Diagnostic Review Only&quot; above to extract the
                                manuscript&apos;s &lt;AuthorVoiceDNA&gt;.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                                    <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                                        <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                            Sentence Mean / SD
                                        </span>
                                        <span className="font-bold font-mono text-ink-900">
                                            {voiceDna.syntacticCadence?.meanWords}w ±{' '}
                                            {voiceDna.syntacticCadence?.stdDevWords}w
                                        </span>
                                    </div>
                                    <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                                        <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                            Rhythm CV Baseline
                                        </span>
                                        <span className="font-bold font-mono text-ink-900">
                                            {voiceDna.syntacticCadence?.coeffOfVariation} (Min
                                            0.22)
                                        </span>
                                    </div>
                                    <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                                        <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                            Psychic Distance
                                        </span>
                                        <span className="font-bold font-mono text-ink-900">
                                            {voiceDna.perceptualProfile?.baselinePsychicDistance} /
                                            5.0
                                        </span>
                                    </div>
                                    <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                                        <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                            Hypotaxis Ratio
                                        </span>
                                        <span className="font-bold font-mono text-ink-900">
                                            {voiceDna.syntacticCadence?.hypotaxisRatio}
                                        </span>
                                    </div>
                                    <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                                        <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                            Filter Words / 1k
                                        </span>
                                        <span className="font-bold font-mono text-ink-900">
                                            {voiceDna.perceptualProfile?.filterVerbRate}
                                        </span>
                                    </div>
                                    <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                                        <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                            Dialogue Ratio
                                        </span>
                                        <span className="font-bold font-mono text-ink-900">
                                            {Math.round(
                                                (voiceDna.perceptualProfile?.dialogueRatio || 0) *
                                                    100
                                            )}
                                            %
                                        </span>
                                    </div>
                                </div>

                                {Array.isArray(voiceDna.signatureLexicon) &&
                                    voiceDna.signatureLexicon.length > 0 && (
                                        <div>
                                            <div className="text-xs font-bold uppercase font-mono text-ink-500 mb-1.5">
                                                Protected Signature Lexicon
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {voiceDna.signatureLexicon.map((tok, i) => (
                                                    <span
                                                        key={i}
                                                        className="px-2.5 py-0.5 rounded-full bg-gold-tint border border-gold-edge text-gold-ink text-xs font-mono font-semibold"
                                                    >
                                                        {typeof tok === 'object'
                                                            ? `${tok.lemma} (${tok.count})`
                                                            : tok}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                {Array.isArray(voiceDna.exemplars) &&
                                    voiceDna.exemplars.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-bold uppercase font-mono text-ink-500">
                                                Top-Decile Gold-Standard Exemplars
                                            </div>
                                            {voiceDna.exemplars.map((ex, i) => (
                                                <div
                                                    key={i}
                                                    className="p-3 rounded-xl bg-inset border border-edge-strong space-y-1"
                                                >
                                                    <div className="flex items-center justify-between text-[11px] font-mono text-gold-ink">
                                                        <span>
                                                            {ex.source_anchor} ({ex.mode})
                                                        </span>
                                                        <span>{ex.stylisticNotes}</span>
                                                    </div>
                                                    <p className="text-xs font-serif italic text-ink-800 line-clamp-3">
                                                        &quot;{ex.verbatimText}&quot;
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                            </div>
                        )}
                    </div>

                    {/* AestheticConstitution & .novelignore Rule Manager */}
                    <div className="bg-surface p-6 rounded-2xl border border-edge shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-edge-soft pb-3">
                            <div>
                                <h3 className="text-base font-bold font-serif text-ink-900 flex items-center gap-2">
                                    <ShieldCheck size={18} className="text-gold-ink" />{' '}
                                    &lt;AestheticConstitution&gt; &amp; .novelignore
                                </h3>
                                <p className="text-xs text-ink-500">
                                    Immutable artistic constraints &amp; intentional stylistic
                                    exemptions that veto false-positive edits.
                                </p>
                            </div>
                            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-gold-tint border border-gold-edge text-gold-ink font-bold">
                                Phase 1A
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                                <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                    Genre Contract
                                </span>
                                <span className="font-bold text-ink-900">
                                    {constitution.genreAndSubgenre?.primary ||
                                        constitution.genreContract?.primaryGenre ||
                                        'Literary Fiction'}{' '}
                                    ({constitution.genreAndSubgenre?.audienceExpectationTier || 'UPMARKET'})
                                </span>
                            </div>
                            <div className="bg-inset p-3 rounded-xl border border-edge-soft">
                                <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                    POV &amp; Psychic Distance
                                </span>
                                <span className="font-bold text-ink-900">
                                    {constitution.narrativePOVContract?.globalType} (PD{' '}
                                    {constitution.narrativePOVContract?.psychicDistanceRange?.min ??
                                        1.5}
                                    –
                                    {constitution.narrativePOVContract?.psychicDistanceRange?.max ??
                                        3.5}
                                    )
                                </span>
                            </div>
                            <div className="bg-inset p-3 rounded-xl border border-edge-soft sm:col-span-2">
                                <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                    Authorial Persona &amp; Anti-Patterns
                                </span>
                                <span className="font-serif italic text-ink-800">
                                    {constitution.authorialDirectives?.persona} —{' '}
                                    {constitution.authorialDirectives?.strictAntiPatterns}
                                </span>
                            </div>
                        </div>

                        {/* .novelignore Rule Builder */}
                        <div className="pt-3 border-t border-edge-soft space-y-3">
                            <div className="text-xs font-bold uppercase font-mono text-ink-700">
                                .novelignore Intentional Style Exemptions ({activeOverrides.length})
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <select
                                    value={novelIgnoreDraftRule.rule_type}
                                    onChange={(e) =>
                                        setNovelIgnoreDraftRule((prev) => ({
                                            ...prev,
                                            rule_type: e.target.value
                                        }))
                                    }
                                    className="bg-inset border border-edge-strong rounded-xl px-2.5 py-1.5 text-xs font-mono text-ink-800 outline-none focus:border-gold"
                                >
                                    <option value="ALLOW_PHRASE">ALLOW_PHRASE</option>
                                    <option value="EXEMPT_SCENE">EXEMPT_SCENE</option>
                                    <option value="IGNORE_DEFECT_CLASS">IGNORE_DEFECT_CLASS</option>
                                </select>
                                <input
                                    type="text"
                                    value={novelIgnoreDraftRule.pattern}
                                    onChange={(e) =>
                                        setNovelIgnoreDraftRule((prev) => ({
                                            ...prev,
                                            pattern: e.target.value
                                        }))
                                    }
                                    placeholder="Phrase, sc_0_0, or defect class..."
                                    className="bg-inset border border-edge-strong rounded-xl px-3 py-1.5 text-xs font-mono text-ink-900 outline-none focus:border-gold"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddNovelIgnoreRule}
                                    className="bg-btn hover:bg-btn-hover text-btn-ink rounded-xl px-3 py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    <Plus size={13} /> Add Exemption
                                </button>
                            </div>

                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {activeOverrides.length === 0 ? (
                                    <p className="text-xs text-ink-400 italic py-2">
                                        No custom .novelignore exemptions added yet.
                                    </p>
                                ) : (
                                    activeOverrides.map((r, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center justify-between px-3 py-2 rounded-xl bg-inset border border-edge-strong text-xs font-mono"
                                        >
                                            <div className="truncate">
                                                <span className="font-bold text-gold-ink">
                                                    [{r.rule_type || 'ALLOW_PHRASE'}]
                                                </span>{' '}
                                                <span className="text-ink-900">
                                                    {r.pattern || r.phrase || r.reason || 'Exemption'}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveNovelIgnoreRule(idx)}
                                                className="text-ink-400 hover:text-blush-600 p-1 cursor-pointer"
                                                title="Remove rule"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 2: PHASE 2A–2B NSG, NLP TELEMETRY & LAYER 0 BLIND READER ── */}
            {editorialHarnessTab === 'telemetry' && (
                <div className="space-y-6">
                    {/* Ebbinghaus Thread Memory Decay Strip */}
                    {nsg && Array.isArray(nsg.threadsLedger) && nsg.threadsLedger.length > 0 && (
                        <div className="bg-surface p-6 rounded-2xl border border-edge shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold font-serif text-ink-900 uppercase tracking-wider font-mono flex items-center gap-2">
                                    <GitBranch size={15} className="text-gold-ink" /> Ebbinghaus
                                    Narrative Thread &amp; Clue Memory Retention S(W)
                                </h3>
                                <span className="text-xs font-mono text-ink-400">
                                    Alert Threshold: S(W) &lt; 0.22
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {computeEbbinghausMemoryDecay(
                                    nsg as unknown as Parameters<
                                        typeof computeEbbinghausMemoryDecay
                                    >[0],
                                    nsg.totalWords || 0
                                ).map((th, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-3.5 rounded-xl border ${th.evaporated ? 'bg-blush-tint/40 border-blush-edge' : 'bg-inset border-edge-strong'}`}
                                    >
                                        <div className="flex items-center justify-between text-xs font-mono mb-1">
                                            <span className="font-bold text-ink-900 truncate">
                                                {th.id}: {th.label}
                                            </span>
                                            <span
                                                className={`px-2 py-0.5 rounded-full font-bold shrink-0 ${th.evaporated ? 'bg-blush-tint text-blush-800' : 'bg-sage-tint text-sage-800'}`}
                                            >
                                                S(W) = {th.salience}
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-ink-500 font-mono">
                                            ΔW since reinforcement: {th.wordsSinceLastReinforcement}
                                            w • Type: {th.type}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Per-Scene Telemetry & Layer 0 Divergence Cards */}
                    <div className="grid grid-cols-1 gap-4">
                        {draftedList.length === 0 ? (
                            <div className="bg-surface p-10 rounded-2xl border border-edge text-center text-xs text-ink-400 italic">
                                No drafted scenes available for telemetry analysis.
                            </div>
                        ) : (
                            draftedList.map((sc) => {
                                const scTel = fullTelemetry?.sceneTelemetryMap?.[sc.sceneId];
                                const l0 = layer0Map[sc.sceneId];
                                return (
                                    <div
                                        key={sc.sceneId}
                                        className="bg-surface p-5 rounded-2xl border border-edge shadow-sm space-y-4"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge-soft pb-3">
                                            <div>
                                                <span className="text-xs font-mono font-bold text-gold-ink bg-gold-tint border border-gold-edge px-2.5 py-0.5 rounded-full mr-2">
                                                    {sc.sceneId}
                                                </span>
                                                <span className="font-serif font-bold text-base text-ink-900">
                                                    Seq {sc.seqIdx + 1}.{sc.sceneIdx + 1}:{' '}
                                                    {sc.title}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs font-mono">
                                                <span className="px-2.5 py-0.5 rounded-full bg-inset border border-edge-strong text-ink-700">
                                                    {sc.normalized.wordCount} words
                                                </span>
                                                {l0 && l0.dTotal !== undefined && (
                                                    <span
                                                        className={`px-2.5 py-0.5 rounded-full font-bold border ${l0.dTotal > 0.25 ? 'bg-blush-tint border-blush-edge text-blush-800' : 'bg-sage-tint border-sage-edge text-sage-800'}`}
                                                    >
                                                        Layer 0 D_total: {l0.dTotal}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        setEditorialScopeSceneId(sc.sceneId);
                                                        runAutonomousEditorialHarness({
                                                            mode: 'full_pipeline',
                                                            scopeSceneId: sc.sceneId,
                                                            useLLM: editorialUseDeepLLM
                                                        });
                                                    }}
                                                    disabled={isRunningEditorialHarness}
                                                    className="px-3 py-1 rounded-lg bg-btn text-btn-ink font-bold text-xs cursor-pointer disabled:opacity-50"
                                                >
                                                    Revise Scene
                                                </button>
                                            </div>
                                        </div>

                                        {scTel && (
                                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
                                                <div className="bg-inset p-2.5 rounded-xl border border-edge-soft">
                                                    <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                                        Rhythm CV
                                                    </span>
                                                    <span
                                                        className={`font-mono font-bold ${scTel.sentenceLengthCV < 0.22 ? 'text-blush-700' : 'text-ink-900'}`}
                                                    >
                                                        {scTel.sentenceLengthCV}
                                                    </span>
                                                </div>
                                                <div className="bg-inset p-2.5 rounded-xl border border-edge-soft">
                                                    <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                                        Psychic Distance
                                                    </span>
                                                    <span className="font-mono font-bold text-ink-900">
                                                        {scTel.meanPsychicDistance}
                                                    </span>
                                                </div>
                                                <div className="bg-inset p-2.5 rounded-xl border border-edge-soft">
                                                    <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                                        Filter / 1k
                                                    </span>
                                                    <span
                                                        className={`font-mono font-bold ${scTel.filterWordDensityPer1k > 8 ? 'text-amber-700' : 'text-ink-900'}`}
                                                    >
                                                        {scTel.filterWordDensityPer1k}
                                                    </span>
                                                </div>
                                                <div className="bg-inset p-2.5 rounded-xl border border-edge-soft">
                                                    <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                                        Lexical Echoes
                                                    </span>
                                                    <span
                                                        className={`font-mono font-bold ${(scTel.lexicalEchoes || []).length > 0 ? 'text-amber-700' : 'text-sage-800'}`}
                                                    >
                                                        {(scTel.lexicalEchoes || []).length}
                                                    </span>
                                                </div>
                                                <div className="bg-inset p-2.5 rounded-xl border border-edge-soft">
                                                    <span className="text-[10px] font-mono uppercase text-ink-500 block">
                                                        White-Room Spans
                                                    </span>
                                                    <span
                                                        className={`font-mono font-bold ${(scTel.whiteRoomSpans || []).length > 0 ? 'text-amber-700' : 'text-sage-800'}`}
                                                    >
                                                        {(scTel.whiteRoomSpans || []).length}
                                                    </span>
                                                </div>
                                                <div className="bg-inset p-2.5 rounded-xl border border-edge-soft">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="text-[10px] font-mono uppercase text-ink-500">
                                                            AI Slop Audit
                                                        </span>
                                                        {(scTel.closerViolations || []).length >
                                                            0 && (
                                                            <span className="px-1.5 py-0.5 rounded bg-blush-tint border border-blush-edge text-[9px] font-mono font-bold text-blush-700 uppercase">
                                                                Closer{' '}
                                                                {
                                                                    (scTel.closerViolations || [])
                                                                        .length
                                                                }
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-baseline gap-2 mt-0.5">
                                                        <span
                                                            className={`font-mono font-bold ${(scTel.hardSlopViolations || []).length > 0 ? 'text-blush-700' : 'text-sage-800'}`}
                                                        >
                                                            {(scTel.hardSlopViolations || []).length}{' '}
                                                            hard
                                                        </span>
                                                        <span className="text-[10px] font-mono text-ink-500">
                                                            ·{' '}
                                                            {(scTel.flagSlopViolations || [])
                                                                .length +
                                                                (scTel.rhetoricalViolations || [])
                                                                    .length}{' '}
                                                            flags
                                                        </span>
                                                    </div>
                                                    {(scTel.slopViolations || []).length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                                            {(scTel.slopViolations || [])
                                                                .slice(0, 4)
                                                                .map((v, vi) => (
                                                                    <span
                                                                        key={vi}
                                                                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono truncate max-w-[130px] ${
                                                                            v.severity === 'hard' ||
                                                                            v.severity ===
                                                                                'high_closer'
                                                                                ? 'bg-blush-tint text-blush-700 border border-blush-edge'
                                                                                : 'bg-surface text-ink-700 border border-edge'
                                                                        }`}
                                                                        title={`${v.categoryLabel || v.category || 'Slop'}: ${v.term || v.phrase}`}
                                                                    >
                                                                        {v.term || v.phrase}
                                                                    </span>
                                                                ))}
                                                            {(scTel.slopViolations || []).length >
                                                                4 && (
                                                                <span className="text-[9px] font-mono text-ink-500 px-1">
                                                                    +
                                                                    {(scTel.slopViolations || [])
                                                                        .length - 4}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {l0 && l0.axisScores && (
                                            <div className="bg-inset p-3.5 rounded-xl border border-edge-strong space-y-2 text-xs">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="font-mono font-bold uppercase text-gold-ink">
                                                        Layer 0 Blind Reader 5-Axis Divergence
                                                    </span>
                                                    <div className="flex flex-wrap gap-2 font-mono text-[11px]">
                                                        <span>
                                                            Causal:{' '}
                                                            <strong>{l0.axisScores.d1_causal}</strong>
                                                        </span>
                                                        <span>
                                                            Subtext:{' '}
                                                            <strong>
                                                                {l0.axisScores.d2_subtext}
                                                            </strong>
                                                        </span>
                                                        <span>
                                                            Value:{' '}
                                                            <strong>
                                                                {l0.axisScores.d3_value_shift}
                                                            </strong>
                                                        </span>
                                                        <span>
                                                            Epistemic:{' '}
                                                            <strong>
                                                                {l0.axisScores.d4_epistemic}
                                                            </strong>
                                                        </span>
                                                        <span>
                                                            Pacing:{' '}
                                                            <strong>{l0.axisScores.d5_pacing}</strong>
                                                        </span>
                                                    </div>
                                                </div>
                                                <p className="text-ink-700 font-serif italic">
                                                    {l0.takeawaySummary}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* ── TAB 3: PHASE 2C–2D INVESTIGATION DOSSIERS & ADVERSARIAL TRIBUNAL ── */}
            {editorialHarnessTab === 'tribunal' && (
                <div className="space-y-4">
                    {deliberations.length === 0 ? (
                        <div className="bg-surface p-10 rounded-2xl border border-edge text-center text-xs text-ink-400 italic">
                            No Adversarial Tribunal deliberations recorded yet. Click &quot;Run Full
                            Review &amp; 3-Wave Revision&quot; or &quot;Diagnostic Review Only&quot;
                            above.
                        </div>
                    ) : (
                        deliberations.map((delib, idx) => {
                            const tTicket = delib.ticket || {};
                            return (
                                <div
                                    key={delib.dossierId || idx}
                                    className="bg-surface p-6 rounded-2xl border border-edge shadow-sm space-y-4"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge-soft pb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-gold-tint border border-gold-edge text-gold-ink">
                                                {tTicket.sceneId || delib.dossierId}
                                            </span>
                                            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-mist-100 border border-edge-strong text-ink-800">
                                                {tTicket.category || 'EDITORIAL_CASE'}
                                            </span>
                                            <span className="text-xs font-mono text-ink-500">
                                                {tTicket.wave} • {tTicket.startAnchor}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 font-mono text-xs">
                                            <span className="px-2.5 py-0.5 rounded-full bg-inset border border-edge-strong text-ink-800 font-bold">
                                                S_priority = {delib.priorityScore} / 100
                                            </span>
                                            <span
                                                className={`px-3 py-0.5 rounded-full font-bold border ${delib.verdict !== 'DISMISSED_BY_DEFENSE' ? 'bg-sage-tint border-sage-edge text-sage-800' : 'bg-mist-100 border-edge-strong text-ink-500'}`}
                                            >
                                                {delib.verdict}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                        <div className="p-3.5 rounded-xl bg-blush-tint/25 border border-blush-edge space-y-1">
                                            <div className="font-mono font-bold uppercase text-blush-800">
                                                Prosecutor Argument (Continuity &amp; Rigor)
                                            </div>
                                            <p className="text-ink-800 leading-relaxed">
                                                {delib.prosecutorArgument}
                                            </p>
                                        </div>
                                        <div className="p-3.5 rounded-xl bg-sage-tint/25 border border-sage-edge space-y-1">
                                            <div className="font-mono font-bold uppercase text-sage-800">
                                                Defense Counsel Argument (Voice &amp; Subtext)
                                            </div>
                                            <p className="text-ink-800 leading-relaxed">
                                                {delib.defenseArgument}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="p-3.5 rounded-xl bg-inset border border-edge-strong space-y-2 text-xs">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="font-mono font-bold uppercase text-gold-ink flex items-center gap-1.5">
                                                <Gavel size={13} /> Managing Editor Judge Rubric
                                                &amp; Surgical Directive
                                            </span>
                                            <div className="flex flex-wrap gap-2 font-mono text-[11px] text-ink-600">
                                                <span>
                                                    Evidence(E):{' '}
                                                    <strong>{delib.rubricScores?.E}</strong>
                                                </span>
                                                <span>
                                                    Impact(I):{' '}
                                                    <strong>{delib.rubricScores?.I}</strong>
                                                </span>
                                                <span>
                                                    Divergence(D):{' '}
                                                    <strong>{delib.rubricScores?.D}</strong>
                                                </span>
                                                <span>
                                                    Confidence(C):{' '}
                                                    <strong>{delib.rubricScores?.C}</strong>
                                                </span>
                                                <span>
                                                    BlastRisk(R):{' '}
                                                    <strong>{delib.rubricScores?.R}</strong>
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-ink-800 font-serif">
                                            {tTicket.surgicalDirective || delib.judicialRationale}
                                        </p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ── TAB 4: PHASES 3–5 3-WAVE EDIT PLAN & 4-GATE LITERARY CI/CD ── */}
            {editorialHarnessTab === 'waves' && (
                <div className="space-y-6">
                    {!editPlan || !Array.isArray(editPlan.waves) ? (
                        <div className="bg-surface p-10 rounded-2xl border border-edge text-center text-xs text-ink-400 italic">
                            No &lt;CompiledEditPlan&gt; compiled yet. Run the Editorial Harness
                            above to generate the 3-Wave surgical plan.
                        </div>
                    ) : (
                        editPlan.waves.map((wave) => (
                            <div
                                key={wave.waveId}
                                className="bg-surface rounded-2xl border border-edge shadow-sm overflow-hidden"
                            >
                                <div className="p-5 bg-inset border-b border-edge flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-gold-tint border border-gold-edge text-gold-ink">
                                                {wave.waveId}
                                            </span>
                                            <h3 className="text-sm font-bold font-mono uppercase text-ink-900">
                                                {wave.name}
                                            </h3>
                                        </div>
                                        <p className="text-xs text-ink-500 mt-1">
                                            Specialist Agent: {wave.specialistAgent}
                                        </p>
                                    </div>
                                    <span className="text-xs font-mono font-bold text-ink-600">
                                        {wave.transactions?.length || 0} Transaction(s)
                                    </span>
                                </div>

                                {(wave.transactions || []).length === 0 ? (
                                    <div className="p-6 text-center text-xs text-ink-400 italic">
                                        No verified defects required intervention in {wave.name}.
                                    </div>
                                ) : (
                                    <div className="divide-y divide-edge">
                                        {(wave.transactions || []).map((tx) => {
                                            const attemptsUsed = tx.attempts_used ?? 0;
                                            return (
                                                <div
                                                    key={tx.transactionId}
                                                    className="p-5 space-y-4"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-mist-100 border border-edge-strong text-ink-800">
                                                                {tx.transactionId}
                                                            </span>
                                                            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-gold-tint border border-gold-edge text-gold-ink">
                                                                {tx.sceneId} ({tx.startAnchor}–
                                                                {tx.endAnchor})
                                                            </span>
                                                            <span className="text-xs font-mono text-ink-600 font-semibold">
                                                                Priority: {tx.priorityScore}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span
                                                                className={`text-xs font-mono font-bold px-3 py-0.5 rounded-full border ${
                                                                    tx.status === 'COMMITTED'
                                                                        ? attemptsUsed > 1
                                                                            ? 'bg-teal-50 border-teal-300 text-teal-800'
                                                                            : 'bg-sage-tint border-sage-edge text-sage-800'
                                                                        : tx.status === 'ROLLED_BACK'
                                                                          ? 'bg-blush-tint border-blush-edge text-blush-800'
                                                                          : 'bg-mist-100 border-edge-strong text-ink-700'
                                                                }`}
                                                            >
                                                                {tx.status === 'COMMITTED'
                                                                    ? attemptsUsed > 1
                                                                        ? `COMMITTED (R${attemptsUsed}/3 Loop)`
                                                                        : 'COMMITTED (R1/3)'
                                                                    : tx.status === 'ROLLED_BACK'
                                                                      ? `ROLLED BACK (${tx.attempts_used || 3}/3 rounds)`
                                                                      : tx.status}
                                                            </span>
                                                            <button
                                                                onClick={() =>
                                                                    executeSingleHarnessTransaction(
                                                                        tx.transactionId
                                                                    )
                                                                }
                                                                disabled={isRunningEditorialHarness}
                                                                className="px-3 py-1 rounded-lg bg-btn hover:bg-btn-hover text-btn-ink text-xs font-bold cursor-pointer disabled:opacity-50"
                                                            >
                                                                {tx.status === 'COMMITTED'
                                                                    ? 'Re-Run Patch'
                                                                    : 'Apply Transaction'}
                                                            </button>
                                                            {tx.beforeProse &&
                                                                tx.status === 'COMMITTED' && (
                                                                    <button
                                                                        onClick={() =>
                                                                            revertHarnessTransaction(
                                                                                tx.transactionId
                                                                            )
                                                                        }
                                                                        disabled={
                                                                            isRunningEditorialHarness
                                                                        }
                                                                        className="px-3 py-1 rounded-lg bg-surface hover:bg-lift border border-edge-strong text-ink-700 text-xs font-bold cursor-pointer"
                                                                    >
                                                                        Revert
                                                                    </button>
                                                                )}
                                                        </div>
                                                    </div>

                                                    <div className="text-xs text-ink-700 bg-inset p-3 rounded-xl border border-edge-soft font-serif">
                                                        <strong className="font-mono uppercase text-ink-500">
                                                            Surgical Directive:{' '}
                                                        </strong>
                                                        {tx.combinedDirective}
                                                    </div>

                                                    {/* 4-Gate Literary CI/CD Results */}
                                                    {Array.isArray(tx.gateResults) &&
                                                        tx.gateResults.length > 0 && (
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                                                                {tx.gateResults.map((g) => (
                                                                    <div
                                                                        key={g.gate}
                                                                        className={`p-3 rounded-xl border text-xs ${g.passed ? 'bg-sage-tint/30 border-sage-edge' : 'bg-blush-tint/30 border-blush-edge'}`}
                                                                    >
                                                                        <div className="flex items-center justify-between font-mono font-bold mb-1">
                                                                            <span className="text-ink-900 truncate">
                                                                                {g.gate}
                                                                            </span>
                                                                            <span
                                                                                className={
                                                                                    g.passed
                                                                                        ? 'text-sage-800'
                                                                                        : 'text-blush-800'
                                                                                }
                                                                            >
                                                                                {g.passed
                                                                                    ? 'PASS'
                                                                                    : 'FAIL'}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-[11px] text-ink-600 leading-snug">
                                                                            {g.details}
                                                                        </p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                    {/* Prior Attempt Feedback Loop History */}
                                                    {Array.isArray(tx.attemptHistory) &&
                                                        tx.attemptHistory.length > 0 && (
                                                            <details className="text-xs bg-inset rounded-xl border border-edge-strong p-3 group">
                                                                <summary className="font-mono font-bold text-ink-700 cursor-pointer flex items-center justify-between">
                                                                    <span className="flex items-center gap-1.5 text-gold-ink">
                                                                        <RefreshCw size={12} />
                                                                        Feedback Loop Diagnostics (
                                                                        {tx.attemptHistory.length}{' '}
                                                                        prior round
                                                                        {tx.attemptHistory.length >
                                                                        1
                                                                            ? 's'
                                                                            : ''}
                                                                        )
                                                                    </span>
                                                                    <span className="text-[10px] text-ink-400 group-open:rotate-180 transition-transform">
                                                                        ▼
                                                                    </span>
                                                                </summary>
                                                                <div className="mt-3 space-y-2.5 pt-2 border-t border-edge-soft">
                                                                    {tx.attemptHistory.map((h) => (
                                                                        <div
                                                                            key={h.attempt}
                                                                            className="p-2.5 rounded-lg bg-surface border border-edge text-[11px] space-y-1"
                                                                        >
                                                                            <div className="flex items-center justify-between font-mono font-bold">
                                                                                <span className="text-blush-700">
                                                                                    Round{' '}
                                                                                    {h.attempt} / 3:{' '}
                                                                                    {h.failedGates?.join(
                                                                                        ', '
                                                                                    ) || 'Rejected'}
                                                                                </span>
                                                                            </div>
                                                                            {h.feedback
                                                                                ?.diagnostic && (
                                                                                <p className="text-ink-600 font-sans">
                                                                                    <strong className="font-mono text-ink-800">
                                                                                        Diagnostic:
                                                                                    </strong>{' '}
                                                                                    {
                                                                                        h.feedback
                                                                                            .diagnostic
                                                                                    }
                                                                                </p>
                                                                            )}
                                                                            {h.feedback
                                                                                ?.correction && (
                                                                                <p className="text-gold-ink font-sans">
                                                                                    <strong className="font-mono text-ink-800">
                                                                                        Correction
                                                                                        Fed to
                                                                                        Agent:
                                                                                    </strong>{' '}
                                                                                    {
                                                                                        h.feedback
                                                                                            .correction
                                                                                    }
                                                                                </p>
                                                                            )}
                                                                            {h.proposedSpan && (
                                                                                <div className="p-1.5 rounded bg-mist-50 border border-edge-soft font-serif text-ink-500 italic truncate max-h-12 overflow-hidden">
                                                                                    &quot;
                                                                                    {h.proposedSpan}
                                                                                    &quot;
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </details>
                                                        )}

                                                    {/* Before / After Span Comparison */}
                                                    {tx.beforeSpan &&
                                                        tx.afterSpan &&
                                                        tx.beforeSpan !== tx.afterSpan && (
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl bg-inset border border-edge-strong text-xs">
                                                                <div>
                                                                    <span className="text-[10px] font-mono uppercase text-blush-700 font-bold block mb-1">
                                                                        Before ({tx.startAnchor}–
                                                                        {tx.endAnchor})
                                                                    </span>
                                                                    <p className="font-serif text-ink-700 line-through opacity-80 whitespace-pre-wrap">
                                                                        {tx.beforeSpan}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <span className="text-[10px] font-mono uppercase text-sage-800 font-bold block mb-1">
                                                                        After (Voice-Locked Surgical
                                                                        Patch)
                                                                    </span>
                                                                    <p className="font-serif text-ink-900 font-medium whitespace-pre-wrap">
                                                                        {tx.afterSpan}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* ── TAB 5: INTERACTIVE 11-TOOL XML MANUSCRIPT INSPECTOR ── */}
            {editorialHarnessTab === 'tools' && (
                <div className="bg-surface p-6 rounded-2xl border border-edge shadow-sm space-y-4">
                    <div className="border-b border-edge-soft pb-3">
                        <h3 className="text-base font-bold font-serif text-ink-900 flex items-center gap-2">
                            <Microscope size={18} className="text-gold-ink" /> 11-Tool Read-Only
                            XML Manuscript Inspection Suite
                        </h3>
                        <p className="text-xs text-ink-500">
                            Directly invoke any of the 11 deterministic manuscript inspection tools
                            used by the Autonomous Editorial Investigator Agent.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-mono font-bold uppercase text-ink-500 mb-1">
                                Select Inspection Tool
                            </label>
                            <select
                                value={editorialToolName}
                                onChange={(e) => setEditorialToolName(e.target.value)}
                                className="w-full bg-inset border border-edge-strong rounded-xl px-3 py-2 text-xs font-mono text-ink-900 outline-none focus:border-gold"
                            >
                                {TOOL_METADATA_LIST.map((tm) => (
                                    <option key={tm.id} value={tm.id}>
                                        {tm.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-mono font-bold uppercase text-ink-500 mb-1">
                                Scene Coordinate (scene_id)
                            </label>
                            <select
                                value={editorialToolArgs.scene_id}
                                onChange={(e) =>
                                    setEditorialToolArgs((prev) => ({
                                        ...prev,
                                        scene_id: e.target.value
                                    }))
                                }
                                className="w-full bg-inset border border-edge-strong rounded-xl px-3 py-2 text-xs font-mono text-ink-900 outline-none focus:border-gold"
                            >
                                {draftedList.map((sc) => (
                                    <option key={sc.sceneId} value={sc.sceneId}>
                                        {sc.sceneId} ({sc.title})
                                    </option>
                                ))}
                                {draftedList.length === 0 && <option value="sc_0_0">sc_0_0</option>}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-mono font-bold uppercase text-ink-500 mb-1">
                                Query / Pattern / Character / Topic
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={
                                        editorialToolArgs.query || editorialToolArgs.pattern || ''
                                    }
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setEditorialToolArgs((prev) => ({
                                            ...prev,
                                            query: val,
                                            pattern: val,
                                            character_id: val,
                                            topic_or_entity_id: val,
                                            thread_id: val
                                        }));
                                    }}
                                    placeholder="Optional search query, regex, or character..."
                                    className="flex-1 bg-inset border border-edge-strong rounded-xl px-3 py-2 text-xs font-mono text-ink-900 outline-none focus:border-gold"
                                />
                                <button
                                    onClick={handleRunHarnessInspectorTool}
                                    className="px-4 py-2 rounded-xl bg-btn hover:bg-btn-hover text-btn-ink font-bold text-xs cursor-pointer shrink-0"
                                >
                                    Run Tool
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="text-xs text-ink-500 font-mono">
                        {TOOL_METADATA_LIST.find((t) => t.id === editorialToolName)?.desc}
                    </div>

                    <div className="bg-inset p-4 rounded-xl border border-edge-strong font-mono text-xs text-ink-800 max-h-96 overflow-y-auto whitespace-pre-wrap">
                        {editorialToolOutput
                            ? JSON.stringify(editorialToolOutput, null, 2)
                            : 'Click "Run Tool" to inspect structured XML manuscript telemetry, GESM epistemic state, or blast radius.'}
                    </div>
                </div>
            )}

            {/* ── HARNESS EXECUTION LOG STREAM ── */}
            {logs.length > 0 && (
                <div className="bg-surface p-5 rounded-2xl border border-edge shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-edge-soft pb-2">
                        <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-ink-700 flex items-center gap-1.5">
                            <Terminal size={14} className="text-gold-ink" /> Editorial Harness
                            Execution Stream
                        </h4>
                        <span className="text-xs font-mono text-ink-400">
                            {logs.length} events
                        </span>
                    </div>
                    <div className="bg-inset p-4 rounded-xl border border-edge-strong font-mono text-xs max-h-48 overflow-y-auto space-y-1.5">
                        {logs.map((l) => (
                            <div key={l.id} className="flex items-start gap-2">
                                <span className="text-ink-400 shrink-0">[{l.timestamp}]</span>
                                <span className="font-bold text-gold-ink shrink-0">[{l.phase}]</span>
                                <span
                                    className={
                                        l.status === 'error'
                                            ? 'text-blush-700 font-bold'
                                            : l.status === 'warning'
                                              ? 'text-amber-700'
                                              : 'text-ink-800'
                                    }
                                >
                                    {l.message}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
