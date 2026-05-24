import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import { Agent } from '../src/agent/agent'
import { InMemoryStore } from '../src/memory/in-memory'
import { InMemoryCheckpointStore } from '../src/memory/in-memory-checkpoint'
import { buildTool } from '../src/tool/build-tool'
import type { AgentContext } from '../src'
import { MockEngine } from './utils/mock-engine'

type Ctx = AgentContext

describe('Agent', () => {
  let engine: MockEngine
  let memory: InMemoryStore
  let checkpoints: InMemoryCheckpointStore

  beforeEach(() => {
    engine = new MockEngine()
    memory = new InMemoryStore()
    checkpoints = new InMemoryCheckpointStore()
  })

  it('completes with a text response', async () => {
    engine.queueResponse({ text: 'Hello!', finishReason: 'stop' })
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [], memory })
    const result = await agent.run('Hi', { context: {} })
    expect(result.status).toBe('completed')
    expect(result.output?.text).toBe('Hello!')
  })

  it('executes tool calls and accumulates steps', async () => {
    engine
      .queueResponse({ toolCalls: [{ id: 'c1', name: 'echo', arguments: { msg: 'hi' } }], finishReason: 'tool-calls' })
      .queueResponse({ text: 'Done', finishReason: 'stop' })

    const echo = buildTool({
      name: 'echo',
      description: 'Echo',
      inputSchema: z.object({ msg: z.string() }),
      async execute({ msg }) { return msg },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [echo], memory })
    const result = await agent.run('Echo hi', { context: {} })
    expect(result.status).toBe('completed')
    expect(result.output?.steps[0].toolCalls[0].name).toBe('echo')
    expect(result.output?.steps[0].toolCalls[0].approved).toBe(true)
  })

  it('pauses when tool returns pause decision', async () => {
    engine.queueResponse({
      toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'rm -rf /' } }],
      finishReason: 'tool-calls',
    })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause', message: 'Dangerous!' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory, checkpoints })
    const result = await agent.run('Run risky', { context: {} })

    expect(result.status).toBe('paused')
    expect(result.pauseReason?.toolName).toBe('risky')
    expect(result.pauseReason?.message).toBe('Dangerous!')
  })

  it('resumes after approval and completes', async () => {
    engine
      .queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'rm -rf /' } }], finishReason: 'tool-calls' })
      .queueResponse({ text: 'All done', finishReason: 'stop' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute({ cmd }) { return `ran: ${cmd}` },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory, checkpoints })
    const paused = await agent.run('Run risky', { context: {} })
    expect(paused.status).toBe('paused')

    const resumed = await agent.resume(paused.runId, {
      approvalId: paused.pauseReason!.approvalId,
      decision: 'allow',
    }, { context: {} })

    expect(resumed.status).toBe('completed')
    expect(resumed.output?.text).toBe('All done')
  })

  it('emits approval.requested (not run.paused) when tool pauses', async () => {
    engine.queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause', message: 'Confirm?' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory, checkpoints })
    const events: string[] = []
    const result = await agent.run('Run risky', { context: {}, onEvent: e => events.push(e.type) })

    expect(result.status).toBe('paused')
    expect(events).toContain('approval.requested')
    expect(events).not.toContain('run.paused')
  })

  it('emits approval.denied on resume with decision: deny', async () => {
    engine.queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })
    engine.queueResponse({ text: 'OK', finishReason: 'stop' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory, checkpoints })
    const paused = await agent.run('Run risky', { context: {} })

    const resumeEvents: string[] = []
    await agent.resume(paused.runId, {
      approvalId: paused.pauseReason!.approvalId,
      decision: 'deny',
      reason: 'Too dangerous',
    }, { context: {}, onEvent: e => resumeEvents.push(e.type) })

    expect(resumeEvents[0]).toBe('run.resumed')
    expect(resumeEvents[1]).toBe('approval.denied')
  })

  it('throws InvalidApprovalIdError before emitting run.resumed on wrong approvalId', async () => {
    engine.queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory, checkpoints })
    const paused = await agent.run('Run risky', { context: {} })
    expect(paused.status).toBe('paused')

    const events: string[] = []
    await expect(
      agent.resume(paused.runId, { approvalId: 'wrong-id', decision: 'allow' }, {
        context: {},
        onEvent: e => events.push(e.type),
      })
    ).rejects.toMatchObject({ code: 'INVALID_APPROVAL_ID' })

    expect(events).toHaveLength(0)
  })

  it('throws NoCheckpointStoreError when pause without checkpoint store', async () => {
    engine.queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory })
    await expect(agent.run('Run risky', { context: {} })).rejects.toMatchObject({ code: 'NO_CHECKPOINT_STORE' })
  })

  it('execute() yields events in correct order', async () => {
    engine.queueResponse({ text: 'Hi', finishReason: 'stop' })
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [], memory })
    const events: string[] = []

    const gen = agent.execute('Hello', { context: {} })
    let next = await gen.next()
    while (!next.done) {
      events.push(next.value.type)
      next = await gen.next()
    }

    expect(events).toEqual(['run.started', 'step.started', 'text.completed', 'step.finished', 'run.completed'])
    expect(next.value.status).toBe('completed')
  })

  it('execute() yields run.resumed → approval.granted → tool.started on resume', async () => {
    engine
      .queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })
      .queueResponse({ text: 'Done', finishReason: 'stop' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory, checkpoints })
    const paused = await agent.run('Run risky', { context: {} })

    const resumeEvents: string[] = []
    const resumed = await agent.resume(paused.runId, {
      approvalId: paused.pauseReason!.approvalId,
      decision: 'allow',
    }, {
      context: {},
      onEvent: e => resumeEvents.push(e.type),
    })

    expect(resumeEvents[0]).toBe('run.resumed')
    expect(resumeEvents[1]).toBe('approval.granted')
    expect(resumeEvents).toContain('tool.started')
    expect(resumeEvents).not.toContain('run.started')
    expect(resumed.status).toBe('completed')
  })

  it('batch pause: pre-pause results in memory, deferred in checkpoint, correct order after resume', async () => {
    engine
      .queueResponse({
        toolCalls: [
          { id: 'c1', name: 'safe', arguments: {} },
          { id: 'c2', name: 'risky', arguments: { cmd: 'x' } },
          { id: 'c3', name: 'safe', arguments: {} },
        ],
        finishReason: 'tool-calls',
      })
      .queueResponse({ text: 'All done', finishReason: 'stop' })

    const safe = buildTool({
      name: 'safe',
      description: 'Safe',
      inputSchema: z.object({}),
      async execute() { return 'ok' },
    })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute({ cmd }) { return `ran: ${cmd}` },
    })

    const finishedSteps: number[] = []
    const agent = new Agent<Ctx>({
      name: 'test',
      engine,
      tools: [safe, risky],
      memory,
      checkpoints,
      hooks: {
        onStepFinish: step => finishedSteps.push(step),
      },
    })
    const paused = await agent.run('Run all', { context: {} })

    expect(paused.status).toBe('paused')

    const beforeMessages = await memory.list(paused.threadId)
    const beforeToolResults = beforeMessages.filter(m => m.role === 'tool')
    expect(beforeToolResults).toHaveLength(1)

    const resumeEvents: string[] = []
    const resumed = await agent.resume(paused.runId, {
      approvalId: paused.pauseReason!.approvalId,
      decision: 'allow',
    }, { context: {}, onEvent: e => resumeEvents.push(e.type) })

    expect(resumed.status).toBe('completed')

    const afterMessages = await memory.list(paused.threadId)
    const afterToolResults = afterMessages.filter(m => m.role === 'tool')
    expect(afterToolResults).toHaveLength(3)
    expect(afterToolResults[0].toolCallId).toBe('c1')
    expect(afterToolResults[1].toolCallId).toBe('c2')
    expect(afterToolResults[2].toolCallId).toBe('c3')
    expect(resumed.output?.steps[0].toolCalls.map(call => call.id)).toEqual(['c1', 'c2'])
    expect(finishedSteps).toEqual([1, 2])

    const toolFinishedIdx = resumeEvents.indexOf('tool.finished')
    const resumedStepFinishedIdx = resumeEvents.indexOf('step.finished')
    const nextStepStartedIdx = resumeEvents.indexOf('step.started')
    expect(toolFinishedIdx).toBeGreaterThan(-1)
    expect(resumedStepFinishedIdx).toBeGreaterThan(toolFinishedIdx)
    expect(nextStepStartedIdx).toBeGreaterThan(resumedStepFinishedIdx)
  })

  it('resume with a pre-aborted signal does not start the approved tool', async () => {
    engine.queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })

    let executed = false
    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute({ cmd }) {
        executed = true
        return cmd
      },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory, checkpoints })
    const paused = await agent.run('Run risky', { context: {} })
    const controller = new AbortController()
    controller.abort()
    const events: string[] = []

    const resumed = await agent.resume(paused.runId, {
      approvalId: paused.pauseReason!.approvalId,
      decision: 'allow',
    }, {
      context: {},
      abortSignal: controller.signal,
      onEvent: e => events.push(e.type),
    })

    expect(resumed.status).toBe('cancelled')
    expect(executed).toBe(false)
    expect(events).toContain('run.cancelled')
    expect(events).not.toContain('tool.started')
  })

  it('denies tool and continues loop', async () => {
    engine
      .queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })
      .queueResponse({ text: 'OK', finishReason: 'stop' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'deny', reason: 'Not allowed' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory })
    const result = await agent.run('Run risky', { context: {} })
    expect(result.status).toBe('completed')
  })

  it('emits reasoning.completed before text.completed when engine returns reasoning', async () => {
    engine.queueResponse({ text: 'Answer', finishReason: 'stop', reasoning: 'Let me think...' } as any)
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [], memory })
    const events: string[] = []

    await agent.run('Hi', { context: {}, onEvent: e => events.push(e.type) })

    expect(events).toContain('reasoning.completed')
    expect(events).toContain('text.completed')
    const reasoningIdx = events.indexOf('reasoning.completed')
    const textIdx = events.indexOf('text.completed')
    expect(reasoningIdx).toBeLessThan(textIdx)
  })

  it('does not emit reasoning.completed when engine returns none', async () => {
    engine.queueResponse({ text: 'Answer', finishReason: 'stop' })
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [], memory })
    const events: string[] = []

    await agent.run('Hi', { context: {}, onEvent: e => events.push(e.type) })

    expect(events).not.toContain('reasoning.completed')
    expect(events).not.toContain('reasoning.delta')
  })

  it('tool.started is not emitted when tool is denied or paused', async () => {
    engine.queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'deny' }),
      async execute({ cmd }) { return cmd },
    })

    const events: string[] = []
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory })
    await agent.run('Run risky', { context: {}, onEvent: e => events.push(e.type) })

    expect(events).not.toContain('tool.started')
  })

  it('stores messages in memory with threadId', async () => {
    engine.queueResponse({ text: 'Hello', finishReason: 'stop' })
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [], memory })
    const threadId = 'thread-123'
    await agent.run('Hi', { context: {}, threadId })
    const messages = await memory.list(threadId)
    expect(messages.some(m => m.role === 'user')).toBe(true)
    expect(messages.some(m => m.role === 'assistant')).toBe(true)
  })

  it('calls onStepFinish for a final text-only step', async () => {
    engine.queueResponse({ text: 'Hello', finishReason: 'stop' })
    const finishedSteps: number[] = []
    const agent = new Agent<Ctx>({
      name: 'test',
      engine,
      tools: [],
      memory,
      hooks: {
        onStepFinish: step => finishedSteps.push(step),
      },
    })

    const result = await agent.run('Hi', { context: {} })

    expect(result.status).toBe('completed')
    expect(finishedSteps).toEqual([1])
  })

  it('emits run.cancelled and returns cancelled status when abortSignal is pre-aborted', async () => {
    engine.queueResponse({ text: 'Hi', finishReason: 'stop' })
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [], memory })
    const events: string[] = []
    const controller = new AbortController()
    controller.abort()

    const result = await agent.run('Hello', {
      context: {},
      abortSignal: controller.signal,
      onEvent: e => events.push(e.type),
    })

    expect(result.status).toBe('cancelled')
    expect(result.error).toBe('Aborted')
    expect(events).toContain('run.cancelled')
    expect(events).not.toContain('step.started')
  })

  it('emits run.cancelled (not run.failed) when engine throws AbortError after signal fires', async () => {
    const controller = new AbortController()
    const abortEngine = {
      provider: 'mock' as const,
      modelId: 'abort-engine',
      async call() {
        controller.abort()
        throw new DOMException('Aborted', 'AbortError')
      },
      async *stream() { yield { type: 'finish' as const } },
    }
    const agent = new Agent<Ctx>({ name: 'test', engine: abortEngine, tools: [], memory })
    const events: string[] = []

    const result = await agent.run('Hello', {
      context: {},
      abortSignal: controller.signal,
      onEvent: e => events.push(e.type),
    })

    expect(result.status).toBe('cancelled')
    expect(result.error).toBe('Aborted')
    expect(events).toContain('run.cancelled')
    expect(events).not.toContain('run.failed')
  })

  it('emits run.cancelled before second tool.started when abort fires during first tool', async () => {
    const controller = new AbortController()
    let callCount = 0

    const echo = buildTool({
      name: 'echo',
      description: 'Echo',
      inputSchema: z.object({ v: z.string() }),
      async execute({ v }) {
        callCount++
        if (callCount === 1) controller.abort()
        return v
      },
    })

    engine.queueResponse({
      toolCalls: [
        { id: 'c1', name: 'echo', arguments: { v: 'first' } },
        { id: 'c2', name: 'echo', arguments: { v: 'second' } },
      ],
      finishReason: 'tool-calls',
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [echo], memory })
    const toolStartedIds: string[] = []
    const events: string[] = []

    const result = await agent.run('Go', {
      context: {},
      abortSignal: controller.signal,
      onEvent: e => {
        events.push(e.type)
        if (e.type === 'tool.started') toolStartedIds.push((e as any).toolCallId)
      },
    })

    expect(result.status).toBe('cancelled')
    expect(events).toContain('run.cancelled')
    expect(toolStartedIds).toContain('c1')
    expect(toolStartedIds).not.toContain('c2')
  })

  it('emits run.failed and returns failed status when engine throws unexpectedly', async () => {
    const crashEngine = {
      provider: 'mock' as const,
      modelId: 'crash',
      async call() { throw new Error('Network timeout') },
      async *stream() { yield { type: 'finish' as const } },
    }
    const agent = new Agent<Ctx>({ name: 'test', engine: crashEngine, tools: [], memory })
    const events: string[] = []

    const result = await agent.run('Hello', { context: {}, onEvent: e => events.push(e.type) })

    expect(result.status).toBe('failed')
    expect(result.error).toBe('Network timeout')
    expect(events).toContain('run.failed')
  })

  it('preserves completed tool results in memory when cancellation fires mid-batch', async () => {
    const controller = new AbortController()
    let callCount = 0

    const echo = buildTool({
      name: 'echo',
      description: 'Echo',
      inputSchema: z.object({ v: z.string() }),
      async execute({ v }) {
        callCount++
        if (callCount === 1) controller.abort()
        return v
      },
    })

    engine.queueResponse({
      toolCalls: [
        { id: 'c1', name: 'echo', arguments: { v: 'first' } },
        { id: 'c2', name: 'echo', arguments: { v: 'second' } },
      ],
      finishReason: 'tool-calls',
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [echo], memory })
    const result = await agent.run('Go', { context: {}, abortSignal: controller.signal })

    expect(result.status).toBe('cancelled')
    const messages = await memory.list(result.threadId)
    const toolResults = messages.filter(m => m.role === 'tool')
    expect(toolResults).toHaveLength(1)
    expect(toolResults[0].toolCallId).toBe('c1')
  })

  it('emits run.failed and returns failed status when maxSteps exceeded', async () => {
    const echo = buildTool({
      name: 'echo',
      description: 'Echo',
      inputSchema: z.object({ v: z.string() }),
      async execute({ v }) { return v },
    })
    for (let i = 0; i < 3; i++) {
      engine.queueResponse({ toolCalls: [{ id: `c${i}`, name: 'echo', arguments: { v: 'x' } }], finishReason: 'tool-calls' })
    }
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [echo], memory })
    const events: string[] = []

    const result = await agent.run('Go', { context: {}, maxSteps: 2, onEvent: e => events.push(e.type) })

    expect(result.status).toBe('failed')
    expect(result.error).toContain('maximum steps')
    expect(events).toContain('run.failed')
    expect(events).not.toContain('run.completed')
  })
})
