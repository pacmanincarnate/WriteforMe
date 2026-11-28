import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    cardToCastMember,
    fillCardMacros,
    lorebookKind,
    lorebookToLoreItems,
    pngCardText,
    readCardJson,
    readLorebook
} from '@/domain/imports';
import { useLoreImport, type UseLoreImportResult } from '@/hooks';
import { openCardFile, openLorebookFile } from '@/services/documents';
import { CastView } from '@/views';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const V2 = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
        name: 'Ilse Varga',
        description: '{{char}} is a ferry pilot on the Marrow river. She owes {{user}} a favour.',
        personality: 'Dry, patient, superstitious about knots.',
        scenario: '{{user}} boards the last ferry of the night.',
        first_mes: 'You are late.',
        mes_example: '<START>\n{{user}}: Is it safe?\n{{char}}: Safe enough. Mind the rope.\n{{char}}: And pay first.',
        creator_notes: 'Made for river stories.',
        system_prompt: '',
        alternate_greetings: ['Sit down.'],
        character_book: {
            name: 'Marrow river',
            entries: [
                { keys: ['Marrow', 'river'], content: 'The Marrow floods every ninth year.', enabled: true, name: 'The Marrow' },
                { keys: ['toll'], content: 'The toll is one copper.', enabled: false },
                { keys: ['/kn[oa]t/i'], content: 'Pilots tie a knot for every crossing.', enabled: true }
            ]
        }
    }
};

/** A PNG file with one text chunk. The checksum is not checked by the reader, so it is left empty. */
function pngWith(keyword: string, value: string): Uint8Array {
    const chunk = (type: string, data: number[]): number[] => {
        const length = data.length;
        return [
            (length >>> 24) & 255, (length >>> 16) & 255, (length >>> 8) & 255, length & 255,
            ...[...type].map((c) => c.charCodeAt(0)),
            ...data,
            0, 0, 0, 0
        ];
    };
    const text = [...keyword].map((c) => c.charCodeAt(0)).concat([0], [...value].map((c) => c.charCodeAt(0)));
    return new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ...chunk('IHDR', new Array(13).fill(0)),
        ...chunk('tEXt', text),
        ...chunk('IEND', [])
    ]);
}

const base64 = (value: string): string => {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
};

const jsonFile = (name: string, value: unknown): File => new File([JSON.stringify(value)], name, { type: 'application/json' });

