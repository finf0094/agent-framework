import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildTool, InMemoryCheckpointStore, InMemoryStore } from '@agent/core'
import type { EngineCallOptions, EngineResponse, IEngine, PauseReason } from '@agent/core'
import { createCliAgent, createCliContext, runWithApproval } from '../src/index.js'

class QueueEngine implements IEngine {
  readonly provider = 'test'
  readonly modelId = 'queue'

  private responses: EngineResponse[] = []

  queue(response: Partial<EngineResponse>): this {
    this.responses.push({
      finishReason: response.finishReason ?? (response.toolCalls?.length ? 'tool-calls' : 'stop'),
      usage: response.usage ?? { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      raw: response.raw ?? response,
      ...response,
    })
    return this
  }

  async call(_options: EngineCallOptions): Promise<EngineResponse> {
    const response = this.responses.shift()
    if (!response) throw new Error('no queued response')
    return response
  }

  async *stream(): AsyncGenerator<never> {
    throw new Error('stream should not be called')
  }
}

describe('runWithApproval', () => {
  it('asks the adapter, resumes with allow, and executes the approved tool', async () => {
    const engine = new QueueEngine()
      .queue({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { value: 'x' } }] })
      .queue({ text: 'done', finishReason: 'stop' })
    const approvals: PauseReason[] = []
    let executed = false

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ value: z.string() }),
      needsApproval: () => ({ behavior: 'pause', message: 'Confirm risky tool' }),
      async execute({ value }) {
        executed = true
        return `ran:${value}`
      },
    })

    const agent = createCliAgent({
      name: 'cli-test',
      engine,
      tools: [risky],
      memory: new InMemoryStore(),
      checkpoints: new InMemoryCheckpointStore(),
    })

    const events: string[] = []
    const result = await runWithApproval(agent, 'run risky', {
      context: createCliContext(),
      onEvent: (event) => events.push(event.type),
      approval: {
        async requestApproval(request) {
          approvals.push(request.pauseReason)
          return { decision: 'allow' }
        },
      },
    })

    expect(result.status).toBe('completed')
    expect(result.output?.text).toBe('done')
    expect(executed).toBe(true)
    expect(approvals).toHaveLength(1)
    expect(approvals[0].toolName).toBe('risky')
    expect(events).toContain('approval.requested')
    expect(events).toContain('approval.granted')
    expect(events).toContain('tool.finished')
  })

  it('resumes with deny and does not execute the denied tool', async () => {
    const engine = new QueueEngine()
      .queue({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { value: 'x' } }] })
      .queue({ text: 'skipped', finishReason: 'stop' })
    let executed = false

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ value: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute() {
        executed = true
        return 'should-not-run'
      },
    })

    const agent = createCliAgent({
      name: 'cli-test',
      engine,
      tools: [risky],
      memory: new InMemoryStore(),
      checkpoints: new InMemoryCheckpointStore(),
    })

    const events: string[] = []
    const result = await runWithApproval(agent, 'run risky', {
      context: createCliContext(),
      onEvent: (event) => events.push(event.type),
      approval: {
        async requestApproval() {
          return { decision: 'deny', reason: 'nope' }
        },
      },
    })

    expect(result.status).toBe('completed')
    expect(result.output?.text).toBe('skipped')
    expect(executed).toBe(false)
    expect(events).toContain('approval.denied')
    expect(events).not.toContain('tool.started')
  })
})
