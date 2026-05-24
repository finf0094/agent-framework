import { Box, Text } from 'ink';
import { useAgentStore } from '../store.js';
import { StreamingText } from './StreamingText.js';

export function ChatHistory() {
    const { messages, streamingText } = useAgentStore();

    return (
        <Box flexDirection="column" flexGrow={1}>
            {messages.map((message) => (
                <Box key={message.id} marginBottom={1}>
                    <Text bold color={message.role === 'user' ? 'cyan' : 'white'}>
                        {message.role === 'user' ? 'you: ' : 'agent: '}
                    </Text>
                    <Text>{message.text}</Text>
                </Box>
            ))}
            <StreamingText text={streamingText} />
        </Box>
    );
}
