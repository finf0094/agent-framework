import type { RunStatus, PauseReason, AgentStep } from './run.js';
import type { TokenUsage } from './engine.js';
import type { Message } from './message.js';

export interface RunCheckpoint {
    runId: string;
    threadId: string;
    status: RunStatus;
    currentStep: number;
    pendingApproval?: PauseReason;
    deferredToolMessages?: Message[];
    pendingStepCalls?: AgentStep['toolCalls'];
    pendingStepStartedAt?: number;
    usage: TokenUsage;
    steps: AgentStep[];
    startedAt: number;
}

export interface ICheckpointStore {
    save(checkpoint: RunCheckpoint): Promise<void>;
    load(runId: string): Promise<RunCheckpoint | undefined>;
    delete(runId: string): Promise<void>;
}
