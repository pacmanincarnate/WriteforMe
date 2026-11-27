declare module '@breezystack/lamejs' {
    export class Mp3Encoder {
        constructor(channels: number, sampleRate: number, kbps: number);
        encodeBuffer(left: Int16Array, right?: Int16Array): Uint8Array;
        flush(): Uint8Array;
    }
    const lamejs: {
        Mp3Encoder: typeof Mp3Encoder;
    };
    export default lamejs;
}

interface DesktopUpdaterProgressAmbient {
    phase: 'downloading' | 'verifying' | 'installing';
    file?: string;
    received: number;
    total: number | null;
    percent: number | null;
}

interface DesktopUpdaterStateAmbient {
    status:
        | 'idle'
        | 'checking'
        | 'up-to-date'
        | 'available'
        | 'downloading'
        | 'verifying'
        | 'installing'
        | 'downloaded-manual'
        | 'error';
    manual: boolean;
    currentVersion: string;
    latestVersion: string | null;
    releaseName: string | null;
    changelog: string;
    releaseUrl: string | null;
    publishedAt: string | null;
    installMode: 'nsis' | 'portable' | 'dev';
    asset: {
        name: string;
        size: number | null;
        downloadUrl: string;
        sha256: string | null;
    } | null;
    progress: DesktopUpdaterProgressAmbient | null;
    error: string | null;
    filePath: string | null;
    skippedVersion: string;
    isSkipped: boolean;
    checkedAt: string | null;
}

interface DesktopUpdaterBridgeAmbient {
    isDesktop: true;
    getState: () => Promise<{ ok: boolean; value?: DesktopUpdaterStateAmbient; error?: string }>;
    checkForUpdates: (opts?: {
        manual?: boolean;
    }) => Promise<{ ok: boolean; value?: DesktopUpdaterStateAmbient; error?: string }>;
    downloadAndInstall: () => Promise<{ ok: boolean; value?: unknown; error?: string }>;
    cancelDownload: () => Promise<{ ok: boolean; value?: unknown; error?: string }>;
    skipVersion: (version: string) => Promise<{ ok: boolean; value?: unknown; error?: string }>;
    openReleaseNotes: (url?: string) => Promise<{ ok: boolean; value?: unknown; error?: string }>;
    onStateChange: (cb: (state: DesktopUpdaterStateAmbient) => void) => () => void;
}

interface DesktopBackendEventAmbient {
    type: string;
    backendId?: string;
    packId?: string;
    modality?: 'llm' | 'audio' | 'image';
    message: string;
    level?: 'success' | 'error' | 'info' | 'warning';
    always?: boolean;
}

interface DesktopVramStatusAmbient {
    mode: 'auto' | 'strict' | 'manual';
    idleUnloadMinutes: number;
    evictThresholdMb: number;
    currentModality: 'llm' | 'audio' | 'image' | null;
    activeLeases: number;
    cloudActivityCount: number;
    resident: { llm: boolean; audio: boolean; image: boolean };
    gpu: { source: string; gpu: string; totalMb: number; usedMb: number; freeMb: number } | null;
}

interface DesktopBackendsBridgeAmbient {
    isDesktop: true;
    ensureKoboldRunning: () => Promise<{
        ok: boolean;
        value?: { ready: boolean; started: boolean; status?: string; reason?: string };
        error?: string;
    }>;
    ensureComfyRunning?: () => Promise<{
        ok: boolean;
        value?: { ready: boolean; started: boolean; status?: string; reason?: string };
        error?: string;
    }>;
    acquireGpuLease?: (
        modality: 'llm' | 'audio' | 'image',
        hints?: Record<string, unknown>
    ) => Promise<{
        ok: boolean;
        value?: { leaseId: string; modality: string; reentrant: boolean };
        error?: string;
    }>;
    releaseGpuLease?: (
        leaseId: string
    ) => Promise<{ ok: boolean; value?: { released: boolean }; error?: string }>;
    setCloudActivity?: (
        activeOrCount: number | boolean
    ) => Promise<{ ok: boolean; value?: { cloudActivityCount: number }; error?: string }>;
    freeAllVram?: () => Promise<{ ok: boolean; error?: string }>;
    getVramStatus?: () => Promise<{
        ok: boolean;
        value?: DesktopVramStatusAmbient;
        error?: string;
    }>;
    openBackendsWindow: () => Promise<{ ok: boolean; error?: string }>;
    onEvent: (cb: (event: DesktopBackendEventAmbient) => void) => () => void;
}

interface Window {
    React?: unknown;
    ReactDOM?: unknown;
    marked?: unknown;
    DOMPurify?: unknown;
    deferredPWAInstallPrompt?: Event | null;
    ellipsisDesktopUpdater?: DesktopUpdaterBridgeAmbient;
    ellipsisDesktopBackends?: DesktopBackendsBridgeAmbient;
}

declare const __APP_VERSION__: string;
declare const __APP_BUILD_ID__: string;
