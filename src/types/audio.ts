export type AudioDramaBackend = 'breeze' | 'drama3' | 'hybrid' | 'kokoro' | 'gemini' | 'elevenlabs' | 'system' | string;

export interface TtsPipelineTier {
    id: string;
    label: string;
    shortLabel?: string;
    backend?: string;
    description?: string;
    [key: string]: unknown;
}

export interface VoiceOption {
    id: string;
    name: string;
    gender?: string;
    accent?: string;
    description?: string;
    [key: string]: unknown;
}

export interface AudioDramaSettings {
    backend: AudioDramaBackend;
    studioBridgeUrl?: string;
    audioCppUrl?: string;
    kokoroVoice?: string;
    kokoroDtype?: string;
    speed?: number;
    dramaOffloadProfile?: string;
    [key: string]: unknown;
}

export interface ScriptSegment {
    speaker: string;
    text: string;
    spokenText?: string;
    breezeText?: string;
    emotion?: string;
    isNarrator?: boolean;
    [key: string]: unknown;
}

export interface CuePoint {
    index: number;
    speaker?: string;
    startSec: number;
    endSec: number;
    text?: string;
    [key: string]: unknown;
}
