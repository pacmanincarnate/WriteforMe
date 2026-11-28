/**
 * @module domain/series/secrets
 * Secrets that span books. A series secret is revealed in layers; each layer becomes a normal
 * Secret Vault entry in its book, so the existing clue and reveal machinery does the work.
 * A layer that belongs to a later book sits in the vault as a hidden entry that only plants clues.
 */

import type {
    SecretEntry,
    SecretEvent,
    SecretLayer,
    SeededClueRecord,
    SeriesPlan,
    SeriesSecret,
    SeriesSecretFields,
    Story
} from '@/types';

/** A reveal anchor no sequence ever matches, so the vault never reveals a hidden layer. */
export const HIDDEN_REVEAL_SEQUENCE = 99;

type VaultSecret = SecretEntry & SeriesSecretFields & Record<string, unknown>;

function clean(val: unknown): string {
    return typeof val === 'string' ? val.trim() : typeof val === 'number' ? String(val) : '';
}

function names(val: unknown): string[] {
    if (Array.isArray(val)) return val.map(clean).filter(Boolean);
    return clean(val)
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter((s) => s && !/^(none|n\/a|nobody|no one|reader only)$/i.test(s));
}

/** True when the vault may reveal this secret in the given book. Standalone secrets always are. */
export function isRevealDueThisBook(
    secret: (SecretEntry & SeriesSecretFields) | null | undefined,
    bookNumber: number | null | undefined
): boolean {
    if (!secret || secret.scope !== 'series') return true;
    if (!bookNumber) return true;
    const revealBook = Number(secret.reveal_book);
    if (!Number.isFinite(revealBook) || revealBook <= 0) return true;
    return revealBook <= bookNumber;
}

/** True for a vault entry that must stay hidden for the whole of this book. */
export function isHiddenThisBook(secret: SecretEntry & SeriesSecretFields, story: Partial<Story> | null | undefined): boolean {
    return !isRevealDueThisBook(secret, story?.series?.book_number);
}

export function normalizeSeriesSecrets(raw: unknown, currentBook = 1): SeriesSecret[] {
    if (!Array.isArray(raw)) return [];
    const out: SeriesSecret[] = [];
    raw.forEach((item, idx) => {
        if (!item || typeof item !== 'object') return;
        const s = item as Record<string, unknown>;
        const rawLayers = Array.isArray(s.layers) ? (s.layers as unknown[]) : [];
        const layers: SecretLayer[] = rawLayers
            .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
            .map((l, lIdx) => ({
                layer: Number(l.layer) || lIdx + 1,
                truth: clean(l.truth),
                reveal_book: Math.max(1, Math.floor(Number(l.reveal_book)) || currentBook),
                revealed_to: names(l.revealed_to),
                status: l.status === 'revealed' ? ('revealed' as const) : ('hidden' as const)
            }))
            .filter((l) => l.truth)
            .sort((a, b) => a.reveal_book - b.reveal_book || a.layer - b.layer)
            .map((l, lIdx) => ({ ...l, layer: lIdx + 1 }));
        if (layers.length === 0) return;
        out.push({
            id: clean(s.id) || `ssec_${idx + 1}`,
            title: clean(s.title) || `Series Secret ${idx + 1}`,
            cover_story: clean(s.cover_story),
            known_by_characters: names(s.known_by_characters ?? s.known_by),
            concealed_from_characters: names(s.concealed_from_characters ?? s.concealed_from),
            reader_status: s.reader_status === 'aware' ? 'aware' : 'blind',
            layers,
            seeded_clues: Array.isArray(s.seeded_clues)
                ? (s.seeded_clues as unknown[])
                      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
                      .map((c) => ({
                          book: Number(c.book) || currentBook,
                          scene: clean(c.scene),
                          directive: clean(c.directive)
                      }))
                      .filter((c) => c.directive)
                : []
        });
    });
    return out;
}

/** The lowest layer that has not been revealed yet, or null when the secret is fully out. */
export function nextHiddenLayer(secret: SeriesSecret): SecretLayer | null {
    return secret.layers.find((l) => l.status !== 'revealed') || null;
}

export function vaultIdForLayer(secretId: string, layer: number): string {
    return `${secretId}_L${layer}`;
}

/**
 * Adds this book's vault entries for the series secrets: a revealable entry for a layer due now,
 * or a hidden clue-only entry for a layer that belongs to a later book. Existing entries are kept.
 */
