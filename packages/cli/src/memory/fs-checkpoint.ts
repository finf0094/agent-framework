import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ICheckpointStore, RunCheckpoint } from '@agent/core';

export class FsCheckpointStore implements ICheckpointStore {
    constructor(private readonly dir: string) {}

    private filePath(runId: string): string {
        return path.join(this.dir, `checkpoint-${encodeKey(runId)}.json`);
    }

    async save(checkpoint: RunCheckpoint): Promise<void> {
        await fs.mkdir(this.dir, { recursive: true });
        await fs.writeFile(this.filePath(checkpoint.runId), JSON.stringify(checkpoint, null, 2), 'utf8');
    }

    async load(runId: string): Promise<RunCheckpoint | undefined> {
        try {
            const content = await fs.readFile(this.filePath(runId), 'utf8');
            return JSON.parse(content) as RunCheckpoint;
        } catch (error) {
            if (isMissingFile(error)) return undefined;
            throw error;
        }
    }

    async delete(runId: string): Promise<void> {
        try {
            await fs.unlink(this.filePath(runId));
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
