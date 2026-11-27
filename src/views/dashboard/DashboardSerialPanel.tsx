/**
 * @module views/dashboard/DashboardSerialPanel
 * Read-only card for a serial: where the current arc stands, which threads are open or on hold,
 * and who is on stage. Renders nothing for any story that is not a serial.
 */

import { Layers } from '@/components';
import { summarizeSerial } from '@/domain/serial';
import type { SerialThread, Story } from '@/types';
import type { DashboardStory } from './types';

const PHASE_LABELS: Record<string, string> = {
    opening: 'Opening',
    middle: 'Middle',
    wrap_up: 'Wrap-up',
    finale: 'Finale',
    done: 'Arc complete'
};

export interface DashboardSerialPanelProps {
    story: DashboardStory;
}

export function DashboardSerialPanel({ story }: DashboardSerialPanelProps) {
    const summary = summarizeSerial(story as Partial<Story>);
    if (!summary) return null;

    const threadList = (label: string, hint: string, threads: SerialThread[]) => (
        <div className="space-y-2">
            <div className="text-xs font-bold text-ink-700">
                {label} <span className="font-normal text-ink-500">({threads.length})</span>
            </div>
            {threads.length === 0 ? (
                <p className="text-xs text-ink-500">{hint}</p>
            ) : (
                <ul className="space-y-1.5">
                    {threads.map((t) => (
                        <li key={t.id} className="text-xs text-ink-700 leading-relaxed">
                            <span className="font-mono font-bold text-ink-400 mr-1.5">{t.id}</span>
                            <span className="font-semibold">{t.title}</span>
                            {t.owners.length > 0 && <span className="text-ink-500"> · {t.owners.join(', ')}</span>}
                            {t.parked && <span className="block text-ink-500">On hold since episode {t.parked.episode}: {t.parked.note}</span>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );

    return (
        <div className="bg-surface p-6 sm:p-8 rounded-2xl border border-edge shadow-sm space-y-5">
            <h3 className="text-xs font-bold text-gold-ink uppercase tracking-wider font-mono flex flex-wrap items-center gap-2">
                <Layers size={15} /> Serial
                <span className="px-2 py-0.5 rounded bg-mist-100 text-ink-600 normal-case tracking-normal">
                    Arc {summary.arc}
                </span>
                <span className="px-2 py-0.5 rounded bg-mist-100 text-ink-600 normal-case tracking-normal">
                    {summary.written} of {summary.length} episodes
                </span>
                <span className="px-2 py-0.5 rounded bg-mist-100 text-ink-600 normal-case tracking-normal">
                    {PHASE_LABELS[summary.phase] || summary.phase}
                </span>
            </h3>
            <p className="text-xs text-ink-500">
                {summary.phase === 'done'
                    ? 'Every episode of this arc is written. Start the next book to begin the next arc.'
                    : `Next up: episode ${summary.nextEpisode}.`}{' '}
                {summary.rotation === 'ensemble'
                    ? 'Ensemble cast: anyone can sit an arc out.'
                    : 'The lead is in every arc; the rest of the cast rotates.'}
            </p>

            {summary.warnings.length > 0 && (
                <ul className="p-4 rounded-xl border border-ember-edge bg-ember-tint text-ember-900 text-xs space-y-1">
                    {summary.warnings.map((w) => (
                        <li key={w}>{w}</li>
                    ))}
                </ul>
            )}

            <div className="grid gap-5 sm:grid-cols-3">
                {threadList('Side threads', 'None open. The next episodes will open one.', summary.side)}
                {threadList('Long-running threads', 'None yet.', summary.spine)}
                {threadList('On hold', 'Nothing is waiting on an absent character.', summary.parked)}
            </div>

            <div className="text-xs text-ink-700 space-y-1">
                <div>
                    <span className="font-bold">On stage:</span>{' '}
                    {summary.onStage.map((r) => r.name).join(', ') || 'The cast is not set yet.'}
                </div>
                {summary.resting.length > 0 && (
                    <div>
                        <span className="font-bold">Resting:</span> {summary.resting.map((r) => r.name).join(', ')}
                    </div>
                )}
            </div>
        </div>
    );
}
