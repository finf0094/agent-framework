import { Box, Text } from 'ink';
import { useAgentStore } from '../store.js';

export function StatusBar({ model }: { model: string }) {
    const { status, currentStep, totalTokens } = useAgentStore();
    const color =
        status === 'running' || status === 'streaming' ? 'green' : status === 'paused' ? 'yellow' : status === 'error' ? 'red' : 'gray';

    return (
        <Box justifyContent="space-between" borderStyle="single" borderColor="gray">
            <Text dimColor>{model}</Text>
            <Text color={color}>{status}</Text>
            <Text dimColor>
                step {currentStep} | {totalTokens} tok
            </Text>
        </Box>
    );
}
