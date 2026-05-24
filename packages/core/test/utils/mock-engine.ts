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

  private callQueue: MockResponse[] = []
  private streamQueue: EngineStreamChunk[][] = []

  queueResponse(response: MockResponse): this {
    this.callQueue.push(response)
    return this
  }

  queueStreamChunks(chunks: EngineStreamChunk[]): this {
    this.streamQueue.push(chunks)
    return this
  }

  async call(_options: EngineCallOptions): Promise<EngineResponse> {
    const response = this.callQueue.shift()
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

  async *stream(options: EngineCallOptions): AsyncGenerator<EngineStreamChunk> {
    const chunks = this.streamQueue.shift()
    if (!chunks) throw new Error('MockEngine: no stream chunks queued')
    for (const chunk of chunks) {
      if (options.abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError')
      yield chunk
    }
  }
}
