import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IMemoryStore, Message } from '@agent/core';

export class FsMemoryStore implements IMemoryStore {
    constructor(private readonly dir: string) {}

    private filePath(threadId: string): string {
        return path.join(this.dir, `${encodeKey(threadId)}.json`);
    }

    async append(threadId: string, messages: Message[]): Promise<void> {
        await fs.mkdir(this.dir, { recursive: true });
        const existing = await this.list(threadId);
        await fs.writeFile(this.filePath(threadId), JSON.stringify([...existing, ...messages], null, 2), 'utf8');
    }

    async list(threadId: string, options?: { limit?: number }): Promise<Message[]> {
        try {
            const content = await fs.readFile(this.filePath(threadId), 'utf8');
            const messages = JSON.parse(content) as Message[];
            return options?.limit ? messages.slice(-options.limit) : messages;
        } catch (error) {
            if (isMissingFile(error)) return [];
            throw error;
        }
    }

    async clear(threadId: string): Promise<void> {
        try {
            await fs.unlink(this.filePath(threadId));
        } catch (error) {
            if (!isMissingFile(error)) throw error;
        }
    }
}

function encodeKey(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
}

function isMissingFile(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
