/**
 * @module services/llm/koboldRuntime
 * The model name KoboldCPP reports as currently loaded. KoboldCPP serves whichever model it was
 * started with, so the name is discovered by a status probe (see `useModelCatalog`) and then read
 * by model-resolution code and by the model pickers.
 *
 * This replaces reads of the ad-hoc `window.koboldLoadedModelGlobal`. The setter still mirrors the
 * value there so DevTools and any external script that inspects it keep working, but nothing in
 * `src/` reads the window property any more.
 */

let loadedModelName = '';

/** Records the model KoboldCPP reported as loaded ('' clears it). */
export function setKoboldLoadedModelName(name: unknown): void {
    loadedModelName = typeof name === 'string' ? name : name ? String(name) : '';
    if (typeof window !== 'undefined') {
        const host = window as unknown as { koboldLoadedModelGlobal?: string };
        if (loadedModelName) host.koboldLoadedModelGlobal = loadedModelName;
        else delete host.koboldLoadedModelGlobal;
    }
}

/** Returns the model KoboldCPP last reported as loaded, or '' when unknown. */
export function getKoboldLoadedModelName(): string {
    return loadedModelName;
}
