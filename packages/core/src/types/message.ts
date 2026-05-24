export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface TextPart {
    type: 'text';
    text: string;
}

export interface ImagePart {
    type: 'image';
    image: string | URL;
    mimeType?: string;
}

export interface ToolCallPart {
    type: 'tool-call';
    toolCallId: string;
    toolName: string;
    args: unknown;
}

export interface ToolResultPart {
    type: 'tool-result';
    toolCallId: string;
    toolName: string;
    result: unknown;
    isError?: boolean;
}

export type MessagePart = TextPart | ImagePart | ToolCallPart | ToolResultPart;

export interface Message {
    role: Role;
    content: string | MessagePart[];
    toolCallId?: string;
}
