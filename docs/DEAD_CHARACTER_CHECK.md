# Dead character check

After a scene is written, the app checks it against the story's record of who is dead. If the scene has a dead character walking, talking or otherwise alive, the sentences that do so are rewritten. The idea comes from Prosperos Dungeon, which keeps its world state in code and checks the model's output against it.

## Who the record holds dead

`deadCharacters(story)` in `src/domain/continuity/deadCharacters.ts` reads, in this order:

1. The author's own mark, `deceased` on a cast member. `true` is dead. `false` is alive, whatever anything else says.
2. A cast member's `status` of `dead` or `deceased`.
3. The character's `physical_state` in `character_states`, which the story updates after each scene. It counts only when its opening words say so plainly ("Dead.", "Killed at the bridge"). Anything hedged ("presumed dead", "left for dead", "nearly killed", "dead tired") does not count.
4. A serial's roster entry with status `dead`.

The Cast page has a "Who Is Dead" panel that shows the record and why each name is on it. Each character can be set to Dead, Alive, or Follow the story.

## What the check does

1. In code, with no model call, it finds the paragraphs of the new scene that name one of the dead, by full name or by first name. A first name shared with a living cast member is not used, because it names no one for certain.
2. A dead character named anywhere in the scene's plan (its cast, events, objective, hinge moment and so on) is there on purpose, as a flashback, a ghost or a body, and is left alone.
3. If no paragraph is flagged, the check ends. A clean scene costs nothing.
4. Otherwise one call, on the review model, is given only the flagged paragraphs and the names. It rewrites the sentences that have the dead alive and returns `UNCHANGED` for paragraphs that only remember or mention them.
5. A rewrite is used only if it is one paragraph and between 0.4 and 1.8 times the length of the original. Everything else in the scene is kept letter for letter.

The check fails open. If the call fails or the answer cannot be used, the scene is kept as written. Stopping the model stops the check too.

The result is written to the pipeline log as "Dead Character Check".

## Turning it off

Settings, Feature Options, "Dead Character Check". It is on by default, because a story where no one has died never makes the call.

## Limits

- It catches names, not pronouns or titles. "The old king" walking about after his death is not caught unless the cast name is "The Old King".
- The record is only as good as the story state. A death the state update missed can be marked by hand on the Cast page.
- It has been tested with unit tests and a faked model. It has not been run against a real model.
