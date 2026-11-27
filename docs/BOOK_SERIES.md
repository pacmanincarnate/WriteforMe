# Book series

A story can be one book of a series. Each book stays its own story document with its own arc,
acts, sequences and prose. What ties the books together is a small `series` header on the story,
a ledger of threads that run across books (`open_threads`), and secrets that are revealed in
layers over more than one book.

A story without a `series` header is a standalone book. Every series function returns early for
it, and every series prompt block is an empty string, so its prompts are unchanged.

## For the writer

- **Start a series.** On the Setup screen, tick "This is Book 1 of a series" and optionally name
  the series. Book 1 still tells a complete story. It also plants threads and secrets that it
  deliberately leaves open.
- **Start the next book.** On the Story Overview, the Series Plan card has a "Start Book N"
  button once the book has prose. It asks for a title and a few sentences on what the next book
  is about. A standalone story with prose shows a one-line "Start a sequel" card instead, which
  turns that story into Book 1.
- **Review the plan.** The Series Plan card shows the series question and theme, where the
  series is heading, this book's question and ending state, a sketch of the next book, the
  series secrets with their layers, and the thread board. Everything is editable there, the same
  way the story structure is. Generation never stops to wait for a review.
- **Thread board.** Each thread shows its promise, where it started, what this book should do
  with it and where it last moved. You can change its status or intent, add a thread or remove
  one. Threads the model opened on its own are marked.
- **Library.** A book of a series shows "Book 2 of 3" and the series title on its card.

## What carries over to the next book

| Carried | Not carried |
| --- | --- |
| Returning characters with their voice, cadence and history | Acts, sequences, scenes, prose |
| The earlier interview, as the base for an updated one | Corner roles: the character web is rebuilt |
| End-of-book character states and relationships | Per-book A/B/C threads |
| Lore, world primer and style | Clue schedules |
| Open series threads | Red herrings |
| Unrevealed secrets, and secrets only some characters know | |
| A recap of every earlier book | |

The lead may change between books, but must be a character the series already knows. The
concept step is asked again once if it picks a stranger; after that the choice is kept and a
warning is shown.

Lore is not distilled again and the previous book is not re-read: the recap and the carried
state stand in for it.

## How it works

### Data

`Story.series` (`SeriesInfo`, `src/types/series.ts`): series id and title, `book_number`,
`previous_books` (recaps), `returning_cast`, `carryover`, the rolling `plan` and any
`contract_violations`.

`Story.open_threads` (`OpenThread[]`): ids `S1`, `S2`, ... are stable for the whole series. They
are separate from the per-book `threads` (`T1`..`T3`), which the Story Arc step rewrites.

A series secret lives in `series.plan.secrets` with ordered layers. The next unrevealed layer
becomes a normal Secret Vault entry tagged `scope: 'series'`, `reveal_book`, `parent_secret_id`
and `layer`. A layer that belongs to a later book gets reveal anchor sequence 99
(`HIDDEN_REVEAL_SEQUENCE`), so the vault plants its clues and never reveals it.

### Pipeline

| Step | What series support adds |
| --- | --- |
| Concept and cast (0.1) | Series context, rules for the returning cast, lead check |
| Interviews (0.2) | Returning characters get the earlier interview and are asked what changed; voice is kept |
| Series Architect (new, before 1.1) | Writes or revises the rolling plan, sets each thread's intent, schedules threads over the sequences, adds the secret layers to the vault |
| Story Arc, Acts, Sequences | Series planning block; the vault and per-book threads keep their series entries |
| Scene blueprints and prose | Thread directives for the sequence; the ending contract in the last two sequences |
| Continuity pass | Reports thread movement, new thread candidates and secret events per scene |
| Story So Far | Sees the thread status table so no open thread drops out of the summary |

The plan is rolling: written books, the current book in full, and the next book as a sketch. It
is revised each time a book starts.

Limits scale with the length of the book (`seriesThreadLimits`): two open threads and one
pay-off under 30,000 words, up to five open and two pay-offs above 120,000.

### The ending contract

A series book must close its own story and leave the planned threads open. The contract
(`buildEndingContract`) lists what must close, what must pay off, which threads must stay open
and which secrets must stay hidden. It is enforced three ways:

1. The planner and the Writing Agent are shown the contract in the last two sequences.
2. An auditor model checks the sequence plan and the scene prose of the last two sequences.
   A violation sends the tier back for another attempt with the violation named. The final
   attempt is never blocked, so a stubborn audit cannot stall generation.
3. The continuity pass records anything that still got through in `series.contract_violations`,
   which the Series Plan card shows.

Cliffhangers are allowed. The book's own question still has to be answered.

### Where the code is

- `src/domain/series/`: pure logic (`threads`, `secrets`, `plan`, `contract`, `sequel`,
  `sceneReport`, `prompts`).
- `src/prompts/tiers/series.ts`: system prompts for the Series Architect, the contract auditor
  and the recap (`SERIES_PROMPTS`).
- `src/pipeline/series.ts` and `src/pipeline/sequel.ts`: the model calls and `startNextBook`.
- `src/views/dashboard/DashboardSeriesPanel.tsx`: the Series Plan card.
- Tests: `tests/unit/domain-series.test.ts`, `pipeline-series.test.ts`,
  `views-series-panel.test.tsx`.

## Not built yet

- Shared-world series with no continuing story. Uploading the earlier book as lore covers it.
- Regenerating a single part of the series plan from the card. The plan is rewritten when the
  story bible is regenerated.
- A view of the whole series across books in the Library.
