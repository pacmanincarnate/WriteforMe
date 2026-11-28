import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { linkSheetRelationships, readCharacterSheets, sheetCharacterName, sheetToCastMember } from '@/domain/imports';
import { CastView } from '@/views';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ILSE = `# Ilse

**Name:** Ilse Varga
**AKA:** Ferrywoman, Knots (crew only, private)
**Type:** Character - Ferry pilot
**Species:** Human
**Age:** 41
**Hair:** grey, tied back, never cut
**Personality:** dry, patient, superstitious
**Vulnerability:** cannot leave a debt unpaid
**Goals (Immediate):** get the ferry through the flood season
**Goals (Long Term):** buy the east landing
**Lucky Number:** nine

**Voice:** Short sentences. She answers the question after the one you asked.

**Physical Expression:**
Laugh: one breath through the nose.
Anger: she coils rope.

**Description:** Ilse stands like the deck is moving. It usually is.

**Summary:** Ilse took the ferry over from her aunt.

She has not missed a crossing in nine years.

## Relationship Matrix

**Blood Relations:** Tomas (younger brother, 6 years), Petra Varga (Aunt)
**Rival:** Tomas, in matters of the river; friendly but real
**Significant Trust:** Oren

### Secrets

**True Secret:** The ferry's licence lapsed two winters ago.

**Inner Desire:** To be owed nothing and owe nothing.
`;

const TOMAS = `# Tomas Varga

**Age:** 35
**Personality:** quick, generous, careless with money

## Relationship Matrix

**Blood Relations:** Ilse (older sister)
`;

describe('Markdown character sheets', () => {
    it('reads labelled lines, their continuation lines and their headings', () => {
        const [sheet, ...rest] = readCharacterSheets(`\uFEFF${ILSE.replace(/\n/g, '\r\n')}`, 'Character_Ilse.md');
        expect(rest).toHaveLength(0);
        expect(sheet.title).toBe('Ilse');
        expect(sheetCharacterName(sheet)).toBe('Ilse Varga');
        const field = (label: string) => sheet.fields.find((f) => f.label === label);
        expect(field('Physical Expression')?.value).toBe('Laugh: one breath through the nose.\nAnger: she coils rope.');
        expect(field('Summary')?.value).toBe('Ilse took the ferry over from her aunt.\n\nShe has not missed a crossing in nine years.');
        expect(field('Rival')?.section).toBe('Relationship Matrix');
        expect(field('True Secret')?.section).toBe('Secrets');
    });

    it('reads several sheets from one file, a sheet with no heading, and plain labels', () => {
        expect(readCharacterSheets(`${ILSE}\n${TOMAS}`).map(sheetCharacterName)).toEqual(['Ilse Varga', 'Tomas Varga']);
        const [plain] = readCharacterSheets('Age: 12\nHair: red\nfreckles too', 'Character_Mina_Holt.md');
        expect(sheetCharacterName(plain)).toBe('Mina Holt');
        expect(plain.fields.map((f) => [f.label, f.value])).toEqual([['Age', '12'], ['Hair', 'red\nfreckles too']]);
        const [prose] = readCharacterSheets('# Bo\n\nBo keeps bees.\n\nBo hates honey.');
        expect(prose.fields).toEqual([{ label: 'Notes', value: 'Bo keeps bees.\n\nBo hates honey.', section: '' }]);
        expect(readCharacterSheets('   \n')).toEqual([]);
    });

    it('places the known labels on the cast member and keeps the rest as notes', () => {
        const member = sheetToCastMember(readCharacterSheets(ILSE)[0], 'char_1');
        expect(member).toMatchObject({
            id: 'char_1',
            name: 'Ilse Varga',
            aliases: ['Ilse', 'Ferrywoman', 'Knots'],
            role: 'Ferry pilot',
            corner_role: 'SUPPORTING',
            logline: 'Ilse stands like the deck is moving.',
            core_flaw: 'cannot leave a debt unpaid',
            core_desire: 'To be owed nothing and owe nothing.',
            appearance: 'Species: Human\nAge: 41\nHair: grey, tied back, never cut'
        });
        expect(member.details.history).toContain('She has not missed a crossing in nine years.');
        expect(member.details.goals).toBe('Goals (Immediate): get the ferry through the flood season\nGoals (Long Term): buy the east landing');
        expect(member.details.sheet_relationships).toHaveLength(3);

        const profile = member.details.deep_profile;
        expect(profile.match(/^[A-Z ]{5,}$/gm)).toEqual([
            'DESCRIPTION', 'APPEARANCE', 'PERSONALITY', 'GOALS', 'HOW THEY TALK AND MOVE', 'HISTORY', 'RELATIONSHIPS', 'SECRETS', 'NOTES'
        ]);
        expect(profile).toContain('NOTES\nAKA: Ferrywoman, Knots (crew only, private)\nType: Character - Ferry pilot\nLucky Number: nine');
        expect(profile).toContain("SECRETS\nTrue Secret: The ferry's licence lapsed two winters ago.");
        // Every value in the sheet is somewhere on the member.
        for (const field of readCharacterSheets(ILSE)[0].fields) {
            if (field.label !== 'Name') expect(profile).toContain(field.value);
        }
    });

    it('leaves a flaw or desire that runs to a passage in the profile only', () => {
        const long = 'She wants the river. '.repeat(30).trim();
        const member = sheetToCastMember(readCharacterSheets(`# Ada\n**Inner Desire:** ${long}`)[0], 'c');
        expect(member.core_desire).toBe('Pursuing their personal goal within the story world.');
        expect(member.details.deep_profile).toContain(long);
    });

    it('links the people a sheet names to cast members, by name, part of a name or alias', () => {
        const cast = [ILSE, TOMAS].map((text, i) => sheetToCastMember(readCharacterSheets(text)[0], `c${i}`));
        const first = linkSheetRelationships(cast, { 'Tomas Varga->Ilse Varga': { current: 'Written by hand.', trust_level: 2 } });
        expect(first.added).toBe(1);
        expect(first.relationships['Ilse Varga->Tomas Varga']).toEqual({
            current: 'Blood Relations (younger brother, 6 years); Rival (in matters of the river; friendly but real)',
            trust_level: 8,
            history: []
        });
        // Text already on the Relationships page is not replaced, and people not in the cast are not invented.
        expect(first.relationships['Tomas Varga->Ilse Varga'].current).toBe('Written by hand.');
        expect(Object.keys(first.relationships)).toHaveLength(2);

        // A later arrival is linked from the lines the earlier sheet kept.
        const oren = { name: 'Oren Pike', details: {} };
        const later = linkSheetRelationships([...cast, oren], first.relationships);
        expect(later.added).toBe(1);
        expect(later.relationships['Ilse Varga->Oren Pike']).toMatchObject({ current: 'Significant Trust', trust_level: 8 });
        expect(linkSheetRelationships([...cast, oren], later.relationships).added).toBe(0);

        // A first name two people share links to neither.
        const twins = [cast[0], { name: 'Tomas Reed' }, { name: 'Tomas Varga' }];
        expect(Object.keys(linkSheetRelationships(twins, {}).relationships)).toEqual([]);
    });
});

