# Import character cards and lorebooks

Characters and world notes made for chat apps can be brought into a story instead of being typed
again. Everything is read in the browser. No model is called and nothing is sent anywhere.

## Character cards

On the **Cast** page, press **Import Card** and pick a file.

| File | What is read |
| --- | --- |
| `.json` | Character Card V1, V2 or V3, Pygmalion, Backyard / Faraday |
| `.png` | A V2 or V3 card stored inside the picture (SillyTavern, Chub, Agnai, RisuAI and most card sites) |
| `.charx` | A CHARX archive: `card.json` plus pictures |

The card becomes a **supporting** cast member:

- The description and personality become the character's history and deep profile. The card's
  example dialogue goes into the deep profile too, under "How they talk", and its first line
  becomes the voice sample.
- `{{char}}` is written out as the character's name and `{{user}}` as "the other person". Other
  placeholders are removed.
- A PNG card is also used as the portrait. A CHARX file's main picture is used the same way.
- The story-shaping fields a card does not have (role, flaw, desire, the Four-Corner slot) get the
  same starting text as a character added by hand. Edit them on the card afterwards.

A card is written for chat, so some parts have no place in a novel and are **not** brought over:
the scenario, the first message and other greetings, the system prompt and post-history
instructions, the creator's notes and app extensions. The message shown after the import names the
ones the card had.

A card whose name is already in the cast is refused, so a second import cannot make a double.

## Lorebooks

On the **Lore** page, press **Import Lorebook** and pick a file.

| File | What is read |
| --- | --- |
| SillyTavern world info (`.json`) | Each entry's content, its comment as the title, its keys |
| NovelAI lorebook (`.lorebook`, `.json`) | Each entry's text, display name, keys |
| Agnai memory book (`.json`) | Each entry's text, name, keywords |
| RisuAI lorebook (`.json`) | Each entry's content, comment, keys (folders are skipped) |
| A character card (`.json`, `.png`, `.charx`) | The lorebook carried inside the card |

Each entry becomes one lore item, true from Act 1, Scene 1, and is indexed like any other lore.
The entry's keywords are kept as its related terms. An entry with no title is named by its first
two keywords, or by its first few words.

What does not carry over:

- Entries that are switched off or empty are left out. The message says how many.
- Lore here is found by meaning, not by keyword match, so keyword rules are not kept: search
  patterns, secondary keys, always-on flags, order, depth, timing and scripts. A keyword written
  as a search pattern is dropped and the entry's text is kept.

Importing a card does not import its lorebook by itself. The message after a card import says when
the card has one; pick the same file under **Import Lorebook** to add it.

## Limits

Files over 50 MB are refused, as are lorebooks with more than 5,000 entries. A PNG whose card is
stored compressed (rare) is reported as having no card.

## Where the code is

- `src/domain/imports/cards.ts` and `lorebooks.ts`: the readers, with no browser or app code.
- `src/services/documents/cardFiles.ts`: opens the picked file (JSON, PNG, CHARX).
- `src/views/cast/CastView.tsx` and `src/hooks/useLoreImport.ts`: the two buttons.
- `tests/unit/card-import.test.tsx`
