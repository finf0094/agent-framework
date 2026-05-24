export class AgentError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'AgentError'
  }
}

export class NoSuchToolError extends AgentError {
  constructor(toolName: string) {
    super(`Tool "${toolName}" not found`, 'NO_SUCH_TOOL')
  }
}

export class InvalidToolArgumentsError extends AgentError {
  constructor(toolName: string, public readonly zodError: unknown) {
    super(`Invalid arguments for tool "${toolName}"`, 'INVALID_ARGS')
  }
}

export class MaxStepsExceededError extends AgentError {
  constructor(maxSteps: number) {
    super(`Agent exceeded maximum steps (${maxSteps})`, 'MAX_STEPS_EXCEEDED')
  }
}

export class EngineError extends AgentError {
  constructor(message: string, public readonly statusCode?: number) {
    super(message, 'ENGINE_ERROR')
  }
}

export class CheckpointNotFoundError extends AgentError {
  constructor(runId: string) {
    super(`Run "${runId}" not found`, 'RUN_NOT_FOUND')
  }
}

export class InvalidRunStatusError extends AgentError {
  constructor(runId: string, status: string) {
    super(`Run "${runId}" cannot be resumed (status: ${status})`, 'INVALID_RUN_STATUS')
  }
}

export class NoCheckpointStoreError extends AgentError {
  constructor() {
    super('CheckpointStore is required for pause/resume', 'NO_CHECKPOINT_STORE')
  }
}

export class InvalidApprovalIdError extends AgentError {
  constructor(runId: string) {
    super(`Invalid approvalId for run "${runId}"`, 'INVALID_APPROVAL_ID')
  }
}
