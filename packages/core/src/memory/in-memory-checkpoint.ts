import type { ICheckpointStore, RunCheckpoint } from '../types/checkpoint.js';

export class InMemoryCheckpointStore implements ICheckpointStore {
    private checkpoints = new Map<string, RunCheckpoint>();

    async save(checkpoint: RunCheckpoint): Promise<void> {
        this.checkpoints.set(checkpoint.runId, { ...checkpoint });
    }

    async load(runId: string): Promise<RunCheckpoint | undefined> {
        const cp = this.checkpoints.get(runId);
        return cp ? { ...cp } : undefined;
    }

    async delete(runId: string): Promise<void> {
        this.checkpoints.delete(runId);
    }
}
