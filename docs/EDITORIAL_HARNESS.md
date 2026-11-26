# Editorial harness: how an edit gets in (and stays out)

The harness (Editorial view, step 21, and the last Autopilot pass) critiques the drafted
manuscript and then rewrites small spans of it. Because it changes the author's prose, its job is
as much "never damage the text" as "improve it". This page lists the rules the code follows.
Code: `src/pipeline/editorialHarness.ts` (orchestration) and `src/domain/editorial/` (the steps).
Tests: `tests/unit/editorial-harness-safety.test.ts`.

## The flow

1. **Critique.** Telemetry, the blind-reader pass and the investigators produce dossiers; the
   tribunal scores each one and turns approved ones into tickets; the planner groups tickets into
   transactions in three waves.
2. **Revise.** Each transaction runs through `runHarnessTransaction`: the editor model proposes a
   replacement, four gates check it, and failures feed back into up to three rounds. Full runs and
   the per-transaction "Apply" / "Re-Run" buttons share this one function.
3. **Merge.** Committed edits are written back to the story.

## Rules

**Critique**

- The tribunal reads `<RubricScores>` in any attribute order. A judge's explicit veto or
  "informational only" ruling stands even if the scores add up to approval.
- A ticket uses the judge's `<ProblemStatement>` and `<SurgicalDirective>` when given, since that
  text is written for the editor and says what to preserve. The investigator's text is the fallback.

**Applying an edit**

- If the text a ticket quoted is no longer in the scene (an earlier edit or the author changed
  it), the transaction is `SKIPPED_STALE`. It is not retried, and the anchored paragraph is never
  overwritten. (Before, it replaced the whole paragraph with the new text.)
- If the model replies without a usable `<ReplacementSpan>`, or quotes an `<OriginalSpanVerifier>`
  that doesn't exist in the scene, the round fails and the next round is told exactly what was
  wrong. The offline regex repair is only used when deep LLM review is off or the model call fails.

**Gates**

- Gate 2: for slop tickets, the flagged phrases have to be gone from the target paragraph.
  Not adding new slop is not enough.
- Gate 4 (arbiter) is sent the Author Voice DNA and Aesthetic Constitution it is told to judge
  against. It approves only with an explicit `APPROVE_COMMIT`, a ticket it agrees is resolved,
  and a voice score of at least 5/10. A reply with no verdict, or a failed call, does not commit.
  The arbiter is skipped for a round that already failed Gates 1 to 3.

**Merging and undo**

- A scene the author edited while the harness was running keeps the author's text, and those
  edits are marked `SKIPPED_CONFLICT`. If the author switched stories, the results are saved to the
  story the run started on.
- "Re-Run Patch" on a committed edit starts again from the text before that edit. If the retry
  fails, the earlier edit stays.
- "Revert" undoes one edit and keeps every other change to the scene. If that can't be done
  exactly, it refuses rather than restoring an old snapshot over newer work.
- "Revert all" restores only the scenes the harness edited (`touchedProseKeys`). Scenes it never
  touched, including scenes written later, are left alone. Each run snapshots every scene fresh,
  except scenes that still hold edits from an earlier run.
