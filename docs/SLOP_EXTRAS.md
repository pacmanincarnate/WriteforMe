# Slop audit extras

Three additions to the slop audit. None of them calls a model.

## 1. Repeated phrases

Word lists catch stock phrases everyone's model uses. They cannot catch the phrase this story's
model has fallen in love with ("the weight of it", "something like relief"), because it is not on
any list. `src/domain/slop/phrases.ts` finds any run of three to eight words that keeps coming back.

- A phrase never runs across a sentence break.
- A phrase made only of common words ("it was in the") is ignored, and so is one whose only
  uncommon words are cast or place names.
- When a long phrase repeats, the shorter phrases inside it are not reported again.

It is used in two places:

- **Inside a scene.** A new density rule, "Same phrase (3 to 8 words) 3+ times in a scene", adds a
  density warning to the slop report with the phrase and how often it was used. Like the other
  density rules it advises the repair pass; it does not force one by itself. It can be switched
  off with the other rules.
- **Across scenes.** Before a scene is written, the last six written scenes are checked for
  wording used in three or more of them, and the writer prompt gets a `<phrase_habits>` block
  naming up to five such phrases with an instruction not to use them. Settings, Pipeline,
  "Repeated Phrase Watch" turns this off.

## 2. Wikipedia's "Signs of AI writing"

Three word lists and five patterns from the Wikipedia field guide, taken from the pack the
Dramatis project built from it and trimmed for fiction:

- **Puffed-up significance** (flag): "stands as", "a pivotal moment", "enduring legacy" and so on.
- **AI vocabulary** (flag): "showcase", "garner", "crucial", "fostering" and so on.
- **Chatbot talking to its user** (hard): "as a language model", "my knowledge cutoff", "Would
  you like me to". The ones people really say to each other ("You're absolutely right") only count
  in narration, not inside quoted dialogue.
- Patterns: a chatbot preamble at the top ("Here's the revised scene:", hard), an unfilled
  placeholder in brackets ("[insert location here]", hard), an "-ing" tail that adds an analysis
  (", underscoring ..."), "not just X but Y", and "no X, no Y, just Z" (all flag).

Left out on purpose: words the audit already had, the guide's citation and markup signs, "rather
than", and a few entries that are ordinary in fiction ("quietly", "turning point", "a reminder of",
"enduring").

## 3. Patterns can carry their own regex

A pattern in the registry or in an imported pack may now have `regex` and `flags`. The scanner
runs it as written; a regex that does not compile is skipped. Patterns without a regex are still
the built-in ones matched by id. Exported packs keep the regex.

## Not included

The ranked list also named Dramatis's "fix only the marked words" repair. EllipsisProse already
repairs slop with surgical find-and-replace edits that leave the rest of the scene alone, so
nothing was ported for that.

## Where the code is

- `src/domain/slop/phrases.ts`, `src/domain/slop/registry.ts`, `src/domain/slop/scanner.ts`.
- `src/pipeline/proseContext.ts`: the `<phrase_habits>` block.
- `tests/unit/slop-extras.test.ts`.
