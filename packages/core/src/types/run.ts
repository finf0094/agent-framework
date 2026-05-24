import type { TokenUsage } from './engine.js';
import type { Message } from './message.js';
import type { AgentEvent } from './events.js';

export type RunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface PauseReason {
    type: 'approval_required';
    approvalId: string;
    toolCallId: string;
    toolName: string;
    input: unknown;
    message?: string;
}

export interface AgentOutput {
    text: string;
    usage: TokenUsage;
    steps: AgentStep[];
    duration: number;
}

export interface RunResult {
    runId: string;
    threadId: string;
    status: RunStatus;
    output?: AgentOutput;
    pauseReason?: PauseReason;
    error?: string;
    messages: Message[];
}

export interface AgentStep {
    stepNumber: number;
    duration: number;
    toolCalls: Array<{
        id: string;
        name: string;
        input: unknown;
        output: unknown;
        approved: boolean;
    }>;
}

export interface RunOptions<Ctx> {
    context: Ctx;
    runId?: string;
    threadId?: string;
    maxSteps?: number;
    abortSignal?: AbortSignal;
    onEvent?: (event: AgentEvent) => void;
    stream?: boolean;
}

export interface ResumeInput {
    approvalId: string;
    decision: 'allow' | 'deny';
    reason?: string;
}

export interface ResumeOptions<Ctx> {
    context: Ctx;
    maxSteps?: number;
    abortSignal?: AbortSignal;
    onEvent?: (event: AgentEvent) => void;
    stream?: boolean;
}
