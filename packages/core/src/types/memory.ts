import type { Message } from './message.js';

export interface IMemoryStore {
    append(threadId: string, messages: Message[]): Promise<void>;
    list(threadId: string, options?: { limit?: number }): Promise<Message[]>;
    clear(threadId: string): Promise<void>;
}
