/**
 * @module services/export/epubExport
 * Full EPUB 3.0 builder & downloader embedding cover, scene illustrations, beat art,
 * portrait gallery, MP3 audio drama tracks, first-use Appendix hyperlinking, and `META-INF/story.json`.
 */

import { ensureJSZip, type JSZipArchive } from '@/services/documents';
import {
    audioStore as defaultAudioStore,
    imageStore as defaultImageStore,
    type AudioStore,
    type ImageStore,
    type SceneAudioRecord
} from '@/services/storage';
import { actForSequence, parseActNumber } from '@/domain/story';
import { escapeXml, parseMarkdown } from '@/utils';
import type { SceneBlueprint, Sequence } from '@/types';
import type {
    ExportLegacyChapter,
    ExportLedgerFact,
    StoryExportInput
} from './audioDramaTxtExport';

export interface EpubExportDependencies {
    imageStore?: Pick<ImageStore, 'getImage'>;
    audioStore?: Pick<AudioStore, 'getAllStoryAudioRecords'>;
}

export interface EpubExportResult {
    blob: Blob;
    filename: string;
    audioCount: number;
}

interface EpubAudioManifestItem {
    href: string;
    durationSec: number;
    textHash: string;
    cueCount: number;
    cueTimeline: unknown[] | null;
}

interface EpubValidSceneItem {
    scene: SceneBlueprint;
    sceneIdx: number;
    sId: string;
    beats: unknown[];
    prose: unknown;
    proseText: string;
}

interface EpubCastEntity extends Record<string, unknown> {
    id?: string;
    name?: string;
    role?: string;
    archetype?: string;
    core_flaw?: string;
    core_desire?: string;
    voice_sample?: string;
    vocal_cadence?: string;
    aliases?: unknown[];
    details?: {
        history?: string;
        aliases?: unknown[];
        [key: string]: unknown;
    };
    psychological_profile?: {
        lie_believed?: string;
        truth_needed?: string;
        [key: string]: unknown;
    };
}

interface LinkableItem {
    id: string;
    targetAnchor: string;
    type: 'character' | 'ledger';
    entity: EpubCastEntity | ExportLedgerFact;
    terms: string[];
}

interface SearchTermEntry {
    term: string;
    regex: RegExp;
    itemId: string;
    targetAnchor: string;
}

interface FirstUseCitation {
    file: string;
    title: string;
    anchor: string;
}

function requireFolder(parent: JSZipArchive, name: string): JSZipArchive {
    const folder = parent.folder(name);
    if (!folder) {
        throw new Error(`Failed to create EPUB zip folder "${name}".`);
    }
    return folder;
}

function dataUrlToBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0]?.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(arr[1] || '');
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

function getMimeAndExt(dataUrl: string): { mime: string; ext: string } {
    const mimeMatch = dataUrl.split(',')[0]?.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const subtype = mime.split('/')[1] || 'jpg';
    const ext = subtype === 'jpeg' ? 'jpg' : subtype;
    return { mime, ext };
}

function slugify(text: string): string {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function ensureXhtmlVoidTags(html: string): string {
    return String(html || '').replace(
        /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)([^>]*?)(?<!\/)>/gi,
        '<$1$2 />'
    );
}

function isActionScene(scene: SceneBlueprint | undefined, sIdx: number): boolean {
    if (scene && (scene.scene_type || scene.type)) {
        const t = String(scene.scene_type || scene.type)
            .toLowerCase()
            .trim();
        if (t.includes('proactive') || t.includes('action') || t === 'scene') return true;
        if (t.includes('reactive') || t.includes('reaction') || t.includes('sequel')) return false;
    }
    return sIdx % 2 === 0;
}

function getChaptersForAct(
    chapters: StoryExportInput['chapters'],
    actIdx: number
): ExportLegacyChapter[] {
    if (!chapters) return [];
    if (Array.isArray(chapters)) {
        return Array.isArray(chapters[actIdx]) ? chapters[actIdx] : [];
    }
    const byNumKey = chapters[String(actIdx)];
    return Array.isArray(byNumKey) ? byNumKey : [];
}

