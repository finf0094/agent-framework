import { randomUUID } from 'node:crypto';
import { create } from 'zustand';
import type { PauseReason } from '@agent/core';

export type AppStatus = 'idle' | 'running' | 'streaming' | 'paused' | 'error';

export interface DisplayMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
}

interface AgentStore {
    status: AppStatus;
    messages: DisplayMessage[];
    streamingText: string;
    pauseReason: PauseReason | null;
    pendingRunId: string | null;
    totalTokens: number;
    currentStep: number;
    setStatus: (status: AppStatus) => void;
    addMessage: (message: DisplayMessage) => void;
    appendStreamingDelta: (delta: string) => void;
    commitStreamingText: () => void;
    setPause: (reason: PauseReason, runId: string) => void;
    clearPause: () => void;
    addTokens: (tokens: number) => void;
    setStep: (step: number) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
    status: 'idle',
    messages: [],
    streamingText: '',
    pauseReason: null,
    pendingRunId: null,
    totalTokens: 0,
    currentStep: 0,
    setStatus: (status) => set({ status }),
    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
    appendStreamingDelta: (delta) => set((state) => ({ streamingText: state.streamingText + delta, status: 'streaming' })),
    commitStreamingText: () =>
        set((state) => ({
            messages: state.streamingText
                ? [...state.messages, { id: randomUUID(), role: 'assistant', text: state.streamingText }]
                : state.messages,
            streamingText: '',
            status: 'idle'
        })),
    setPause: (pauseReason, pendingRunId) => set({ pauseReason, pendingRunId, status: 'paused' }),
    clearPause: () => set({ pauseReason: null, pendingRunId: null }),
    addTokens: (tokens) => set((state) => ({ totalTokens: state.totalTokens + tokens })),
    setStep: (currentStep) => set({ currentStep })
}));
