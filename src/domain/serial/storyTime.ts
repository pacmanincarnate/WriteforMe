/**
 * @module domain/serial/storyTime
 * Story time is separate from release order, so an arc may sit before or beside one already published.
 * What a character knew at an earlier time is the belief graph's job (domain/continuity/epistemicGraph),
 * not this module's; this only checks that an arc's place in time is consistent.
 */

import type { ArcTime } from './types';

/**
 * Returns problems with where an arc sits in story time:
 * - a flashback must end before the arc it sits behind starts, or it contradicts published text;
 * - any published arc whose days overlap makes those scenes canon for this one, whatever the mode says;
 * - a flashback should answer or recast an open thread, or the reader is being handed backstory, not story.
 */
export function checkArcTimeFits(arc: ArcTime, published: Array<{ number: number; time: ArcTime }>): string[] {
    const problems: string[] = [];
    const start = arc.start.day;
    const end = arc.end?.day ?? arc.start.day;
    if (arc.mode === 'flashback') {
        const later = published.find((a) => a.number === arc.relative_to_arc);
        if (!later) problems.push(`arc ${arc.relative_to_arc} not found`);
        else if (end > later.time.start.day) problems.push(`flashback ends on day ${end}, after arc ${later.number} starts on day ${later.time.start.day}`);
        if (!arc.reframes?.length) problems.push('flashback names no thread it answers or recasts');
    }
    if (arc.mode !== 'forward') {
        for (const a of published) {
            const aEnd = a.time.end?.day ?? a.time.start.day;
            if (start < aEnd && end > a.time.start.day) problems.push(`overlaps arc ${a.number} (days ${a.time.start.day} to ${aEnd}): its published scenes are fixed`);
        }
    }
    return problems;
}