/** Builds a self-contained EPUB 3.0 archive Blob for the given story and its stored media assets. */
export async function buildStoryEpubBlob(
    story: StoryExportInput,
    deps: EpubExportDependencies = {}
): Promise<EpubExportResult> {
    const JSZip = await ensureJSZip();
    const targetImageStore = deps.imageStore ?? defaultImageStore;
    const targetAudioStore = deps.audioStore ?? defaultAudioStore;

    const zip = new JSZip();
    const cleanTitle = story.title ? story.title : 'My Story';
    const safeFilename = cleanTitle.replace(/[^a-zA-Z0-9]/g, '_');

    // Fetch all image keys for this story from IndexedDB / Disk Vault
    const imagesMap: Record<string, string> = {};
    if (story.id) {
        const coverData = await targetImageStore.getImage(`cover_${story.id}`);
        if (coverData) {
            imagesMap.cover = coverData;
        }

        const imagePromises: Array<Promise<void>> = [];
        const allBeatKeys = Object.keys(story.beats || {});
        allBeatKeys.forEach((beatKey) => {
            const beats = story.beats?.[beatKey] || [];
            beats.forEach((_, bi) => {
                const imgKey = `beat_${story.id}_${beatKey}_${bi}`;
                imagePromises.push(
                    targetImageStore.getImage(imgKey).then((dataUrl) => {
                        if (dataUrl) imagesMap[imgKey] = dataUrl;
                    })
                );
            });
        });

        ((story.cast || []) as EpubCastEntity[]).forEach((char) => {
            if (!char || !char.id) return;
            const portKey = `portrait_${story.id}_${char.id}`;
            imagePromises.push(
                targetImageStore.getImage(portKey).then((dataUrl) => {
                    if (dataUrl) imagesMap[portKey] = dataUrl;
                })
            );
        });

        const sceneKeysSet = new Set(Object.keys(story.prose || {}));
        (story.sequences || []).forEach((seq, qi) => {
            (seq.scenes || []).forEach((_, si) => {
                sceneKeysSet.add(`${qi}-${si}`);
            });
        });
        sceneKeysSet.forEach((sId) => {
            const sceneImgKey = `scene_${story.id}_${sId}`;
            imagePromises.push(
                targetImageStore.getImage(sceneImgKey).then((dataUrl) => {
                    if (dataUrl) imagesMap[sceneImgKey] = dataUrl;
                })
            );
        });

        await Promise.all(imagePromises);
    }

    // Fetch all audio records for this story from AudioStore
    const audioMap: Record<string, { rec: SceneAudioRecord; buffer: ArrayBuffer }> = {};
    if (story.id) {
        try {
            const allAudioRecords = await targetAudioStore.getAllStoryAudioRecords(story.id);
            for (const rec of allAudioRecords || []) {
                if (rec && rec.blob) {
                    const buffer =
                        typeof rec.blob.arrayBuffer === 'function'
                            ? await rec.blob.arrayBuffer()
                            : new Uint8Array(await new Response(rec.blob).arrayBuffer()).buffer;
                    audioMap[`${rec.seqIdx}-${rec.sceneIdx}`] = { rec, buffer };
                }
            }
        } catch (audioFetchErr) {
            console.warn('Could not fetch story audio for EPUB export:', audioFetchErr);
        }
    }
    const audioManifest: Record<string, EpubAudioManifestItem> = {};

    // 1. Mimetype (must be first, no compression)
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // 2. Container
    const metaInfFolder = requireFolder(zip, 'META-INF');
    metaInfFolder.file(
        'container.xml',
        `<?xml version="1.0" ?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
   <rootfiles>
      <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
   </rootfiles>
</container>`
    );

    const oebps = requireFolder(zip, 'OEBPS');
    const textFolder = requireFolder(oebps, 'Text');
    const imagesFolder = requireFolder(oebps, 'Images');
    const audioFolder = requireFolder(oebps, 'Audio');

    const manifestItems: string[] = [];
    const spineItems: string[] = [];
    const tocPoints: string[] = [];
    const navItems: Array<{ href: string; heading: string; level: number }> = [];
    let playOrder = 1;

    // 2.1 Cover image (if exists)
    if (imagesMap.cover) {
        const { mime: coverMime, ext } = getMimeAndExt(imagesMap.cover);
        const coverImgFilename = `cover.${ext}`;
        const coverBlob = dataUrlToBlob(imagesMap.cover);
        imagesFolder.file(coverImgFilename, coverBlob);

        manifestItems.push(
            `<item id="cover-image" href="Images/${coverImgFilename}" media-type="${coverMime}"/>`
        );

        const coverFilename = 'Cover.xhtml';
        const coverHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Cover</title>
<style>
  body { margin: 0; padding: 0; text-align: center; background-color: #000000; }
  div { margin: 0; padding: 0; height: 100%; display: flex; align-items: center; justify-content: center; }
  img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style>
</head>
<body>
<div>
  <img src="Images/${coverImgFilename}" alt="Cover" />
</div>
</body>
</html>`;
        textFolder.file(coverFilename, coverHtml);
        manifestItems.push(
            `<item id="coverpage" href="Text/${coverFilename}" media-type="application/xhtml+xml"/>`
        );
        spineItems.push(`<itemref idref="coverpage"/>`);
        tocPoints.push(
            `<navPoint id="navPoint-${playOrder}" playOrder="${playOrder}"><navLabel><text>Cover</text></navLabel><content src="Text/${coverFilename}"/></navPoint>`
        );
        playOrder++;
    }

    // 3. Title Page
    const titleFilename = 'Title.xhtml';
    const titleHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Title Page</title>
<style>body { text-align: center; margin-top: 30%; }</style></head>
<body>
<h1>${story.title ? story.title.replace(/&/g, '&amp;') : 'Untitled Story'}</h1>
<h3 style="font-weight: normal; font-style: italic;">${story.concept ? story.concept.replace(/&/g, '&amp;') : 'My Story'}</h3>
<h3>Drafted with EllipsisProse (Sequence Architecture)</h3>
</body>
</html>`;
    textFolder.file(titleFilename, titleHtml);
    manifestItems.push(
        `<item id="titlepage" href="Text/${titleFilename}" media-type="application/xhtml+xml"/>`
    );
    spineItems.push(`<itemref idref="titlepage"/>`);
    tocPoints.push(
        `<navPoint id="navPoint-${playOrder}" playOrder="${playOrder}"><navLabel><text>Title Page</text></navLabel><content src="Text/${titleFilename}"/></navPoint>`
    );
    playOrder++;

    // 4. Content (Acts, Sequences, and Scenes)
    const castList = Array.isArray(story.cast) ? (story.cast as EpubCastEntity[]) : [];
    const ledgerList = Array.isArray(story.continuity_ledger) ? story.continuity_ledger : [];
    const linkableItems: LinkableItem[] = [];

    const characterFirstNamesCount: Record<string, number> = {};
    castList.forEach((c) => {
        if (!c || !c.name) return;
        const parts = c.name.trim().split(/\s+/);
        if (parts.length > 0) {
            const fn = parts[0].toLowerCase();
            characterFirstNamesCount[fn] = (characterFirstNamesCount[fn] || 0) + 1;
        }
    });

    castList.forEach((c, cIdx) => {
        if (!c || !c.name) return;
        const charSlug = slugify(c.id || c.name || `char_${cIdx}`);
        const targetAnchor = `char_${charSlug}`;
        const terms: string[] = [];

        const fullName = c.name.trim();
        if (fullName.length >= 2) terms.push(fullName);

        const aliases = Array.isArray(c.aliases)
            ? c.aliases
            : Array.isArray(c.details?.aliases)
              ? c.details.aliases
              : [];
        aliases.forEach((a) => {
            const aTrim = String(a || '').trim();
            if (aTrim.length >= 2 && !terms.some((t) => t.toLowerCase() === aTrim.toLowerCase())) {
                terms.push(aTrim);
            }
        });

        const parts = fullName.split(/\s+/);
        if (parts.length > 1) {
            const fn = parts[0];
            if (fn.length >= 3 && characterFirstNamesCount[fn.toLowerCase()] === 1) {
                if (!terms.some((t) => t.toLowerCase() === fn.toLowerCase())) {
                    terms.push(fn);
                }
            }
        }

        linkableItems.push({
            id: `char_${c.id || cIdx}`,
            targetAnchor,
            type: 'character',
            entity: c,
            terms
        });
    });

    const seenLedgerKeys = new Set<string>();
    ledgerList.forEach((fact, fIdx) => {
        if (!fact || !fact.key) return;
        const rawKey = String(fact.key).trim();
        if (/\[.*?\]/.test(rawKey)) return;
        if (rawKey.length < 4) return;
        if (castList.some((c) => c && c.name && c.name.toLowerCase() === rawKey.toLowerCase())) {
            return;
        }

        const lowerKey = rawKey.toLowerCase();
        if (seenLedgerKeys.has(lowerKey)) return;
        seenLedgerKeys.add(lowerKey);

        const factSlug = slugify(fact.tracking_tag || rawKey);
        const targetAnchor = `ledger_${factSlug}`;
        linkableItems.push({
            id: `ledger_${fIdx}`,
            targetAnchor,
            type: 'ledger',
            entity: fact,
            terms: [rawKey]
        });
    });

    const searchTerms: SearchTermEntry[] = [];
    linkableItems.forEach((item) => {
        item.terms.forEach((term) => {
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const prefix = /^\w/.test(term) ? '\\b' : '';
            const suffix = /\w$/.test(term) ? '\\b' : '';
            searchTerms.push({
                term,
                regex: new RegExp(`${prefix}${escaped}${suffix}`, 'i'),
                itemId: item.id,
                targetAnchor: item.targetAnchor
            });
        });
    });
    searchTerms.sort((a, b) => b.term.length - a.term.length);

    const linkedItemIds = new Set<string>();
    const firstUseCitations: Record<string, FirstUseCitation> = {};
    const charPortraits: Record<string, string> = {};

    const linkFirstUsesInHtml = (
        htmlContent: string,
        chapFilename: string,
        chapHeading: string
    ): string => {
        if (!htmlContent || searchTerms.length === 0) return htmlContent;
        const activeTerms = searchTerms.filter((st) => !linkedItemIds.has(st.itemId));
        if (activeTerms.length === 0) return htmlContent;

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<body>${htmlContent}</body>`, 'text/html');
            const body = doc.body;

            const processNode = (node: ChildNode): void => {
                if (!node) return;
                if (node.nodeType === 1) {
                    const el = node as Element;
                    const tag = el.tagName.toLowerCase();
                    if (
                        tag === 'a' ||
                        tag === 'script' ||
                        tag === 'style' ||
                        tag === 'h1' ||
                        tag === 'h2' ||
                        tag === 'h3'
                    ) {
                        return;
                    }
                    const children = Array.from(el.childNodes);
                    for (let i = 0; i < children.length; i++) {
                        processNode(children[i]);
                    }
                    return;
                }

                if (node.nodeType === 3) {
                    const text = node.nodeValue;
                    if (!text || text.trim().length === 0) return;

                    let bestMatch: RegExpExecArray | null = null;
                    let bestTerm: SearchTermEntry | null = null;

                    for (let i = 0; i < activeTerms.length; i++) {
                        const st = activeTerms[i];
                        if (linkedItemIds.has(st.itemId)) continue;
                        st.regex.lastIndex = 0;
                        const match = st.regex.exec(text);
                        if (match) {
                            if (
                                !bestMatch ||
                                !bestTerm ||
                                match.index < bestMatch.index ||
                                (match.index === bestMatch.index && st.term.length > bestTerm.term.length)
                            ) {
                                bestMatch = match;
                                bestTerm = st;
                            }
                        }
                    }

                    if (bestMatch && bestTerm) {
                        const matchIdx = bestMatch.index;
                        const matchStr = bestMatch[0];
                        const citeId = `cite_${bestTerm.targetAnchor}_${Math.random().toString(36).substring(2, 8)}`;

                        linkedItemIds.add(bestTerm.itemId);
                        firstUseCitations[bestTerm.itemId] = {
                            file: chapFilename,
                            title: chapHeading,
                            anchor: citeId
                        };

                        const beforeText = text.substring(0, matchIdx);
                        const afterText = text.substring(matchIdx + matchStr.length);

                        const anchorEl = doc.createElement('a');
                        anchorEl.setAttribute('href', `Appendix.xhtml#${bestTerm.targetAnchor}`);
                        anchorEl.setAttribute('class', 'appendix-ref');
                        anchorEl.setAttribute('id', citeId);
                        anchorEl.textContent = matchStr;

                        const parent = node.parentNode;
                        if (parent) {
                            if (beforeText) {
                                parent.insertBefore(doc.createTextNode(beforeText), node);
                            }
                            parent.insertBefore(anchorEl, node);
                            const afterNode = doc.createTextNode(afterText);
                            parent.insertBefore(afterNode, node);
                            parent.removeChild(node);

                            if (afterText.trim().length > 0) {
                                processNode(afterNode);
                            }
                        }
                    }
                }
            };

            processNode(body);
            return body.innerHTML;
        } catch (err) {
            console.warn('Error during first-use prose linking:', err);
            return htmlContent;
        }
    };

    (story.acts || []).forEach((act, actIdx) => {
        const actNum = parseActNumber(act.number, actIdx + 1);
        const actTitle = act.title ? act.title.trim() : '';
        const actHeading = actTitle ? `Act ${actNum} - ${actTitle}` : `Act ${actNum}`;

        const actChapters = getChaptersForAct(story.chapters, actIdx);
        const seqList: Array<Partial<Sequence> & { origIdx: number }> =
            story.sequences && story.sequences.length > 0
                ? story.sequences.map((seq, sIdx) => ({ ...seq, origIdx: sIdx }))
                : actChapters.map((ch, cIdx) => ({
                      number: ch.number || cIdx + 1,
                      title: ch.title || `Sequence ${cIdx + 1}`,
                      parent_act: actNum,
                      origIdx: cIdx
                  }));

        const actSequences = seqList.filter(
            (seq) =>
                parseActNumber(
                    seq.parent_act,
                    actForSequence(Number(seq.number) || seq.origIdx + 1)
                ) === actNum
        );
        if (actSequences.length === 0) return;

        const actFilename = `Act_${actNum}.xhtml`;
        const actHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(actHeading)}</title>
<style>body { text-align: center; margin-top: 30%; font-family: sans-serif; }</style></head>
<body>
<h1>${escapeXml(actHeading)}</h1>
</body>
</html>`;
        textFolder.file(actFilename, actHtml);
        const actId = `act_${actNum}`;
        manifestItems.push(
            `<item id="${actId}" href="Text/${actFilename}" media-type="application/xhtml+xml"/>`
        );
        spineItems.push(`<itemref idref="${actId}"/>`);
        navItems.push({ href: `Text/${actFilename}`, heading: actHeading, level: 1 });

        let actNavPoint = `<navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
<navLabel><text>${escapeXml(actHeading)}</text></navLabel>
<content src="Text/${actFilename}"/>`;
        playOrder++;

        actSequences.forEach((sequence, seqInActIdx) => {
            const seqIdx = sequence.origIdx;
            const partNum = seqInActIdx + 1;
            const seqTitle = sequence.title ? sequence.title.trim() : '';
            const partHeading = seqTitle ? `Part ${partNum} - ${seqTitle}` : `Part ${partNum}`;

            const rawSeqScenes =
                story.scenes?.[`${seqIdx}`] ||
                story.scenes?.[`${actIdx}-${seqIdx}`] ||
                story.scenes?.['0-0'] ||
                [];
            if (rawSeqScenes.length === 0) return;

            const validScenes: EpubValidSceneItem[] = [];
            rawSeqScenes.forEach((scene, sceneIdx) => {
                const sId = `${seqIdx}-${sceneIdx}`;
                const beats = story.beats?.[sId] || story.beats?.[`${sId}-0`] || [];
                const prose = story.prose?.[sId] || story.prose?.[`${sId}-0`];
                const proseText =
                    typeof prose === 'string'
                        ? prose
                        : String(prose?.final || prose?.draft || '');
                if (proseText && proseText.trim()) {
                    validScenes.push({
                        scene,
                        sceneIdx,
                        sId,
                        beats,
                        prose,
                        proseText
                    });
                }
            });

            if (validScenes.length === 0) return;

            const seqFilename = `Act_${actNum}_Part_${partNum}.xhtml`;
            const seqHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(partHeading)}</title>
<style>body { text-align: center; margin-top: 30%; font-family: sans-serif; }</style></head>
<body>
<h1>${escapeXml(partHeading)}</h1>
</body>
</html>`;
            textFolder.file(seqFilename, seqHtml);
            const seqFileId = `part_${actNum}_${partNum}`;
            manifestItems.push(
                `<item id="${seqFileId}" href="Text/${seqFilename}" media-type="application/xhtml+xml"/>`
            );
            spineItems.push(`<itemref idref="${seqFileId}"/>`);
            navItems.push({ href: `Text/${seqFilename}`, heading: partHeading, level: 2 });

            actNavPoint += `
<navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
<navLabel><text>${escapeXml(partHeading)}</text></navLabel>
<content src="Text/${seqFilename}"/>`;
            playOrder++;

            const chapters: Array<{ chapNum: number; title: string; items: EpubValidSceneItem[] }> = [];
            let currentChapter: { chapNum: number; title: string; items: EpubValidSceneItem[] } | null =
                null;

            validScenes.forEach((item) => {
                const isAction = isActionScene(item.scene, item.sceneIdx);
                if (isAction || !currentChapter) {
                    currentChapter = {
                        chapNum: chapters.length + 1,
                        title: item.scene && item.scene.title ? item.scene.title.trim() : '',
                        items: [item]
                    };
                    chapters.push(currentChapter);
                } else {
                    currentChapter.items.push(item);
                }
            });

            chapters.forEach((chap) => {
                const chapTitle = chap.title;
                const chapHeading = chapTitle
                    ? `Chapter ${chap.chapNum} - ${chapTitle}`
                    : `Chapter ${chap.chapNum}`;
                const chapFilename = `Act_${actNum}_Part_${partNum}_Chap_${chap.chapNum}.xhtml`;

                let chapterBody = '';
                chap.items.forEach((item, itemIdx) => {
                    if (itemIdx > 0) {
                        chapterBody += `\n<hr class="scene-divider" style="border: 0; border-top: 1px solid #ccc; margin: 2em auto; width: 50%;" />\n`;
                    }

                    // Scene Illustration
                    const sceneImgKey = `scene_${story.id}_${item.sId}`;
                    const sceneImgData =
                        imagesMap[sceneImgKey] ||
                        imagesMap[`scene_${story.id}_${actIdx}-${seqIdx}-${item.sceneIdx}`];
                    let sceneIllustrationHtml = '';
                    if (sceneImgData && typeof sceneImgData === 'string' && sceneImgData.includes(',')) {
                        try {
                            const { mime: sMime, ext: sExt } = getMimeAndExt(sceneImgData);
                            const sFilename = `scene_${seqIdx}_${item.sceneIdx}.${sExt}`;
                            const sImgId = `img_scene_${seqIdx}_${item.sceneIdx}`;
                            const sBlob = dataUrlToBlob(sceneImgData);
                            imagesFolder.file(sFilename, sBlob);
                            manifestItems.push(
                                `<item id="${sImgId}" href="Images/${sFilename}" media-type="${sMime}"/>`
                            );
                            const sTitle =
                                item.scene && item.scene.title
                                    ? item.scene.title.trim()
                                    : `Scene ${item.sceneIdx + 1}`;
                            sceneIllustrationHtml = `\n<div class="scene-illustration" style="text-align: center; margin: 2em 0 1.5em 0;"><img src="../Images/${sFilename}" style="max-width: 100%; height: auto; border-radius: 6px;" alt="${escapeXml(sTitle)}" /></div>\n`;
                        } catch (e) {
                            console.warn('Failed to attach scene illustration to EPUB:', e);
                        }
                    }

                    let sceneProseHtml = parseMarkdown(item.proseText);

                    item.beats.forEach((_, bi) => {
                        const imgKey = `beat_${story.id}_${item.sId}_${bi}`;
                        const imgData =
                            imagesMap[imgKey] ||
                            imagesMap[`beat_${story.id}_${actIdx}-${seqIdx}-${item.sceneIdx}_${bi}`] ||
                            imagesMap[`beat_${story.id}_0-0-0_${bi}`];
                        if (imgData && typeof imgData === 'string' && imgData.includes(',')) {
                            try {
                                const { mime: imgMime, ext: imgExt } = getMimeAndExt(imgData);
                                const imgFilename = `beat_${seqIdx}_${item.sceneIdx}_${bi}.${imgExt}`;
                                const imgId = `img_${seqIdx}_${item.sceneIdx}_${bi}`;

                                const imgBlob = dataUrlToBlob(imgData);
                                imagesFolder.file(imgFilename, imgBlob);

                                manifestItems.push(
                                    `<item id="${imgId}" href="Images/${imgFilename}" media-type="${imgMime}"/>`
                                );
                                sceneProseHtml += `\n<div style="text-align: center; margin: 1.5em 0;"><img src="../Images/${imgFilename}" style="max-width: 100%; height: auto; border-radius: 4px;" alt="Beat Image" /></div>\n`;
                            } catch (e) {
                                console.warn('Failed to attach beat image to EPUB:', e);
                            }
                        }
                    });

                    // Scene Audio Drama MP3 Embed (EPUB 3.0)
                    let sceneAudioPlayerHtml = '';
                    const audioEntry = audioMap[item.sId];
                    if (audioEntry && audioEntry.rec && audioEntry.buffer) {
                        const audioRec = audioEntry.rec;
                        try {
                            const audioFilename = `scene_${seqIdx}_${item.sceneIdx}.mp3`;
                            const audioItemId = `audio_scene_${seqIdx}_${item.sceneIdx}`;
                            audioFolder.file(audioFilename, audioEntry.buffer, { compression: 'STORE' });
                            manifestItems.push(
                                `<item id="${audioItemId}" href="Audio/${audioFilename}" media-type="audio/mpeg"/>`
                            );
                            audioManifest[item.sId] = {
                                href: `Audio/${audioFilename}`,
                                durationSec: audioRec.durationSec || 0,
                                textHash: audioRec.textHash || '',
                                cueCount: audioRec.cueCount || 0,
                                cueTimeline: Array.isArray(audioRec.cueTimeline)
                                    ? audioRec.cueTimeline
                                    : null
                            };
                            const sTitle =
                                item.scene && item.scene.title
                                    ? item.scene.title.trim()
                                    : `Scene ${item.sceneIdx + 1}`;
                            const durSec = Math.round(audioRec.durationSec || 0);
                            const durLabel =
                                durSec > 0 ? `${Math.floor(durSec / 60)}m ${durSec % 60}s` : 'Performance';
                            sceneAudioPlayerHtml = `\n<div class="scene-audio-player" style="margin: 1.5em 0; padding: 12px 16px; background: #faf7f2; border: 1px solid #e7dfd4; border-radius: 10px; display: flex; flex-direction: column; gap: 6px;">\n  <div style="font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.05em; font-family: sans-serif; font-weight: bold; color: #8a6d3b;">Scene Audio Drama &bull; ${escapeXml(sTitle)} (${durLabel})</div>\n  <audio controls="controls" preload="metadata" style="width: 100%;">\n    <source src="../Audio/${audioFilename}" type="audio/mpeg" />\n    Your EPUB reader does not support audio playback.\n  </audio>\n</div>\n`;
                        } catch (aErr) {
                            console.warn('Failed to attach scene audio to EPUB:', aErr);
                        }
                    }

                    chapterBody += sceneAudioPlayerHtml + sceneIllustrationHtml + sceneProseHtml;
                });

                chapterBody = linkFirstUsesInHtml(chapterBody, chapFilename, chapHeading);
                chapterBody = ensureXhtmlVoidTags(chapterBody);

                const chapterHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>${escapeXml(chapHeading)}</title>
<style>
body { font-family: sans-serif; line-height: 1.6; padding: 1em; }
p { margin-bottom: 1em; text-indent: 0; }
.beat p { text-indent: 1.5em; }
h1 { text-align: center; margin-bottom: 2em; }
.scene-divider { text-align: center; margin: 2em auto; border: 0; border-top: 1px solid #ccc; width: 50%; }
.scene-illustration { text-align: center; margin: 2em auto; max-width: 100%; }
.scene-illustration img { max-width: 100%; height: auto; border-radius: 6px; }
a.appendix-ref { color: inherit; text-decoration: underline dotted #888; text-underline-offset: 2px; }
a.appendix-ref:hover { text-decoration: underline; color: #8a6d3b; }
</style>
</head>
<body>
<h1>${escapeXml(chapHeading)}</h1>
${chapterBody}
</body>
</html>`;
                textFolder.file(chapFilename, chapterHtml);
                const chapFileId = `chap_${actNum}_${partNum}_${chap.chapNum}`;
                manifestItems.push(
                    `<item id="${chapFileId}" href="Text/${chapFilename}" media-type="application/xhtml+xml"/>`
                );
                spineItems.push(`<itemref idref="${chapFileId}"/>`);
                navItems.push({ href: `Text/${chapFilename}`, heading: chapHeading, level: 3 });

                actNavPoint += `
<navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
<navLabel><text>${escapeXml(chapHeading)}</text></navLabel>
<content src="Text/${chapFilename}"/>
</navPoint>`;
                playOrder++;
            });

            actNavPoint += `</navPoint>`;
        });

        actNavPoint += `</navPoint>`;
        tocPoints.push(actNavPoint);
    });

    // 4.1 Appendix (Dramatis Personæ & Continuity Ledger)
    if (castList.length > 0 || ledgerList.length > 0) {
        castList.forEach((c, cIdx) => {
            if (!c || !c.id) return;
            const portKey = `portrait_${story.id}_${c.id}`;
            const portData = imagesMap[portKey];
            if (portData && typeof portData === 'string' && portData.includes(',')) {
                try {
                    const { mime: portMime, ext: portExt } = getMimeAndExt(portData);
                    const safeCharId = slugify(c.id || c.name || `char_${cIdx}`);
                    const portFilename = `portrait_${safeCharId}.${portExt}`;
                    const portImgId = `port_${safeCharId}`;
                    const portBlob = dataUrlToBlob(portData);
                    imagesFolder.file(portFilename, portBlob);
                    manifestItems.push(
                        `<item id="${portImgId}" href="Images/${portFilename}" media-type="${portMime}"/>`
                    );
                    charPortraits[c.id] = `../Images/${portFilename}`;
                } catch (e) {
                    console.warn('Failed to attach character portrait to EPUB:', e);
                }
            }
        });

        let appendixHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Appendix: Dramatis Personæ &amp; Continuity Ledger</title>
<style>
body { font-family: sans-serif; line-height: 1.6; padding: 1.5em; max-width: 800px; margin: 0 auto; color: #222; }
h1 { text-align: center; font-size: 1.8em; margin-bottom: 0.5em; border-bottom: 2px solid #ddd; padding-bottom: 0.5em; font-family: serif; }
h2 { font-size: 1.4em; margin-top: 2em; margin-bottom: 0.8em; border-bottom: 1px solid #ccc; padding-bottom: 0.3em; font-family: serif; color: #333; }
h3 { font-size: 1.15em; margin-top: 1.5em; margin-bottom: 0.5em; font-family: serif; color: #444; }
h4 { font-size: 1.05em; margin: 0; font-family: serif; color: #111; }
.appendix-entry { margin-bottom: 1.8em; padding: 1.2em; background: #fdfdfd; border: 1px solid #e2e2e2; border-radius: 8px; }
.appendix-entry-header { display: flex; align-items: baseline; gap: 0.5em; margin-bottom: 0.5em; flex-wrap: wrap; }
.badge { display: inline-block; font-size: 0.75em; text-transform: uppercase; font-family: monospace; font-weight: bold; background: #eaeaea; color: #555; padding: 2px 7px; border-radius: 4px; border: 1px solid #d0d0d0; }
.badge-appearance { background: #f5eef8; color: #6c3483; border-color: #d7bde2; }
.badge-object { background: #fef5e7; color: #b9770e; border-color: #f8c471; }
.badge-place { background: #eafaf1; color: #1e8449; border-color: #a9dfbf; }
.badge-lore { background: #ebf5fb; color: #2874a6; border-color: #aed6f1; }
.badge-agreement { background: #f4ecf7; color: #7d3c98; border-color: #d2b4de; }
.portrait-img { float: right; max-width: 110px; max-height: 150px; border-radius: 6px; border: 1px solid #ccc; margin: 0 0 1em 1em; object-fit: cover; }
.backlink { display: inline-block; margin-top: 0.6em; font-size: 0.85em; color: #8a6d3b; text-decoration: none; font-style: italic; }
.backlink:hover { text-decoration: underline; }
.entry-detail { margin: 0.3em 0; font-size: 0.95em; }
.voice-sample { font-style: italic; background: #fffdf5; padding: 0.6em 0.8em; border-left: 3px solid #d4af37; margin: 0.6em 0; font-size: 0.9em; }
.nav-pills { text-align: center; margin-bottom: 2em; font-size: 0.9em; }
.nav-pills a { margin: 0 0.8em; color: #8a6d3b; text-decoration: none; font-weight: bold; }
.nav-pills a:hover { text-decoration: underline; }
.clear { clear: both; }
</style>
</head>
<body>
<h1>Appendix</h1>
<p style="text-align: center; font-style: italic; color: #666; margin-bottom: 1.5em;">A companion reference containing Dramatis Personæ and the Canon Continuity Ledger.</p>
`;

        if (castList.length > 0 && ledgerList.length > 0) {
            appendixHtml += `<div class="nav-pills"><a href="#dramatis-personae">Dramatis Personæ</a> &bull; <a href="#continuity-ledger">Continuity Ledger</a></div>\n`;
        }

        if (castList.length > 0) {
            appendixHtml += `<section id="dramatis-personae">\n<h2>Dramatis Personæ</h2>\n`;
            castList.forEach((c, cIdx) => {
                const item = linkableItems.find((li) => li.type === 'character' && li.entity === c);
                const targetAnchor = item
                    ? item.targetAnchor
                    : `char_${slugify(c.id || c.name || `char_${cIdx}`)}`;
                const cite = item ? firstUseCitations[item.id] : null;
                const portSrc = c.id ? charPortraits[c.id] : undefined;

                appendixHtml += `<div id="${targetAnchor}" class="appendix-entry">\n`;
                if (portSrc) {
                    appendixHtml += `  <img src="${portSrc}" alt="${escapeXml(c.name)}" class="portrait-img" />\n`;
                }
                appendixHtml += `  <div class="appendix-entry-header">\n`;
                appendixHtml += `    <h4>${escapeXml(c.name)}</h4>\n`;
                if (c.role) {
                    appendixHtml += `    <span class="badge">${escapeXml(c.role)}</span>\n`;
                }
                appendixHtml += `  </div>\n`;

                if (c.archetype) {
                    appendixHtml += `  <p class="entry-detail"><strong>Archetype:</strong> ${escapeXml(c.archetype)}</p>\n`;
                }
                if (c.core_flaw || c.core_desire) {
                    appendixHtml += `  <p class="entry-detail">`;
                    if (c.core_desire) {
                        appendixHtml += `<strong>Desire:</strong> ${escapeXml(c.core_desire)} `;
                    }
                    if (c.core_flaw) appendixHtml += `<strong>Flaw:</strong> ${escapeXml(c.core_flaw)}`;
                    appendixHtml += `</p>\n`;
                }
                if (c.psychological_profile) {
                    const pp = c.psychological_profile;
                    if (pp.lie_believed || pp.truth_needed) {
                        appendixHtml += `  <p class="entry-detail"><strong>Psychological Arc:</strong> `;
                        if (pp.lie_believed) {
                            appendixHtml += `Believes "${escapeXml(pp.lie_believed)}"; `;
                        }
                        if (pp.truth_needed) {
                            appendixHtml += `Truth Needed: "${escapeXml(pp.truth_needed)}"`;
                        }
                        appendixHtml += `</p>\n`;
                    }
                }
                if (c.details?.history) {
                    appendixHtml += `  <p class="entry-detail"><strong>Backstory:</strong> ${escapeXml(c.details.history)}</p>\n`;
                }
                if (c.voice_sample || c.vocal_cadence) {
                    appendixHtml += `  <div class="voice-sample"><strong>Voice:</strong> ${escapeXml(c.voice_sample || c.vocal_cadence)}</div>\n`;
                }
                if (cite) {
                    appendixHtml += `  <p><a href="${cite.file}#${cite.anchor}" class="backlink">&#x21a9; Return to first mention (${escapeXml(cite.title)})</a></p>\n`;
                }
                appendixHtml += `  <div class="clear"></div>\n</div>\n`;
            });
            appendixHtml += `</section>\n`;
        }

        if (ledgerList.length > 0) {
            appendixHtml += `<section id="continuity-ledger">\n<h2>Continuity Ledger &amp; World Lore</h2>\n`;
            const categoryGroups: Record<string, Array<{ fact: ExportLedgerFact; fIdx: number }>> = {};
            ledgerList.forEach((fact, fIdx) => {
                if (!fact || !fact.key) return;
                const cat = (fact.category || 'Fact').trim();
                if (!categoryGroups[cat]) categoryGroups[cat] = [];
                categoryGroups[cat].push({ fact, fIdx });
            });

            const catOrder = [
                'place',
                'object',
                'lore',
                'agreement',
                'appearance',
                'state change',
                'fact'
            ];
            const sortedCategories = Object.keys(categoryGroups).sort((a, b) => {
                const idxA = catOrder.indexOf(a.toLowerCase());
                const idxB = catOrder.indexOf(b.toLowerCase());
                const weightA = idxA === -1 ? 99 : idxA;
                const weightB = idxB === -1 ? 99 : idxB;
                return weightA - weightB || a.localeCompare(b);
            });

            sortedCategories.forEach((catName) => {
                const items = categoryGroups[catName];
                const catLower = catName.toLowerCase();
                let badgeClass = 'badge';
                if (catLower.includes('place')) badgeClass = 'badge badge-place';
                else if (catLower.includes('object')) badgeClass = 'badge badge-object';
                else if (catLower.includes('lore')) badgeClass = 'badge badge-lore';
                else if (catLower.includes('agreement')) badgeClass = 'badge badge-agreement';
                else if (catLower.includes('appearance')) badgeClass = 'badge badge-appearance';

                appendixHtml += `<h3>${escapeXml(catName)}</h3>\n`;
                items.forEach(({ fact }) => {
                    const item = linkableItems.find((li) => li.type === 'ledger' && li.entity === fact);
                    const targetAnchor = item
                        ? item.targetAnchor
                        : `ledger_${slugify(String(fact.key || ''))}`;
                    const cite = item ? firstUseCitations[item.id] : null;

                    appendixHtml += `<div id="${targetAnchor}" class="appendix-entry">\n`;
                    appendixHtml += `  <div class="appendix-entry-header">\n`;
                    appendixHtml += `    <h4>${escapeXml(fact.key)}</h4>\n`;
                    appendixHtml += `    <span class="${badgeClass}">${escapeXml(fact.category || 'Fact')}</span>\n`;
                    if (fact.source_scene) {
                        appendixHtml += `    <span style="font-size: 0.8em; color: #888; font-family: monospace;">(${escapeXml(fact.source_scene)})</span>\n`;
                    }
                    appendixHtml += `  </div>\n`;
                    if (fact.value) {
                        appendixHtml += `  <p class="entry-detail">${escapeXml(fact.value)}</p>\n`;
                    }
                    if (cite) {
                        appendixHtml += `  <p><a href="${cite.file}#${cite.anchor}" class="backlink">&#x21a9; Return to first mention (${escapeXml(cite.title)})</a></p>\n`;
                    }
                    appendixHtml += `</div>\n`;
                });
            });
            appendixHtml += `</section>\n`;
        }

        appendixHtml += `</body>\n</html>`;
        appendixHtml = ensureXhtmlVoidTags(appendixHtml);

        textFolder.file('Appendix.xhtml', appendixHtml);
        manifestItems.push(
            `<item id="appendix" href="Text/Appendix.xhtml" media-type="application/xhtml+xml"/>`
        );
        spineItems.push(`<itemref idref="appendix"/>`);
        navItems.push({
            href: 'Text/Appendix.xhtml',
            heading: 'Appendix: Dramatis Personæ & Continuity Ledger',
            level: 1
        });
        tocPoints.push(
            `<navPoint id="navPoint-${playOrder}" playOrder="${playOrder}"><navLabel><text>Appendix: Dramatis Personæ &amp; Continuity Ledger</text></navLabel><content src="Text/Appendix.xhtml"/></navPoint>`
        );
        playOrder++;
    }

    // 4.2 EPUB 3 Navigation Document (nav.xhtml)
    const navListItems = navItems
        .map(
            (item) => `    <li class="level-${item.level}"><a href="${item.href}">${escapeXml(item.heading)}</a></li>`
        )
        .join('\n');
    const navHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
<title>Table of Contents</title>
<style>
body { font-family: sans-serif; line-height: 1.6; padding: 1em; }
nav ol { list-style-type: none; padding-left: 0; }
li.level-1 { font-weight: bold; margin-top: 1em; font-size: 1.1em; }
li.level-2 { margin-left: 1.2em; font-weight: 600; font-size: 1em; }
li.level-3 { margin-left: 2.4em; font-weight: normal; font-size: 0.95em; }
a { color: #8a6d3b; text-decoration: none; }
a:hover { text-decoration: underline; }
</style>
</head>
<body>
<nav epub:type="toc" id="toc">
  <h1>Table of Contents</h1>
  <ol>
${navListItems}
  </ol>
</nav>
</body>
</html>`;
    textFolder.file('nav.xhtml', navHtml);
    manifestItems.push(
        `<item id="nav" href="Text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`
    );

    // 5. NCX (TOC)
    const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
   <head>
      <meta name="dtb:uid" content="urn:ellipsisprose:${escapeXml(story.id || 'untitled')}"/>
      <meta name="dtb:depth" content="2"/>
      <meta name="dtb:totalPageCount" content="0"/>
      <meta name="dtb:maxPageNumber" content="0"/>
   </head>
   <docTitle><text>${escapeXml(story.title || 'Untitled Story')}</text></docTitle>
   <navMap>
      ${tocPoints.join('\n')}
   </navMap>
</ncx>`;
    oebps.file('toc.ncx', ncx);

    // 6. OPF
    let opfMetadata = `
      <dc:title>${escapeXml(story.title || 'Untitled Story')}</dc:title>
      <dc:creator opf:role="aut">${escapeXml(story.author || 'EllipsisProse User')}</dc:creator>
      <dc:language>en</dc:language>
      <dc:identifier id="BookId">urn:ellipsisprose:${escapeXml(story.id || 'untitled')}</dc:identifier>
`;
    if (imagesMap.cover) {
        opfMetadata += `      <meta name="cover" content="cover-image"/>\n`;
    }

    const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
   <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
      ${opfMetadata}
   </metadata>
   <manifest>
      <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
      ${manifestItems.join('\n      ')}
   </manifest>
   <spine toc="ncx">
      ${spineItems.join('\n      ')}
   </spine>
</package>`;
    oebps.file('content.opf', opf);

    // Embed Database JSON info in META-INF/story.json
    const dbExport: {
        story: StoryExportInput;
        images: Record<string, string>;
        audioManifest: Record<string, EpubAudioManifestItem>;
    } = {
        story,
        images: {},
        audioManifest
    };
    if (imagesMap.cover && story.id) {
        dbExport.images[`cover_${story.id}`] = imagesMap.cover;
    }
    Object.keys(imagesMap).forEach((key) => {
        if (key !== 'cover') {
            dbExport.images[key] = imagesMap[key];
        }
    });
    metaInfFolder.file('story.json', JSON.stringify(dbExport));

    // 7. Generate
    const content = await zip.generateAsync({ type: 'blob' });
    const filename = `ellipsisprose_export_${safeFilename}_${new Date().toISOString().slice(0, 10)}.epub`;
    return {
        blob: content,
        filename,
        audioCount: Object.keys(audioManifest).length
    };
}

/** Builds an EPUB 3.0 archive and triggers browser download. */
export async function exportStoryEpub(
    story: StoryExportInput,
    deps: EpubExportDependencies = {}
): Promise<EpubExportResult> {
    const result = await buildStoryEpubBlob(story, deps);
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return result;
}
