/**
 * @module domain/serial/types
 * Re-exports the serial types and holds the default thread and cast policies.
 */

import type { CastPolicy, ThreadPolicy } from '@/types';

export type * from '@/types/serial';

export const DEFAULT_THREAD_POLICY: ThreadPolicy = {
    main: { max: 1 },
    side: { min: 2, target: 3, max: 4 },
    series: { max: 2 },
    maxThreadsPerEpisode: 3,
    maxIdleEpisodes: 4,
    closeSideEvery: 4,
    minGapBetweenSideCloses: 2,
    minEpisodesOpen: 3,
    maxOpensPerEpisode: 1,
    maxClosesPerEpisode: 1,
    minTouchesBeforeClose: 2,
    wrapUpWindow: 3,
    noNewSideInLast: 2,
    maxParked: 3
};

export const DEFAULT_CAST_POLICY: CastPolicy = {
    rotation: 'anchored',
    rotateBy: 'oldest_thread',
    anchorMaxAbsence: 2,
    maxActivePerArc: 7,
    maxPovPerArc: 3,
    coreMaxAbsence: 6,
    supportingMaxAbsence: 12,
    introductionsPerArc: { min: 1, max: 2 },
    everyoneOwnsThread: true,
    threadRequiredTiers: ['core', 'supporting'],
    minCarryover: 2,
    requireThreadForNewCharacter: true,
    maxArcsRested: { core: 2, supporting: 4 }
};
