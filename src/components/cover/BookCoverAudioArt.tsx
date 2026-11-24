/**
 * @module components/cover/BookCoverAudioArt
 * Compositional SVG acoustic cover overlay (concentric gold rings + offline progress arc).
 */

import { useMemo } from 'react';

export const AUDIO_DRAMA_RIPPLE_RADII: readonly number[] = [
    24, 48, 72, 96, 120, 144, 168, 192, 216
];

export interface BookCoverAudioArtProps {
    story?: { writing_mode?: string } | null;
    audioCount?: number;
    totalScenes?: number;
    isMini?: boolean;
}

export function BookCoverAudioArt({
    story,
    audioCount = 0,
    totalScenes = 0,
    isMini = false
}: BookCoverAudioArtProps) {
    const cornerGlowId = useMemo(
        () => 'audioCornerGlow_' + Math.random().toString(36).slice(2, 9),
        []
    );
    const isDrama = story?.writing_mode === 'audio_drama';
    const hasOfflineAudio = Number(audioCount) > 0;
    if (!isDrama && !hasOfflineAudio) return null;

    const safeTotal = Math.max(Number(totalScenes) || 0, Number(audioCount) || 1);
    const ratio = hasOfflineAudio
        ? Math.max(0.08, Math.min(1, Number(audioCount) / safeTotal))
        : 0;
    const isComplete = hasOfflineAudio && Number(audioCount) >= safeTotal;
    const arcRadius = 34;
    const quarterCircumference = (Math.PI * arcRadius) / 2;
    const arcDashOffset = quarterCircumference * (1 - ratio);

    return (
        <svg
            className={`book-cover-audio-art ${isDrama ? 'audio-drama-ripples' : ''}`}
            viewBox="0 0 200 300"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <radialGradient id={cornerGlowId} cx="100%" cy="100%" r="35%">
                    <stop
                        offset="0%"
                        stopColor={isComplete ? '#6F9F84' : '#E7C57D'}
                        stopOpacity="0.42"
                    />
                    <stop offset="68%" stopColor="#1C1917" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#1C1917" stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* Concentric hairline broadcast / acoustic rings */}
            {AUDIO_DRAMA_RIPPLE_RADII.filter((_, i) => isDrama || i < 5).map((r, i) => (
                <circle
                    key={r}
                    className="audio-cover-ring"
                    cx="200"
                    cy="300"
                    r={r}
                    fill="none"
                    stroke={isDrama ? '#ffe4a8' : '#f3dba4'}
                    strokeWidth={isDrama ? (i < 3 ? 1.6 : 1) : i < 2 ? 1.25 : 0.85}
                    strokeOpacity={
                        isDrama
                            ? (1 - (i + 1) / 10).toFixed(2)
                            : (0.58 - i * 0.09).toFixed(2)
                    }
                    style={{ animationDelay: `${(i + 1) * 90}ms` }}
                />
            ))}

            {/* Integrated Offline Audio Corner Vignette & Radial Completion Arc */}
            {hasOfflineAudio && (
                <g className="book-cover-offline-emblem">
                    <circle cx="200" cy="300" r="56" fill={`url(#${cornerGlowId})`} />
                    <path
                        d={`M ${200 - arcRadius} 300 A ${arcRadius} ${arcRadius} 0 0 1 200 ${300 - arcRadius}`}
                        fill="none"
                        stroke="#ffffff"
                        strokeOpacity="0.22"
                        strokeWidth={isMini ? 3.5 : 2.6}
                        strokeLinecap="round"
                    />
                    <path
                        d={`M ${200 - arcRadius} 300 A ${arcRadius} ${arcRadius} 0 0 1 200 ${300 - arcRadius}`}
                        fill="none"
                        stroke={isComplete ? '#8FE3B4' : '#FFE4A8'}
                        strokeOpacity="0.95"
                        strokeWidth={isMini ? 3.8 : 2.8}
                        strokeLinecap="round"
                        strokeDasharray={quarterCircumference.toFixed(2)}
                        strokeDashoffset={arcDashOffset.toFixed(2)}
                    />
                    {!isMini && (
                        <g
                            transform="translate(174, 276)"
                            stroke="#FFFDF7"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            opacity="0.95"
                        >
                            <line x1="0" y1="8" x2="0" y2="12" />
                            <line x1="4.5" y1="4" x2="4.5" y2="16" />
                            <line x1="9" y1="6.5" x2="9" y2="13.5" />
                            <line x1="13.5" y1="2.5" x2="13.5" y2="17.5" />
                            <line x1="18" y1="7" x2="18" y2="13" />
                        </g>
                    )}
                </g>
            )}
        </svg>
    );
}

export function AudioDramaRipples({
    story,
    audioCount = 0,
    totalScenes = 0,
    isMini = false
}: BookCoverAudioArtProps) {
    return (
        <BookCoverAudioArt
            story={story}
            audioCount={audioCount}
            totalScenes={totalScenes}
            isMini={isMini}
        />
    );
}
