/**
 * @module hooks/useGenerationStatus
 * What the pipeline is doing right now, as the shell and the views show it: the busy flag and
 * its label, the continuous-autopilot switch, and the review feedback carried between attempts.
 */

import { useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

type Setter<T> = Dispatch<SetStateAction<T>>;

export interface UseGenerationStatusResult {
    loading: boolean;
    setLoading: Setter<boolean>;
    /** Human-readable label for the step in progress. */
    loadingStep: string;
    setLoadingStep: Setter<string>;
    continuousAutopilot: boolean;
    setContinuousAutopilot: Setter<boolean>;
    isDirectingVoices: boolean;
    setIsDirectingVoices: Setter<boolean>;
    /** Critiques from the last failed review, shown in the intervention dialog. */
    failedReviewCritiques: string[];
    setFailedReviewCritiques: Setter<string[]>;
    /** Reviewer feedback per scene, replayed into the next attempt. */
    feedbackLedger: Record<string, string[]>;
    setFeedbackLedger: Setter<Record<string, string[]>>;
    /** The ledger as of the latest render, for callbacks that outlive it. */
    feedbackLedgerRef: MutableRefObject<Record<string, string[]>>;
    /** World summary distilled from imported lore, or null when none has been built. */
    worldPrimer: string | null;
    setWorldPrimer: Setter<string | null>;
}

export function useGenerationStatus(): UseGenerationStatusResult {
    const [loading, setLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState('');
    const [continuousAutopilot, setContinuousAutopilot] = useState(false);
    const [isDirectingVoices, setIsDirectingVoices] = useState(false);
    const [failedReviewCritiques, setFailedReviewCritiques] = useState<string[]>([]);
    const [feedbackLedger, setFeedbackLedger] = useState<Record<string, string[]>>({});
    const feedbackLedgerRef = useRef(feedbackLedger);
    feedbackLedgerRef.current = feedbackLedger;
    const [worldPrimer, setWorldPrimer] = useState<string | null>(null);
    return {
        loading,
        setLoading,
        loadingStep,
        setLoadingStep,
        continuousAutopilot,
        setContinuousAutopilot,
        isDirectingVoices,
        setIsDirectingVoices,
        failedReviewCritiques,
        setFailedReviewCritiques,
        feedbackLedger,
        setFeedbackLedger,
        feedbackLedgerRef,
        worldPrimer,
        setWorldPrimer
    };
}
