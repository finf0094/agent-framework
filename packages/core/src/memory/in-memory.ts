import type { IMemoryStore } from '../types/memory.js';
import type { Message } from '../types/message.js';

export class InMemoryStore implements IMemoryStore {
    private threads = new Map<string, Message[]>();

    async append(threadId: string, messages: Message[]): Promise<void> {
        const existing = this.threads.get(threadId) ?? [];
        this.threads.set(threadId, [...existing, ...messages]);
    }

    async list(threadId: string, options?: { limit?: number }): Promise<Message[]> {
        const messages = this.threads.get(threadId) ?? [];
        return options?.limit ? messages.slice(-options.limit) : [...messages];
    }

    async clear(threadId: string): Promise<void> {
        this.threads.delete(threadId);
    }
}
