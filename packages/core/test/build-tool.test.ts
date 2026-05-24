import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { buildTool } from '../src/tool/build-tool'

describe('buildTool', () => {
  it('validates and executes', async () => {
    const add = buildTool({
      name: 'add',
      description: 'Add two numbers',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      async execute({ a, b }) { return a + b },
    })

    expect(await add.execute({ a: 1, b: 2 }, {})).toBe(3)
    await expect(add.execute({ a: '1', b: 2 } as any, {})).rejects.toThrow()
  })

  it('generates correct JSON schema', () => {
    const search = buildTool({
      name: 'search',
      description: 'Search files',
      inputSchema: z.object({ query: z.string(), limit: z.number().optional() }),
      async execute({ query }) { return [query] },
    })

    const schema = search.toSchema()
    expect(schema.type).toBe('function')
    expect(schema.function.name).toBe('search')
    expect(schema.function.parameters.properties.query.type).toBe('string')
    expect(schema.function.parameters.additionalProperties).toBe(false)
  })

  it('needsApproval returns pause for dangerous input', async () => {
    const rm = buildTool({
      name: 'shell',
      description: 'Run command',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: ({ input }) =>
        input.cmd.startsWith('rm')
          ? { behavior: 'pause', message: 'Dangerous!' }
          : { behavior: 'allow' },
      async execute({ cmd }) { return cmd },
    })

    expect(await rm.needsApproval!({ input: { cmd: 'ls' }, context: {} })).toEqual({ behavior: 'allow' })
    expect(await rm.needsApproval!({ input: { cmd: 'rm -rf /' }, context: {} })).toMatchObject({ behavior: 'pause' })
  })
})
