import type { NameBanks } from './types';

/**
 * The name banks are about 1.5 MB of JSON, so they load on demand as their own chunk.
 * `getNameBanks` is the synchronous view for code that cannot wait (the name audit):
 * it returns null until `loadNameBanks` has finished once.
 */
let loaded: NameBanks | null = null;
let loading: Promise<NameBanks | null> | null = null;

export function getNameBanks(): NameBanks | null {
    return loaded;
}

export function loadNameBanks(): Promise<NameBanks | null> {
    if (loaded) return Promise.resolve(loaded);
    if (!loading) {
        loading = Promise.all([import('./tables/given_names.json'), import('./tables/names.json')])
            .then(([given, names]) => {
                loaded = {
                    given: (given.default ?? given) as unknown as NameBanks['given'],
                    names: (names.default ?? names) as unknown as NameBanks['names']
                };
                return loaded;
            })
            .catch((err) => {
                console.warn('[names] Name banks failed to load:', err);
                loading = null;
                return null;
            });
    }
    return loading;
}

/** Tests only: install or clear the banks without the dynamic import. */
export function setNameBanksForTests(banks: NameBanks | null): void {
    loaded = banks;
    loading = null;
}
