import OpenAI from 'openai';
import type {
    EngineCallOptions,
    EngineConfig,
    EngineResponse,
    EngineStreamChunk,
    IEngine,
    Message,
    MessagePart,
    ToolCall,
    ToolSchema
} from '@agent/core';

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;
type ChatTool = OpenAI.Chat.Completions.ChatCompletionTool;

function toOpenAIContent(content: string | MessagePart[]): string | ChatContentPart[] {
    if (typeof content === 'string') return content;

    return content.flatMap((part): ChatContentPart[] => {
        if (part.type === 'text') return [{ type: 'text', text: part.text }];
        if (part.type === 'image') {
            return [
                {
                    type: 'image_url',
                    image_url: {
                        url: typeof part.image === 'string' ? part.image : part.image.toString()
                    }
                }
            ];
        }
        return [];
    });
}

function toOpenAITool(tool: ToolSchema): ChatTool {
    return {
        type: 'function',
        function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters
        }
    };
}

function stringifyToolResult(result: unknown): string {
    if (typeof result === 'string') return result;
    return JSON.stringify(result) ?? '';
}

function parseToolArguments(value: string): Record<string, any> {
    if (!value) return {};
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, any>) : {};
}

function tryParseToolArguments(value: string | undefined): Record<string, any> | undefined {
    if (!value) return undefined;

    try {
        return parseToolArguments(value);
    } catch {
        return undefined;
    }
}

function toOpenAIMessages(messages: Message[], system?: string): ChatMessage[] {
    const result: ChatMessage[] = [];
    if (system) result.push({ role: 'system', content: system });

    for (const message of messages) {
        if (message.role === 'system') {
            result.push({
                role: 'system',
                content: typeof message.content === 'string' ? message.content : ''
            });
            continue;
        }

        if (message.role === 'user') {
            result.push({
                role: 'user',
                content: toOpenAIContent(message.content)
            });
            continue;
        }

        if (message.role === 'assistant') {
            if (typeof message.content === 'string') {
                result.push({ role: 'assistant', content: message.content });
                continue;
            }

            const text = message.content
                .filter((part) => part.type === 'text')
                .map((part) => (part.type === 'text' ? part.text : ''))
                .join('');
            const toolCalls = message.content
                .filter((part) => part.type === 'tool-call')
                .map((part) => ({
                    id: part.toolCallId,
                    type: 'function' as const,
                    function: {
                        name: part.toolName,
                        arguments: JSON.stringify(part.args) ?? ''
                    }
                }));

            result.push({
                role: 'assistant',
                content: text || null,
                tool_calls: toolCalls.length > 0 ? toolCalls : undefined
            });
            continue;
        }

        const parts = Array.isArray(message.content) ? message.content : [];
        const toolResult = parts.find((part) => part.type === 'tool-result');
        result.push({
            role: 'tool',
            tool_call_id: message.toolCallId ?? (toolResult?.type === 'tool-result' ? toolResult.toolCallId : ''),
            content: toolResult?.type === 'tool-result' ? stringifyToolResult(toolResult.result) : ''
        });
    }

    return result;
}

function mapFinishReason(reason: string | null): EngineResponse['finishReason'] {
    if (reason === 'tool_calls' || reason === 'function_call') return 'tool-calls';
    if (reason === 'length') return 'length';
    if (reason === 'stop') return 'stop';
    return 'error';
}

function toToolCalls(toolCalls: OpenAI.Chat.Completions.ChatCompletionMessage['tool_calls']): ToolCall[] | undefined {
    return toolCalls
        ?.filter((toolCall) => toolCall.type === 'function')
        .map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: parseToolArguments(toolCall.function.arguments)
        }));
}

export class OpenAIEngine implements IEngine {
    readonly provider = 'openai';
    readonly modelId: string;

    constructor(
        private readonly client: OpenAI,
        modelId: string,
        private readonly engineConfig: Partial<EngineConfig> = {}
    ) {
        this.modelId = modelId;
    }

