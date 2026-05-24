import type { IAgent, AgentConfig } from '../types/agent.js';
import type { AgentContext } from '../types/context.js';
import type { Message, ToolCallPart, ToolResultPart } from '../types/message.js';
import type { AgentEvent } from '../types/events.js';
import type { TokenUsage, EngineResponse, EngineCallOptions } from '../types/engine.js';
import type { ToolCall } from '../types/tool.js';
import type { RunCheckpoint } from '../types/checkpoint.js';
import type { RunOptions, ResumeOptions, ResumeInput, RunResult, AgentStep, AgentOutput, PauseReason } from '../types/run.js';
import {
    NoSuchToolError,
    InvalidToolArgumentsError,
    MaxStepsExceededError,
    CheckpointNotFoundError,
    InvalidRunStatusError,
    NoCheckpointStoreError,
    InvalidApprovalIdError
} from '../utils/errors.js';

interface LoopState {
    step: number;
    startTime: number;
    usage: TokenUsage;
    steps: AgentStep[];
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
    return {
        promptTokens: a.promptTokens + b.promptTokens,
        completionTokens: a.completionTokens + b.completionTokens,
        totalTokens: a.totalTokens + b.totalTokens
    };
}

function makeErrorMessage(toolCallId: string, toolName: string, error: string): Message {
    return {
        role: 'tool',
        toolCallId,
        content: [
            {
                type: 'tool-result',
                toolCallId,
                toolName,
                result: `Error: ${error}`,
                isError: true
            } satisfies ToolResultPart
        ]
    };
}

export class Agent<Ctx extends AgentContext = AgentContext> implements IAgent<Ctx> {
    readonly name: string;
    readonly tools: AgentConfig<Ctx>['tools'];
    private config: AgentConfig<Ctx>;

    constructor(config: AgentConfig<Ctx>) {
        this.config = config;
        this.name = config.name;
        this.tools = config.tools;
    }

    async run(prompt: string, options: RunOptions<Ctx>): Promise<RunResult> {
        const gen = this.execute(prompt, options);
        while (true) {
            const next = await gen.next();
            if (next.done) return next.value;
            options.onEvent?.(next.value);
        }
    }

    async resume(runId: string, input: ResumeInput, options: ResumeOptions<Ctx>): Promise<RunResult> {
        if (!this.config.checkpoints) throw new NoCheckpointStoreError();
        const checkpoint = await this.config.checkpoints.load(runId);
        if (!checkpoint) throw new CheckpointNotFoundError(runId);
        if (checkpoint.status !== 'paused') throw new InvalidRunStatusError(runId, checkpoint.status);

        const gen = this._resumeFromCheckpoint(checkpoint, input, options);
        while (true) {
            const next = await gen.next();
            if (next.done) return next.value;
            options.onEvent?.(next.value);
        }
    }

    async *execute(prompt: string, options: RunOptions<Ctx>): AsyncGenerator<AgentEvent, RunResult> {
        const runId = options.runId ?? crypto.randomUUID();
        const threadId = options.threadId ?? runId;
        await this.config.memory.append(threadId, [{ role: 'user', content: prompt }]);
        yield { type: 'run.started', runId };
        return yield* this._loop(runId, threadId, options, {
            step: 0,
            startTime: Date.now(),
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            steps: []
        }, options.stream);
    }

