# Content dial

A setting per story for how far it goes on the page. Until now the only way to say "keep the
violence implied" or "close the door on sex scenes" was to write it in the author's note and hope
every agent read it the same way.

## Where it is

On the story's dashboard, under the author's note: **Content Dial**.

- **Preset**: Not set, Restrained, Mature or Unflinching. A preset puts every category at one
  level.
- **Five categories**, each from 0 to 3: violence, sex, horror, cruelty, drugs and drink.

  | Level | Means |
  | --- | --- |
  | 0 Off the page | If it happens, it happens between scenes |
  | 1 Restrained | Implied, with little physical detail |
  | 2 Mature | Shown plainly, without lingering |
  | 3 Unflinching | Explicit and on the page, in full |

- **Always fade to black**: topics that may still happen in the story but are never shown,
  whatever the levels say: torture, sexual violence, harm to children, self-harm, mutilation,
  executions, slavery, addiction, disease, sacrifice.

Changing one category after picking a preset shows the preset as Custom. Picking a preset again
keeps the fade-to-black topics. "Not set" removes the dial.

## What the model is told

A story with a dial adds a `<content_limits>` block, right after the author's note, to every
prompt that carries the note: the story arc, the acts, the scene blueprints, the continuity
context and the scene-writing prompt. Planning is told as well as writing, so a scene is not
planned around something the page will not show.

The block states each category's level in the words of the table above, lists the fade-to-black
topics, and says that a limit is a ceiling and not a target.

A story with no dial sends nothing, so existing stories are written exactly as before.

## Limits

- The dial is an instruction to the model. Nothing in code checks the finished scene against it.
- A model service's own content rules still apply, whatever the dial says.
- Review and repair prompts do not carry the block.

## Where the code is

- `src/domain/story/contentDial.ts`: levels, topics, the stored dial and the prompt block.
- `src/domain/story/structure.ts` (`getAuthorNoteXml`): where the block joins the prompts.
- `src/views/dashboard/ContentDialPanel.tsx`: the panel.
- `tests/unit/content-dial.test.tsx`

From the intensity settings in Prospero's Dungeon (`dungeon/tone.py`), without the parts that
belong to a game: worlds setting a default, and levels changing which events can be drawn.
