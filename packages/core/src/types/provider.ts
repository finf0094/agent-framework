import type { IEngine, EngineConfig } from './engine.js';

export interface ProviderConfig {
    apiKey?: string;
    baseURL?: string;
    headers?: Record<string, string>;
    fetch?: typeof fetch;
}

export interface IProvider {
    readonly id: string;

    engine(modelId: string, config?: Partial<EngineConfig>): IEngine;

    ping?(): Promise<boolean>;
    listModels?(): Promise<ModelInfo[]>;
}

export interface ModelInfo {
    id: string;
    name: string;
    contextWindow: number;
    supportsTools: boolean;
    supportsVision: boolean;
    supportsStreaming: boolean;
}