    private async *_resumeFromCheckpoint(
        checkpoint: RunCheckpoint,
        input: ResumeInput,
        options: ResumeOptions<Ctx>
    ): AsyncGenerator<AgentEvent, RunResult> {
        const { runId, threadId, pendingApproval } = checkpoint;

        if (!pendingApproval) throw new InvalidRunStatusError(runId, checkpoint.status);
        if (input.approvalId !== pendingApproval.approvalId) throw new InvalidApprovalIdError(runId);

        yield { type: 'run.resumed', runId, fromStep: checkpoint.currentStep };

        if (input.decision === 'allow') {
            yield {
                type: 'approval.granted',
                runId,
                approvalId: pendingApproval.approvalId
            };
        } else {
            yield {
                type: 'approval.denied',
                runId,
                approvalId: pendingApproval.approvalId,
                reason: input.reason
            };
        }

        const deferred = checkpoint.deferredToolMessages ?? [];
        const resumedStepCalls = [...(checkpoint.pendingStepCalls ?? [])];

        if (input.decision === 'deny') {
            await this.config.memory.append(threadId, [
                makeErrorMessage(pendingApproval.toolCallId, pendingApproval.toolName, input.reason ?? 'Denied by user'),
                ...deferred
            ]);
            resumedStepCalls.push({
                id: pendingApproval.toolCallId,
                name: pendingApproval.toolName,
                input: pendingApproval.input,
                output: null,
                approved: false
            });
        } else {
            const tool = this.config.tools.find((t) => t.name === pendingApproval.toolName);
            if (!tool) {
                await this.config.memory.append(threadId, [
                    makeErrorMessage(pendingApproval.toolCallId, pendingApproval.toolName, 'Tool no longer available'),
                    ...deferred
                ]);
                resumedStepCalls.push({
                    id: pendingApproval.toolCallId,
                    name: pendingApproval.toolName,
                    input: pendingApproval.input,
                    output: null,
                    approved: false
                });
            } else {
                if (options.abortSignal?.aborted) {
                    yield { type: 'run.cancelled', runId, reason: 'Aborted' };
                    return {
                        runId,
                        threadId,
                        status: 'cancelled',
                        error: 'Aborted',
                        messages: await this.config.memory.list(threadId)
                    };
                }

                yield {
                    type: 'tool.started',
                    runId,
                    toolCallId: pendingApproval.toolCallId,
                    toolName: pendingApproval.toolName,
                    input: pendingApproval.input
                };
                try {
                    const result = await tool.execute(pendingApproval.input, options.context);
                    await this.config.memory.append(threadId, [
                        {
                            role: 'tool',
                            toolCallId: pendingApproval.toolCallId,
                            content: [
                                {
                                    type: 'tool-result',
                                    toolCallId: pendingApproval.toolCallId,
                                    toolName: pendingApproval.toolName,
                                    result
                                } satisfies ToolResultPart
                            ]
                        },
                        ...deferred
                    ]);
                    resumedStepCalls.push({
                        id: pendingApproval.toolCallId,
                        name: pendingApproval.toolName,
                        input: pendingApproval.input,
                        output: result,
                        approved: true
                    });
                    yield {
                        type: 'tool.finished',
                        runId,
                        toolCallId: pendingApproval.toolCallId,
                        result
                    };
                } catch (err) {
                    const msg = (err as Error).message;
                    yield {
                        type: 'tool.failed',
                        runId,
                        toolCallId: pendingApproval.toolCallId,
                        error: msg
                    };
                    await this.config.memory.append(threadId, [
                        makeErrorMessage(pendingApproval.toolCallId, pendingApproval.toolName, msg),
                        ...deferred
                    ]);
                }
            }
        }

        const shouldFinishResumedStep = resumedStepCalls.length > 0;
        const resumedStepDuration = Date.now() - (checkpoint.pendingStepStartedAt ?? Date.now());
        const resumedSteps =
            shouldFinishResumedStep
                ? [
                    ...checkpoint.steps,
                    {
                        stepNumber: checkpoint.currentStep,
                        duration: resumedStepDuration,
                        toolCalls: resumedStepCalls
                    }
                ]
                : checkpoint.steps;

        await this.config.checkpoints!.delete(runId);

        if (shouldFinishResumedStep) {
            yield {
                type: 'step.finished',
                runId,
                stepNumber: checkpoint.currentStep,
                duration: resumedStepDuration
            };
            await this.config.hooks?.onStepFinish?.(checkpoint.currentStep, resumedStepDuration);
        }

        return yield* this._loop(runId, threadId, options, {
            step: checkpoint.currentStep,
            startTime: checkpoint.startedAt,
            usage: checkpoint.usage,
            steps: resumedSteps
        }, options.stream);
    }

    private async *_runEngineStep(
        runId: string,
        engineCallOptions: EngineCallOptions,
        stream: boolean | undefined
    ): AsyncGenerator<AgentEvent, EngineResponse> {
        if (!stream) {
            return await this.config.engine.call(engineCallOptions);
        }

        let textAccum = '';
        let reasoningAccum = '';
        const toolCalls: ToolCall[] = [];
        let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        for await (const chunk of this.config.engine.stream(engineCallOptions)) {
            if (chunk.type === 'reasoning-delta' && chunk.reasoningDelta) {
                reasoningAccum += chunk.reasoningDelta;
                yield { type: 'reasoning.delta', runId, text: chunk.reasoningDelta };
            }
            if (chunk.type === 'text-delta' && chunk.textDelta) {
                textAccum += chunk.textDelta;
                yield { type: 'text.delta', runId, text: chunk.textDelta };
            }
            if (chunk.type === 'tool-call') {
                const tc = chunk.toolCall;
                if (tc?.id && tc?.name) {
                    toolCalls.push({ id: tc.id, name: tc.name, arguments: tc.arguments ?? {} });
                }
            }
            if (chunk.type === 'finish' && chunk.usage) {
                usage = chunk.usage;
            }
        }

        if (reasoningAccum) {
            yield { type: 'reasoning.completed', runId, text: reasoningAccum };
        }
        if (textAccum) {
            yield { type: 'text.completed', runId, text: textAccum };
        }

        return {
            text: textAccum || undefined,
            reasoning: reasoningAccum || undefined,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            finishReason: toolCalls.length > 0 ? 'tool-calls' : 'stop',
            usage,
            raw: null
        };
    }

