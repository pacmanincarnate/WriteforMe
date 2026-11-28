# Build a world from a pitch

On the **Lore** page, open **Build a world from a pitch**, describe the world in a few sentences, pick a size and press **Build World**. The idea comes from Prosperos Worldsmith's new-world wizard, which asks for a world in parts and checks each part in code before asking for the next.

## How it is built

The world is written in three parts, each one model call on the structure model:

1. **The land.** 1 to 5 regions, and places worth setting a scene in (4 to 6 for a small world, 6 to 10 for medium, 10 to 14 for large).
2. **The peoples and factions.** 1 to 5 peoples, and factions whose goals pull against each other (2 to 3, 3 to 5, or 4 to 6 by size).
3. **The history and rules.** 3 to 8 history entries, and 2 to 6 hard limits of the world.

Each answer is one JSON object. Before the next part is asked for it is checked in code (`worldPartProblems` in `src/domain/lore/worldBuilder.ts`):

- The counts are in range, every entry has a name and a text, and nothing is over length or listed twice.
- Every place is in a region that exists, and every region has a place.
- A faction only holds places the land has, and only names rivals and allies that are factions in the same answer. It cannot be its own rival, or have the same faction as both rival and ally. At least one faction has a rival.

A part with problems is asked for once more, with the problems listed. If the second answer still has problems, the build stops and nothing is added. Each later part is shown the parts already accepted, so the factions use the real place names and the history is about the real factions.

The model is also shown the story's title, genre and tone, and the topics of the lore the story already has, so the new world does not repeat or contradict them.

## What you get

The finished world converts into story lore (one entry for each region, place, people, faction, history entry and rule), is processed and indexed through `ingestLoreBatch` like initiation documents, and is added directly to `story.lore` (skipping topics already present).

The structured world draft is also saved on `story.generated_world`, and **Overview** displays a **View Generated World** button to inspect the regions, places, peoples, factions, history, and rules at any time.

## Cost

Three model calls, or up to six when parts have to be asked for again (plus RAG indexing for the new lore entries). Stop works as usual and leaves nothing behind.

## Limits

- It writes the world, not characters, plot or secrets.
- It has been tested with unit tests and a faked model. It has not been run against a real model, so how often a real model needs the second try is not known.