export function materializeSeriesSecrets(
    vault: unknown,
    plan: Pick<SeriesPlan, 'secrets'> | null | undefined,
    bookNumber: number
): VaultSecret[] {
    const out: VaultSecret[] = Array.isArray(vault) ? [...(vault as VaultSecret[])] : [];
    if (!plan || !Array.isArray(plan.secrets)) return out;
    plan.secrets.forEach((sec) => {
        const layer = nextHiddenLayer(sec);
        if (!layer) return;
        const id = vaultIdForLayer(sec.id, layer.layer);
        if (out.some((v) => v && (v.id === id || (v.parent_secret_id === sec.id && Number(v.layer) === layer.layer)))) {
            return;
        }
        const dueNow = layer.reveal_book <= bookNumber;
        const isFinalLayer = layer.layer === sec.layers.length;
        out.push({
            id,
            title: isFinalLayer ? sec.title : `${sec.title} (part ${layer.layer})`,
            category: 'plot_mystery',
            truth: layer.truth,
            cover_story: {
                public_belief: sec.cover_story || 'The accepted account, which nobody has reason to doubt yet.',
                character_masks: {}
            },
            known_by_characters: sec.known_by_characters || [],
            concealed_from_characters: sec.concealed_from_characters || [],
            reader_status: sec.reader_status || 'blind',
            reveal_anchor: dueNow
                ? { act_number: 3, sequence_number: 7, scene_hint: 'Climax confrontation' }
                : {
                      act_number: 3,
                      sequence_number: HIDDEN_REVEAL_SEQUENCE,
                      scene_hint: `Held for Book ${layer.reveal_book}`
                  },
            status: 'dormant',
            clue_schedule: dueNow
                ? [
                      {
                          sequence_number: 2,
                          behavioral_directive: `A small, concrete oddity that only makes sense once "${sec.title}" is understood. Do not explain it.`,
                          benign_reason: 'Looks like an ordinary habit or coincidence.',
                          seeded_in_prose: false
                      },
                      {
                          sequence_number: 5,
                          behavioral_directive: `Under pressure, a second detail that points toward "${sec.title}" without stating it.`,
                          benign_reason: 'Easily blamed on stress or circumstance.',
                          seeded_in_prose: false
                      }
                  ]
                : [
                      {
                          sequence_number: 4,
                          behavioral_directive: `One quiet, concrete detail that will matter in a later book for "${sec.title}". Nobody remarks on it and it is not explained.`,
                          benign_reason: 'Reads as background texture.',
                          seeded_in_prose: false
                      }
                  ],
            scope: 'series',
            reveal_book: dueNow ? bookNumber : layer.reveal_book,
            parent_secret_id: sec.id,
            layer: layer.layer
        } as VaultSecret);
    });
    return out;
}

/** Every clue already on the page for a series secret, as text for the reveal prompt. */
export function buildFairPlayLedger(secret: SeriesSecret | null | undefined): string {
    const clues = secret?.seeded_clues || [];
    if (clues.length === 0) return '';
    return clues.map((c) => `Book ${c.book}${c.scene ? `, ${c.scene}` : ''}: ${c.directive}`).join(' | ');
}

/** Fair-play text for a vault entry that came from a series secret, or '' for any other secret. */
export function fairPlayLedgerForVaultSecret(story: Partial<Story> | null | undefined, secret: SecretEntry & SeriesSecretFields): string {
    if (!secret?.parent_secret_id) return '';
    const parent = story?.series?.plan?.secrets?.find((s) => s.id === secret.parent_secret_id);
    return buildFairPlayLedger(parent);
}

/**
 * Copies what the vault learned during drafting back onto the series secrets: clues that reached
 * the page join the fair-play ledger, and a revealed vault entry marks its layer revealed.
 */
