import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import { Agent } from '@agent/core';
import type { AgentConfig, IAgent, PauseReason, ResumeInput, RunOptions, RunResult } from '@agent/core';
import type { CliContext } from './context.js';

export interface ApprovalRequest {
    runId: string;
    pauseReason: PauseReason;
}

export interface ApprovalResponse {
    decision: ResumeInput['decision'];
    reason?: string;
}

export interface ApprovalAdapter {
    requestApproval(request: ApprovalRequest): Promise<ApprovalResponse>;
}

export interface RunWithApprovalOptions extends RunOptions<CliContext> {
    approval?: ApprovalAdapter;
}

export function createCliAgent(config: AgentConfig<CliContext>): IAgent<CliContext> {
    return new Agent(config);
}

export async function runWithApproval(agent: IAgent<CliContext>, prompt: string, options: RunWithApprovalOptions): Promise<RunResult> {
    const { approval = new ReadlineApprovalAdapter(), ...runOptions } = options;
    let result = await agent.run(prompt, runOptions);

    while (result.status === 'paused' && result.pauseReason) {
        const approvalResponse = await approval.requestApproval({
            runId: result.runId,
            pauseReason: result.pauseReason
        });

        result = await agent.resume(
            result.runId,
            {
                approvalId: result.pauseReason.approvalId,
                decision: approvalResponse.decision,
                reason: approvalResponse.reason
            },
            runOptions
        );
    }

    return result;
}

export class ReadlineApprovalAdapter implements ApprovalAdapter {
    async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
        const reason = request.pauseReason;
        const rl = readline.createInterface({ input, output });

        try {
            output.write(`\n[approval required] ${reason.message ?? `Tool "${reason.toolName}" requires approval`}\n`);
            output.write(`Tool: ${reason.toolName}\n`);
            output.write(`Input: ${JSON.stringify(reason.input, null, 2)}\n`);

            const answer = (await rl.question(`Allow tool "${reason.toolName}"? (y/N): `)).trim().toLowerCase();
            if (answer === 'y' || answer === 'yes') {
                return { decision: 'allow' };
            }
            return { decision: 'deny', reason: 'Declined by user' };
        } finally {
            rl.close();
        }
    }
}
