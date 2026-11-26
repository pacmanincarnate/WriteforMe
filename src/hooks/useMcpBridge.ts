/**
 * @module hooks/useMcpBridge
 * Owns the Antigravity MCP Live Bridge inside React: the enable toggle (persisted), the WebSocket
 * connection lifecycle, and the `window.EllipsisProseBridge` registration. The action dispatcher
 * itself lives in `@/services/bridge` and stays React-free.
 */

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { STORAGE_KEYS } from '@/config';
import {
    connectMcpBridge,
    createBridgeApi,
    createBridgeDispatcher,
    type BridgeActions,
    type BridgeDispatch,
    type BridgeSocket,
    type BridgeState,
    type BridgeStoryStore,
    type EllipsisProseBridgeApi
} from '@/services/bridge';

export const MCP_BRIDGE_ENABLED_STORAGE_KEY = STORAGE_KEYS.enableMcpBridge;

export interface UseMcpBridgeParams {
    /** Current app state the bridge reports on. Pass a fresh object every render. */
    state: BridgeState;
    /** Callbacks the bridge may invoke. Pass the current render's callbacks every render. */
    actions: BridgeActions;
    storyStore: BridgeStoryStore | null | undefined;
    /** Test seam: replaces `new WebSocket(url)`. */
    createSocket?: (url: string) => BridgeSocket;
}

export interface UseMcpBridgeResult {
    isMcpConnected: boolean;
    enableMcpBridge: boolean;
    setEnableMcpBridge: Dispatch<SetStateAction<boolean>>;
    mcpRetryTrigger: number;
    setMcpRetryTrigger: Dispatch<SetStateAction<number>>;
    /** Stable for the lifetime of the component; always acts on the latest state and callbacks. */
    handleBridgeAction: BridgeDispatch;
    bridgeApi: EllipsisProseBridgeApi;
}

function readEnabledFlag(): boolean {
    try {
        return localStorage.getItem(MCP_BRIDGE_ENABLED_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

export function useMcpBridge({
    state,
    actions,
    storyStore,
    createSocket
}: UseMcpBridgeParams): UseMcpBridgeResult {
    const [isMcpConnected, setIsMcpConnected] = useState(false);
    const [enableMcpBridge, setEnableMcpBridge] = useState(readEnabledFlag);
    const [mcpRetryTrigger, setMcpRetryTrigger] = useState(0);

    // Latest-value refs: the dispatcher below is created once and outlives any single render
    // (the WebSocket holds on to it), so it must never capture render-scoped values directly.
    const stateRef = useRef(state);
    stateRef.current = state;
    const actionsRef = useRef(actions);
    actionsRef.current = actions;
    const storyStoreRef = useRef(storyStore);
    storyStoreRef.current = storyStore;
    const createSocketRef = useRef(createSocket);
    createSocketRef.current = createSocket;

    const bridgeRef = useRef<{ dispatch: BridgeDispatch; api: EllipsisProseBridgeApi } | null>(null);
    if (!bridgeRef.current) {
        const dispatch = createBridgeDispatcher({
            getState: () => stateRef.current,
            getActions: () => actionsRef.current,
            getStoryStore: () => storyStoreRef.current
        });
        bridgeRef.current = { dispatch, api: createBridgeApi(dispatch) };
    }
    const { dispatch, api } = bridgeRef.current;

    // Global DevTools & external bridge access (public contract; see mcp-server/README.md).
    if (typeof window !== 'undefined') {
        const host = window as unknown as { EllipsisProseBridge?: EllipsisProseBridgeApi };
        if (host.EllipsisProseBridge !== api) host.EllipsisProseBridge = api;
    }

    useEffect(() => {
        try {
            localStorage.setItem(MCP_BRIDGE_ENABLED_STORAGE_KEY, String(enableMcpBridge));
        } catch {
            /* storage unavailable */
        }
    }, [enableMcpBridge]);

    useEffect(() => {
        // Do not open WebSockets (or poll) while the bridge is disabled.
        if (!enableMcpBridge) {
            setIsMcpConnected(false);
            return;
        }
        return connectMcpBridge({
            dispatch,
            onConnectedChange: setIsMcpConnected,
            createSocket: createSocketRef.current
        });
    }, [enableMcpBridge, mcpRetryTrigger, dispatch]);

    return {
        isMcpConnected,
        enableMcpBridge,
        setEnableMcpBridge,
        mcpRetryTrigger,
        setMcpRetryTrigger,
        handleBridgeAction: dispatch,
        bridgeApi: api
    };
}
