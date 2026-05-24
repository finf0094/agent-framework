import path from 'node:path';
import { useCallback, useMemo, useState } from 'react';
import { Box } from 'ink';
import { z } from 'zod';
import { Agent, buildTool } from '@agent/core';
import { createCliContext, FsCheckpointStore, FsMemoryStore } from '@agent/cli';
import { createOpenAI } from '@agent/openai';
import { ApprovalModal } from './components/ApprovalModal.js';
import { ChatHistory } from './components/ChatHistory.js';
import { InputBox } from './components/InputBox.js';
import { StatusBar } from './components/StatusBar.js';
import { DEFAULT_AGENT_DIR, loadCliAppConfig } from './config.js';
import { useAgent } from './hooks/useAgent.js';
import { useAgentStore } from './store.js';

interface AppProps {
    model?: string;
    stream?: boolean;
    apiKey?: string;
    baseURL?: string;
}

export function App({ model, stream, apiKey, baseURL }: AppProps) {
    const { status, pauseReason, pendingRunId } = useAgentStore();
    const [input, setInput] = useState('');
    const context = useMemo(() => createCliContext(), []);
    const config = useMemo(() => loadCliAppConfig(), []);
    const resolvedModel = model ?? process.env.AGENT_MODEL ?? config.model ?? 'gpt-4o';
    const resolvedStream = stream ?? config.stream ?? false;
    const resolvedApiKey = apiKey ?? process.env.OPENAI_API_KEY ?? config.apiKey;
    const resolvedBaseURL = baseURL ?? process.env.OPENAI_BASE_URL ?? config.baseURL;

    const agent = useMemo(() => {
        if (!resolvedApiKey) return null;
        const dataDir = config.dataDir ?? DEFAULT_AGENT_DIR;
        return new Agent({
            name: 'cli-agent',
            engine: createOpenAI({ apiKey: resolvedApiKey, baseURL: resolvedBaseURL }).engine(resolvedModel),
            tools: [approvalDemoTool],
            memory: new FsMemoryStore(path.join(dataDir, 'memory')),
            checkpoints: new FsCheckpointStore(path.join(dataDir, 'checkpoints')),
            system: 'You are a helpful assistant.'
        });
    }, [config.dataDir, resolvedApiKey, resolvedBaseURL, resolvedModel]);

    const { run, resume } = useAgent(agent, context, resolvedStream);

    const handleSubmit = useCallback(
        (value: string) => {
            const prompt = value.trim();
            if (!prompt) return;
            setInput('');
            void run(prompt);
        },
        [run]
    );

    const handleApproval = useCallback(
        (decision: 'allow' | 'deny') => {
            if (!pauseReason || !pendingRunId) return;
            void resume(pauseReason.approvalId, pendingRunId, decision);
        },
        [pauseReason, pendingRunId, resume]
    );

    return (
        <Box flexDirection="column" height="100%">
            <StatusBar model={resolvedModel} />
            <ChatHistory />
            {status === 'paused' ? (
                <ApprovalModal onDecision={handleApproval} />
            ) : (
                <InputBox value={input} onChange={setInput} onSubmit={handleSubmit} />
            )}
        </Box>
    );
}

const approvalDemoTool = buildTool({
    name: 'approval_demo',
    description: 'Returns the provided message after explicit user approval. Use this when the user asks to test approval.',
    inputSchema: z.object({
        message: z.string()
    }),
    needsApproval: ({ input }) => ({ behavior: 'pause', message: `Approve demo message: ${input.message}` }),
    async execute({ message }) {
        return `approved: ${message}`;
    }
});
