# Name banks

EllipsisProse used to only ban stock AI names (Elara, Voss, Blackwood) and leave the model to pick the
replacement. The name banks give it real names to pick from, and catch the made-up shapes no list can hold.

Turn it off under **Settings, Pipeline, Real-Name Bank**. With it off, prompts and audits are exactly as before.

## What it does

1. **Offers names when a story is cast.** The concept prompt (Tier 0.1) gets a `<name_bank>` block: eight women's
   and eight men's names with ages, and spare family names. They are drawn for the time and place the concept
   reads as. A 58-year-old in Baltimore is a Lisa or a Kevin; a 24-year-old is a Brianna or a Tyler.
2. **Reads the setting from free text.** Words like "Victorian", "old west", "samurai" or "colony ship" pick the
   era. A country ("in Japan") makes that country's names the local ones. A people ("a Nigerian family in Houston")
   supplies half the names, and the place supplies the rest. A year ("1994") is the year ages count back from.
   With nothing to go on it is the modern United States.
3. **Fantasy peoples.** In a fantasy or medieval setting that mentions elves, dwarves, orcs and so on, the block
   adds a line of names for each (up to four peoples).
4. **Flags made-up names.** The name audit gains a hard rule, "Reads as a made-up name": a word on the shipped
   invented list, or one shaped like a model coinage (Kael-, Vael-, -yra, Ravencrest, Duskwhisper) that appears in
   none of the real lists. Names the author typed in the concept, author's note or lore are left alone.
5. **Swaps without a model call.** When the rename call fails twice, the replacement is drawn from the bank for
   the story's own setting, in the same shape as the old name (full name, given name or surname). Before this it
   came from six fixed names. The same story always draws the same replacement.

The rename prompt also lists eight bank names, so the model's first try is better.

## Where the code is

| Part | File |
| --- | --- |
| Data | `src/domain/names/tables/given_names.json`, `names.json` |
| Loading (lazy, own chunk) | `src/domain/names/banks.ts` |
| Era, country, people from text | `src/domain/names/place.ts` |
| Drawing one name | `src/domain/names/draw.ts` |
| Cast offer, replacements, prompt block | `src/domain/names/roll.ts` |
| Made-up-name detector | `src/domain/names/invented.ts` |
| Pipeline glue | `src/pipeline/nameBank.ts` |

The banks are about 1.5 MB of JSON. They are loaded on first use and are part of the offline precache.
The name audit is synchronous, so it uses the banks only once they are loaded; `runAgentWithEscalation`
and the concept step load them first.

Draws are seeded by the story id, so a story sees the same names on every run.

## Where the data comes from

Both files are copied unchanged from Prospero's Dungeon (`Program/dungeon/world/data/`), where the flow was ported
from Prospero's Dramatis (`dramatis/names.py`).

- `given_names.json`: popular given names per birth year or cohort and common family names for 26 cultures. US
  names from 1880 on are the Social Security Administration's public-domain lists. The rest are curated estimates
  written from general knowledge of published rankings, marked CC0. Each culture's `sources` entry says which.
- `names.json`: curated name groups per era (modern, Victorian, medieval, frontier, storybook, Edo Japan, Qing
  China, Ottoman, ancient Rome, Mughal India) and a `peoples` bank for fantasy kinds. CC0.

## Not built

- A "Roll a name" button in the cast editor.
- Naming minor characters by their own age and gender when they are spawned mid-story. They go through the audit
  and the bank-backed rename, but the scene planner is not handed names up front.
- Place names. The bank covers people only.
