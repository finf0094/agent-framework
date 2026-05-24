import { Box, Text, useInput } from 'ink';
import { useAgentStore } from '../store.js';

interface ApprovalModalProps {
    onDecision: (decision: 'allow' | 'deny') => void;
}

export function ApprovalModal({ onDecision }: ApprovalModalProps) {
    const { pauseReason } = useAgentStore();

    useInput((input, key) => {
        const value = input.toLowerCase();
        if (value === 'y') onDecision('allow');
        if (value === 'n' || key.escape) onDecision('deny');
    });

    if (!pauseReason) return null;

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
            <Text bold color="yellow">
                Approval required
            </Text>
            <Text>
                Tool: <Text bold>{pauseReason.toolName}</Text>
            </Text>
            {pauseReason.message ? <Text dimColor>{pauseReason.message}</Text> : null}
            <Text>Input: {JSON.stringify(pauseReason.input, null, 2)}</Text>
            <Text> </Text>
            <Text>
                <Text color="green">[y]</Text> Allow <Text color="red">[n]</Text> Deny
            </Text>
        </Box>
    );
}