describe('character cards', () => {
    it('reads a V2 card, its book, and names what is left behind', () => {
        const card = readCardJson(V2);
        expect(card.format).toBe('Character Card V2');
        expect(card.character.name).toBe('Ilse Varga');
        expect(card.unused).toEqual(['Scenario', 'First message', 'Other greetings', "Creator's notes"]);
        expect(card.book?.entries.map((e) => e.title)).toEqual(['The Marrow', 'Pilots tie a knot for every…']);
        expect(card.book?.skipped).toBe(1);
        // A search-pattern keyword is dropped; the text stays.
        expect(card.book?.entries[1].keywords).toEqual([]);
    });

    it('reads V1, V3, Pygmalion and Backyard cards', () => {
        expect(readCardJson({ name: 'Bo', description: 'A baker.', first_mes: 'Hi' }).format).toBe('Character Card V1');
        expect(readCardJson({ spec: 'chara_card_v3', data: { name: 'Bo', description: 'A baker.' } }).format).toBe('Character Card V3');
        const pyg = readCardJson({ char_name: 'Bo', char_persona: 'A baker.', world_scenario: 'A shop.', char_greeting: 'Hi' });
        expect(pyg.format).toBe('Pygmalion character');
        expect(pyg.character.description).toBe('A baker.');
        expect(pyg.unused).toEqual(['Scenario', 'First message']);
        const backyard = readCardJson({ aiName: 'bo', aiDisplayName: 'Bo', aiPersona: 'A baker.' });
        expect(backyard.character.name).toBe('Bo');
    });

    it('refuses what is not a usable card, in plain words', () => {
        expect(() => readCardJson([1, 2])).toThrow('not a character card');
        expect(() => readCardJson({ entries: {} })).toThrow('not a character card this app can read');
        expect(() => readCardJson({ spec: 'chara_card_v2', data: { name: '', description: 'x' } })).toThrow('no character name');
        expect(() => readCardJson({ spec: 'chara_card_v2', data: { name: 'Bo', first_mes: 'Hi' } })).toThrow(
            'no description or personality'
        );
    });

    it('writes chat placeholders out', () => {
        expect(fillCardMacros('{{char}} waits for {{user}}. {{random:a,b}}<BOT> nods.', 'Ilse')).toBe(
            'Ilse waits for the other person. Ilse nods.'
        );
    });

    it('turns a card into a supporting cast member', () => {
        const member = cardToCastMember(readCardJson(V2), 'char_1');
        expect(member).toMatchObject({ id: 'char_1', name: 'Ilse Varga', role: 'Supporting', corner_role: 'SUPPORTING' });
        expect(member.logline).toBe('Ilse Varga is a ferry pilot on the Marrow river.');
        expect(member.details.history).toContain('She owes the other person a favour.');
        expect(member.details.deep_profile).toContain('PERSONALITY\nDry, patient, superstitious about knots.');
        expect(member.details.deep_profile).toContain('Ilse Varga: Safe enough. Mind the rope.');
        expect(member.details.deep_profile).not.toContain('{{');
        expect(member.details.deep_profile).not.toContain('boards the last ferry');
        expect(member.voice_sample).toBe('Safe enough. Mind the rope.');
    });

    it('finds the card inside a PNG, V3 before V2, with non-English text intact', () => {
        const v3 = { spec: 'chara_card_v3', data: { name: 'Zoë', description: 'Une pilote — calme.' } };
        const bytes = pngWith('ccv3', base64(JSON.stringify(v3)));
        expect(JSON.parse(pngCardText(bytes) || '')).toEqual(v3);
        expect(pngCardText(pngWith('Software', 'paint'))).toBeNull();
        expect(() => pngCardText(new Uint8Array([1, 2, 3]))).toThrow('not a PNG');
        expect(() => pngCardText(pngWith('chara', '%%%'))).toThrow('damaged');
    });
});

describe('card and lorebook files', () => {
    it('opens JSON, PNG and CHARX cards, with the picture when there is one', async () => {
        const fromJson = await openCardFile(jsonFile('ilse.json', V2));
        expect(fromJson.card.character.name).toBe('Ilse Varga');
        expect(fromJson.picture).toBeNull();

        const png = new File([pngWith('chara', base64(JSON.stringify(V2))) as BlobPart], 'ilse.png', { type: 'image/png' });
        const fromPng = await openCardFile(png);
        expect(fromPng.card.format).toBe('Character Card V2');
        expect(fromPng.picture).toBe(png);

        const zip = new JSZip();
        zip.file('card.json', JSON.stringify({ spec: 'chara_card_v3', data: V2.data }));
        zip.file('assets/other/extra.png', new Uint8Array([9]));
        zip.file('assets/icon/main.webp', new Uint8Array([1, 2, 3]));
        const charx = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'ilse.charx');
        const fromCharx = await openCardFile(charx);
        expect(fromCharx.card.format).toBe('Character Card V3');
        expect(fromCharx.picture?.name).toBe('Ilse Varga.webp');
        expect(fromCharx.picture?.type).toBe('image/webp');
    });

    it('explains a file it cannot use', async () => {
        await expect(openCardFile(new File(['{oops'], 'x.json'))).rejects.toThrow('not valid JSON');
        const plain = new File([pngWith('Software', 'paint') as BlobPart], 'photo.png', { type: 'image/png' });
        await expect(openCardFile(plain)).rejects.toThrow('no character card inside');
        const empty = new JSZip();
        empty.file('readme.txt', 'hi');
        const charx = new File([await empty.generateAsync({ type: 'arraybuffer' })], 'x.charx');
        await expect(openCardFile(charx)).rejects.toThrow('no card.json');
        await expect(openLorebookFile(jsonFile('bo.json', { name: 'Bo', description: 'A baker.' }))).rejects.toThrow(
            'carries no lorebook'
        );
        await expect(openLorebookFile(jsonFile('x.json', { hello: 1 }))).rejects.toThrow('not a lorebook');
    });

    it('opens a lorebook file, or the book inside a card', async () => {
        const st = { entries: { 0: { uid: 0, key: ['Marrow'], comment: 'River', content: 'It floods.' } } };
        expect((await openLorebookFile(jsonFile('World Info.json', st))).name).toBe('World Info');
        expect((await openLorebookFile(jsonFile('ilse.json', V2))).name).toBe('Marrow river');
    });
});

