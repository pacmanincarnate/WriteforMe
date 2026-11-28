/**
 * @module views/settings/SettingsLocalEmbedding
 * The built-in embedding provider UI: prefers KoboldCPP's embedding endpoint when available and
 * otherwise configures and runs the bundled CPU llama.cpp model.
 */

import React, { useEffect, useState } from 'react';
import { RefreshCw } from '@/components';
import { useLocalEmbeddingSetup } from '@/hooks';
import {
    probeKoboldEmbeddingAvailability,
    type LocalEmbeddingModel,
    type LocalEmbeddingStatus
} from '@/services/rag';

const megabytes = (bytes: number): string => `${Math.round(bytes / 1e6)} MB`;

function optionLabel(model: LocalEmbeddingModel): string {
    return `${model.name} · ${model.source || megabytes(model.bytes)}`;
}

function Progress({ status, retry }: { status: LocalEmbeddingStatus; retry: () => void }) {
    if (status.state === 'downloading') {
        const percent = status.total ? Math.min(100, (status.received / status.total) * 100) : 0;
        return (
            <div className="space-y-1.5" role="status">
                <div
                    className="h-1.5 rounded-full bg-mist-100 overflow-hidden"
                    role="progressbar"
                    aria-label="Download"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(percent)}
                >
                    <div className="h-full bg-btn transition-all" style={{ width: `${percent}%` }} />
                </div>
                <p className="text-xs text-ink-500 font-mono">
                    {megabytes(status.received)} of {megabytes(status.total)}
                </p>
            </div>
        );
    }
    if (status.state === 'failed') {
        return (
            <div className="flex items-start gap-3" role="alert">
                <p className="text-xs text-red-600 flex-1 break-words">{status.message}</p>
                <button
                    type="button"
                    onClick={retry}
                    className="text-xs bg-surface hover:bg-lift border border-edge-strong text-ink-700 font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                    <RefreshCw size={12} /> Try again
                </button>
            </div>
        );
    }
    if (status.state === 'starting') {
        return (
            <p className="text-xs text-ink-500" role="status">
                Starting…
            </p>
        );
    }
    if (status.state === 'ready') {
        return (
            <p className="text-xs text-ink-500" role="status">
                Ready
            </p>
        );
    }
    return null;
}

export interface SettingsLocalEmbeddingProps {
    /** When passed, Built-in probes KoboldCPP first and prefers it whenever embeddings are active. */
    koboldUrl?: string;
}

export const SettingsLocalEmbedding: React.FC<SettingsLocalEmbeddingProps> = ({ koboldUrl }) => {
    const [koboldProbe, setKoboldProbe] = useState<'idle' | 'available' | 'unavailable'>(
        koboldUrl ? 'idle' : 'unavailable'
    );

    useEffect(() => {
        if (!koboldUrl) {
            setKoboldProbe('unavailable');
            return;
        }
        let cancelled = false;
        setKoboldProbe('idle');
        void probeKoboldEmbeddingAvailability(koboldUrl).then((ok) => {
            if (!cancelled) setKoboldProbe(ok ? 'available' : 'unavailable');
        });
        return () => {
            cancelled = true;
        };
    }, [koboldUrl]);

    const { modelId, status, choose, retry } = useLocalEmbeddingSetup(koboldProbe === 'unavailable');

    if (koboldProbe === 'available') {
        return (
            <p className="text-xs text-sage-700 font-medium" role="status">
                KoboldCPP embeddings active ({koboldUrl}) — using KoboldCPP ahead of built-in llama.cpp.
            </p>
        );
    }

    if (!status) return null;
    const listed = status.models.some((m) => m.id === modelId);
    return (
        <div className="space-y-2.5">
            <select
                aria-label="Embedding model"
                value={modelId}
                onChange={(e) => choose(e.target.value)}
                className="w-full bg-surface border border-edge-strong rounded-xl px-3.5 py-2 text-xs text-ink-800 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none transition-colors font-mono"
            >
                {!listed && <option value={modelId}>{modelId.replace(/^file:/, '')}</option>}
                {status.models.map((m) => (
                    <option key={m.id} value={m.id}>
                        {optionLabel(m)}
                    </option>
                ))}
            </select>
            <Progress status={status} retry={retry} />
            {koboldUrl && (
                <p className="text-[11px] text-ink-500">
                    KoboldCPP embeddings are used automatically ahead of llama.cpp whenever KoboldCPP is running with embeddings enabled.
                </p>
            )}
        </div>
    );
};
