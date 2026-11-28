export type SlopSeverity = 'hard' | 'flag' | 'off';
export type SlopHitSeverity = SlopSeverity | 'high_closer' | 'overdrawn';

export interface SlopCategory {
    id: string;
    group?: string;
    title: string;
    description?: string;
    severity?: SlopSeverity;
    defaultSeverity?: SlopSeverity;
    match?: 'phrase' | 'word' | 'name' | string;
    note?: string;
    items: string[];
}

export interface SlopPattern {
    id: string;
    title: string;
    severity: SlopSeverity;
    note?: string;
}

export interface SlopDensityRule {
    id: string;
    title: string;
    severity: SlopSeverity;
    window?: number;
    count?: number;
}

export interface SlopPack {
    name?: string;
    version?: string;
    author?: string;
    how_to_use?: string;
    categories: SlopCategory[];
    patterns?: SlopPattern[];
    density?: SlopDensityRule[];
}

export interface SlopConfig {
    schemaVersion: number;
    enableSlopAudit: boolean;
    enableUpstreamNameAudit: boolean;
    /** Offer real names from the name banks and flag names that read as made up. Missing means on. */
    enableNameBank?: boolean;
    emDashMode: 'density' | 'strict' | 'off';
    emDashMaxPer1k: number;
    categorySeverities: Record<string, SlopSeverity>;
    customItemsByCategory: Record<string, string[]>;
    removedDefaultItems: Record<string, string[]>;
    importedPack: SlopPack | null;
    importedPackMeta: Record<string, unknown> | null;
    _migratedLegacy?: boolean;
}

export interface SlopHit {
    id: string;
    severity: SlopHitSeverity;
    categoryId: string;
    categoryTitle: string;
    match: string;
    line: number;
    start: number;
    end: number;
    sentence: string;
    context: string;
    note: string;
    isTrailingCloser: boolean;
    isClustered: boolean;
    _paraIdx?: number;
}

export interface SlopAuditReport {
    hardHits: SlopHit[];
    closerHits: SlopHit[];
    flagHits: SlopHit[];
    clusteredFlagHits: SlopHit[];
    patternHits: SlopHit[];
    densityHits: SlopHit[];
    allHits: SlopHit[];
    phraseCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
    summary: {
        wordCount: number;
        hardCount: number;
        closerCount: number;
        flagCount: number;
        clusteredFlagCount: number;
        patternCount: number;
        densityCount: number;
        emDashCount: number;
        emDashPer1k: number;
        emClusterCount: number;
        shouldTriggerSurgicalGate: boolean;
        hasActionableItems: boolean;
        reasons: string[];
    };
}

export interface EntityNameViolation {
    entityType: 'character' | 'place';
    name: string;
    id?: unknown;
    role?: unknown;
    reason: string;
    severity: 'hard' | 'overdrawn';
    categoryId: string;
}

export interface EntityNameAuditReport {
    valid: boolean;
    violations: EntityNameViolation[];
    hardViolations: EntityNameViolation[];
    overdrawnViolations: EntityNameViolation[];
    overdrawnCounts: {
        firstNames: number;
        surnames: number;
        places: number;
    };
}
