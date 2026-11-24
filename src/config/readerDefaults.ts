/**
 * @module config/readerDefaults
 * Default reader typography, layout, and inline Kokoro TTS playback settings.
 */

export interface ReaderSettings {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    readerTheme: 'light' | 'sepia' | 'dark' | string;
    contentWidth: 'narrow' | 'standard' | 'wide' | string;
    textAlign: 'left' | 'justify' | string;
    paragraphStyle: 'indented' | 'spaced' | string;
    readingMode: 'paginated' | 'scroll' | string;
    ttsVoice: string;
    ttsSpeed: number;
    ttsDevice: string;
    ttsDtype: string;
    ttsAutoFollow: boolean;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
    fontFamily: 'Merriweather',
    fontSize: 18,
    lineHeight: 1.75,
    readerTheme: 'light',
    contentWidth: 'standard',
    textAlign: 'left',
    paragraphStyle: 'indented',
    readingMode: 'paginated',
    ttsVoice: 'af_heart',
    ttsSpeed: 1.0,
    ttsDevice: 'wasm',
    ttsDtype: 'q8',
    ttsAutoFollow: true
};
