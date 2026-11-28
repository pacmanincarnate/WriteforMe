/**
 * @module domain/series/sceneReport
 * Applies what the continuity pass reported about one scene to the series ledger: thread
 * movement, threads the model opened on its own, and what happened to secrets. Pure: returns a
 * patch for the story and the notes worth showing the user.
 */

import type { ContractViolation, OpenThread, OpenThreadUpdate, SecretEvent, SeriesInfo, Story, ThreadCandidate } from '@/types';
import { checkEndingContract } from './contract';
import { isSeriesStory } from './plan';
import { applySecretEvents } from './secrets';
import { acceptThreadCandidates, applyOpenThreadUpdates, seriesThreadLimits, type SeriesThreadLimits } from './threads';

export interface SeriesSceneReport {
    open_thread_updates?: OpenThreadUpdate[];
    new_thread_candidates?: ThreadCandidate[];
    secret_events?: SecretEvent[];
}

export interface SeriesSceneReportResult {
    /** Fields to merge into the story. Empty when the story is not part of a series. */
    patch: { open_threads?: OpenThread[]; series?: SeriesInfo };
    /** Threads the model opened in this scene and the ledger accepted. */
    openedThreads: OpenThread[];
    /** Contract violations found in this scene (new ones only). */
    newViolations: ContractViolation[];
}

function violationKey(v: ContractViolation): string {
    return `${v.rule}|${v.subject}|${v.evidence}`;
}

/** Merges violations, dropping repeats, so re-running a scene does not stack the same warning. */
export function mergeContractViolations(
    existing: ContractViolation[] | undefined,
    incoming: ContractViolation[]
): ContractViolation[] {
    const out = [...(existing || [])];
    const seen = new Set(out.map(violationKey));
    incoming.forEach((v) => {
        const key = violationKey(v);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(v);
    });
    return out;
}

export function applySeriesSceneReport(
    story: Partial<Story> | null | undefined,
    report: SeriesSceneReport | null | undefined,
    sceneLabel: string,
    /** Replaces the word-count limits. A serial passes its own thread policy here. */
    limitsOverride?: SeriesThreadLimits
): SeriesSceneReportResult {
    if (!isSeriesStory(story) || !report) return { patch: {}, openedThreads: [], newViolations: [] };
    const book = story.series.book_number;
    const updated = applyOpenThreadUpdates(story.open_threads, report.open_thread_updates, sceneLabel, book);
    const limits = limitsOverride ?? seriesThreadLimits((story as Record<string, unknown>).target_word_count ?? story.target_words);
    const { threads, accepted } = acceptThreadCandidates(updated, report.new_thread_candidates, limits, book, sceneLabel);
    const { secrets, leaks } = applySecretEvents(story, report.secret_events, sceneLabel);

    const found: ContractViolation[] = leaks.map((leak) => ({
        rule: 'must_stay_hidden',
        subject: leak.secret_id,
        evidence: `Scene ${sceneLabel}: ${leak.evidence || 'the scene gave this secret away.'}`
    }));
    checkEndingContract({ ...story, open_threads: threads })
        .filter((v) => v.rule === 'must_stay_open')
        .forEach((v) => found.push(v));

    const before = new Set((story.series.contract_violations || []).map(violationKey));
    const newViolations = found.filter((v) => !before.has(violationKey(v)));
    const series: SeriesInfo = {
        ...story.series,
        ...(story.series.plan ? { plan: { ...story.series.plan, secrets } } : {}),
        contract_violations: mergeContractViolations(story.series.contract_violations, found)
    };
    return { patch: { open_threads: threads, series }, openedThreads: accepted, newViolations };
}
