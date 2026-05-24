import type { z } from 'zod';
import type { AgentContext } from './context.js';

export type ApprovalDecision = { behavior: 'allow' } | { behavior: 'deny'; reason?: string } | { behavior: 'pause'; message?: string };

export interface ITool<TInput = any, TOutput = any, Ctx extends AgentContext = AgentContext> {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: z.ZodSchema<TInput>;
    readonly outputSchema?: z.ZodSchema<TOutput>;

    needsApproval?(args: { input: TInput; context: Ctx }): ApprovalDecision | Promise<ApprovalDecision>;

    execute(input: TInput, context: Ctx): Promise<TOutput>;
    toSchema(): ToolSchema;
}

export interface ToolSchema {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    };
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
}
