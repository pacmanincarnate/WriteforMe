# Serial fiction

A serial is an ongoing story told in arcs and released in episodes. Side plots open and close along
the way, and the cast can change between arcs. This builds on book series (`docs/BOOK_SERIES.md`):
**a serial is a series whose books are arcs.**

A story that is not a serial is untouched. Every entry point below hands a standalone story or a
plain series book straight to the series code, so their prompts and saved files are unchanged.

## How it sits on the series model

| Serial idea | Where it lives |
| --- | --- |
| An arc | One book of the series: one story document with `series.book_number` as the arc number, planned with the usual 3 acts and 8 sequences |
| The arc's main plot | The book's own A-story (`threads[0]`). The series ending contract already closes it |
| Long-running and side threads | The series ledger, `Story.open_threads`. There is one ledger, not two |
| What the serial adds per thread | `Story.serial.thread_meta[id]`: scope, the episode it opened and last moved, how often it moved, whether it is parked |
| Cast roster, episodes, story time, policies | `Story.serial` |
| Starting the next arc | The series "Start Book N" action. The serial state is carried over with it |

A thread's scope is `series` (the spine, which an arc moves and does not close) or `side` (arc-sized,
opens and closes every few episodes). A thread the story opened on its own, or one the series plan
pays off in this arc, is a side thread. Everything else the Series Architect planned is spine.

## Episodes

Scenes are planned one sequence at a time, so episodes are laid over sequences. Each sequence holds
`episodesPerSequence` episodes (default 2, range 1 to 3) and its scenes are split evenly between
them, in order. An arc of 8 sequences is therefore 16 episodes, known before a scene is planned,
which is what lets the scheduler tell an arc's opening from its wrap-up and its finale. Episode
numbers run on across arcs.

## What happens when

1. **Setup.** "Run it as a serial" creates the series header and `serial`, with the cast rotation
   chosen there: `anchored` (the lead is in every arc, the rest rotate) or `ensemble` (anyone may
   sit an arc out).
2. **Scene planning** (`generateScenes`). `planSerialSequence` plans the sequence's episodes and the
   planner prompt gets one `<serial_context>` per episode in place of the series thread schedule:
   which threads to advance, close or park, slots for new side threads, who is due on the page and
   how the episode ends. The plans are saved with the scenes. A thread a plan closes is marked as a
   pay-off, so the series ending contract allows it. From the wrap-up on, the next arc's cast is
   picked so this arc can settle the business of whoever is leaving.
3. **Prose.** Each scene gets the plan of its own episode and is told whether it ends the episode.
4. **Continuity pass.** `applyLongformSceneReport` runs the series report and then moves the serial
   fields: a thread counts as moved once per episode, closes are dated, new side threads are
   accepted up to the serial's own thread policy (not the book-length limit), and the roster and the
   episode list are updated. The model may also report `serial_thread_notes` with `parked` (an owner
   left on the page and the reader was told what is unfinished) or `kept_warm`. When an episode ends
   without a close or an exit it planned, the user is told.
5. **Next arc.** `carrySerialToNextArc` continues the episode count, keeps the serial fields of open
   threads and hands the cast step a `<serial_cast_plan>`: who to cast, who is resting, how many
   new characters. The roster then follows the cast the arc was really given. A thread parked in an
   earlier arc is picked up again when its owner is back, and must be touched before it can close.

## The scheduling rules

`src/domain/serial/` is deterministic bookkeeping. The model still invents what happens.

- An arc has phases: opening, middle, wrap-up (the last 3 episodes) and finale.
- The main plot is in every episode and closes on the finale. The finale also moves a spine thread
  and ends on a reveal.
- Side threads stay near a target of 3 open (range 2 to 4). One closes only after at least 2
  episodes moved it, and closes are spaced out.
- A departing character's threads are closed, or parked on the finale with an on-page exit. A thread
  with no owner on stage that was never parked raises a warning, because that is a dropped plot. At
  most 3 threads should be parked at once.
- No new side threads open in the last 2 episodes of an arc.
- Seats in the next arc go by `oldest_thread` (default), `longest_absent` or `balanced`. With
  `everyoneOwnsThread` on, every core or supporting character on stage owns or co-owns an open thread.
- Episode endings vary: cliffhanger, reversal, decision, reveal, quiet.

| File | Purpose |
| --- | --- |
| `src/types/serial.ts` | Shapes. `SerialThread` extends the series `OpenThread` |
| `types.ts` | Default thread and cast policies |
| `scheduler.ts` | `scheduleEpisode` and `scheduleAhead` |
| `threads.ts`, `cast.ts` | Ledger helpers, cast rotation, `reassignThreadsOf` for a character who dies or retires |
| `story.ts` | The join to a story: episodes over sequences, roster sync, planning, prompts, scene reports, the next arc, the dashboard summary |
| `promptBlock.ts` | The `<serial_context>` block |
| `src/prompts/tiers/serial.ts` | The editable instruction wording |
| `storyTime.ts` | `checkArcTimeFits` for flashback and parallel arcs |

## In the app

- Setup: "Run it as a serial" with the cast rotation choice.
- Dashboard: a read-only Serial card with the arc, episodes written, phase, threads grouped as side,
  long-running and on hold, who is on stage and who is resting, and the scheduler's warnings.

## Editable wording

A serial has no model call of its own, so there is no "serial architect" prompt. The episode plan is
worked out by the app and rides along in the scene planner, Writer and Archivist prompts. The fixed
instructions that travel with it are editable under Settings, Prompts, in the "Serial fiction" group
(`SERIAL_PROMPTS` in `src/prompts/tiers/serial.ts`): the episode planner, the episode writer and the
thread tracking wording. The plan itself is not editable text.

## Not built yet

- Interludes between arcs. The scheduler plans them; nothing in the app writes a standalone one.
- Editing: changing policies, parking or handing over a thread, resting a character or marking one
  dead from the dashboard.
- Flashback and parallel arcs. `checkArcTimeFits` exists, but an arc is always `forward`. Flashback
  continuity should query the existing belief graph (`src/domain/continuity/epistemicGraph.ts`),
  which first needs scene coordinates that order scenes across arcs.
- Episode grouping in the reader and in exports.
- The Series panel still says "Book" where a serial would say "Arc".

## Tests

```
npx vitest run tests/unit/domain-serial.test.ts tests/unit/domain-serial-story.test.ts tests/unit/pipeline-serial.test.ts tests/unit/views-serial-panel.test.tsx
```

`domain-serial.test.ts` runs the scheduler over four arcs with an interlude. `domain-serial-story.test.ts`
writes a whole 16-episode arc through the story join and starts the next one.
