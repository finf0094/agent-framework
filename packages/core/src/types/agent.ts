import type { AgentContext } from './context.js';
import type { IEngine } from './engine.js';
import type { ITool } from './tool.js';
import type { IMemoryStore } from './memory.js';
import type { ICheckpointStore } from './checkpoint.js';
import type { AgentEvent } from './events.js';
import type { RunOptions, ResumeOptions, ResumeInput, RunResult } from './run.js';

export interface AgentHooks {
    onStepStart?: (stepNumber: number) => void | Promise<void>;
    onStepFinish?: (stepNumber: number, duration: number) => void | Promise<void>;
}

export interface AgentConfig<Ctx extends AgentContext = AgentContext> {
    name: string;
    engine: IEngine;
    system?: string;
    tools: ITool<any, any, Ctx>[];
    memory: IMemoryStore;
    checkpoints?: ICheckpointStore;
    hooks?: AgentHooks;
}

export interface IAgent<Ctx extends AgentContext = AgentContext> {
    readonly name: string;
    readonly tools: ITool[];

    run(prompt: string, options: RunOptions<Ctx>): Promise<RunResult>;
    resume(runId: string, input: ResumeInput, options: ResumeOptions<Ctx>): Promise<RunResult>;
    execute(prompt: string, options: RunOptions<Ctx>): AsyncGenerator<AgentEvent, RunResult>;
}
