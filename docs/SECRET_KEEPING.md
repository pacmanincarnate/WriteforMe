# Secret keeping

A secret in the Secret Vault has a truth and a planned reveal. Until the reveal, neither the Writer's prompt nor
the scene it writes should give the truth away. Two checks enforce that.

## 1. The scrub (code, no model call)

Before the reveal, the truth is taken out of the text the Writer is shown: the act mandate, each character's
interview and profile, the character state lines, and the previous scene's tail across a point-of-view change.

The scrub used to replace only the exact truth string. The same secret in another word order ("the ledger was
forged by Mara" for "Mara forged the ledger") went through. A unit test confirmed it before the fix.

It now also replaces any sentence that carries most of the truth's telling words:

- Telling words are the truth's words of four letters or more, minus filler words and cast names, with endings
  trimmed so "forged" and "forging" match.
- A sentence is replaced when it holds at least 60% of them, and at least two. A truth with only one or two
  telling words needs all of them.
- The rest of the field is kept.

Code: `src/domain/continuity/secretScrub.ts`.

`tests/unit/secret-privacy.test.ts` holds the sentinel tests. A made-up word is planted in a truth, the prompts are
built before the reveal, and the word must not appear in any of them. It must appear once the secret is revealed or
the story reaches the reveal sequence. Add a case there whenever a new prompt block shows cast or plot text to the
Writer.

## 2. The leak judge (one model call per scene)

Word matching cannot see a secret told in entirely different words. After a scene is written and polished, one
extra call (the review model) is shown the unrevealed truths and the scene, and asked which passages would leave a
reader knowing a truth. Clues, hints and the cover story are not leaks, and the prompt says so.

- The judge must quote the scene. A quote that is not in the scene is dropped, so it cannot invent a leak.
- If any leak stands, one surgical edit rewrites only those passages. It is accepted only if the quoted words are
  gone and less than a quarter of the scene changed.
- It fails open. If either call fails or the edit cannot be applied, the scene is kept, the pipeline log lists the
  passages, and a warning toast names the scene.
- No call is made when the story has no unrevealed secret at that point.

Turn it off under **Settings, Pipeline, Secret Leak Check**. The judge's wording is the "Secret leak judge" prompt
under Settings, Prompts.

Code: `src/pipeline/secretLeak.ts`, called from `writeSceneProse` between the polish pass and the slop gate.

## Limits

- The scrub can replace a sentence that shares the truth's words without telling it. It errs toward hiding.
- The judge has not been run against a real model. How often it flags planted clues is unknown.
- Only the Writer's inputs and output are covered. Planner prompts see secrets by design.
- Series secrets with a later reveal book rely on the same vault status and are covered the same way.
