import { Box, Text } from 'ink';

export function StreamingText({ text }: { text: string }) {
    if (!text) return null;

    return (
        <Box>
            <Text bold color="white">
                agent:{' '}
            </Text>
            <Text>{text}</Text>
            <Text color="green">_</Text>
        </Box>
    );
}