describe('lorebooks', () => {
    it('tells the formats apart', () => {
        expect(lorebookKind({ lorebookVersion: 5, entries: [] })?.kind).toBe('novelai');
        expect(lorebookKind({ kind: 'memory', entries: [] })?.kind).toBe('agnai');
        expect(lorebookKind({ type: 'risu', data: [] })?.kind).toBe('risu');
        expect(lorebookKind({ entries: {} })?.kind).toBe('sillytavern');
        expect(lorebookKind({ entries: [{ keys: [], content: 'x' }] })?.kind).toBe('portable');
        expect(lorebookKind({ name: 'Bo' })).toBeNull();
        expect(() => lorebookKind({ lorebookVersion: 5, kind: 'memory' })).toThrow('more than one kind');
    });

    it('reads SillyTavern world info, leaving out switched-off and empty entries', () => {
        const book = readLorebook(
            {
                entries: {
                    0: { key: ['Kingswood', 'the reeve'], comment: '', content: 'A royal forest.' },
                    1: { key: ['gone'], content: 'Off.', disable: true },
                    2: { key: [], content: '   ' },
                    3: { key: [], comment: '', content: 'One two three four five six seven eight.', constant: true }
                }
            },
            'My world'
        );
        expect(book).toMatchObject({ name: 'My world', format: 'SillyTavern world info', skipped: 2 });
        expect(book.entries.map((e) => e.title)).toEqual(['Kingswood, the reeve', 'One two three four five six…']);
    });

    it('reads NovelAI, Agnai and RisuAI books', () => {
        const novelai = readLorebook(
            { lorebookVersion: 5, entries: [{ text: 'Salt is money.', displayName: 'Salt', keys: ['salt & coin'], enabled: true }] },
            'x'
        );
        expect(novelai.entries).toEqual([{ title: 'Salt', text: 'Salt is money.', keywords: [] }]);
        const agnai = readLorebook({ kind: 'memory', name: 'Book', entries: [{ name: 'Gate', entry: 'Iron.', keywords: ['gate'] }] }, 'x');
        expect(agnai.name).toBe('Book');
        expect(agnai.entries[0]).toEqual({ title: 'Gate', text: 'Iron.', keywords: ['gate'] });
        const risu = readLorebook(
            { type: 'risu', ver: 1, data: [{ mode: 'folder', key: 'f', content: 'x' }, { key: 'moon, tide', comment: 'Moon', content: 'Two moons.' }] },
            'x'
        );
        expect(risu.entries).toEqual([{ title: 'Moon', text: 'Two moons.', keywords: ['moon', 'tide'] }]);
        expect(risu.skipped).toBe(1);
    });

    it('makes lore items that are true from the start of the story', () => {
        const items = lorebookToLoreItems({
            name: 'Book',
            format: 'Agnai memory book',
            skipped: 0,
            entries: [
                { title: 'Gate', text: 'Iron.', keywords: ['gate'] },
                { title: 'Sky', text: 'Green.', keywords: [] }
            ]
        });
        expect(items[0]).toEqual({
            topic: 'Gate',
            detail: 'Iron.',
            valid_from_act: 1,
            valid_from_scene: 1,
            related_to: ['gate'],
            description: 'Imported from Agnai memory book: Book'
        });
        expect(items[1].related_to).toEqual(['Imported Lorebook']);
    });
});

