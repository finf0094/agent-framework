import { describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import { OpenAIEngine } from '../src/engine';
import type { Message, ToolSchema } from '@agent/core';

function makeClient(response: unknown) {
    const create = vi.fn().mockResolvedValue(response);
    const client = {
        chat: {
            completions: {
                create
            }
        }
    } as unknown as OpenAI;

    return { client, create };
}

async function* chunks(values: unknown[]) {
    for (const value of values) yield value;
}

describe('OpenAIEngine', () => {
    it('maps messages, assistant tool calls, tool results, tools, and abort signal', async () => {
        const response = {
            choices: [
                {
                    finish_reason: 'stop',
                    message: {
                        content: 'done'
                    }
                }
            ],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 2,
                total_tokens: 3
            }
        };
        const { client, create } = makeClient(response);
        const controller = new AbortController();
        const engine = new OpenAIEngine(client, 'gpt-test', { temperature: 0.2, maxTokens: 128, topP: 0.9 });
        const messages: Message[] = [
            { role: 'user', content: [{ type: 'text', text: 'hello' }] },
            {
                role: 'assistant',
                content: [
                    { type: 'text', text: 'calling' },
                    { type: 'tool-call', toolCallId: 'c1', toolName: 'lookup', args: { q: 'x' } }
                ]
            },
            {
                role: 'tool',
                toolCallId: 'c1',
                content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'lookup', result: undefined }]
            }
        ];
        const tools: ToolSchema[] = [
            {
                type: 'function',
                function: {
                    name: 'lookup',
                    description: 'Lookup',
                    parameters: { type: 'object', properties: {} }
                }
            }
        ];

        await engine.call({
            messages,
            tools,
            system: 'system prompt',
            abortSignal: controller.signal
        });

        expect(create).toHaveBeenCalledTimes(1);
        const [body, requestOptions] = create.mock.calls[0];
        expect(requestOptions).toEqual({ signal: controller.signal });
        expect(body).toMatchObject({
            model: 'gpt-test',
            temperature: 0.2,
            max_completion_tokens: 128,
            top_p: 0.9,
            tools: [{ type: 'function', function: tools[0].function }]
        });
        expect(body.messages).toEqual([
            { role: 'system', content: 'system prompt' },
            { role: 'user', content: [{ type: 'text', text: 'hello' }] },
            {
                role: 'assistant',
                content: 'calling',
                tool_calls: [
                    {
                        id: 'c1',
                        type: 'function',
                        function: { name: 'lookup', arguments: '{"q":"x"}' }
                    }
                ]
            },
            { role: 'tool', tool_call_id: 'c1', content: '' }
        ]);
    });

    it('maps non-streaming responses with tool calls and usage', async () => {
        const { client } = makeClient({
            choices: [
                {
                    finish_reason: 'tool_calls',
                    message: {
                        content: null,
                        reasoning_content: 'thinking',
                        tool_calls: [
                            {
                                id: 'c1',
                                type: 'function',
                                function: { name: 'lookup', arguments: '{"q":"x"}' }
                            }
                        ]
                    }
                }
            ],
            usage: {
                prompt_tokens: 4,
                completion_tokens: 5,
                total_tokens: 9
            }
        });
        const engine = new OpenAIEngine(client, 'gpt-test');

        const response = await engine.call({ messages: [] });

        expect(response).toMatchObject({
            reasoning: 'thinking',
            finishReason: 'tool-calls',
            usage: { promptTokens: 4, completionTokens: 5, totalTokens: 9 },
            toolCalls: [{ id: 'c1', name: 'lookup', arguments: { q: 'x' } }]
        });
        expect(response.text).toBeUndefined();
    });

    it('keeps streaming tool argument deltas and emits a final assembled tool call', async () => {
        const stream = chunks([
            {
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    id: 'c1',
                                    function: { name: 'lookup', arguments: '{"q"' }
                                }
                            ]
                        },
                        finish_reason: null
                    }
                ],
                usage: null
            },
            {
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    function: { arguments: ':"x"}' }
                                }
                            ]
                        },
                        finish_reason: 'tool_calls'
                    }
                ],
                usage: null
            },
            {
                choices: [],
                usage: {
                    prompt_tokens: 1,
                    completion_tokens: 2,
                    total_tokens: 3
                }
            }
        ]);
        const { client } = makeClient(stream);
        const engine = new OpenAIEngine(client, 'gpt-test');

        const events = [];
        for await (const event of engine.stream({ messages: [] })) {
            events.push(event);
        }

        expect(events).toContainEqual(
            expect.objectContaining({
                type: 'tool-call-delta',
                toolCallIndex: 0,
                toolCallArgumentsDelta: '{"q"',
                toolCall: expect.objectContaining({ id: 'c1', name: 'lookup' })
            })
        );
        expect(events).toContainEqual(
            expect.objectContaining({
                type: 'tool-call-delta',
                toolCallIndex: 0,
                toolCallArgumentsDelta: ':"x"}',
                toolCall: expect.objectContaining({ arguments: { q: 'x' } })
            })
        );
        expect(events).toContainEqual({
            type: 'tool-call',
            toolCallIndex: 0,
            toolCall: { id: 'c1', name: 'lookup', arguments: { q: 'x' } }
        });
        expect(events.at(-1)).toEqual({
            type: 'finish',
            usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
        });
    });

    it('emits text, reasoning, and fallback finish chunks for streams without usage', async () => {
        const stream = chunks([
            {
                choices: [
                    {
                        delta: {
                            content: 'hello',
                            reasoning_content: 'why'
                        },
                        finish_reason: 'stop'
                    }
                ]
            }
        ]);
        const { client } = makeClient(stream);
        const engine = new OpenAIEngine(client, 'gpt-test');

        const events = [];
        for await (const event of engine.stream({ messages: [] })) {
            events.push(event);
        }

        expect(events).toEqual([
            { type: 'reasoning-delta', reasoningDelta: 'why' },
            { type: 'text-delta', textDelta: 'hello' },
            { type: 'finish', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }
        ]);
    });

    it('does not throw when streamed tool arguments finish as invalid JSON', async () => {
        const stream = chunks([
            {
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    id: 'c1',
                                    function: { name: 'lookup', arguments: '{"q"' }
                                }
                            ]
                        },
                        finish_reason: null
                    }
                ]
            },
            {
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    function: { arguments: ':invalid' }
                                }
                            ]
                        },
                        finish_reason: 'tool_calls'
                    }
                ]
            }
        ]);
        const { client } = makeClient(stream);
        const engine = new OpenAIEngine(client, 'gpt-test');

        const events = [];
        for await (const event of engine.stream({ messages: [] })) {
            events.push(event);
        }

        expect(events).toContainEqual({
            type: 'tool-call',
            toolCallIndex: 0,
            toolCall: { id: 'c1', name: 'lookup', arguments: {} }
        });
        expect(events.at(-1)).toEqual({
            type: 'finish',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        });
    });
});
