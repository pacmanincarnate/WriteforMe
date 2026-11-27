# Select a passage and rewrite it

Until now the choices for a weak paragraph were to edit it by hand or to rewrite the whole scene.
Now a selected passage can be rewritten on its own.

## How to use it

1. In the Writer, open a scene's Inline Serif Editor (double-click the prose, or use the edit
   button).
2. Select the passage in the text box.
3. Optionally type how it should change ("tenser", "shorter", "more of her fear").
4. Press **Rewrite Selection** (or Enter in the note box).

The rewritten passage replaces the selection in the editor's draft and is left selected so you can
see what changed. Nothing is saved yet: **Save Changes** keeps it, **Undo Rewrite** puts the old
passage back, and Cancel throws the whole draft away as before.

## What the model sees and returns

One call to the prose model. It is shown the selection, up to 1,500 characters on each side for
continuity, the scene's title and point of view, the story's genre and tone, and your note. It
returns only the passage. The passage is put into the scene in code, so the text outside the
selection cannot change, letter for letter.

An answer is refused, and asked for once more, when it is empty, the same as the original, far
longer than the original, or repeats the text around the selection. If the second answer is also
unusable, the passage is left as it was and the reason is shown.

A selection must be at least 12 characters and at most 8,000. The prompt is `passageRewrite`,
editable under Settings, Prompts.

## Where the code is

- `src/domain/editing/passageRewrite.ts`: selection, surroundings, checks, replacement.
- `src/pipeline/passageRewrite.ts`: the call.
- `src/views/writer/PassageRewriteBar.tsx`: the bar under the editor.
- `tests/unit/passage-rewrite.test.tsx`.

## Limits

- It works in the editor's text box only. Selecting text in the read view does nothing.
- The slop audit and continuity checks do not run on a rewritten passage until the scene is next
  audited.
