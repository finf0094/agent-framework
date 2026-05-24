import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputBoxProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (value: string) => void;
}

export function InputBox({ value, onChange, onSubmit }: InputBoxProps) {
    return (
        <Box borderStyle="single" borderColor="gray">
            <Text color="cyan">{'> '}</Text>
            <TextInput value={value} onChange={onChange} onSubmit={onSubmit} placeholder="Type a message..." />
        </Box>
    );
}
