import type { Message } from './message.js';
import type { ToolSchema, ToolCall } from './tool.js';

export interface EngineConfig {
    model: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
}

export interface EngineCallOptions {
    messages: Message[];
    tools?: ToolSchema[];
    system?: string;
    abortSignal?: AbortSignal;
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface EngineResponse {
    text?: string;
    reasoning?: string;
    toolCalls?: ToolCall[];
    finishReason: 'stop' | 'tool-calls' | 'length' | 'error';
    usage: TokenUsage;
    raw: unknown;
}

export interface EngineStreamChunk {
    type: 'reasoning-delta' | 'text-delta' | 'tool-call-delta' | 'tool-call' | 'finish';
    reasoningDelta?: string;
    textDelta?: string;
    toolCall?: Partial<ToolCall>;
    toolCallIndex?: number;
    toolCallArgumentsDelta?: string;
    usage?: TokenUsage;
}

export interface IEngine {
    readonly provider: string;
    readonly modelId: string;

    call(options: EngineCallOptions): Promise<EngineResponse>;
    stream(options: EngineCallOptions): AsyncGenerator<EngineStreamChunk>;
}
