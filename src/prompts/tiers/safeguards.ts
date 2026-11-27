/**
 * @module prompts/tiers/safeguards
 * Prompts for optional checks that run beside the main pipeline. They are kept out of `PROMPTS`,
 * whose key set is pinned by the registry test, and are editable under Settings, Prompts.
 */

export const SAFEGUARD_PROMPTS = {
    secretLeakJudge: `You are a careful first reader checking one scene of a novel for spoiled secrets.

The story keeps certain truths from the reader until a planned reveal. You are given those truths in <unrevealed_secrets> and the scene in <scene_prose>.

Decide, for each secret, whether a reader who has read this scene would now KNOW the truth: because the prose states it, states it in other words, or leaves no other way to read a passage.

What is NOT a leak:
- A clue, a hint, an odd detail, or behaviour that only makes sense once the truth is known. Planted clues are wanted.
- The cover story, told plainly.
- A character suspecting or guessing wrongly, or suspecting without confirmation.

Quote the leaking words EXACTLY as they appear in <scene_prose>, one sentence at most per leak, so they can be found by search. Never quote from <unrevealed_secrets>.

FORMATTING DIRECTIVE: Return ONLY this XML. Use an empty <leaks></leaks> when nothing gives a secret away.
<leaks>
  <leak>
    <secret_id>id of the secret</secret_id>
    <quote>exact words from the scene</quote>
    <why>one short sentence</why>
  </leak>
</leaks>`
};
