/**
 * @module views/cast/DeadRecordPanel
 * Who the story's record holds dead, on the Cast page. The record is read from the story state as
 * it is written; here the author can overrule it either way for any character.
 */

import React from 'react';
import { deadCharacters, type DeadCheckCastMember, type DeadCheckStory } from '@/domain/continuity/deadCharacters';

export interface DeadRecordPanelProps<TStory extends DeadCheckStory> {
    story: TStory;
    setStory: (updater: (prev: TStory) => TStory) => unknown;
}

const SOURCE_LABELS = {
    author: 'you marked them dead',
    state: 'the story state says so',
    roster: 'the serial roster says so'
} as const;

type Mark = 'story' | 'dead' | 'alive';

const markOf = (member: DeadCheckCastMember): Mark =>
    member.deceased === true ? 'dead' : member.deceased === false ? 'alive' : 'story';

export function DeadRecordPanel<TStory extends DeadCheckStory>({ story, setStory }: DeadRecordPanelProps<TStory>) {
    const cast = (Array.isArray(story.cast) ? story.cast : []).filter(
        (member): member is DeadCheckCastMember => Boolean(member && typeof member.name === 'string' && member.name.trim())
    );
    if (cast.length === 0) return null;
    const dead = new Map(deadCharacters(story).map((entry) => [entry.name.toLowerCase(), entry.source]));

    const setMark = (name: string, mark: Mark): void => {
        setStory((prev) => ({
            ...prev,
            cast: (prev.cast || []).map((member) => {
                if (!member || member.name !== name) return member;
                const next = { ...member };
                if (mark === 'story') delete next.deceased;
                else next.deceased = mark === 'dead';
                return next;
            })
        }));
    };

    return (
        <details className="rounded-xl border border-edge-soft bg-surface p-4" data-testid="dead-record">
            <summary className="cursor-pointer text-xs font-bold text-ink-500 uppercase tracking-wider font-mono">
                Who Is Dead ({dead.size})
            </summary>
            <p className="mt-2 text-xs text-ink-500">
                A new scene that has one of these characters alive is corrected, unless the scene&apos;s plan names
                them (a flashback, a ghost, a body). The story keeps this record as it is written. You can overrule
                it for anyone.
            </p>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cast.map((member) => {
                    const name = String(member.name).trim();
                    const source = dead.get(name.toLowerCase());
                    return (
                        <li key={name} className="flex items-center justify-between gap-2 text-xs text-ink-700">
                            <span>
                                <span className="font-bold">{name}</span>
                                <span className="text-ink-500">{source ? `: dead, ${SOURCE_LABELS[source]}` : ': alive'}</span>
                            </span>
                            <select
                                value={markOf(member)}
                                onChange={(e) => setMark(String(member.name), e.target.value as Mark)}
                                aria-label={`Record for ${name}`}
                                className="px-2 py-1 rounded-lg border border-edge-strong bg-surface text-xs text-ink-900 outline-none focus:ring-1 focus:ring-gold-edge"
                            >
                                <option value="story">Follow the story</option>
                                <option value="dead">Dead</option>
                                <option value="alive">Alive</option>
                            </select>
                        </li>
                    );
                })}
            </ul>
        </details>
    );
}