export function syncSeriesSecretsFromVault(story: Partial<Story>): SeriesSecret[] {
    const secrets = story.series?.plan?.secrets || [];
    const book = story.series?.book_number || 1;
    const vault = (Array.isArray(story.secret_vault) ? story.secret_vault : []) as VaultSecret[];
    return secrets.map((sec) => {
        const entries = vault.filter((v) => v && v.parent_secret_id === sec.id);
        if (entries.length === 0) return sec;
        const seeded: SeededClueRecord[] = [...(sec.seeded_clues || [])];
        const layers = sec.layers.map((l) => ({ ...l }));
        const knownBy = new Set(sec.known_by_characters || []);
        entries.forEach((v) => {
            const clues = Array.isArray(v.clue_schedule) ? (v.clue_schedule as Array<Record<string, unknown>>) : [];
            clues.forEach((c) => {
                if (!c.seeded_in_prose) return;
                const directive = clean(c.behavioral_directive);
                const scene = `sequence ${Number(c.sequence_number) || '?'}`;
                if (directive && !seeded.some((s) => s.book === book && s.directive === directive)) {
                    seeded.push({ book, scene, directive });
                }
            });
            names(v.known_by_characters).forEach((n) => knownBy.add(n));
            if (v.status === 'revealed') {
                const layer = layers.find((l) => l.layer === Number(v.layer));
                if (layer) {
                    layer.status = 'revealed';
                    (layer.revealed_to || []).forEach((n) => knownBy.add(n));
                }
            }
        });
        const concealed = (sec.concealed_from_characters || []).filter((n) => !knownBy.has(n));
        return {
            ...sec,
            layers,
            seeded_clues: seeded,
            known_by_characters: Array.from(knownBy),
            concealed_from_characters: concealed
        };
    });
}

export interface SecretEventResult {
    secrets: SeriesSecret[];
    /** Ids of vault secrets the scene gave away although they belong to a later book. */
    leaks: Array<{ secret_id: string; evidence: string }>;
}

/** Records what the continuity pass saw happen to secrets in one scene. */
export function applySecretEvents(story: Partial<Story>, events: SecretEvent[] | undefined, sceneLabel: string): SecretEventResult {
    const book = story.series?.book_number || 1;
    const vault = (Array.isArray(story.secret_vault) ? story.secret_vault : []) as VaultSecret[];
    let secrets = story.series?.plan?.secrets || [];
    const leaks: SecretEventResult['leaks'] = [];
    if (!Array.isArray(events)) return { secrets, leaks };
    events.forEach((ev) => {
        const id = clean(ev?.secret_id);
        const kind = clean(ev?.event).toLowerCase();
        const entry = vault.find((v) => v && (v.id === id || clean(v.title).toLowerCase() === id.toLowerCase()));
        if (!entry) return;
        const hidden = !isRevealDueThisBook(entry, book);
        if ((kind === 'leaked' || kind === 'layer_revealed') && hidden) {
            leaks.push({ secret_id: String(entry.id || id), evidence: clean(ev.evidence) });
            return;
        }
        if (kind === 'clue_seeded' && entry.parent_secret_id) {
            const directive = clean(ev.evidence);
            if (!directive) return;
            secrets = secrets.map((s) =>
                s.id !== entry.parent_secret_id || (s.seeded_clues || []).some((c) => c.book === book && c.directive === directive)
                    ? s
                    : { ...s, seeded_clues: [...(s.seeded_clues || []), { book, scene: sceneLabel, directive }] }
            );
        }
    });
    return { secrets, leaks };
}

/** Who believes each secret's truth at the end of a book, read from the belief graph. */
export function readSecretKnowledge(story: Partial<Story>): Record<string, string[]> {
    const graph = story.epistemic_graph as
        | {
              entities?: Record<string, { name?: string }>;
              propositions?: Record<string, { secret_id?: string }>;
              holds_belief_edges?: Array<{
                  holder_id?: string;
                  proposition_id?: string;
                  stance?: string;
                  invalidated_at_scene?: string | null;
              }>;
          }
        | null
        | undefined;
    const out: Record<string, string[]> = {};
    if (!graph || !Array.isArray(graph.holds_belief_edges)) return out;
    graph.holds_belief_edges.forEach((edge) => {
        if (!edge || edge.invalidated_at_scene) return;
        if (edge.stance !== 'BELIEVES_TRUE') return;
        const holder = String(edge.holder_id || '');
        if (!holder || holder === 'meta_reader') return;
        const propId = String(edge.proposition_id || '');
        const secretId = graph.propositions?.[propId]?.secret_id || (/^prop_(.+)_truth$/.exec(propId)?.[1] ?? '');
        if (!secretId) return;
        const name = graph.entities?.[holder]?.name || holder;
        out[secretId] = out[secretId] || [];
        if (!out[secretId].includes(name)) out[secretId].push(name);
    });
    return out;
}

export interface CarriedSecrets {
    /** Series secrets with the finished book's clues, reveals and knowledge folded in. */
    seriesSecrets: SeriesSecret[];
    /** Book-level secrets that stay in play: unrevealed ones, and ones only some characters know. */
    vault: VaultSecret[];
    /** Secrets everyone now knows, as plain facts for the next book's lore. */
    revealedFacts: Array<{ title: string; truth: string; known_by: string[] }>;
}

