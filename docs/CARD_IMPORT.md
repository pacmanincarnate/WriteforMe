# Import characters and lorebooks

Characters you already wrote as Markdown files, and characters and world notes made for chat
apps, can be brought into a story instead of being typed again. Everything is read in the browser. No model is called and nothing is sent anywhere.

## Character cards

On the **Cast** page, press **Import Characters** and pick a file, or several.

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

## Character sheets in Markdown

**Import Characters** also takes `.md`, `.markdown` and `.txt` files, any number at once. Each
`# Heading` starts a character, so one file can hold one character or a whole cast.

Sheets are written by hand and laid out differently by every author, so the reader is loose:

| Layout | Example |
| --- | --- |
| Bold label | `**Hair:** brown`, `**Hair** - brown`, `- **Hair:** brown` |
| Plain label | `Hair: brown`, `- Hair: brown` (in a sheet with no bold labels) |
| Heading and prose | `## Backstory` followed by paragraphs |
| Table | `\| Hair \| brown \|` |
| Front matter | `name: Sera Quill` between `---` lines at the top |

Lines after a label belong to it until the next label or heading.

A label is placed by the words in it, not by an exact name: "Hair Colour", "Eye color" and
"Physical Description" are all appearance; "Backstory", "Bio" and "Summary" are history.

| Goes to | Labels with words like |
| --- | --- |
| Name | name, full name; else the heading; else the file name |
| Other names (used to match dialogue to the speaker) | AKA, alias, nickname, goes by |
| Role | role, occupation, job, type |
| Appearance (used for portraits and scene pictures) | gender, species, age, height, build, hair, eyes, marks, clothing |
| Flaw and desire | flaw, weakness, vulnerability; desire, want (up to 400 characters, longer text stays in the profile) |
| Goals | goals, motivation, ambition |
| History | summary, history, background, backstory, bio |
| Deep profile | everything, grouped: description, appearance, personality, goals, how they talk and move, history, relationships, secrets, notes |

A label nothing recognises takes the place of the heading it sits under; with no such heading it
is kept under **Notes** in the deep profile. Nothing in the file is dropped.

The character comes in as **supporting**, like one from a card. Set the Four-Corner slot on the
card afterwards.

**Relationships.** Lines under a relationships heading (or labelled family, friends, rival,
partner, trust and so on) name other people. For each name that is in the cast, by full name, part
of a name or another name, an entry is added on the **Relationships** page, from this character to
that one, with the label and any note in brackets as its text. A relationship that already has
text is not changed. The lines are kept on the character, so importing someone they name later
links the two then. A name two cast members share links to neither.

**Secrets.** A sheet's secrets go into the deep profile, not the Secret Vault. A vault secret is
hidden from the Writer until its reveal, which is a plot decision the sheet does not make.

A character whose name is already in the cast is left out, and the message says so. Files over
2 MB are refused.

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

- `src/domain/imports/cards.ts`, `sheets.ts` and `lorebooks.ts`: the readers, with no browser or app code.
- `src/services/documents/cardFiles.ts`: opens the picked file (JSON, PNG, CHARX).
- `src/hooks/useCastImport.ts` and `src/hooks/useLoreImport.ts`: the two buttons.
- `tests/unit/card-import.test.tsx`, `tests/unit/sheet-import.test.tsx`
