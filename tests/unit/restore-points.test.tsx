import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    RESTORE_POINT_LIMITS,
    dailyBackupDue,
    restorePointAge,
    restorePointsToDrop,
    type RestorePointMeta
} from '@/domain/story';
import { RestorePointStore, restorePointStore, storyStore } from '@/services/storage';
import { SettingsRestorePoints } from '@/views/settings/SettingsRestorePoints';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 24 * 60 * 60 * 1000;
const NOON = new Date(2026, 10, 27, 12, 0, 0).getTime();

const point = (id: string, kind: RestorePointMeta['kind'], timestamp: number): RestorePointMeta => ({
    id,
    storyId: 's1',
    kind,
    label: id,
    timestamp,
    words: 100,
    scenes: 1
});

const storyWith = (text: string): Record<string, unknown> => ({
    id: 's1',
    title: 'The Glass Harbour',
    concept: 'A lighthouse keeper finds a door in the sea.',
    prose: { '0-0': { final: text } }
});

describe('which restore points are kept', () => {
    it('keeps the newest undo points and drops the rest', () => {
        const points = Array.from({ length: 14 }, (_, i) => point(`b${i}`, 'before', NOON - i * 60000));
        const drop = restorePointsToDrop(points);
        expect(drop).toEqual(['b10', 'b11', 'b12', 'b13']);
        expect(points.length - drop.length).toBe(RESTORE_POINT_LIMITS.before);
    });

    it('keeps one backup a day for seven days, then one a week for four weeks', () => {
        // Two backups a day for 60 days.
        const points: RestorePointMeta[] = [];
        for (let d = 0; d < 60; d++) {
            points.push(point(`d${d}-late`, 'auto', NOON - d * DAY));
            points.push(point(`d${d}-early`, 'auto', NOON - d * DAY - 3 * 60 * 60 * 1000));
        }
        const drop = new Set(restorePointsToDrop(points));
        const kept = points.filter((p) => !drop.has(p.id)).map((p) => p.id);
        expect(kept).toEqual([
            'd0-late', 'd1-late', 'd2-late', 'd3-late', 'd4-late', 'd5-late', 'd6-late',
            'd7-late', 'd14-late', 'd21-late', 'd28-late'
        ]);
    });

    it('does not let undo points push out backups, or the other way round', () => {
        const points = [
            ...Array.from({ length: 12 }, (_, i) => point(`b${i}`, 'before', NOON - i * 1000)),
            point('a0', 'auto', NOON - 5 * DAY),
            point('m0', 'manual', NOON - 40 * DAY)
        ];
        const drop = restorePointsToDrop(points);
        expect(drop).toEqual(['b10', 'b11']);
    });

    it('knows when today has no backup yet', () => {
        expect(dailyBackupDue([], NOON)).toBe(true);
        expect(dailyBackupDue([point('a', 'auto', NOON - DAY)], NOON)).toBe(true);
        expect(dailyBackupDue([point('a', 'auto', NOON - 60000)], NOON)).toBe(false);
        expect(dailyBackupDue([point('b', 'before', NOON - 60000)], NOON)).toBe(true);
    });

    it('says how old a point is in plain words', () => {
        expect(restorePointAge(NOON - 20000, NOON)).toBe('just now');
        expect(restorePointAge(NOON - 5 * 60000, NOON)).toBe('5 minutes ago');
        expect(restorePointAge(NOON - 3 * 60 * 60000, NOON)).toBe('3 hours ago');
        expect(restorePointAge(NOON - DAY, NOON)).toBe('yesterday');
        expect(restorePointAge(NOON - 3 * DAY, NOON)).toBe('3 days ago');
    });
});

