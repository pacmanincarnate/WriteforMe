/**
 * @module hooks/useCastImport
 * The Cast page's Import Characters button: character cards from other apps (JSON, PNG, CHARX)
 * and character sheets written as Markdown, one file or many at once.
 */

import type { MutableRefObject } from 'react';
import {
    cardToCastMember,
    linkSheetRelationships,
    readCharacterSheets,
    sheetCharacterName,
    sheetToCastMember,
    SHEET_FILE_LIMIT_BYTES,
    type CharacterSheet
} from '@/domain/imports';
import { CARD_FILE_ACCEPT, openCardFile } from '@/services/documents';

export const CAST_FILE_ACCEPT = `${CARD_FILE_ACCEPT},.md,.markdown,.txt`;

interface CastImportMember {
    id?: string;
    name?: string;
    details?: Record<string, unknown> | null;
}

interface CastImportStory<TMember extends CastImportMember> {
    cast?: TMember[];
    relationships?: unknown;
}

export interface UseCastImportParams<TMember extends CastImportMember, TStory extends CastImportStory<TMember>> {
    story: TStory;
    storyRef: MutableRefObject<TStory>;
    setStory: (updater: (prev: TStory) => TStory) => unknown;
    showToast: (message: string, variant?: string) => void;
    uploadCharacterPortrait: (member: TMember, picture: File) => void;
}

type RelationshipRecord = Record<string, Record<string, unknown>> | undefined;

const isSheetFile = (file: File): boolean => /\.(md|markdown|txt)$/i.test(file.name);
const named = (names: string[]): string => names.map((name) => `"${name}"`).join(', ');
const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function useCastImport<TMember extends CastImportMember, TStory extends CastImportStory<TMember>>({
    story,
    storyRef,
    setStory,
    showToast,
    uploadCharacterPortrait
}: UseCastImportParams<TMember, TStory>): { importCastFiles: (files: File[]) => Promise<void> } {
    const takenNames = (): Set<string> =>
        new Set((storyRef.current?.cast || story.cast || []).map((c) => (c.name || '').trim().toLowerCase()));

    /** A character card from another app becomes a supporting cast member, with its picture. */
    const importCard = async (file: File): Promise<void> => {
        try {
            const { card, picture } = await openCardFile(file);
            const name = card.character.name;
            if (takenNames().has(name.toLowerCase())) {
                showToast(`The cast already has a character named "${name}". Rename or remove them first.`, 'warn');
                return;
            }
            const newChar = cardToCastMember(card, `char_${Date.now()}`) as unknown as TMember;
            setStory((prev) => ({ ...prev, cast: [...(prev.cast || []), newChar] }));
            const notes = [
                card.unused.length > 0 ? `Not brought over: ${card.unused.join(', ')}.` : '',
                card.book
                    ? `The card carries a lorebook of ${card.book.entries.length} ${card.book.entries.length === 1 ? 'entry' : 'entries'}: use Import Lorebook in the Lore tab with the same file to add it.`
                    : ''
            ].filter(Boolean);
            showToast(`Imported "${name}" from a ${card.format} as a supporting character. ${notes.join(' ')}`.trim(), 'success');
            if (picture) uploadCharacterPortrait(newChar, picture);
        } catch (err) {
            showToast(`Card import failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
    };

    /** Markdown sheets come in together, so the people they name can be linked to each other. */
    const importSheets = async (files: File[]): Promise<void> => {
        const sheets: CharacterSheet[] = [];
        const unreadable: string[] = [];
        for (const file of files) {
            try {
                if (file.size > SHEET_FILE_LIMIT_BYTES) throw new Error('too large');
                const found = readCharacterSheets(await file.text(), file.name).filter((sheet) => sheetCharacterName(sheet));
                if (found.length === 0) throw new Error('no character');
                sheets.push(...found);
            } catch {
                unreadable.push(file.name);
            }
        }
        const taken = takenNames();
        const doubles: string[] = [];
        const stamp = Date.now();
        const members = sheets.flatMap((sheet, index) => {
            const name = sheetCharacterName(sheet);
            if (taken.has(name.toLowerCase())) {
                doubles.push(name);
                return [];
            }
            taken.add(name.toLowerCase());
            return [sheetToCastMember(sheet, `char_${stamp}_${index}`) as unknown as TMember];
        });

        // Counted against the cast as it is now; the update below links against the cast it finds.
        const current = storyRef.current || story;
        const linked =
            members.length > 0
                ? linkSheetRelationships([...(current.cast || []), ...members], current.relationships as RelationshipRecord).added
                : 0;
        if (members.length > 0) {
            setStory((prev) => {
                const cast = [...(prev.cast || []), ...members];
                return { ...prev, cast, relationships: linkSheetRelationships(cast, prev.relationships as RelationshipRecord).relationships };
            });
        }
        const said = [
            members.length > 0
                ? `Imported ${named(members.map((m) => m.name || ''))} as supporting ${members.length === 1 ? 'character' : 'characters'}.`
                : '',
            linked > 0 ? `Linked ${count(linked, 'relationship', 'relationships')} by name.` : '',
            doubles.length > 0 ? `Already in the cast, so left out: ${named(doubles)}.` : '',
            unreadable.length > 0 ? `No character sheet found in: ${unreadable.join(', ')}.` : ''
        ].filter(Boolean);
        showToast(said.join(' '), members.length > 0 ? 'success' : 'warn');
    };

    const importCastFiles = async (files: File[]): Promise<void> => {
        const sheetFiles = files.filter(isSheetFile);
        for (const file of files.filter((f) => !isSheetFile(f))) await importCard(file);
        if (sheetFiles.length > 0) await importSheets(sheetFiles);
    };

    return { importCastFiles };
}
