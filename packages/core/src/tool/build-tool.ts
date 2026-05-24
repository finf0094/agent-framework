import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ITool, ApprovalDecision, ToolSchema } from '../types/tool.js';
import type { AgentContext } from '../types/context.js';

export interface ToolDefinition<TInput, TOutput, Ctx extends AgentContext> {
    name: string;
    description: string;
    inputSchema: z.ZodSchema<TInput>;
    outputSchema?: z.ZodSchema<TOutput>;

    needsApproval?: (args: { input: TInput; context: Ctx }) => ApprovalDecision | Promise<ApprovalDecision>;

    execute(input: TInput, context: Ctx): Promise<TOutput>;
}

export function buildTool<TInput, TOutput, Ctx extends AgentContext = AgentContext>(
    definition: ToolDefinition<TInput, TOutput, Ctx>
): ITool<TInput, TOutput, Ctx> {
    return {
        name: definition.name,
        description: definition.description,
        inputSchema: definition.inputSchema,
        outputSchema: definition.outputSchema,
        needsApproval: definition.needsApproval,

        async execute(input, context) {
            const validated = definition.inputSchema.parse(input);
            const result = await definition.execute(validated, context);
            if (definition.outputSchema) {
                return definition.outputSchema.parse(result);
            }
            return result;
        },

        toSchema(): ToolSchema {
            const jsonSchema = zodToJsonSchema(definition.inputSchema, {
                target: 'jsonSchema7'
            });
            const { $schema: _, ...params } = jsonSchema as any;
            return {
                type: 'function',
                function: {
                    name: definition.name,
                    description: definition.description,
                    parameters: { ...params, additionalProperties: false }
                }
            };
        }
    };
}
