import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLiveStoryForAudio, setLiveStoryProviderForAudio } from '@/domain/audio';
import { runContinuityAuditor } from '@/domain/continuity';
import { surgicallyRepairBeatMRUs, surgicallyRepairValueShifts } from '@/domain/validation';
import { getKoboldLoadedModelName, setKoboldLoadedModelName } from '@/services/llm';

type Host = { callAI?: unknown; storyRef?: unknown; koboldLoadedModelGlobal?: string };
const host = window as unknown as Host;

afterEach(() => {
    delete host.callAI;
    delete host.storyRef;
    setLiveStoryProviderForAudio(null);
    setKoboldLoadedModelName('');
});

describe('domain layer takes its dependencies explicitly', () => {
    it('runContinuityAuditor does not fall back to window.callAI', async () => {
        const windowCallAI = vi.fn(async () => '<audit_status>PASS</audit_status>');
        host.callAI = windowCallAI;
        const prose = 'She crossed the quay. '.repeat(20);
        const skipped = await runContinuityAuditor({ proseText: prose, activeStateBlock: '<state/>' });
        expect(skipped).toEqual({ prose, status: 'SKIPPED', patchesApplied: 0 });
        expect(windowCallAI).not.toHaveBeenCalled();

        const injected = vi.fn(async () => '<audit_status>PASS</audit_status>');
        const audited = await runContinuityAuditor({
            proseText: prose,
            activeStateBlock: '<state/>',
            callAIFn: injected
        });
        expect(injected).toHaveBeenCalledTimes(1);
        expect(audited.status).not.toBe('SKIPPED');
        expect(windowCallAI).not.toHaveBeenCalled();
    });

    it('structural repair does not fall back to window.callAI', async () => {
        const windowCallAI = vi.fn(async () => '');
        host.callAI = windowCallAI;
        const beats = [{ beat_id: '1' }];
        const scenes = [{ number: '1.1' }];
        expect(await surgicallyRepairBeatMRUs([{ index: 0, beat: beats[0] }], beats, {}, 'raw')).toEqual({
            success: false,
            genOutput: 'raw'
        });
        expect(await surgicallyRepairValueShifts([{ index: 0, scene: scenes[0] }], scenes, {}, 'raw')).toEqual({
            success: false,
            genOutput: 'raw'
        });
        expect(windowCallAI).not.toHaveBeenCalled();
    });

    it('getLiveStoryForAudio uses the registered provider, not window.storyRef', () => {
        const job = { id: 's1', title: 'snapshot' };
        host.storyRef = { current: { id: 's1', title: 'from window' } };
        expect(getLiveStoryForAudio(job)).toBe(job);

        const live = { id: 's1', title: 'live' };
        setLiveStoryProviderForAudio(() => live);
        expect(getLiveStoryForAudio(job)).toBe(live);
        expect(getLiveStoryForAudio({ id: 'other' })).toEqual({ id: 'other' });
        expect(getLiveStoryForAudio(null)).toBeNull();

        setLiveStoryProviderForAudio(() => null);
        expect(getLiveStoryForAudio(job)).toBe(job);
    });
});

describe('KoboldCPP loaded-model runtime value', () => {
    it('is read from the module, and mirrored to window for external readers only', () => {
        expect(getKoboldLoadedModelName()).toBe('');
        host.koboldLoadedModelGlobal = 'set-by-someone-else';
        expect(getKoboldLoadedModelName()).toBe('');

        setKoboldLoadedModelName('gemma-3-local');
        expect(getKoboldLoadedModelName()).toBe('gemma-3-local');
        expect(host.koboldLoadedModelGlobal).toBe('gemma-3-local');

        setKoboldLoadedModelName('');
        expect(getKoboldLoadedModelName()).toBe('');
        expect(host.koboldLoadedModelGlobal).toBeUndefined();
    });
});
