# Restore points and daily backups

A model can rewrite a scene worse than it was, and a reset throws work away on purpose. Until now
the only ways back were the directive workspace's single Undo and the rolling files the local disk
vault keeps, which the app has no screen for. Restore points give every story a way back that
works in the browser alone.

## What is kept

A restore point is a whole copy of the story.

- **Undo points** are taken just before something rewrites the story:
  rewriting a scene that already has prose, re-planning the scenes of a sequence, an editorial
  pass, applying a directive plan, a manual slop clean, resetting a stage, and restoring an
  earlier version. The newest 10 are kept.
- **Daily backups.** The first save of each day keeps the story as it stood before that save.
  One a day is kept for the last seven days that have one, then one a week for the four weeks
  before those.
- **Saved by you.** "Save A Restore Point" keeps a copy on request. The newest 10 are kept.

An empty story is never copied. Taking a restore point never calls a model.

## Restoring

Settings, Danger tab, "Restore Points & Daily Backups" lists the open story's points with their
age, word count and scenes written. Restore asks once, then puts the story back. The version being
replaced is kept first as its own undo point, so a restore can be undone.

## Where they live

In this browser, in the IndexedDB database `EllipsisRestoreStore`. They do not travel with a JSON
export and are not written to the local disk vault (which keeps its own rolling files under
`data/backups`). Deleting a story deletes its restore points; a factory reset deletes them all.
If the browser runs out of room, the oldest half of that story's points are given up to make space,
and if that is not enough the new point is skipped. A failed restore point never blocks the save
or the step it was protecting.

## Where the code is

- `src/domain/story/restorePoints.ts`: which points to keep, when a daily backup is due.
- `src/services/storage/restorePointStore.ts`: the store.
- `src/pipeline/restorePoint.ts`: `markRestorePoint`, called by the steps listed above.
- `src/views/settings/SettingsRestorePoints.tsx`: the panel.
- `tests/unit/restore-points.test.tsx`.

## Limits

- Scene audio and images are not part of a restore point. Restoring an older text leaves audio
  made from the newer text in place.
- Copies are whole stories, so a long novel's points can add up to tens of megabytes.
