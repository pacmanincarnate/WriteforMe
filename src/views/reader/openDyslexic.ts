/**
 * @module views/reader/openDyslexic
 * Loads the OpenDyslexic typeface (SIL Open Font License) the first time it is wanted, so readers
 * who never pick it do not pay for it at start-up. The font files ship with the app and are kept
 * for offline use like every other built file.
 */

const FACES = [
    { weight: '400', style: 'normal', file: () => import('@fontsource/opendyslexic/files/opendyslexic-latin-400-normal.woff2?url') },
    { weight: '400', style: 'italic', file: () => import('@fontsource/opendyslexic/files/opendyslexic-latin-400-italic.woff2?url') },
    { weight: '700', style: 'normal', file: () => import('@fontsource/opendyslexic/files/opendyslexic-latin-700-normal.woff2?url') }
] as const;

let loading: Promise<boolean> | null = null;

/** True once the faces are registered with the page; false where fonts cannot be loaded. */
export function loadOpenDyslexic(): Promise<boolean> {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return Promise.resolve(false);
    if (!loading) {
        loading = Promise.all(
            FACES.map(async (face) => {
                const url = (await face.file()).default;
                const loaded = await new FontFace('OpenDyslexic', `url("${url}") format("woff2")`, {
                    weight: face.weight,
                    style: face.style,
                    display: 'swap'
                }).load();
                document.fonts.add(loaded);
            })
        ).then(
            () => true,
            (err) => {
                console.warn('[Reader] OpenDyslexic could not be loaded:', err);
                loading = null;
                return false;
            }
        );
    }
    return loading;
}