    private async *_loop(
        runId: string,
        threadId: string,
        options: ResumeOptions<Ctx>,
        state: LoopState,
        stream?: boolean
    ): AsyncGenerator<AgentEvent, RunResult> {
        const maxSteps = options.maxSteps ?? 10;
        let { step, startTime, usage, steps } = state;

        try {
            while (step < maxSteps) {
                if (options.abortSignal?.aborted) {
                    yield { type: 'run.cancelled', runId, reason: 'Aborted' };
                    return {
                        runId,
                        threadId,
                        status: 'cancelled',
                        error: 'Aborted',
                        messages: await this.config.memory.list(threadId)
                    };
                }

                step++;
                const stepStartTime = Date.now();

                yield { type: 'step.started', runId, stepNumber: step };
                await this.config.hooks?.onStepStart?.(step);

                const messages = await this.config.memory.list(threadId);
                let response: EngineResponse;
                try {
                    response = yield* this._runEngineStep(runId, {
                        messages,
                        tools: this.config.tools.map((t) => t.toSchema()),
                        system: this.config.system,
                        abortSignal: options.abortSignal
                    }, stream);
                } catch (err) {
                    if (options.abortSignal?.aborted) {
                        yield { type: 'run.cancelled', runId, reason: 'Aborted' };
                        return {
                            runId,
                            threadId,
                            status: 'cancelled',
                            error: 'Aborted',
                            messages: await this.config.memory.list(threadId)
                        };
                    }
                    throw err;
                }

                usage = addUsage(usage, response.usage);

                if (!stream && response.reasoning) {
                    yield {
                        type: 'reasoning.completed',
                        runId,
                        text: response.reasoning
                    };
                }

                if (response.finishReason !== 'tool-calls' || !response.toolCalls?.length) {
                    await this.config.memory.append(threadId, [{ role: 'assistant', content: response.text ?? '' }]);

                    if (!stream && response.text) {
                        yield { type: 'text.completed', runId, text: response.text };
                    }

                    const stepDuration = Date.now() - stepStartTime;
                    steps = [...steps, { stepNumber: step, duration: stepDuration, toolCalls: [] }];
                    yield {
                        type: 'step.finished',
                        runId,
                        stepNumber: step,
                        duration: stepDuration
                    };
                    await this.config.hooks?.onStepFinish?.(step, stepDuration);

                    const output: AgentOutput = {
                        text: response.text ?? '',
                        usage,
                        steps,
                        duration: Date.now() - startTime
                    };
                    yield { type: 'run.completed', runId, output };
                    return {
                        runId,
                        threadId,
                        status: 'completed',
                        output,
                        messages: await this.config.memory.list(threadId)
                    };
                }

                const toolCallParts: ToolCallPart[] = response.toolCalls.map((call) => ({
                    type: 'tool-call',
                    toolCallId: call.id,
                    toolName: call.name,
                    args: call.arguments
                }));
                await this.config.memory.append(threadId, [
                    {
                        role: 'assistant',
                        content: [...(response.text ? [{ type: 'text' as const, text: response.text }] : []), ...toolCallParts]
                    }
                ]);

                const toolMessages: Message[] = [];
                const deferredMessages: Message[] = [];
                const stepCalls: AgentStep['toolCalls'] = [];
                let pauseReason: PauseReason | undefined;

                for (const call of response.toolCalls) {
                    if (pauseReason) {
                        deferredMessages.push(
                            makeErrorMessage(call.id, call.name, 'Skipped: another tool in this batch requires approval')
                        );
                        continue;
                    }

                    const tool = this.config.tools.find((t) => t.name === call.name);

                    if (!tool) {
                        const msg = new NoSuchToolError(call.name).message;
                        yield {
                            type: 'tool.failed',
                            runId,
                            toolCallId: call.id,
                            error: msg
                        };
                        toolMessages.push(makeErrorMessage(call.id, call.name, msg));
                        continue;
                    }

                    let validatedInput: unknown;
                    try {
                        validatedInput = tool.inputSchema.parse(call.arguments);
                    } catch (err) {
                        const msg = new InvalidToolArgumentsError(call.name, err).message;
                        yield {
                            type: 'tool.failed',
                            runId,
                            toolCallId: call.id,
                            error: msg
                        };
                        toolMessages.push(makeErrorMessage(call.id, call.name, msg));
                        continue;
                    }

                    if (tool.needsApproval) {
                        const decision = await tool.needsApproval({
                            input: validatedInput,
                            context: options.context
                        });

                        if (decision.behavior === 'deny') {
                            toolMessages.push(makeErrorMessage(call.id, call.name, decision.reason ?? 'Denied by policy'));
                            stepCalls.push({
                                id: call.id,
                                name: call.name,
                                input: validatedInput,
                                output: null,
                                approved: false
                            });
                            continue;
                        }

                        if (decision.behavior === 'pause') {
                            if (!this.config.checkpoints) throw new NoCheckpointStoreError();
                            pauseReason = {
                                type: 'approval_required',
                                approvalId: crypto.randomUUID(),
                                toolCallId: call.id,
                                toolName: tool.name,
                                input: validatedInput,
                                message: decision.message
                            };
                            continue;
                        }
                    }

                    if (options.abortSignal?.aborted) {
                        if (toolMessages.length > 0) await this.config.memory.append(threadId, toolMessages);
                        yield { type: 'run.cancelled', runId, reason: 'Aborted' };
                        return {
                            runId,
                            threadId,
                            status: 'cancelled',
                            error: 'Aborted',
                            messages: await this.config.memory.list(threadId)
                        };
                    }

                    yield {
                        type: 'tool.started',
                        runId,
                        toolCallId: call.id,
                        toolName: call.name,
                        input: validatedInput
                    };
                    try {
                        const result = await tool.execute(validatedInput, options.context);
                        toolMessages.push({
                            role: 'tool',
                            toolCallId: call.id,
                            content: [
                                {
                                    type: 'tool-result',
                                    toolCallId: call.id,
                                    toolName: call.name,
                                    result
                                } satisfies ToolResultPart
                            ]
                        });
                        stepCalls.push({
                            id: call.id,
                            name: call.name,
                            input: validatedInput,
                            output: result,
                            approved: true
                        });
                        yield { type: 'tool.finished', runId, toolCallId: call.id, result };
                    } catch (err) {
                        const msg = (err as Error).message;
                        yield {
                            type: 'tool.failed',
                            runId,
                            toolCallId: call.id,
                            error: msg
                        };
                        toolMessages.push(makeErrorMessage(call.id, call.name, msg));
                    }
                }

                if (toolMessages.length > 0) await this.config.memory.append(threadId, toolMessages);

                if (pauseReason) {
                    await this.config.checkpoints!.save({
                        runId,
                        threadId,
                        status: 'paused',
                        currentStep: step,
                        pendingApproval: pauseReason,
                        deferredToolMessages: deferredMessages,
                        pendingStepCalls: stepCalls,
                        pendingStepStartedAt: stepStartTime,
                        usage,
                        steps,
                        startedAt: startTime
                    });
                    yield {
                        type: 'approval.requested',
                        runId,
                        approvalId: pauseReason.approvalId,
                        toolCallId: pauseReason.toolCallId,
                        toolName: pauseReason.toolName,
                        input: pauseReason.input,
                        message: pauseReason.message
                    };
                    return {
                        runId,
                        threadId,
                        status: 'paused',
                        pauseReason,
                        messages: await this.config.memory.list(threadId)
                    };
                }

                const stepDuration = Date.now() - stepStartTime;
                steps = [...steps, { stepNumber: step, duration: stepDuration, toolCalls: stepCalls }];
                yield {
                    type: 'step.finished',
                    runId,
                    stepNumber: step,
                    duration: stepDuration
                };
                await this.config.hooks?.onStepFinish?.(step, stepDuration);
            }

            const error = new MaxStepsExceededError(maxSteps);
            yield { type: 'run.failed', runId, error: error.message };
            return {
                runId,
                threadId,
                status: 'failed',
                error: error.message,
                messages: await this.config.memory.list(threadId)
            };
        } catch (err) {
            if (
                err instanceof NoCheckpointStoreError ||
                err instanceof CheckpointNotFoundError ||
                err instanceof InvalidRunStatusError ||
                err instanceof InvalidApprovalIdError
            )
                throw err;
            const message = (err as Error).message ?? 'Unexpected error';
            yield { type: 'run.failed', runId, error: message };
            return {
                runId,
                threadId,
                status: 'failed',
                error: message,
                messages: await this.config.memory.list(threadId)
            };
        }
    }
}
