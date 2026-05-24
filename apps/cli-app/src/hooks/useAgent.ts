import { randomUUID } from 'node:crypto';
import { useCallback, useRef } from 'react';
import type { Agent, AgentEvent } from '@agent/core';
import type { CliContext } from '@agent/cli';
import { useAgentStore } from '../store.js';

export function useAgent(agent: Agent<CliContext> | null, context: CliContext, stream = false) {
    const store = useAgentStore;
    const agentRef = useRef(agent);
    agentRef.current = agent;

    const run = useCallback(
        async (prompt: string) => {
            const { setStatus, addMessage, appendStreamingDelta, commitStreamingText, setPause, addTokens, setStep } = store.getState();

            setStatus('running');
            addMessage({ id: randomUUID(), role: 'user', text: prompt });

            if (!agentRef.current) {
                addMessage({ id: randomUUID(), role: 'assistant', text: 'OPENAI_API_KEY is required.' });
                setStatus('error');
                return;
            }

            try {
                for await (const event of agentRef.current.execute(prompt, { context, stream })) {
                    switch (event.type) {
                        case 'text.delta':
                            appendStreamingDelta(event.text);
                            break;
                        case 'text.completed':
                            if (stream) commitStreamingText();
                            else addMessage({ id: randomUUID(), role: 'assistant', text: event.text });
                            break;
                        case 'step.started':
                            setStep(event.stepNumber);
                            break;
                        case 'run.completed':
                            addTokens(event.output.usage.totalTokens);
                            setStatus('idle');
                            break;
                        case 'approval.requested':
                            setPause(
                                {
                                    type: 'approval_required',
                                    approvalId: event.approvalId,
                                    toolCallId: event.toolCallId,
                                    toolName: event.toolName,
                                    input: event.input,
                                    message: event.message
                                },
                                event.runId
                            );
                            return;
                        case 'run.failed':
                            addMessage({ id: randomUUID(), role: 'assistant', text: event.error });
                            setStatus('error');
                            break;
                        case 'run.cancelled':
                            setStatus('error');
                            break;
                    }
                }
            } catch (error) {
                addMessage({ id: randomUUID(), role: 'assistant', text: toErrorMessage(error) });
                setStatus('error');
            }
        },
        [context, stream]
    );

    const resume = useCallback(
        async (approvalId: string, runId: string, decision: 'allow' | 'deny') => {
            const { clearPause, setStatus, addMessage, appendStreamingDelta, commitStreamingText, setPause, addTokens, setStep } =
                store.getState();

            clearPause();
            setStatus('running');

            if (!agentRef.current) {
                setStatus('error');
                return;
            }

            let pausedAgain = false;
            const handleEvent = (event: AgentEvent) => {
                switch (event.type) {
                    case 'text.delta':
                        appendStreamingDelta(event.text);
                        break;
                    case 'text.completed':
                        if (stream) commitStreamingText();
                        else addMessage({ id: randomUUID(), role: 'assistant', text: event.text });
                        break;
                    case 'step.started':
                        setStep(event.stepNumber);
                        break;
                    case 'run.completed':
                        addTokens(event.output.usage.totalTokens);
                        setStatus('idle');
                        break;
                    case 'approval.requested':
                        setPause(
                            {
                                type: 'approval_required',
                                approvalId: event.approvalId,
                                toolCallId: event.toolCallId,
                                toolName: event.toolName,
                                input: event.input,
                                message: event.message
                            },
                            event.runId
                        );
                        pausedAgain = true;
                        return;
                    case 'run.failed':
                        addMessage({ id: randomUUID(), role: 'assistant', text: event.error });
                        setStatus('error');
                        break;
                    case 'run.cancelled':
                        setStatus('error');
                        break;
                }
            };

            try {
                const result = await agentRef.current.resume(runId, { approvalId, decision }, { context, stream, onEvent: handleEvent });
                if (!pausedAgain && result.status === 'paused' && result.pauseReason) {
                    setPause(result.pauseReason, result.runId);
                }
            } catch (error) {
                addMessage({ id: randomUUID(), role: 'assistant', text: toErrorMessage(error) });
                setStatus('error');
            }
        },
        [context, stream]
    );

    return { run, resume };
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}
