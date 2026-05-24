import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Message, RunCheckpoint } from '@agent/core'
import { FsCheckpointStore, FsMemoryStore } from '../src/index.js'

describe('fs stores', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-cli-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('appends, lists, limits, and clears memory by thread', async () => {
    const store = new FsMemoryStore(path.join(dir, 'memory'))
    const messages: Message[] = [
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
    ]

    await store.append('thread/with/slashes', messages)
    await store.append('thread/with/slashes', [{ role: 'user', content: 'three' }])
    await store.append('other-thread', [{ role: 'user', content: 'other' }])

    expect(await store.list('thread/with/slashes')).toEqual([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
    ])
    expect(await store.list('thread/with/slashes', { limit: 1 })).toEqual([{ role: 'user', content: 'three' }])
    expect(await store.list('other-thread')).toEqual([{ role: 'user', content: 'other' }])

    await store.clear('thread/with/slashes')
    expect(await store.list('thread/with/slashes')).toEqual([])
  })

  it('saves, loads, overwrites, and deletes checkpoints', async () => {
    const store = new FsCheckpointStore(path.join(dir, 'checkpoints'))
    const checkpoint: RunCheckpoint = {
      runId: 'run/1',
      threadId: 'thread-1',
      status: 'paused',
      currentStep: 2,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      steps: [],
      startedAt: 10,
    }

    expect(await store.load(checkpoint.runId)).toBeUndefined()
    await store.save(checkpoint)
    expect(await store.load(checkpoint.runId)).toEqual(checkpoint)

    await store.save({ ...checkpoint, currentStep: 3 })
    expect((await store.load(checkpoint.runId))?.currentStep).toBe(3)

    await store.delete(checkpoint.runId)
    expect(await store.load(checkpoint.runId)).toBeUndefined()
  })
})
