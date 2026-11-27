/**
 * @module domain/serial/promptBlock
 * The `<serial_context>` prompt block. It returns an empty string unless both a serial and an episode
 * plan are given, so every prompt for a standalone story or a plain series book is unchanged.
 */

import type { EpisodePlan, SerialState } from './types';

export function formatSerialContext(serial: SerialState | undefined, plan: EpisodePlan | undefined): string {
    if (!serial || !plan) return ''; // golden prompts unchanged
    const byId = new Map(serial.threads.map((t) => [t.id, t]));
    const line = (id: string) => {
        const t = byId.get(id);
        return t ? `<thread id="${t.id}" scope="${t.scope}" owners="${t.owners.join(', ')}">${t.title}: ${t.last_note ?? t.description}</thread>` : '';
    };
    // A look-ahead plan may name a thread that does not exist yet (one it expects an earlier episode to open).
    const block = (tag: string, ids: string[]) => {
        const lines = ids.map(line).filter(Boolean);
        return lines.length ? `<${tag}>\n${lines.join('\n')}\n</${tag}>\n` : '';
    };
    const time = serial.arc_time;
    return `<serial_context arc="${serial.arc_number}" episode="${plan.episode}" kind="${plan.kind}" phase="${plan.phase}" time_mode="${time.mode}" story_time="${time.start.label ?? `day ${time.start.day}`}">
${block('advance', plan.advance)}${block('close', plan.close)}${block('park', plan.park)}${block('keep_warm', plan.keep_warm)}${plan.open
        .map((o) => `<open_slot scope="${o.scope}" owners="${o.suggested_owners.join(', ')}"${o.grow_from ? ` grow_from="${o.grow_from}"` : ''}>${o.reason}</open_slot>\n`)
        .join('')}<due_on_page>${plan.due_on_page.join(', ')}</due_on_page>
<ending hook="${plan.hook}"/>
Move only the listed threads; others may be mentioned but not changed. A closed thread pays off on the page, not off stage.
A parked thread gets an exit: show its owner leaving and say plainly what is left unfinished.
</serial_context>\n\n`;
}
