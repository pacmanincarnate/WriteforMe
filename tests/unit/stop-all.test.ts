import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface Proc {
    pid: number;
    ppid: number;
    name: string;
    exe?: string;
    commandLine?: string;
}
interface StopModule {
    planStops(
        processes: Proc[],
        listeners: { port: number; pid: number }[],
        options?: { rootDir?: string; dataDir?: string; env?: Record<string, string | undefined>; selfPid?: number }
    ): { label: string; pid: number }[];
    describeTree(processes: Proc[], rootPid: number): string[];
}

const { planStops, describeTree } = createRequire(import.meta.url)('../../stop.js') as StopModule;

const rootDir = path.join('C:', 'apps', 'EllipsisProse');
const options = { rootDir, env: {} };
const llamaExe = path.join(rootDir, 'data', 'embeddings', 'llama', 'llama-server.exe');
const comfyLine = 'python.exe -s C:\\ComfyUI\\main.py --disable-auto-launch --listen 127.0.0.1 --port 8188 --enable-cors-header';

describe('stop.js', () => {
    it('stops each launcher window once, and names what goes down with it', () => {
        const processes: Proc[] = [
            { pid: 10, ppid: 1, name: 'cmd.exe', commandLine: 'cmd /k node server.js' },
            { pid: 11, ppid: 10, name: 'node.exe', commandLine: 'node server.js' },
            { pid: 12, ppid: 11, name: 'python.exe', commandLine: comfyLine },
            { pid: 13, ppid: 11, name: 'llama-server.exe', exe: llamaExe, commandLine: `${llamaExe} --embedding` },
            { pid: 20, ppid: 1, name: 'cmd.exe', commandLine: 'cmd /k "cd /d C:\\apps\\EllipsisProse && npm run audio-bridge"' },
            { pid: 21, ppid: 20, name: 'node.exe', commandLine: 'node npm-cli.js run audio-bridge' },
            { pid: 22, ppid: 21, name: 'node.exe', commandLine: 'node audio-studio-bridge.js' },
            { pid: 23, ppid: 22, name: 'audiocpp_server.exe', commandLine: 'audiocpp_server.exe --port 8080' }
        ];
        const listeners = [
            { port: 3000, pid: 11 },
            { port: 3000, pid: 11 },
            { port: 5020, pid: 22 },
            { port: 8188, pid: 12 }
        ];

        expect(planStops(processes, listeners, options)).toEqual([
            { label: 'Web server', pid: 10 },
            { label: 'Audio Studio Bridge', pid: 20 }
        ]);
        expect(describeTree(processes, 10)).toEqual(['ComfyUI', 'built-in embeddings']);
        expect(describeTree(processes, 20)).toEqual(['Audio.cpp']);
    });

    it('leaves another program on the same port alone, and the terminal a service was typed into', () => {
        const processes: Proc[] = [
            { pid: 30, ppid: 1, name: 'node.exe', commandLine: 'node other-app.js' },
            { pid: 40, ppid: 1, name: 'cmd.exe', commandLine: 'C:\\WINDOWS\\system32\\cmd.exe' },
            { pid: 41, ppid: 40, name: 'node.exe', commandLine: 'node codex-bridge.js' }
        ];
        const listeners = [
            { port: 3000, pid: 30 },
            { port: 5010, pid: 41 }
        ];

        expect(planStops(processes, listeners, options)).toEqual([{ label: 'Codex bridge', pid: 41 }]);
    });

    it('clears what a force-closed service left behind, but never a ComfyUI someone else still runs', () => {
        const processes: Proc[] = [
            { pid: 50, ppid: 999, name: 'python.exe', commandLine: comfyLine },
            { pid: 51, ppid: 999, name: 'llama-server.exe', exe: llamaExe },
            { pid: 52, ppid: 999, name: 'audiocpp.exe' },
            { pid: 60, ppid: 1, name: 'cmd.exe', commandLine: 'cmd /c run_nvidia_gpu.bat' },
            { pid: 61, ppid: 60, name: 'python.exe', commandLine: comfyLine.replace('8188', '8189') },
            { pid: 62, ppid: 1, name: 'llama-server.exe', exe: 'C:\\tools\\llama-server.exe' }
        ];

        expect(planStops(processes, [], options)).toEqual([
            { label: 'ComfyUI', pid: 50 },
            { label: 'Built-in embeddings (llama.cpp)', pid: 51 },
            { label: 'Audio.cpp', pid: 52 }
        ]);
    });

    it('follows the port the server was started on, and never stops itself', () => {
        const processes: Proc[] = [
            { pid: 70, ppid: 1, name: 'node.exe', commandLine: 'node server.js' },
            { pid: 71, ppid: 1, name: 'node.exe', commandLine: 'node claude-bridge.js' }
        ];
        const listeners = [
            { port: 3100, pid: 70 },
            { port: 5011, pid: 71 }
        ];

        expect(planStops(processes, listeners, { rootDir, env: { PORT: '3100' }, selfPid: 71 })).toEqual([
            { label: 'Web server', pid: 70 }
        ]);
        expect(planStops(processes, listeners, options)).toEqual([{ label: 'Claude bridge', pid: 71 }]);
    });
});
