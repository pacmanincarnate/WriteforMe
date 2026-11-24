export type PipelineStepId = string;

export interface PipelineStep {
    id: PipelineStepId;
    label: string;
    shortLabel?: string;
    tier?: string;
    description?: string;
    [key: string]: unknown;
}

export interface PipelineStepSpec {
    [stepId: string]: {
        label?: string;
        tier?: string;
        phase?: string;
        [key: string]: unknown;
    };
}

export interface ReviewIssue {
    severity: string;
    category: string;
    description: string;
    location?: string;
    fix_suggestion?: string;
    fixSuggestion?: string;
}

export interface ReviewStatus {
    status: 'PASS' | 'FAIL' | string;
    reasons: string[];
    critique: string;
    briefs: Array<Record<string, unknown>>;
    issues: ReviewIssue[];
    isValid: boolean;
}

export interface SurgicalEditReport {
    text: string;
    edits: Array<Record<string, unknown>>;
    applied: Array<Record<string, unknown>>;
    rejected?: Array<Record<string, unknown>>;
    failed: Array<Record<string, unknown>>;
    summary?: string;
}

export type RollbackStage = 'tts' | 'prose' | 'scenes' | 'sequences' | 'acts';