describe('Markdown character sheets in other layouts', () => {
    const member = (text: string, filename = '') => sheetToCastMember(readCharacterSheets(text, filename)[0], 'c');

    it('reads headings with prose and bullets under them', () => {
        const got = member(`# Character Sheet: Dov Hale

## Basics
- Nicknames: Dovie, The Clerk
- Occupation: Tide clerk
- Eye color: green
- Hair Colour: black

## Physical Description
Tall and stooped, ink on both cuffs.

## Backstory
Dov counted tides for the Registry until the ledgers stopped adding up.

## Speech Patterns
Never finishes a sentence he started angry.

## Family & Friends
- Mother: Ilse Varga (estranged)

## What He Hides
He altered one entry himself.

## Pets
A one-eyed cat.
`);
        expect(got.name).toBe('Dov Hale');
        expect(got.aliases).toEqual(['Dovie', 'The Clerk']);
        expect(got.role).toBe('Tide clerk');
        expect(got.appearance).toBe('Eye color: green\nHair Colour: black\nPhysical Description: Tall and stooped, ink on both cuffs.');
        expect(got.details.history).toBe('Backstory: Dov counted tides for the Registry until the ledgers stopped adding up.');
        expect(got.details.sheet_relationships).toEqual([{ label: 'Mother', text: 'Ilse Varga (estranged)' }]);
        const profile = got.details.deep_profile;
        expect(profile).toContain('HOW THEY TALK AND MOVE\nSpeech Patterns: Never finishes');
        expect(profile).toContain('SECRETS\nWhat He Hides: He altered one entry himself.');
        expect(profile).toContain('Pets: A one-eyed cat.');
    });

    it('reads front matter, a table, and bold labels closed in other ways', () => {
        const got = member(`---
name: "Sera Quill"
aliases: [Quill, Red]
tags:
  - smuggler
  - pilot
---

| Field | Value |
| --- | --- |
| **Age** | 29 |
| Build | wiry |

**Fatal Flaw** - trusts a good story over a true one
__Wants:__ a ship with her own name on it
**Motivation**: pay off the Marrow debt
`, 'sera.md');
        expect(got).toMatchObject({
            name: 'Sera Quill',
            aliases: ['Quill', 'Red'],
            appearance: 'Age: 29\nBuild: wiry',
            core_flaw: 'trusts a good story over a true one',
            core_desire: 'a ship with her own name on it'
        });
        expect(got.details.goals).toBe('Motivation: pay off the Marrow debt');
        expect(got.details.deep_profile).toContain('tags: smuggler, pilot');
    });

    it('lets an unknown label take the place of its heading, and does not split prose on a colon', () => {
        const got = member('# Bo\n\n## Appearance\nCoat: oilskin, patched\n\n## History\nBo said one thing to the harbour master that night: no.');
        expect(got.appearance).toBe('Coat: oilskin, patched');
        expect(got.details.history).toBe('Bo said one thing to the harbour master that night: no.');
    });

    it('reads several labels on one line, numbered headings, rules, and a label that only its heading explains', () => {
        const got = member(`# Character Profile — Nell Ash

**Age:** 30 | **Status:** Harbour pilot, second class

---

## 1. Voice and Expression

**Description:** Low and even.
**Internal Monologue Style:** Lists. Always lists.
**Example (at ease):** I count the buoys twice, then once more for luck.

---

## 2. Skills
- **Knots:** every one in the book
- **Decision-Making Style:** slow, then all at once

## 3. The Secret
She cannot swim.
`);
        expect(got.name).toBe('Nell Ash');
        expect(got.appearance).toBe('Age: 30');
        expect(got.voice_sample).toBe('I count the buoys twice, then once more for luck.');
        const profile = got.details.deep_profile;
        expect(profile).not.toContain('---');
        expect(profile).toContain('PERSONALITY\nDecision-Making Style: slow, then all at once');
        expect(profile).toContain(
            'HOW THEY TALK AND MOVE\nDescription: Low and even.\nInternal Monologue Style: Lists. Always lists.\nExample (at ease): I count'
        );
        expect(profile).toContain('SECRETS\nThe Secret: She cannot swim.');
        expect(profile).toContain('NOTES\nStatus: Harbour pilot, second class\nSkills:\nKnots: every one in the book');
    });

    it('links names written with a possessive or other punctuation', () => {
        const cast = [
            { name: 'Ada Reed', details: { sheet_relationships: [{ label: 'Friends', text: "Bo's (since school); Cy." }] } },
            { name: 'Bo Marsh' },
            { name: 'Cy' }
        ];
        expect(Object.keys(linkSheetRelationships(cast, {}).relationships)).toEqual(['Ada Reed->Bo Marsh']);
    });
});