    async call(options: EngineCallOptions): Promise<EngineResponse> {
        const response = await this.client.chat.completions.create(
            {
                model: this.modelId,
                messages: toOpenAIMessages(options.messages, options.system),
                tools: options.tools?.map(toOpenAITool),
                temperature: this.engineConfig.temperature,
                max_completion_tokens: this.engineConfig.maxTokens,
                top_p: this.engineConfig.topP
            },
            { signal: options.abortSignal }
        );

        const choice = response.choices[0];
        if (!choice) {
            return {
                finishReason: 'error',
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                raw: response
            };
        }

        const message = choice.message as OpenAI.Chat.Completions.ChatCompletionMessage & {
            reasoning_content?: string;
        };

        return {
            text: message.content ?? undefined,
            reasoning: message.reasoning_content,
            toolCalls: toToolCalls(message.tool_calls),
            finishReason: mapFinishReason(choice.finish_reason),
            usage: {
                promptTokens: response.usage?.prompt_tokens ?? 0,
                completionTokens: response.usage?.completion_tokens ?? 0,
                totalTokens: response.usage?.total_tokens ?? 0
            },
            raw: response
        };
    }

    async *stream(options: EngineCallOptions): AsyncGenerator<EngineStreamChunk> {
        const stream = await this.client.chat.completions.create(
            {
                model: this.modelId,
                messages: toOpenAIMessages(options.messages, options.system),
                tools: options.tools?.map(toOpenAITool),
                temperature: this.engineConfig.temperature,
                max_completion_tokens: this.engineConfig.maxTokens,
                top_p: this.engineConfig.topP,
                stream: true,
                stream_options: { include_usage: true }
            },
            { signal: options.abortSignal }
        );

        let yieldedFinish = false;
        const toolCallDeltas = new Map<
            number,
            {
                id?: string;
                name?: string;
                argumentsText: string;
            }
        >();

        for await (const chunk of stream) {
            const choice = chunk.choices[0];
            const delta = choice?.delta as (typeof choice.delta & { reasoning_content?: string }) | undefined;

            if (delta?.reasoning_content) {
                yield { type: 'reasoning-delta', reasoningDelta: delta.reasoning_content };
            }

            if (delta?.content) {
                yield { type: 'text-delta', textDelta: delta.content };
            }

            if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                    const index = toolCall.index;
                    const argumentsDelta = toolCall.function?.arguments ?? '';
                    const current = toolCallDeltas.get(index) ?? { argumentsText: '' };
                    current.id = toolCall.id ?? current.id;
                    current.name = toolCall.function?.name ?? current.name;
                    current.argumentsText += argumentsDelta;
                    toolCallDeltas.set(index, current);

                    yield {
                        type: 'tool-call-delta',
                        toolCallIndex: index,
                        toolCallArgumentsDelta: argumentsDelta,
                        toolCall: {
                            id: current.id,
                            name: current.name,
                            arguments: tryParseToolArguments(current.argumentsText)
                        }
                    };
                }
            }

            if (choice?.finish_reason === 'tool_calls' || choice?.finish_reason === 'function_call') {
                for (const [index, toolCall] of toolCallDeltas) {
                    if (!toolCall.id || !toolCall.name) continue;
                    yield {
                        type: 'tool-call',
                        toolCallIndex: index,
                        toolCall: {
                            id: toolCall.id,
                            name: toolCall.name,
                            arguments: tryParseToolArguments(toolCall.argumentsText) ?? {}
                        }
                    };
                }
            }

            if (chunk.usage) {
                yieldedFinish = true;
                yield {
                    type: 'finish',
                    usage: {
                        promptTokens: chunk.usage.prompt_tokens,
                        completionTokens: chunk.usage.completion_tokens,
                        totalTokens: chunk.usage.total_tokens
                    }
                };
            }
        }

        if (!yieldedFinish) {
            yield {
                type: 'finish',
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
            };
        }
    }
}