describe('the restore point store', () => {
    let store: RestorePointStore;
    let n = 0;
    beforeEach(() => {
        store = new RestorePointStore(`RestoreTest${n++}`);
    });

    it('saves a copy, lists it newest first, and gives it back unchanged', async () => {
        const story = storyWith('The sea was a door.');
        const first = await store.add('s1', story, 'before', 'Before rewriting Scene 1.1', NOON);
        const second = await store.add('s1', storyWith('The sea was a wall.'), 'manual', 'Saved by you', NOON + 5000);
        expect(first?.words).toBe(5);
        expect(first?.scenes).toBe(1);

        // Changing the story afterwards must not change the copy.
        (story.prose as Record<string, { final: string }>)['0-0'].final = 'changed';
        const listed = await store.list('s1');
        expect(listed.map((p) => p.id)).toEqual([second?.id, first?.id]);
        expect(await store.load(first!.id)).toEqual(storyWith('The sea was a door.'));
        expect(await store.list('other')).toEqual([]);
    });

    it('skips an empty story and a repeat of the same undo point', async () => {
        expect(await store.add('s1', { id: 's1' }, 'before', 'x', NOON)).toBeNull();
        expect(await store.add('s1', storyWith('One.'), 'before', 'Before the editorial pass', NOON)).not.toBeNull();
        expect(await store.add('s1', storyWith('Two.'), 'before', 'Before the editorial pass', NOON + 1000)).toBeNull();
        expect(await store.add('s1', storyWith('Two.'), 'before', 'Before the editorial pass', NOON + 120000)).not.toBeNull();
        expect((await store.list('s1')).length).toBe(2);
    });

    it('prunes as it goes, and removes the copies with the list entries', async () => {
        const ids: string[] = [];
        for (let i = 0; i < 13; i++) {
            const made = await store.add('s1', storyWith(`Draft ${i}.`), 'before', `Step ${i}`, NOON + i * 1000);
            ids.push(made!.id);
        }
        const listed = await store.list('s1');
        expect(listed.length).toBe(RESTORE_POINT_LIMITS.before);
        expect(listed[0].label).toBe('Step 12');
        expect(await store.load(ids[0])).toBeNull();
    });

    it('takes one daily backup a day', async () => {
        expect(await store.backupIfDue('s1', storyWith('Day one.'), NOON)).not.toBeNull();
        expect(await store.backupIfDue('s1', storyWith('Later.'), NOON + 60 * 60000)).toBeNull();
        expect(await store.backupIfDue('s1', storyWith('Day two.'), NOON + DAY)).not.toBeNull();
        expect((await store.list('s1')).map((p) => p.kind)).toEqual(['auto', 'auto']);
    });

    it('forgets a story on request', async () => {
        await store.add('s1', storyWith('One.'), 'manual', 'a', NOON);
        await store.add('s2', { ...storyWith('Two.'), id: 's2' }, 'manual', 'b', NOON);
        await store.clearStory('s1');
        expect(await store.list('s1')).toEqual([]);
        expect((await store.list('s2')).length).toBe(1);
        await store.clear();
        expect(await store.list('s2')).toEqual([]);
    });
});

describe('saving a story', () => {
    it('keeps the version from before the first save of the day', async () => {
        await restorePointStore.clear();
        await storyStore.saveStory('daily-1', { ...storyWith('Yesterday.'), id: 'daily-1' });
        await vi.waitFor(async () => expect((await restorePointStore.list('daily-1')).length).toBe(1));
        await storyStore.saveStory('daily-1', { ...storyWith('Today, rewritten.'), id: 'daily-1' });
        const points = await restorePointStore.list('daily-1');
        expect(points.length).toBe(1);
        expect(points[0].kind).toBe('auto');

        await storyStore.deleteStory('daily-1');
        expect(await restorePointStore.list('daily-1')).toEqual([]);
    });
});

describe('the restore points panel', () => {
    const roots: Root[] = [];
    afterEach(() => {
        while (roots.length) {
            const root = roots.pop();
            act(() => root?.unmount());
        }
    });

    it('lists points and restores one, keeping a way back', async () => {
        await restorePointStore.clear();
        const old = { ...storyWith('The old ending.'), id: 'panel-1' };
        const current = { ...storyWith('The new ending, which is worse.'), id: 'panel-1' };
        await restorePointStore.add('panel-1', old, 'before', 'Before rewriting Scene 1.1');

        const setStory = vi.fn();
        const showToast = vi.fn();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        roots.push(root);
        await act(async () => {
            root.render(
                <SettingsRestorePoints story={current as never} setStory={setStory} showToast={showToast} loading={false} />
            );
        });
        await vi.waitFor(() => expect(host.textContent).toContain('Before rewriting Scene 1.1'));
        expect(host.textContent).toContain('Undo point');

        const click = async (label: string): Promise<void> => {
            const button = [...host.querySelectorAll('button')].find(
                (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label
            );
            expect(button, label).toBeTruthy();
            await act(async () => {
                button!.click();
            });
        };
        await click('Restore Before rewriting Scene 1.1');
        expect(setStory).not.toHaveBeenCalled();
        await click('Yes, Restore');
        await vi.waitFor(() => expect(setStory).toHaveBeenCalledTimes(1));
        expect(setStory.mock.calls[0][0]).toEqual(old);
        expect(await storyStore.loadStory('panel-1')).toEqual(old);

        // The version that was replaced is itself kept.
        const points = await restorePointStore.list('panel-1');
        const back = points.find((p) => p.label === 'Before restoring an earlier version');
        expect(back).toBeTruthy();
        expect(await restorePointStore.load(back!.id)).toEqual(current);
        host.remove();
    });
});