describe('Cast page: Import Characters with Markdown files', () => {
    let root: Root | null = null;
    afterEach(() => {
        act(() => root?.unmount());
        root = null;
        document.body.innerHTML = '';
    });

    it('brings in several sheets at once, links them, and leaves out a name already in the cast', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        type TestStory = { cast: Array<{ name: string }>; relationships?: Record<string, { current?: string }> };
        let story: TestStory = { cast: [{ name: 'Oren Pike' }] };
        const storyRef = createRef() as React.MutableRefObject<TestStory>;
        const showToast = vi.fn();
        const setStory = (updater: (prev: TestStory) => TestStory): void => {
            story = updater(story);
            storyRef.current = story;
        };
        const noop = vi.fn();
        const render = (): void =>
            act(() =>
                root!.render(
                    <CastView
                        view="cast" setView={noop} story={story as never} storyRef={storyRef as never} setStory={setStory as never}
                        isInspectorMode={false} selectedSequence={null} selectedScene={null} loadedImages={{}} portraitLoading={{}}
                        isAnyAudioPlaying={false} isAuditioningVoice={false} openEditModal={noop} openFormModal={noop}
                        showToast={showToast} findCastIndexForChar={() => 0} commitVoiceEditUpdate={noop}
                        generateCharacterPortrait={noop} uploadCharacterPortrait={noop} removeCharacterPortrait={noop}
                        handleRerollCharacterSeed={noop} handleResetCharacterReferenceText={noop}
                        testAuditionCharacterVoice={noop} stopAllAudioPlayback={noop}
                    />
                )
            );
        render();
        const input = host.querySelector<HTMLInputElement>('#characterCardFileInput')!;
        expect(input.multiple).toBe(true);
        expect(input.accept).toContain('.md');

        const pick = async (files: File[]): Promise<void> => {
            Object.defineProperty(input, 'files', { configurable: true, value: files });
            await act(async () => {
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        };
        const files = [new File([ILSE], 'Character_Ilse.md'), new File([TOMAS], 'Character_Tomas.md'), new File(['  '], 'empty.md')];
        await pick(files);
        await vi.waitFor(() => expect(story.cast).toHaveLength(3));
        expect(story.cast.map((c) => c.name)).toEqual(['Oren Pike', 'Ilse Varga', 'Tomas Varga']);
        expect(Object.keys(story.relationships || {}).sort()).toEqual([
            'Ilse Varga->Oren Pike', 'Ilse Varga->Tomas Varga', 'Tomas Varga->Ilse Varga'
        ]);
        expect(showToast).toHaveBeenLastCalledWith(
            'Imported "Ilse Varga", "Tomas Varga" as supporting characters. Linked 3 relationships by name. No character sheet found in: empty.md.',
            'success'
        );

        render();
        await pick([files[0]]);
        await vi.waitFor(() => expect(showToast).toHaveBeenLastCalledWith('Already in the cast, so left out: "Ilse Varga".', 'warn'));
        expect(story.cast).toHaveLength(3);
    });
});
