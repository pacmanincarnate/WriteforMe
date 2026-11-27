/**
 * @module domain/story/restorePoints
 * Rules for a story's restore points: which to keep, and when a daily backup is due.
 *
 * Two kinds exist. A `before` point is taken just before something rewrites the story (a scene
 * rewrite, a restore, an editing pass), so that one action can be undone. An `auto` point is the
 * daily backup. The newest few `before` points are kept; `auto` points thin out with age: one a
 * day for the last seven days that have one, then one a week for the four weeks before those.
 */

export type RestorePointKind = 'before' | 'auto' | 'manual';

export interface RestorePointMeta {
    id: string;
    storyId: string;
    kind: RestorePointKind;
    label: string;
    timestamp: number;
    words: number;
    scenes: number;
}

export const RESTORE_POINT_LIMITS = {
    before: 10,
    manual: 10,
    daily: 7,
    weekly: 4
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day number, so "one a day" follows the writer's clock, not UTC. */
function dayOf(timestamp: number): number {
    const d = new Date(timestamp);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** Ids of the restore points of one story that are past keeping. */
export function restorePointsToDrop(points: readonly RestorePointMeta[]): string[] {
    const newestFirst = [...points].sort((a, b) => b.timestamp - a.timestamp);
    const drop: string[] = [];

    for (const kind of ['before', 'manual'] as const) {
        newestFirst
            .filter((p) => p.kind === kind)
            .slice(RESTORE_POINT_LIMITS[kind])
            .forEach((p) => drop.push(p.id));
    }

    const days = new Set<number>();
    const weeks = new Set<number>();
    let oldestDailyDay: number | null = null;
    for (const point of newestFirst.filter((p) => p.kind === 'auto')) {
        const day = dayOf(point.timestamp);
        if (days.has(day)) {
            drop.push(point.id);
            continue;
        }
        if (days.size < RESTORE_POINT_LIMITS.daily) {
            days.add(day);
            oldestDailyDay = day;
            continue;
        }
        // Older than the dailies: one a week, counted back from the oldest daily kept.
        const week = Math.floor(((oldestDailyDay ?? day) - day - 1) / 7);
        if (week < RESTORE_POINT_LIMITS.weekly && !weeks.has(week)) {
            weeks.add(week);
            continue;
        }
        drop.push(point.id);
    }
    return drop;
}

/** True when no daily backup of this story has been taken yet today. */
export function dailyBackupDue(points: readonly RestorePointMeta[], now: number): boolean {
    const today = dayOf(now);
    return !points.some((p) => p.kind === 'auto' && dayOf(p.timestamp) === today);
}

/** "3 minutes ago", "yesterday", or a date, for the restore point list. */
export function restorePointAge(timestamp: number, now: number): string {
    const minutes = Math.max(0, Math.round((now - timestamp) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24 && dayOf(timestamp) === dayOf(now)) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = dayOf(now) - dayOf(timestamp);
    if (days <= 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(timestamp).toLocaleDateString();
}
