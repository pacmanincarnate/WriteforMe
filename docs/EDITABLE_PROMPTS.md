# Editable prompts

**Settings, Prompts** lists the core system prompts, one per agent, grouped by stage: concept and cast, story
structure, writing and revision, continuity and lore, the Editorial Desk, and book series. Open one to reword it.

## Rules

- **A save that would break the app is refused.** Each default shows the model which XML tags or JSON fields to
  write, and the app reads replies by them. A wording that drops one is not saved, and the message names what is
  missing. The tags and fields to keep are listed under the edit box. An empty prompt is refused too.
- **Edits survive updates.** Your wording is stored apart from the shipped one (browser storage key
  `ellipsisprose_prompt_overrides_v1`), with a fingerprint of the default it replaced. With the local server or the
  desktop app it is saved to disk with the other settings.
- **"New default" flag.** When an update changes a default you have reworded, yours stays in use and the prompt is
  flagged, with **Show default** to compare.
- **"Not in use" flag.** If an update's new default needs a tag your wording lacks, the default is used until you
  fix or reset yours. Your text is kept.
- **Reset to default** removes your wording. Saving text identical to the default does the same.
- A saved wording is used from the next model call. No reload is needed.

## What is and is not editable

Editable: every system prompt in the registry (`PROMPTS` in `src/prompts/`, `SERIES_PROMPTS` and `SERIAL_PROMPTS`), about sixty.
The Audio Drama Writer is built from the Writer's audio rules plus the editable "Audio drama writing modifier".

Not editable: the per-call user prompts that pipeline code builds (context blocks and output schemas, such as the
concept step's `<output_format_description>`), and shared protocol text that is baked into several prompts at
build time. Rewording a prompt changes only that prompt.

The guard reads only the system prompt. Where the output format is given in the per-call prompt, there is nothing
to drop, and the edit box lists no tags.

## Where the code is

| Part | File |
| --- | --- |
| List, checks, apply | `src/prompts/overrides.ts` |
| Storage and state | `src/hooks/usePromptOverrides.ts` |
| Settings tab | `src/views/settings/SettingsPromptsTab.tsx` |
| Applied at startup | `hydrateAllStoresFromStorage` in `src/stores/index.ts` |

`applyPromptOverrides` writes the wording in use into the live registry objects, which pipeline code reads at call
time. With no overrides the registry is byte-identical to the shipped prompts, which a unit test asserts.

## Not built

- Export and import of a set of reworded prompts.
- A diff view between your wording and a new default.
- Per-story prompts. Overrides apply to every story.