describe('in the app', () => {
    const roots: Root[] = [];
    afterEach(() => {
        while (roots.length) {
            const root = roots.pop();
            act(() => root?.unmount());
        }
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('adds a lorebook to the story lore and indexes it', async () => {
        type TestStory = { id?: string; lore?: unknown[] };
        const toasts: Array<[string, string | undefined]> = [];
        const ingests: unknown[][] = [];
        const box: { story: TestStory } = { story: { lore: [{ topic: 'existing' }] } };
        let latest: UseLoreImportResult | null = null;
        function Probe(): null {
            latest = useLoreImport<TestStory>({
                story: box.story,
                setStory: (updater) => {
                    box.story = updater(box.story);
                },
                setWorldPrimer: () => {},
                showToast: (m, v) => toasts.push([m, v]),
                setLoading: () => {},
                setLoadingStep: () => {},
                ingestLoreBatch: async (lore) => {
                    ingests.push(lore);
                    return null;
                }
            });
            return null;
        }
        const root = createRoot(document.createElement('div'));
        roots.push(root);
        act(() => root.render(<Probe />));
        const api = latest as unknown as UseLoreImportResult;

        await act(async () => {
            await api.handleLorebookImport(jsonFile('ilse.json', V2));
        });
        expect(ingests[0]).toHaveLength(3);
        expect((box.story.lore || []).map((l) => (l as { topic: string }).topic)).toEqual([
            'existing',
            'The Marrow',
            'Pilots tie a knot for every…'
        ]);
        expect(toasts.at(-1)).toEqual([
            'Imported 2 entries from "Marrow river" (Character lorebook). 1 switched-off or empty entry was left out.',
            'success'
        ]);

        await act(async () => {
            await api.handleLorebookImport(jsonFile('x.json', { hello: 1 }));
        });
        expect(toasts.at(-1)?.[0]).toContain('Lorebook import failed: This is not a lorebook');
        expect(toasts.at(-1)?.[1]).toBe('error');
    });

    it('imports a card from the Cast page, and will not add the same name twice', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        roots.push(root);
        const story: { cast: Array<{ id?: string; name: string }>; sequences: never[]; lore: never[] } = {
            cast: [{ id: 'c1', name: 'Mara Vance' }],
            sequences: [],
            lore: []
        };
        const showToast = vi.fn();
        const uploadCharacterPortrait = vi.fn();
        const setStory = vi.fn((updater: unknown) => {
            if (typeof updater === 'function') Object.assign(story, (updater as (prev: typeof story) => typeof story)(story));
        });
        const render = (): void =>
            act(() =>
                root.render(
                    <CastView
                        view="cast"
                        setView={vi.fn()}
                        story={story}
                        storyRef={createRef() as React.MutableRefObject<never>}
                        setStory={setStory as never}
                        isInspectorMode={false}
                        selectedSequence={null}
                        selectedScene={null}
                        loadedImages={{}}
                        portraitLoading={{}}
                        isAnyAudioPlaying={false}
                        isAuditioningVoice={false}
                        openEditModal={vi.fn()}
                        openFormModal={vi.fn()}
                        showToast={showToast}
                        findCastIndexForChar={() => 0}
                        commitVoiceEditUpdate={vi.fn()}
                        generateCharacterPortrait={vi.fn()}
                        uploadCharacterPortrait={uploadCharacterPortrait}
                        removeCharacterPortrait={vi.fn()}
                        handleRerollCharacterSeed={vi.fn()}
                        handleResetCharacterReferenceText={vi.fn()}
                        testAuditionCharacterVoice={vi.fn()}
                        stopAllAudioPlayback={vi.fn()}
                    />
                )
            );
        render();
        expect(host.textContent).toContain('Import Characters');

        const pick = async (file: File): Promise<void> => {
            const input = host.querySelector<HTMLInputElement>('#characterCardFileInput')!;
            Object.defineProperty(input, 'files', { configurable: true, value: [file] });
            await act(async () => {
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        };
        const png = new File([pngWith('chara', base64(JSON.stringify(V2))) as BlobPart], 'ilse.png', { type: 'image/png' });
        await pick(png);
        await vi.waitFor(() => expect(story.cast).toHaveLength(2));
        expect(story.cast[1].name).toBe('Ilse Varga');
        expect(uploadCharacterPortrait).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ilse Varga' }), png);
        const said = String(showToast.mock.calls.at(-1)?.[0]);
        expect(said).toContain('Imported "Ilse Varga" from a Character Card V2 as a supporting character.');
        expect(said).toContain("Not brought over: Scenario, First message, Other greetings, Creator's notes.");
        expect(said).toContain('lorebook of 2 entries');

        render();
        await pick(png);
        await vi.waitFor(() => expect(String(showToast.mock.calls.at(-1)?.[0])).toContain('already has a character named "Ilse Varga"'));
        expect(story.cast).toHaveLength(2);
    });
});
