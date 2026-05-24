import OpenAI from 'openai';
import type { EngineConfig, IEngine, IProvider, ModelInfo, ProviderConfig } from '@agent/core';
import { OpenAIEngine } from './engine.js';

const UNKNOWN_CONTEXT_WINDOW = 0;

export class OpenAIProvider implements IProvider {
    readonly id = 'openai';
    private readonly client: OpenAI;

    constructor(config: ProviderConfig = {}) {
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
            defaultHeaders: config.headers,
            fetch: config.fetch
        });
    }

    engine(modelId: string, config?: Partial<EngineConfig>): IEngine {
        return new OpenAIEngine(this.client, modelId, config);
    }

    async ping(): Promise<boolean> {
        try {
            await this.client.models.list();
            return true;
        } catch {
            return false;
        }
    }

    async listModels(): Promise<ModelInfo[]> {
        const { data } = await this.client.models.list();
        return data
            .filter((model) => model.id.startsWith('gpt') || model.id.startsWith('o'))
            .map((model) => ({
                id: model.id,
                name: model.id,
                // The OpenAI models list API does not expose context window or capability metadata.
                contextWindow: UNKNOWN_CONTEXT_WINDOW,
                supportsTools: true,
                supportsVision: model.id.includes('vision') || model.id.includes('4o'),
                supportsStreaming: true
            }));
    }
}

export function createOpenAI(config?: ProviderConfig): OpenAIProvider {
    return new OpenAIProvider(config);
}
