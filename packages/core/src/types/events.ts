import type { AgentOutput } from './run.js';

export type RunEvent =
    | { type: 'run.started'; runId: string }
    | { type: 'run.resumed'; runId: string; fromStep: number }
    | { type: 'run.completed'; runId: string; output: AgentOutput }
    | { type: 'run.failed'; runId: string; error: string }
    | { type: 'run.cancelled'; runId: string; reason?: string };

export type StepEvent =
    | { type: 'step.started'; runId: string; stepNumber: number }
    | { type: 'step.finished'; runId: string; stepNumber: number; duration: number };

export type ContentEvent =
    | { type: 'reasoning.delta'; runId: string; text: string }
    | { type: 'reasoning.completed'; runId: string; text: string }
    | { type: 'text.delta'; runId: string; text: string }
    | { type: 'text.completed'; runId: string; text: string };

export type ToolEvent =
    | { type: 'tool.started'; runId: string; toolCallId: string; toolName: string; input: unknown }
    | { type: 'tool.finished'; runId: string; toolCallId: string; result: unknown }
    | { type: 'tool.failed'; runId: string; toolCallId: string; error: string };

export type ApprovalEvent =
    | {
          type: 'approval.requested';
          runId: string;
          approvalId: string;
          toolCallId: string;
          toolName: string;
          input: unknown;
          message?: string;
      }
    | { type: 'approval.granted'; runId: string; approvalId: string }
    | { type: 'approval.denied'; runId: string; approvalId: string; reason?: string };

export type AgentEvent = RunEvent | StepEvent | ContentEvent | ToolEvent | ApprovalEvent;
