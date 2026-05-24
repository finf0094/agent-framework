import type { IEngine, EngineCallOptions, EngineResponse, EngineStreamChunk } from '../../src'

export interface MockResponse {
  text?: string
  reasoning?: string
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
  finishReason?: EngineResponse['finishReason']
}

export class MockEngine implements IEngine {
  readonly provider = 'mock'
  readonly modelId = 'mock-model'

  private queue: MockResponse[] = []

  queueResponse(response: MockResponse): this {
    this.queue.push(response)
    return this
  }

  async call(_options: EngineCallOptions): Promise<EngineResponse> {
    const response = this.queue.shift()
    if (!response) throw new Error('MockEngine: no responses queued')
    return {
      text: response.text,
      reasoning: response.reasoning,
      toolCalls: response.toolCalls,
      finishReason: response.finishReason ?? (response.toolCalls?.length ? 'tool-calls' : 'stop'),
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      raw: response,
    }
  }

  async *stream(_options: EngineCallOptions): AsyncGenerator<EngineStreamChunk> {
    yield { type: 'finish' }
  }
}