/** Decides what happens to every secret when a book ends and the next one starts. */
export function carrySecretsToSequel(source: Partial<Story>): CarriedSecrets {
    const knowledge = readSecretKnowledge(source);
    const castNames = (Array.isArray(source.cast) ? source.cast : []).map((c) => clean(c?.name)).filter(Boolean);
    const seriesSecrets = syncSeriesSecretsFromVault(source).map((sec) => {
        const extra = new Set(sec.known_by_characters || []);
        const vault = (Array.isArray(source.secret_vault) ? source.secret_vault : []) as VaultSecret[];
        vault
            .filter((v) => v && v.parent_secret_id === sec.id)
            .forEach((v) => (knowledge[String(v.id)] || []).forEach((n) => extra.add(n)));
        return {
            ...sec,
            known_by_characters: Array.from(extra),
            concealed_from_characters: (sec.concealed_from_characters || []).filter((n) => !extra.has(n))
        };
    });

    const book = source.series?.book_number || 1;
    const vault: VaultSecret[] = [];
    const revealedFacts: CarriedSecrets['revealedFacts'] = [];
    ((Array.isArray(source.secret_vault) ? source.secret_vault : []) as VaultSecret[]).forEach((v) => {
        if (!v || typeof v !== 'object') return;
        const knowers = Array.from(new Set([...names(v.known_by_characters), ...(knowledge[String(v.id)] || [])]));
        const title = clean(v.title) || 'Secret';
        const truth = clean(v.truth);
        if (v.parent_secret_id) {
            // Layers are rebuilt from the series plan for the next book.
            if (v.status === 'revealed' && truth) revealedFacts.push({ title, truth, known_by: knowers });
            return;
        }
        if (v.category === 'red_herring') return;
        if (v.status !== 'revealed') {
            vault.push({
                ...v,
                known_by_characters: knowers,
                status: 'dormant',
                clue_schedule: [],
                reveal_anchor: { act_number: 3, sequence_number: 7, scene_hint: 'Climax confrontation' },
                carried_from_book: book
            });
            return;
        }
        if (!truth) return;
        const stillBlind = castNames.filter((n) => names(v.concealed_from_characters).includes(n) && !knowers.includes(n));
        revealedFacts.push({ title, truth, known_by: knowers });
        if (stillBlind.length > 0 && knowers.length > 0) {
            // Out in the open for some, still hidden from others: it carries as dramatic irony.
            vault.push({
                ...v,
                category: 'dramatic_irony',
                known_by_characters: knowers,
                concealed_from_characters: stillBlind,
                reader_status: 'aware',
                status: 'dormant',
                clue_schedule: [],
                reveal_anchor: { act_number: 3, sequence_number: 7, scene_hint: 'Confrontation' },
                carried_from_book: book
            });
        }
    });
    return { seriesSecrets, vault, revealedFacts };
}

/** Keeps a secret plan coherent: layers never reveal in a book that is already written. */
export function validateSecretPlan(secrets: SeriesSecret[], currentBook: number): SeriesSecret[] {
    return secrets.map((sec) => {
        let floor = currentBook;
        const layers = sec.layers.map((l) => {
            if (l.status === 'revealed') return l;
            const revealBook = Math.max(floor, l.reveal_book);
            floor = revealBook;
            return { ...l, reveal_book: revealBook };
        });
        return { ...sec, layers };
    });
}

/**
 * The Story Arc step replaces the vault with the secrets it designed for this book. This puts
 * back the entries that belong to the series: layers of series secrets and secrets carried
 * over from the previous book.
 */
export function keepSeriesVaultEntries(previousVault: unknown, nextVault: unknown): VaultSecret[] {
    const next = Array.isArray(nextVault) ? [...(nextVault as VaultSecret[])] : [];
    const prev = Array.isArray(previousVault) ? (previousVault as VaultSecret[]) : [];
    prev.forEach((v) => {
        if (!v || typeof v !== 'object') return;
        if (!v.parent_secret_id && v.carried_from_book === undefined) return;
        const taken = next.some((n) => n && (n.id === v.id || clean(n.title).toLowerCase() === clean(v.title).toLowerCase()));
        if (!taken) next.push(v);
        else if (!next.some((n) => n && n.id === v.id && clean(n.title).toLowerCase() === clean(v.title).toLowerCase())) {
            // Same id, different secret: give the series entry a free id rather than lose it.
            next.push({ ...v, id: `${String(v.id)}_series` });
        }
    });
    return next;
}
