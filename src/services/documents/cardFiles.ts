/**
 * @module services/documents/cardFiles
 * Opens a character card or lorebook file the user picked: JSON, a PNG with the card inside it,
 * or a CHARX archive (a zip with card.json and pictures). Nothing is sent anywhere; the file is
 * read in the browser.
 */

import { pngCardText, readCardJson, readLorebook, lorebookKind, type ImportedCard, type ImportedLorebook } from '@/domain/imports';
import { ensureJSZip, type JSZipArchive } from './loaders';

export const CARD_FILE_LIMIT_BYTES = 50 * 1024 * 1024;
export const CARD_FILE_ACCEPT = '.json,.png,.charx';
export const LOREBOOK_FILE_ACCEPT = '.json,.lorebook';

export interface OpenedCard {
    card: ImportedCard;
    /** The card's picture, ready to be the character's portrait, when the file has one. */
    picture: File | null;
}

const stem = (filename: string): string => filename.replace(/\.[^.]+$/, '').trim() || 'Imported';
const extension = (filename: string): string => (filename.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

function parse(source: string): unknown {
    try {
        return JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
    } catch {
        throw new Error('This file is not valid JSON, so it cannot be read.');
    }
}

function checkSize(file: File): void {
    if (file.size > CARD_FILE_LIMIT_BYTES) throw new Error('This file is too large to be a character card (over 50 MB).');
}

const PICTURE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

async function openCharx(file: File): Promise<OpenedCard> {
    const JSZip = await ensureJSZip();
    let zip: JSZipArchive;
    try {
        zip = await JSZip.loadAsync(await file.arrayBuffer());
    } catch {
        throw new Error('This CHARX file could not be opened. It may be damaged.');
    }
    const cardEntry = zip.file('card.json');
    if (!cardEntry) throw new Error('This CHARX file has no card.json inside it.');
    const card = readCardJson(parse(await cardEntry.async('text')));

    // The main icon the card names, else the first picture in the archive.
    const pictures = zip.file(/\.(png|jpe?g|webp)$/i).sort((a, b) => a.name.localeCompare(b.name));
    const preferred = pictures.find((entry) => /(^|\/)(main|icon|avatar)[^/]*$/i.test(entry.name)) || pictures[0];
    let picture: File | null = null;
    if (preferred) {
        const kind = extension(preferred.name);
        const bytes = await preferred.async('arraybuffer');
        picture = new File([bytes], `${card.character.name}.${kind}`, { type: PICTURE_TYPES[kind] });
    }
    return { card, picture };
}

/** Reads the card in a picked file. Throws a plain-language Error when there is none. */
export async function openCardFile(file: File): Promise<OpenedCard> {
    checkSize(file);
    const kind = extension(file.name);
    if (kind === 'charx' || kind === 'zip') return openCharx(file);
    if (kind === 'png' || file.type === 'image/png') {
        const found = pngCardText(new Uint8Array(await file.arrayBuffer()));
        if (!found) throw new Error('This picture has no character card inside it.');
        return { card: readCardJson(parse(found)), picture: file };
    }
    return { card: readCardJson(parse(await file.text())), picture: null };
}

/** Reads the lorebook in a picked file, or the lorebook a character card carries. */
export async function openLorebookFile(file: File): Promise<ImportedLorebook> {
    checkSize(file);
    const kind = extension(file.name);
    if (kind === 'png' || kind === 'charx') {
        const { card } = await openCardFile(file);
        if (!card.book) throw new Error(`The card for ${card.character.name} carries no lorebook.`);
        return card.book;
    }
    const value = parse(await file.text());
    if (lorebookKind(value)) return readLorebook(value, stem(file.name));
    // A character card saved as JSON may carry a book too.
    let card: ImportedCard;
    try {
        card = readCardJson(value);
    } catch {
        throw new Error('This is not a lorebook this app can read (SillyTavern, NovelAI, Agnai or RisuAI).');
    }
    if (!card.book) throw new Error(`The card for ${card.character.name} carries no lorebook.`);
    return card.book;
}
