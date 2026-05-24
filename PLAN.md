# Agent Framework — Nx Monorepo, Publishable Libraries

Реализуй проект последовательно по фазам. После каждой фазы запускай `npm exec nx run-many -t build` и `npm exec nx run-many -t test` для проверки.

## Оглавление

- [0. Философия и архитектура](#0-философия-и-архитектура)
- [1. Структура репозитория](#1-структура-репозитория)
- [2. Phase 0: Nx workspace](#2-phase-0-nx-workspace)
- [3. Phase 1: @agent/core — типы и контракты](#3-phase-1-agentcore--типы-и-контракты)
- [4. Phase 2: @agent/core — Agent и buildTool](#4-phase-2-agentcore--agent-и-buildtool)
- [5. Phase 3: @agent/openai](#5-phase-3-agentopenai)
- [5.5. Phase 3.5: Core streaming mode](#55-phase-35-core-streaming-mode)
- [6. Phase 4: @agent/cli](#6-phase-4-agentcli)
- [7. Phase 5: apps/cli-app — CLI приложение (React + Ink)](#7-phase-5-appscli-app--cli-приложение-react--ink)
- [8. Phase 6: @agent/browser](#8-phase-6-agentbrowser)
- [9. Phase 7: @agent/rest](#9-phase-7-agentrest)
- [10. Phase 8: Примеры (apps)](#10-phase-8-примеры-apps)
- [11. Phase 9: Тестирование](#11-phase-9-тестирование)
- [12. Phase 10: Release и публикация](#12-phase-10-release-и-публикация)
- [13. Phase 11: Документация](#13-phase-11-документация)
- [14. Чеклист готовности](#14-чеклист-готовности)

---

## 0. Философия и архитектура

### Ключевые принципы

- **Изоморфность** — один агент работает в браузере, CLI и REST
- **Human-in-the-loop через паузу** — `needsApproval` + `onApprovalRequired` останавливают цикл агента (не callback!)
- **Типизированный контекст** — `ctx.shell` доступен только в CLI, `ctx.dom` только в browser
- **Гексагональная архитектура** — Ports & Adapters: интерфейсы в core, реализации в пакетах
- **Publishable by default** — каждая библиотека публикуется на npm как отдельный пакет

### Nx vs Turbo: ключевые отличия

| Аспект | Turbo | Nx |
|---|---|---|
| Конфигурация задач | `turbo.json` | `nx.json` + `project.json` |
| Граф зависимостей | Package-level | Project-level (умнее) |
| Кодогенерация | Нет | `nx generate` |
| Publishable libs | Вручную | `--publishable` флаг |
| Release | Вручную / changeset | `nx release` (встроено) |
| Кэш | Remote (платный) | Nx Cloud (бесплатный tier) |
| Path aliases | Ручные | Авто в `tsconfig.base.json` |

### Архитектурная диаграмма

```
┌─────────────────────────────────────────────────────────────┐
│                    ENVIRONMENT LAYER                         │
│  @agent/cli        @agent/browser      @agent/rest          │
│  (CliContext,      (BrowserContext,    (RestContext,         │
│   FsMemory,         IndexedDB,          Redis,              │
│   readline)         modal)              webhooks)            │
└─────────────────────────────────────────────────────────────┘
                          ↓ используют
┌─────────────────────────────────────────────────────────────┐
│                      CORE LAYER                             │
│                    @agent/core                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Agent   │  │ IEngine  │  │ buildTool│  │ IMemory  │   │
│  │ (ReAct   │  │(контракт)│  │+approval │  │  Store   │   │
│  │  loop)   │  │          │  │          │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↑ реализуют
┌─────────────────────────────────────────────────────────────┐
│                    PROVIDER LAYER                           │
│  @agent/openai    (SDK: openai)                             │
│  @agent/anthropic (SDK: @anthropic-ai/sdk)                  │
│  @agent/google    (SDK: @google/generative-ai)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Структура репозитория

```
agent-framework/
├── packages/
│   ├── core/                  # @agent/core
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── context.ts
│   │   │   │   ├── message.ts
│   │   │   │   ├── tool.ts
│   │   │   │   ├── engine.ts
│   │   │   │   ├── memory.ts
│   │   │   │   ├── run.ts        ← RunStatus, PauseReason, RunResult, RunOptions
│   │   │   │   ├── checkpoint.ts ← ICheckpointStore, RunCheckpoint
│   │   │   │   ├── events.ts
│   │   │   │   ├── agent.ts
│   │   │   │   └── provider.ts
│   │   │   ├── agent/
│   │   │   │   └── agent.ts
│   │   │   ├── tool/
│   │   │   │   └── build-tool.ts
│   │   │   ├── memory/
│   │   │   │   ├── in-memory.ts
│   │   │   │   └── in-memory-checkpoint.ts
│   │   │   ├── utils/
│   │   │   │   └── errors.ts
│   │   │   └── index.ts
│   │   ├── project.json       ← Nx project config
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.lib.json
│   │   └── tsconfig.spec.json
│   │
│   ├── providers/             ← все LLM провайдеры в одной папке
│   │   ├── openai/            # @agent/openai
│   │   │   ├── src/
│   │   │   │   ├── engine.ts
│   │   │   │   ├── provider.ts
│   │   │   │   └── index.ts
│   │   │   ├── project.json
│   │   │   ├── package.json
│   │   │   ├── tsconfig.json
│   │   │   └── tsconfig.lib.json
│   │   │
│   │   ├── anthropic/         # @agent/anthropic (аналогично openai)
│   │   └── google/            # @agent/google    (аналогично openai)
│   │
│   ├── cli/                   # @agent/cli
│   │   ├── src/
│   │   │   ├── context.ts
│   │   │   ├── agent.ts
│   │   │   ├── memory/
│   │   │   │   └── fs-memory.ts
│   │   │   └── index.ts
│   │   ├── project.json
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsconfig.lib.json
│   │
│   ├── browser/               # @agent/browser
│   │   └── ...
│   │
│   └── rest/                  # @agent/rest
│       └── ...
│
├── apps/
│   └── examples/
│       ├── cli-devops/
│       │   ├── src/main.ts
│       │   └── project.json
│       ├── browser-form-filler/
│       └── rest-api-agent/
│
├── nx.json                    ← Nx orchestration + release config
├── package.json               ← root devDependencies + npm workspaces
└── tsconfig.base.json         ← path aliases для всех пакетов
```

---

## 2. Phase 0: Nx workspace

### 2.1. Инициализация

```bash
# Создать workspace с нуля
npx create-nx-workspace@latest agent-framework \
  --preset=ts \
  --packageManager=npm \
  --nxCloud=skip

cd agent-framework

# Добавить плагин для JS/TS библиотек (версию брать из текущего nx)
npm install -D @nx/js@$(node -e "process.stdout.write(require('./node_modules/nx/package.json').version)")

# Добавить esbuild плагин (нужен для apps/cli-app в Phase 5) — та же версия что nx
npm install -D @nx/esbuild@$(node -e "process.stdout.write(require('./node_modules/nx/package.json').version)")

# Добавить поддержку vitest — та же версия что nx
npm install -D @nx/vite@$(node -e "process.stdout.write(require('./node_modules/nx/package.json').version)") vitest @vitest/coverage-v8
```

### 2.2. `package.json` (корневой)

```json
{
  "name": "agent-framework",
  "version": "0.0.0",
  "private": true,
  "workspaces": [
    "packages/*",
    "packages/providers/*",
    "apps/*",
    "apps/examples/*"
  ],
  "scripts": {
    "build": "nx run-many -t build",
    "test": "nx run-many -t test",
    "lint": "nx run-many -t lint",
    "typecheck": "nx run-many -t typecheck",
    "release": "nx release",
    "release:publish": "nx release publish"
  },
  "devDependencies": {
    "@nx/js": "22.7.2",
    "@nx/esbuild": "22.7.2",
    "@nx/vite": "22.7.2",
    "@swc-node/register": "1.11.1",
    "@swc/core": "1.15.8",
    "@swc/helpers": "0.5.18",
    "@vitest/coverage-v8": "^2.0.0",
    "@types/node": "^22.0.0",
    "nx": "22.7.2",
    "prettier": "^3.8.1",
    "tslib": "^2.3.0",
    "typescript": "~5.9.2",
    "vitest": "^2.0.0"
  },
  "packageManager": "npm@10.9.0"
}
```

### 2.3. `nx.json`

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "defaultBase": "main",
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "sharedGlobals": ["{workspaceRoot}/tsconfig.base.json"],
    "production": [
      "default",
      "!{projectRoot}/**/*.spec.ts",
      "!{projectRoot}/tsconfig.spec.json"
    ]
  },
  "targetDefaults": {
    "build": {
      "inputs": ["production", "^production"],
      "dependsOn": ["^build"],
      "cache": true
    },
    "test": {
      "inputs": ["default", "^production"],
      "cache": true
    },
    "typecheck": {
      "inputs": ["default", "^production"],
      "cache": true
    },
    "lint": {
      "inputs": ["default"],
      "cache": true
    }
  },
  "release": {
    "projects": ["packages/*", "packages/providers/*", "apps/cli-app"],
    "projectsRelationship": "independent",
    "version": {
      "conventionalCommits": true,
      "generatorOptions": {
        "currentVersionResolver": "git-tag",
        "specifierSource": "conventional-commits"
      }
    },
    "changelog": {
      "projectChangelogs": true,
      "workspaceChangelog": true
    },
    "git": {
      "commit": true,
      "tag": true,
      "commitMessage": "chore(release): publish {projectName}@{version}"
    }
  },
  "plugins": [
    {
      "plugin": "@nx/js/typescript",
      "options": {
        "typecheck": { "targetName": "typecheck" },
        "build": {
          "targetName": "build",
          "configName": "tsconfig.lib.json"
        }
      }
    }
  ]
}
```

### 2.5. `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "rootDir": ".",
    "sourceMap": true,
    "declaration": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "paths": {
      "@agent/core": ["packages/core/src/index.ts"],
      "@agent/openai": ["packages/providers/openai/src/index.ts"],
      "@agent/anthropic": ["packages/providers/anthropic/src/index.ts"],
      "@agent/google": ["packages/providers/google/src/index.ts"],
      "@agent/cli": ["packages/cli/src/index.ts"],
      "@agent/browser": ["packages/browser/src/index.ts"],
      "@agent/rest": ["packages/rest/src/index.ts"]
    }
  },
  "exclude": ["node_modules", "dist", "tmp"]
}
```

> **Важно:** `paths` в `tsconfig.base.json` позволяет использовать `@agent/core` в исходниках напрямую без сборки — Nx разрешает их через TypeScript.

---

## 3. Phase 1: @agent/core — типы и контракты

**Цель:** Определить все интерфейсы, которые будут использовать остальные пакеты.

### 3.1. Генерация библиотеки

```bash
nx g @nx/js:library core \
  --directory=packages/core \
  --publishable \
  --importPath=@agent/core \
  --bundler=tsc \
  --unitTestRunner=vitest \
  --projectNameAndRootFormat=as-provided
```

### 3.2. `packages/core/package.json`

```json
{
  "name": "@agent/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.js",
  "types": "./index.d.ts",
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    }
  },
  "publishConfig": {
    "access": "public"
  },
  "dependencies": {
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.23.0"
  },
  "sideEffects": false
}
```

> **Обрати внимание:** пути `"./index.js"` — относительно `dist/packages/core/`, куда Nx помещает собранный код. Не `"./dist/index.js"`.

### 3.3. `packages/core/project.json`

```json
{
  "name": "@agent/core",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/core/src",
  "projectType": "library",
  "tags": ["scope:core", "type:lib"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/core",
        "tsConfig": "packages/core/tsconfig.lib.json",
        "packageJson": "packages/core/package.json",
        "main": "packages/core/src/index.ts",
        "assets": [
          "packages/core/*.md",
          "packages/core/LICENSE"
        ],
        "updateBuildableProjectDepsInPackageJson": true,
        "buildableProjectDepsInPackageJsonType": "dependencies"
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/packages/core"],
      "options": {
        "configFile": "packages/core/vite.config.ts",
        "reportsDirectory": "../../coverage/packages/core"
      }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p packages/core/tsconfig.json"
      }
    }
  }
}
```

### 3.4. `packages/core/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [
    { "path": "./tsconfig.lib.json" },
    { "path": "./tsconfig.spec.json" }
  ],
  "compilerOptions": {
    "strict": true
  }
}
```

### 3.5. `packages/core/tsconfig.lib.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/packages/core",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "inlineSources": true,
    "types": []
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.test.ts", "vite.config.ts"]
}
```

### 3.6. `packages/core/tsconfig.spec.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "types": ["vitest/globals", "node"]
  },
  "include": [
    "vite.config.ts",
    "src/**/*.spec.ts",
    "src/**/*.test.ts",
    "test/**/*.spec.ts",
    "test/**/*.test.ts"
  ]
}
```

### 3.7. `packages/core/vite.config.ts`

```typescript
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{spec,test}.ts', 'test/**/*.{spec,test}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
})
```

### 3.8. Исходные файлы типов

**`packages/core/src/types/context.ts`**

```typescript
export type AgentContext = Record<string, unknown>
```

**`packages/core/src/types/message.ts`**

```typescript
export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface TextPart {
  type: 'text'
  text: string
}

export interface ImagePart {
  type: 'image'
  image: string | URL
  mimeType?: string
}

export interface ToolCallPart {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: unknown
}

export interface ToolResultPart {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  result: unknown
  isError?: boolean
}

export type MessagePart = TextPart | ImagePart | ToolCallPart | ToolResultPart

export interface Message {
  role: Role
  content: string | MessagePart[]
  toolCallId?: string
}
```

**`packages/core/src/types/tool.ts`**

```typescript
import type { z } from 'zod'
import type { AgentContext } from './context'

export type ApprovalDecision =
  | { behavior: 'allow' }
  | { behavior: 'deny'; reason?: string }
  | { behavior: 'pause'; message?: string }

export interface ITool<
  TInput = any,
  TOutput = any,
  Ctx extends AgentContext = AgentContext
> {
  readonly name: string
  readonly description: string
  readonly inputSchema: z.ZodSchema<TInput>
  readonly outputSchema?: z.ZodSchema<TOutput>

  needsApproval?(args: { input: TInput; context: Ctx }):
    ApprovalDecision | Promise<ApprovalDecision>

  execute(input: TInput, context: Ctx): Promise<TOutput>
  toSchema(): ToolSchema
}

export interface ToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, any>
  }
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, any>
}
```

**`packages/core/src/types/engine.ts`**

```typescript
import type { Message } from './message'
import type { ToolSchema, ToolCall } from './tool'

export interface EngineConfig {
  model: string
  temperature?: number
  maxTokens?: number
  topP?: number
}

export interface EngineCallOptions {
  messages: Message[]
  tools?: ToolSchema[]
  system?: string
  abortSignal?: AbortSignal
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface EngineResponse {
  text?: string
  reasoning?: string  // provider-exposed reasoning summary/trace, when available
  toolCalls?: ToolCall[]
  finishReason: 'stop' | 'tool-calls' | 'length' | 'error'
  usage: TokenUsage
  raw: unknown
}

export interface EngineStreamChunk {
  type: 'reasoning-delta' | 'text-delta' | 'tool-call-delta' | 'tool-call' | 'finish'
  reasoningDelta?: string
  textDelta?: string
  toolCall?: Partial<ToolCall>
  usage?: TokenUsage
}

export interface IEngine {
  readonly provider: string
  readonly modelId: string

  call(options: EngineCallOptions): Promise<EngineResponse>
  stream(options: EngineCallOptions): AsyncGenerator<EngineStreamChunk>
}
```

**`packages/core/src/types/memory.ts`**

```typescript
import type { Message } from './message'

export interface IMemoryStore {
  append(threadId: string, messages: Message[]): Promise<void>
  list(threadId: string, options?: { limit?: number }): Promise<Message[]>
  clear(threadId: string): Promise<void>
}
```

**`packages/core/src/types/run.ts`** ← новый файл

```typescript
import type { TokenUsage } from './engine'
import type { Message } from './message'
import type { AgentEvent } from './events'

export type RunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface PauseReason {
  type: 'approval_required'
  approvalId: string
  toolCallId: string
  toolName: string
  input: unknown
  message?: string
}

export interface AgentOutput {
  text: string
  usage: TokenUsage
  steps: AgentStep[]
  duration: number
}

export interface RunResult {
  runId: string
  threadId: string
  status: RunStatus
  output?: AgentOutput
  pauseReason?: PauseReason
  error?: string  // present when status === 'failed' | 'cancelled'
  messages: Message[]
}

export interface AgentStep {
  stepNumber: number
  duration: number
  toolCalls: Array<{
    id: string
    name: string
    input: unknown
    output: unknown
    approved: boolean
  }>
}

export interface RunOptions<Ctx> {
  context: Ctx
  runId?: string
  threadId?: string
  maxSteps?: number
  abortSignal?: AbortSignal
  onEvent?: (event: AgentEvent) => void
}

export interface ResumeInput {
  approvalId: string
  decision: 'allow' | 'deny'
  reason?: string
}

export interface ResumeOptions<Ctx> {
  context: Ctx
  maxSteps?: number
  abortSignal?: AbortSignal
  onEvent?: (event: AgentEvent) => void
}
```

**`packages/core/src/types/checkpoint.ts`** ← новый файл

```typescript
import type { RunStatus, PauseReason, AgentStep } from './run'
import type { TokenUsage } from './engine'
import type { Message } from './message'

export interface RunCheckpoint {
  runId: string
  threadId: string
  status: RunStatus
  currentStep: number
  pendingApproval?: PauseReason
  deferredToolMessages?: Message[]  // skipped tool-result messages kept in order for resume
  usage: TokenUsage
  steps: AgentStep[]
  startedAt: number
}

export interface ICheckpointStore {
  save(checkpoint: RunCheckpoint): Promise<void>
  load(runId: string): Promise<RunCheckpoint | undefined>
  delete(runId: string): Promise<void>
}
```

**`packages/core/src/types/events.ts`**

```typescript
import type { PauseReason, AgentOutput } from './run'

// ── Run lifecycle ─────────────────────────────────────────────────────────────
// run.paused is not here — approval.requested (ApprovalEvent) signals the pause.
export type RunEvent =
  | { type: 'run.started';   runId: string }
  | { type: 'run.resumed';   runId: string; fromStep: number }
  | { type: 'run.completed'; runId: string; output: AgentOutput }
  | { type: 'run.failed';    runId: string; error: string }
  | { type: 'run.cancelled'; runId: string; reason?: string }  // emitted when abortSignal fires

// ── Step lifecycle ────────────────────────────────────────────────────────────
export type StepEvent =
  | { type: 'step.started';  runId: string; stepNumber: number }
  | { type: 'step.finished'; runId: string; stepNumber: number; duration: number }

// ── LLM content ──────────────────────────────────────────────────────────────
// *.delta     — one streaming chunk
// *.completed — full block (non-streaming, or final value after all deltas)
export type ContentEvent =
  | { type: 'reasoning.delta';     runId: string; text: string }
  | { type: 'reasoning.completed'; runId: string; text: string }
  | { type: 'text.delta';          runId: string; text: string }
  | { type: 'text.completed';      runId: string; text: string }

// ── Tool calls ────────────────────────────────────────────────────────────────
export type ToolEvent =
  | { type: 'tool.started';  runId: string; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool.finished'; runId: string; toolCallId: string; result: unknown }
  | { type: 'tool.failed';   runId: string; toolCallId: string; error: string }

// ── Human-in-the-loop approval ────────────────────────────────────────────────
// approval.requested replaces run.paused — it signals both the pause and the approval detail.
// approval.granted / approval.denied are emitted at the start of resume(), before tool execution.
export type ApprovalEvent =
  | { type: 'approval.requested'; runId: string; approvalId: string; toolCallId: string; toolName: string; input: unknown; message?: string }
  | { type: 'approval.granted';   runId: string; approvalId: string }
  | { type: 'approval.denied';    runId: string; approvalId: string; reason?: string }

// ── Composed union ────────────────────────────────────────────────────────────
export type AgentEvent = RunEvent | StepEvent | ContentEvent | ToolEvent | ApprovalEvent
```

> Все события — чистые сериализуемые данные (без функций). Grouped types позволяют narrowing по группе: `event is ContentEvent`, `event is ToolEvent`, и т.д. Используются одинаково в SSE, WebSocket и in-process callbacks.

**Паттерн narrowing по группе:**

```typescript
import type { RunEvent, StepEvent, ContentEvent, ToolEvent, ApprovalEvent, AgentEvent } from '@agent/core'

function isRunEvent(e: AgentEvent): e is RunEvent         { return e.type.startsWith('run.') }
function isStepEvent(e: AgentEvent): e is StepEvent       { return e.type.startsWith('step.') }
function isContentEvent(e: AgentEvent): e is ContentEvent { return e.type.startsWith('reasoning.') || e.type.startsWith('text.') }
function isToolEvent(e: AgentEvent): e is ToolEvent       { return e.type.startsWith('tool.') }
function isApprovalEvent(e: AgentEvent): e is ApprovalEvent { return e.type.startsWith('approval.') }
```

**Жизненный цикл run с approvals:**

```
run.started
  step.started
    reasoning.completed?
    [tools that don't need approval:]
    tool.started → tool.finished | tool.failed
    [tool that needs approval — tool.started NOT emitted yet:]
    approval.requested             ← run pauses here
run.resumed
  approval.granted | approval.denied
  tool.started → tool.finished | tool.failed   ← emitted now, after decision
  step.started
    ...
  step.finished
  text.completed
  step.finished
run.completed | run.failed | run.cancelled
```

**`packages/core/src/types/agent.ts`**

```typescript
import type { AgentContext } from './context'
import type { IEngine } from './engine'
import type { ITool } from './tool'
import type { IMemoryStore } from './memory'
import type { ICheckpointStore } from './checkpoint'
import type { AgentEvent } from './events'
import type { RunOptions, ResumeOptions, ResumeInput, RunResult } from './run'

export interface AgentHooks {
  onStepStart?: (stepNumber: number) => void | Promise<void>
  onStepFinish?: (stepNumber: number, duration: number) => void | Promise<void>
}

export interface AgentConfig<Ctx extends AgentContext = AgentContext> {
  name: string
  engine: IEngine
  system?: string
  tools: ITool<any, any, Ctx>[]
  memory: IMemoryStore
  checkpoints?: ICheckpointStore
  hooks?: AgentHooks
}

export interface IAgent<Ctx extends AgentContext = AgentContext> {
  readonly name: string
  readonly tools: ITool[]

  run(prompt: string, options: RunOptions<Ctx>): Promise<RunResult>
  resume(runId: string, input: ResumeInput, options: ResumeOptions<Ctx>): Promise<RunResult>
  execute(prompt: string, options: RunOptions<Ctx>): AsyncGenerator<AgentEvent, RunResult>
}
```

**`packages/core/src/types/provider.ts`**

```typescript
import type { IEngine, EngineConfig } from './engine'

export interface ProviderConfig {
  apiKey?: string
  baseURL?: string
  headers?: Record<string, string>
  fetch?: typeof fetch
}

export interface IProvider {
  readonly id: string

  engine(modelId: string, config?: Partial<EngineConfig>): IEngine

  ping?(): Promise<boolean>
  listModels?(): Promise<ModelInfo[]>
}

export interface ModelInfo {
  id: string
  name: string
  contextWindow: number
  supportsTools: boolean
  supportsVision: boolean
  supportsStreaming: boolean
}
```

**`packages/core/src/utils/errors.ts`**

```typescript
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
```

**`packages/core/src/index.ts`** (Phase 1 — только типы и ошибки)

```typescript
export * from './types/context'
export * from './types/message'
export * from './types/tool'
export * from './types/engine'
export * from './types/memory'
export * from './types/run'
export * from './types/checkpoint'
export * from './types/events'
export * from './types/agent'
export * from './types/provider'

export * from './utils/errors'
```

**Критерий готовности:** `nx build @agent/core` создаёт `dist/packages/core/` со всеми `.js` и `.d.ts`.

---

## 4. Phase 2: @agent/core — Agent и buildTool

**Цель:** Реализовать ReAct loop и билдер инструментов.

### 4.1. `packages/core/src/tool/build-tool.ts`

```typescript
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ITool, ApprovalDecision, ToolSchema } from '../types/tool'
import type { AgentContext } from '../types/context'

export interface ToolDefinition<TInput, TOutput, Ctx extends AgentContext> {
  name: string
  description: string
  inputSchema: z.ZodSchema<TInput>
  outputSchema?: z.ZodSchema<TOutput>

  needsApproval?: (args: {
    input: TInput
    context: Ctx
  }) => ApprovalDecision | Promise<ApprovalDecision>

  execute(input: TInput, context: Ctx): Promise<TOutput>
}

export function buildTool<
  TInput,
  TOutput,
  Ctx extends AgentContext = AgentContext,
>(definition: ToolDefinition<TInput, TOutput, Ctx>): ITool<TInput, TOutput, Ctx> {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    needsApproval: definition.needsApproval,

    async execute(input, context) {
      const validated = definition.inputSchema.parse(input)
      const result = await definition.execute(validated, context)
      if (definition.outputSchema) {
        return definition.outputSchema.parse(result)
      }
      return result
    },

    toSchema(): ToolSchema {
      const jsonSchema = zodToJsonSchema(definition.inputSchema, {
        target: 'jsonSchema7',
      })
      const { $schema, ...params } = jsonSchema as any
      return {
        type: 'function',
        function: {
          name: definition.name,
          description: definition.description,
          parameters: { ...params, additionalProperties: false },
        },
      }
    },
  }
}
```

### 4.2. `packages/core/src/agent/agent.ts`

```typescript
import type { IAgent, AgentConfig } from '../types/agent'
import type { AgentContext } from '../types/context'
import type { Message, ToolCallPart, ToolResultPart } from '../types/message'
import type { AgentEvent } from '../types/events'
import type { TokenUsage, EngineResponse, EngineCallOptions } from '../types/engine'
import type { ToolCall } from '../types/tool'
import type { RunCheckpoint } from '../types/checkpoint'
import type {
  RunOptions, ResumeOptions, ResumeInput, RunResult, AgentStep, AgentOutput, PauseReason,
} from '../types/run'
import {
  NoSuchToolError, InvalidToolArgumentsError, MaxStepsExceededError,
  CheckpointNotFoundError, InvalidRunStatusError, NoCheckpointStoreError,
  InvalidApprovalIdError,
} from '../utils/errors'

interface LoopState {
  step: number
  startTime: number
  usage: TokenUsage
  steps: AgentStep[]
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  }
}

function makeErrorMessage(toolCallId: string, toolName: string, error: string): Message {
  return {
    role: 'tool',
    toolCallId,
    content: [{ type: 'tool-result', toolCallId, toolName, result: `Error: ${error}`, isError: true } satisfies ToolResultPart],
  }
}

export class Agent<Ctx extends AgentContext = AgentContext> implements IAgent<Ctx> {
  readonly name: string
  readonly tools: AgentConfig<Ctx>['tools']
  private config: AgentConfig<Ctx>

  constructor(config: AgentConfig<Ctx>) {
    this.config = config
    this.name = config.name
    this.tools = config.tools
  }

  async run(prompt: string, options: RunOptions<Ctx>): Promise<RunResult> {
    const gen = this.execute(prompt, options)
    let next = await gen.next()
    while (!next.done) {
      options.onEvent?.(next.value)
      next = await gen.next()
    }
    return next.value
  }

  async resume(runId: string, input: ResumeInput, options: ResumeOptions<Ctx>): Promise<RunResult> {
    if (!this.config.checkpoints) throw new NoCheckpointStoreError()
    const checkpoint = await this.config.checkpoints.load(runId)
    if (!checkpoint) throw new CheckpointNotFoundError(runId)
    if (checkpoint.status !== 'paused') throw new InvalidRunStatusError(runId, checkpoint.status)

    const gen = this._resumeFromCheckpoint(checkpoint, input, options)
    let next = await gen.next()
    while (!next.done) {
      options.onEvent?.(next.value)
      next = await gen.next()
    }
    return next.value
  }

  async *execute(prompt: string, options: RunOptions<Ctx>): AsyncGenerator<AgentEvent, RunResult> {
    const runId = options.runId ?? crypto.randomUUID()
    const threadId = options.threadId ?? runId
    // Errors here (memory I/O before run.started) propagate as rejections — the run
    // never started, so there is no event stream to emit run.failed into.
    await this.config.memory.append(threadId, [{ role: 'user', content: prompt }])
    // run.started emitted here, before _loop, so the event is always first
    yield { type: 'run.started', runId }
    return yield* this._loop(runId, threadId, options, {
      step: 0, startTime: Date.now(),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      steps: [],
    }, options.stream)
  }

  private async *_resumeFromCheckpoint(
    checkpoint: RunCheckpoint,
    input: ResumeInput,
    options: ResumeOptions<Ctx>,
  ): AsyncGenerator<AgentEvent, RunResult> {
    const { runId, threadId, pendingApproval } = checkpoint

    // Validate before emitting any events — consumer must not receive run.resumed
    // followed immediately by an error
    if (!pendingApproval) throw new InvalidRunStatusError(runId, checkpoint.status)
    if (input.approvalId !== pendingApproval.approvalId) throw new InvalidApprovalIdError(runId)

    // run.resumed only after successful validation — always the first event on resume
    yield { type: 'run.resumed', runId, fromStep: checkpoint.currentStep }

    // Emit the approval decision before any tool execution
    if (input.decision === 'allow') {
      yield { type: 'approval.granted', runId, approvalId: pendingApproval.approvalId }
    } else {
      yield { type: 'approval.denied', runId, approvalId: pendingApproval.approvalId, reason: input.reason }
    }

    // deferred = skipped tool-result messages saved in checkpoint to preserve order
    const deferred = checkpoint.deferredToolMessages ?? []

    if (input.decision === 'deny') {
      await this.config.memory.append(threadId, [
        makeErrorMessage(pendingApproval.toolCallId, pendingApproval.toolName, input.reason ?? 'Denied by user'),
        ...deferred,
      ])
    } else {
      const tool = this.config.tools.find(t => t.name === pendingApproval.toolName)
      if (!tool) {
        await this.config.memory.append(threadId, [
          makeErrorMessage(pendingApproval.toolCallId, pendingApproval.toolName, 'Tool no longer available'),
          ...deferred,
        ])
      } else {
        yield { type: 'tool.started', runId, toolCallId: pendingApproval.toolCallId, toolName: pendingApproval.toolName, input: pendingApproval.input }
        try {
          const result = await tool.execute(pendingApproval.input, options.context)
          // Append c2 result then deferred messages — preserves [c1, c2, c3] memory order
          await this.config.memory.append(threadId, [
            {
              role: 'tool', toolCallId: pendingApproval.toolCallId,
              content: [{ type: 'tool-result', toolCallId: pendingApproval.toolCallId, toolName: pendingApproval.toolName, result } satisfies ToolResultPart],
            },
            ...deferred,
          ])
          yield { type: 'tool.finished', runId, toolCallId: pendingApproval.toolCallId, result }
        } catch (err) {
          const msg = (err as Error).message
          yield { type: 'tool.failed', runId, toolCallId: pendingApproval.toolCallId, error: msg }
          await this.config.memory.append(threadId, [makeErrorMessage(pendingApproval.toolCallId, pendingApproval.toolName, msg), ...deferred])
        }
      }
    }

    await this.config.checkpoints!.delete(runId)
    return yield* this._loop(runId, threadId, options, {
      step: checkpoint.currentStep,
      startTime: checkpoint.startedAt,
      usage: checkpoint.usage,
      steps: checkpoint.steps,
    }, options.stream)
  }

  // Routes to engine.call() or engine.stream() based on stream flag.
  // In streaming mode: emits reasoning.delta, text.delta, text.completed events inline.
  // In non-streaming mode: returns a plain EngineResponse; caller emits events itself.
  private async *_runEngineStep(
    runId: string,
    engineCallOptions: EngineCallOptions,
    stream: boolean | undefined,
  ): AsyncGenerator<AgentEvent, EngineResponse> {
    if (!stream) {
      return await this.config.engine.call(engineCallOptions)
    }

    let textAccum = ''
    let reasoningAccum = ''
    const toolCalls: ToolCall[] = []
    let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    for await (const chunk of this.config.engine.stream(engineCallOptions)) {
      if (chunk.type === 'reasoning-delta' && chunk.reasoningDelta) {
        reasoningAccum += chunk.reasoningDelta
        yield { type: 'reasoning.delta', runId, text: chunk.reasoningDelta }
      }
      if (chunk.type === 'text-delta' && chunk.textDelta) {
        textAccum += chunk.textDelta
        yield { type: 'text.delta', runId, text: chunk.textDelta }
      }
      if (chunk.type === 'tool-call' && chunk.toolCall?.id && chunk.toolCall?.name) {
        toolCalls.push({ id: chunk.toolCall.id, name: chunk.toolCall.name, arguments: chunk.toolCall.arguments ?? {} })
      }
      if (chunk.type === 'finish' && chunk.usage) {
        usage = chunk.usage
      }
    }

    if (reasoningAccum) yield { type: 'reasoning.completed', runId, text: reasoningAccum }
    if (textAccum)     yield { type: 'text.completed',      runId, text: textAccum }

    return {
      text: textAccum || undefined,
      reasoning: reasoningAccum || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: toolCalls.length > 0 ? 'tool-calls' : 'stop',
      usage,
      raw: null,
    }
  }

  private async *_loop(
    runId: string,
    threadId: string,
    options: ResumeOptions<Ctx>,
    state: LoopState,
    stream?: boolean,
  ): AsyncGenerator<AgentEvent, RunResult> {
    const maxSteps = options.maxSteps ?? 10
    let { step, startTime, usage, steps } = state

    // Note: run.started / run.resumed are emitted by the caller (execute / _resumeFromCheckpoint)

    try {
      while (step < maxSteps) {
      if (options.abortSignal?.aborted) {
        yield { type: 'run.cancelled', runId, reason: 'Aborted' }
        return { runId, threadId, status: 'cancelled', error: 'Aborted', messages: await this.config.memory.list(threadId) }
      }

      step++
      const stepStartTime = Date.now()

      yield { type: 'step.started', runId, stepNumber: step }
      await this.config.hooks?.onStepStart?.(step)

      const messages = await this.config.memory.list(threadId)
      let response: EngineResponse
      try {
        response = yield* this._runEngineStep(runId, {
          messages,
          tools: this.config.tools.map(t => t.toSchema()),
          system: this.config.system,
          abortSignal: options.abortSignal,
        }, stream)
      } catch (err) {
        // AbortError mid-call: SDK threw when signal fired
        if (options.abortSignal?.aborted) {
          yield { type: 'run.cancelled', runId, reason: 'Aborted' }
          return { runId, threadId, status: 'cancelled', error: 'Aborted', messages: await this.config.memory.list(threadId) }
        }
        throw err  // unexpected engine error → outer catch → run.failed
      }

      usage = addUsage(usage, response.usage)

      // Non-streaming: emit reasoning.completed here; streaming already emitted deltas in _runEngineStep
      if (!stream && response.reasoning) {
        yield { type: 'reasoning.completed', runId, text: response.reasoning }
      }

      // Text-only response: emit text.completed + step.finished before run.completed
      if (response.finishReason !== 'tool-calls' || !response.toolCalls?.length) {
        await this.config.memory.append(threadId, [{ role: 'assistant', content: response.text ?? '' }])

        // Non-streaming: emit text.completed here; streaming already emitted in _runEngineStep
        if (!stream && response.text) {
          yield { type: 'text.completed', runId, text: response.text }
        }

        const stepDuration = Date.now() - stepStartTime
        steps = [...steps, { stepNumber: step, duration: stepDuration, toolCalls: [] }]
        yield { type: 'step.finished', runId, stepNumber: step, duration: stepDuration }

        const output: AgentOutput = { text: response.text ?? '', usage, steps, duration: Date.now() - startTime }
        yield { type: 'run.completed', runId, output }
        return { runId, threadId, status: 'completed', output, messages: await this.config.memory.list(threadId) }
      }

      // Save assistant message with all tool call parts upfront
      const toolCallParts: ToolCallPart[] = response.toolCalls.map(call => ({
        type: 'tool-call', toolCallId: call.id, toolName: call.name, args: call.arguments,
      }))
      await this.config.memory.append(threadId, [{
        role: 'assistant',
        content: [
          ...(response.text ? [{ type: 'text' as const, text: response.text }] : []),
          ...toolCallParts,
        ],
      }])

      const toolMessages: Message[] = []     // results for calls processed before pause
      const deferredMessages: Message[] = [] // skipped results for calls after pause
      const stepCalls: AgentStep['toolCalls'] = []
      let pauseReason: PauseReason | undefined

      for (const call of response.toolCalls) {
        // After pause, remaining calls are deferred — saved in checkpoint to preserve order on resume
        if (pauseReason) {
          deferredMessages.push(makeErrorMessage(call.id, call.name, 'Skipped: another tool in this batch requires approval'))
          // MVP batch-pause semantics: remaining calls are NOT re-executed after resume.
          // If needed, the LLM will request them again in the next step.
          continue
        }

        const tool = this.config.tools.find(t => t.name === call.name)

        if (!tool) {
          const msg = new NoSuchToolError(call.name).message
          yield { type: 'tool.failed', runId, toolCallId: call.id, error: msg }
          toolMessages.push(makeErrorMessage(call.id, call.name, msg))
          continue
        }

        // Validate input before any approval or execution
        let validatedInput: unknown
        try {
          validatedInput = tool.inputSchema.parse(call.arguments)
        } catch (err) {
          const msg = new InvalidToolArgumentsError(call.name, err).message
          yield { type: 'tool.failed', runId, toolCallId: call.id, error: msg }
          toolMessages.push(makeErrorMessage(call.id, call.name, msg))
          continue
        }

        // Approval policy
        if (tool.needsApproval) {
          const decision = await tool.needsApproval({ input: validatedInput, context: options.context })

          if (decision.behavior === 'deny') {
            toolMessages.push(makeErrorMessage(call.id, call.name, decision.reason ?? 'Denied by policy'))
            stepCalls.push({ id: call.id, name: call.name, input: validatedInput, output: null, approved: false })
            continue
          }

          if (decision.behavior === 'pause') {
            if (!this.config.checkpoints) throw new NoCheckpointStoreError()
            pauseReason = {
              type: 'approval_required',
              approvalId: crypto.randomUUID(),
              toolCallId: call.id,
              toolName: tool.name,
              input: validatedInput,
              message: decision.message,
            }
            continue  // collect deferred messages for remaining calls
          }
        }

        // Abort check before starting the tool — don't emit tool.started if we're cancelling
        if (options.abortSignal?.aborted) {
          yield { type: 'run.cancelled', runId, reason: 'Aborted' }
          return { runId, threadId, status: 'cancelled', error: 'Aborted', messages: await this.config.memory.list(threadId) }
        }
        // tool.started emitted only right before actual tool.execute()
        yield { type: 'tool.started', runId, toolCallId: call.id, toolName: call.name, input: validatedInput }
        try {
          const result = await tool.execute(validatedInput, options.context)
          toolMessages.push({
            role: 'tool', toolCallId: call.id,
            content: [{ type: 'tool-result', toolCallId: call.id, toolName: call.name, result } satisfies ToolResultPart],
          })
          stepCalls.push({ id: call.id, name: call.name, input: validatedInput, output: result, approved: true })
          yield { type: 'tool.finished', runId, toolCallId: call.id, result }
        } catch (err) {
          const msg = (err as Error).message
          yield { type: 'tool.failed', runId, toolCallId: call.id, error: msg }
          toolMessages.push(makeErrorMessage(call.id, call.name, msg))
        }
      }

      // Flush pre-pause tool results to memory; deferred messages go into checkpoint
      if (toolMessages.length > 0) await this.config.memory.append(threadId, toolMessages)

      if (pauseReason) {
        // MVP limitation: the current partial step (with pre-pause tool calls) is not
        // added to `steps` in the checkpoint. output.steps will not include this step
        // after resume. To fix this properly, add pendingStepCalls + pendingStepStartedAt
        // to RunCheckpoint and reconstruct the step in _resumeFromCheckpoint.
        await this.config.checkpoints!.save({
          runId, threadId, status: 'paused',
          currentStep: step, pendingApproval: pauseReason,
          deferredToolMessages: deferredMessages,  // restored in correct order on resume
          usage, steps, startedAt: startTime,
        })
        yield {
          type: 'approval.requested', runId,
          approvalId: pauseReason.approvalId,
          toolCallId: pauseReason.toolCallId,
          toolName: pauseReason.toolName,
          input: pauseReason.input,
          message: pauseReason.message,
        }
        return { runId, threadId, status: 'paused', pauseReason, messages: await this.config.memory.list(threadId) }
      }

      const stepDuration = Date.now() - stepStartTime
      steps = [...steps, { stepNumber: step, duration: stepDuration, toolCalls: stepCalls }]
      yield { type: 'step.finished', runId, stepNumber: step, duration: stepDuration }
      await this.config.hooks?.onStepFinish?.(step, stepDuration)
    }

    const error = new MaxStepsExceededError(maxSteps)
    yield { type: 'run.failed', runId, error: error.message }
    return { runId, threadId, status: 'failed', error: error.message, messages: await this.config.memory.list(threadId) }

    } catch (err) {
      // Re-throw only caller/config errors — incorrect setup or invalid input that the
      // caller is responsible for fixing. Everything else, including EngineError, is a
      // runtime failure and becomes run.failed.
      if (
        err instanceof NoCheckpointStoreError ||
        err instanceof CheckpointNotFoundError ||
        err instanceof InvalidRunStatusError ||
        err instanceof InvalidApprovalIdError
      ) throw err
      const message = (err as Error).message ?? 'Unexpected error'
      yield { type: 'run.failed', runId, error: message }
      return { runId, threadId, status: 'failed', error: message, messages: await this.config.memory.list(threadId) }
    }
  }
}
```

### 4.3. `packages/core/src/memory/in-memory.ts`

```typescript
import type { IMemoryStore } from '../types/memory'
import type { Message } from '../types/message'

export class InMemoryStore implements IMemoryStore {
  private threads = new Map<string, Message[]>()

  async append(threadId: string, messages: Message[]): Promise<void> {
    const existing = this.threads.get(threadId) ?? []
    this.threads.set(threadId, [...existing, ...messages])
  }

  async list(threadId: string, options?: { limit?: number }): Promise<Message[]> {
    const messages = this.threads.get(threadId) ?? []
    return options?.limit ? messages.slice(-options.limit) : [...messages]
  }

  async clear(threadId: string): Promise<void> {
    this.threads.delete(threadId)
  }
}
```

### 4.4. `packages/core/src/memory/in-memory-checkpoint.ts`

```typescript
import type { ICheckpointStore, RunCheckpoint } from '../types/checkpoint'

export class InMemoryCheckpointStore implements ICheckpointStore {
  private checkpoints = new Map<string, RunCheckpoint>()

  async save(checkpoint: RunCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.runId, { ...checkpoint })
  }

  async load(runId: string): Promise<RunCheckpoint | undefined> {
    const cp = this.checkpoints.get(runId)
    return cp ? { ...cp } : undefined
  }

  async delete(runId: string): Promise<void> {
    this.checkpoints.delete(runId)
  }
}
```

### 4.5. `packages/core/src/index.ts` (обновлённый)

```typescript
// Types
export * from './types/context'
export * from './types/message'
export * from './types/tool'
export * from './types/engine'
export * from './types/memory'
export * from './types/run'
export * from './types/checkpoint'
export * from './types/events'
export * from './types/agent'
export * from './types/provider'

// Agent
export { Agent } from './agent/agent'

// Tools
export { buildTool } from './tool/build-tool'
export type { ToolDefinition } from './tool/build-tool'

// Memory & Checkpoints
export { InMemoryStore } from './memory/in-memory'
export { InMemoryCheckpointStore } from './memory/in-memory-checkpoint'

// Errors
export * from './utils/errors'
```

**Критерий готовности:** `nx build @agent/core` завершается без ошибок.

---

## 5. Phase 3: @agent/openai

**Цель:** Тонкий адаптер над официальным `openai` SDK.

### 5.1. Генерация

```bash
nx g @nx/js:library openai \
  --directory=packages/providers/openai \
  --publishable \
  --importPath=@agent/openai \
  --bundler=tsc \
  --unitTestRunner=none \
  --projectNameAndRootFormat=as-provided
```

### 5.2. `packages/providers/openai/package.json`

```json
{
  "name": "@agent/openai",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.js",
  "types": "./index.d.ts",
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    }
  },
  "publishConfig": {
    "access": "public"
  },
  "dependencies": {
    "@agent/core": "workspace:*",
    "openai": "^4.67.0"
  },
  "sideEffects": false
}
```

### 5.3. `packages/providers/openai/project.json`

```json
{
  "name": "@agent/openai",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/providers/openai/src",
  "projectType": "library",
  "tags": ["scope:provider", "type:lib"],
  "implicitDependencies": ["@agent/core"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/providers/openai",
        "tsConfig": "packages/providers/openai/tsconfig.lib.json",
        "packageJson": "packages/providers/openai/package.json",
        "main": "packages/providers/openai/src/index.ts",
        "assets": ["packages/providers/openai/*.md"],
        "updateBuildableProjectDepsInPackageJson": true,
        "buildableProjectDepsInPackageJsonType": "dependencies"
      },
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p packages/providers/openai/tsconfig.json"
      }
    }
  }
}
```

### 5.4. `packages/providers/openai/tsconfig.lib.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../../../dist/packages/providers/openai",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "types": []
  },
  "include": ["src/**/*.ts"]
}
```

### 5.5. `packages/providers/openai/tsconfig.json`

```json
{
  "extends": "../../../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [
    { "path": "./tsconfig.lib.json" }
  ]
}
```

### 5.6. Исходные файлы

**`packages/providers/openai/src/engine.ts`**

```typescript
import OpenAI from 'openai'
import type {
  IEngine, EngineCallOptions, EngineResponse, EngineStreamChunk,
  EngineConfig, Message, MessagePart,
} from '@agent/core'

type OAIMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam

function toOAIContent(content: string | MessagePart[]): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  if (typeof content === 'string') return content
  return content.flatMap(part => {
    if (part.type === 'text') return [{ type: 'text' as const, text: part.text }]
    if (part.type === 'image') {
      const url = typeof part.image === 'string' ? part.image : part.image.toString()
      return [{ type: 'image_url' as const, image_url: { url } }]
    }
    return []
  })
}

function toOAIMessages(messages: Message[], system?: string): OAIMessage[] {
  const result: OAIMessage[] = []
  if (system) result.push({ role: 'system', content: system })

  for (const msg of messages) {
    if (msg.role === 'system') {
      result.push({ role: 'system', content: typeof msg.content === 'string' ? msg.content : '' })
    } else if (msg.role === 'user') {
      result.push({ role: 'user', content: toOAIContent(msg.content) as any })
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'assistant', content: msg.content })
      } else {
        const textParts = msg.content.filter(p => p.type === 'text')
        const toolCallParts = msg.content.filter(p => p.type === 'tool-call')
        result.push({
          role: 'assistant',
          content: textParts.length ? textParts.map(p => p.type === 'text' ? p.text : '').join('') : null,
          tool_calls: toolCallParts.map(p => p.type === 'tool-call' ? ({
            id: p.toolCallId,
            type: 'function' as const,
            function: { name: p.toolName, arguments: JSON.stringify(p.args) },
          }) : null).filter(Boolean) as any,
        })
      }
    } else if (msg.role === 'tool') {
      const parts = Array.isArray(msg.content) ? msg.content : []
      const resultPart = parts.find(p => p.type === 'tool-result')
      result.push({
        role: 'tool',
        tool_call_id: msg.toolCallId ?? (resultPart?.type === 'tool-result' ? resultPart.toolCallId : ''),
        content: resultPart?.type === 'tool-result' ? JSON.stringify(resultPart.result) : '',
      })
    }
  }

  return result
}

function mapFinishReason(reason: string | null): EngineResponse['finishReason'] {
  if (reason === 'tool_calls') return 'tool-calls'
  if (reason === 'length') return 'length'
  if (reason === 'stop') return 'stop'
  return 'error'
}

export class OpenAIEngine implements IEngine {
  readonly provider = 'openai'
  readonly modelId: string

  constructor(
    private client: OpenAI,
    modelId: string,
    private engineConfig: Partial<EngineConfig> = {},
  ) {
    this.modelId = modelId
  }

  async call(options: EngineCallOptions): Promise<EngineResponse> {
    const response = await this.client.chat.completions.create(
      {
        model: this.modelId,
        messages: toOAIMessages(options.messages, options.system),
        tools: options.tools?.map(t => ({ type: 'function' as const, function: t.function })),
        temperature: this.engineConfig.temperature,
        max_tokens: this.engineConfig.maxTokens,
        top_p: this.engineConfig.topP,
      },
      // signal goes in the RequestOptions second arg, not the body
      { signal: options.abortSignal },
    )

    const choice = response.choices[0]
    const msg = choice.message as any  // reasoning_content is not in the SDK types yet
    return {
      text: choice.message.content ?? undefined,
      reasoning: msg.reasoning_content ?? undefined,  // o1/o3 models expose this
      toolCalls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })),
      finishReason: mapFinishReason(choice.finish_reason),
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      raw: response,
    }
  }

  async *stream(options: EngineCallOptions): AsyncGenerator<EngineStreamChunk> {
    const stream = this.client.chat.completions.stream({
      model: this.modelId,
      messages: toOAIMessages(options.messages, options.system),
      tools: options.tools?.map(t => ({ type: 'function' as const, function: t.function })),
      temperature: this.engineConfig.temperature,
      max_tokens: this.engineConfig.maxTokens,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (delta?.content) yield { type: 'text-delta', textDelta: delta.content }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          yield {
            type: 'tool-call-delta',
            toolCall: {
              id: tc.id,
              name: tc.function?.name,
              arguments: tc.function?.arguments ? JSON.parse(tc.function.arguments) : undefined,
            },
          }
        }
      }
    }

    const finalUsage = await stream.finalUsage()
    yield {
      type: 'finish',
      usage: {
        promptTokens: finalUsage.prompt_tokens,
        completionTokens: finalUsage.completion_tokens,
        totalTokens: finalUsage.total_tokens,
      },
    }
  }
}
```

**`packages/providers/openai/src/provider.ts`**

```typescript
import OpenAI from 'openai'
import type { IProvider, IEngine, EngineConfig, ProviderConfig, ModelInfo } from '@agent/core'
import { OpenAIEngine } from './engine'

export class OpenAIProvider implements IProvider {
  readonly id = 'openai'
  private client: OpenAI

  constructor(config: ProviderConfig = {}) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.headers,
      fetch: config.fetch,
    })
  }

  engine(modelId: string, config?: Partial<EngineConfig>): IEngine {
    return new OpenAIEngine(this.client, modelId, config)
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.models.list()
      return true
    } catch {
      return false
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const { data } = await this.client.models.list()
    return data
      .filter(m => m.id.startsWith('gpt') || m.id.startsWith('o'))
      .map(m => ({
        id: m.id,
        name: m.id,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: m.id.includes('vision') || m.id.includes('4o'),
        supportsStreaming: true,
      }))
  }
}

export function createOpenAI(config?: ProviderConfig): OpenAIProvider {
  return new OpenAIProvider(config)
}
```

**`packages/providers/openai/src/index.ts`**

```typescript
export { OpenAIEngine } from './engine'
export { OpenAIProvider, createOpenAI } from './provider'
```

> **Аналогично** создаются `packages/providers/anthropic/` и `packages/providers/google/` с теми же конфигами — только меняется имя пакета, `importPath`, зависимость SDK и логика маппинга сообщений.

---

## 5.5. Phase 3.5: Core streaming mode

**Status:** Done.

**Goal:** Add streaming execution to `@agent/core` without introducing runtime-specific abstractions.

Implemented:

- `RunOptions.stream?: boolean`
- `ResumeOptions.stream?: boolean`
- `Agent.execute()` remains the single primitive
- `Agent.run()` remains a wrapper over `execute()`
- Default behavior still uses `engine.call()`
- `stream: true` consumes `engine.stream()`, emits `reasoning.delta` / `text.delta`, assembles the final `EngineResponse`, then reuses the existing tool/approval/pause/resume loop
- `resume(..., { stream: true })` continues with streaming after approval
- Abort during stream returns `run.cancelled`, non-abort stream errors become `run.failed`

Verified:

- `npx nx run @agent/core:test --skip-nx-cache` passes: 34/34
- `npx nx run @agent/openai:test --skip-nx-cache` passes: 5/5
- `npx nx run-many -t typecheck --projects @agent/core,@agent/openai --skip-nx-cache` passes
- `npx nx run-many -t build --projects @agent/core,@agent/openai --skip-nx-cache` passes
- Workspace and dist imports pass for `@agent/core` and `@agent/openai`

Next phase: `@agent/cli`.

---

## 6. Phase 4: @agent/cli

### 6.1. Генерация

```bash
nx g @nx/js:library cli \
  --directory=packages/cli \
  --publishable \
  --importPath=@agent/cli \
  --bundler=tsc \
  --unitTestRunner=none \
  --projectNameAndRootFormat=as-provided
```

### 6.2. `packages/cli/package.json`

```json
{
  "name": "@agent/cli",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.js",
  "types": "./index.d.ts",
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    }
  },
  "publishConfig": {
    "access": "public"
  },
  "dependencies": {
    "@agent/core": "workspace:*"
  },
  "sideEffects": false
}
```

### 6.3. `packages/cli/tsconfig.lib.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/packages/cli",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

### 6.4. `packages/cli/project.json`

```json
{
  "name": "@agent/cli",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/cli/src",
  "projectType": "library",
  "tags": ["scope:env", "type:lib"],
  "implicitDependencies": ["@agent/core"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/cli",
        "tsConfig": "packages/cli/tsconfig.lib.json",
        "packageJson": "packages/cli/package.json",
        "main": "packages/cli/src/index.ts",
        "assets": ["packages/cli/*.md"],
        "updateBuildableProjectDepsInPackageJson": true,
        "buildableProjectDepsInPackageJsonType": "dependencies"
      },
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p packages/cli/tsconfig.json"
      }
    }
  }
}
```

### 6.5. Исходные файлы

**`packages/cli/src/context.ts`**

```typescript
import type { AgentContext } from '@agent/core'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'

const execAsync = promisify(exec)

export interface CliContext extends AgentContext {
  shell: {
    exec(command: string): Promise<{ stdout: string; stderr: string }>
    cwd: string
  }
  fs: {
    read(filePath: string): Promise<string>
    write(filePath: string, content: string): Promise<void>
    list(dirPath: string): Promise<string[]>
  }
}

export function createCliContext(options: { cwd?: string } = {}): CliContext {
  const cwd = options.cwd ?? process.cwd()
  return {
    shell: {
      cwd,
      async exec(command) {
        return execAsync(command, { cwd })
      },
    },
    fs: {
      async read(filePath) {
        return fs.readFile(path.resolve(cwd, filePath), 'utf-8')
      },
      async write(filePath, content) {
        await fs.writeFile(path.resolve(cwd, filePath), content, 'utf-8')
      },
      async list(dirPath) {
        const entries = await fs.readdir(path.resolve(cwd, dirPath), { withFileTypes: true })
        return entries.map(e => e.name + (e.isDirectory() ? '/' : ''))
      },
    },
  }
}
```

**`packages/cli/src/memory/fs-memory.ts`**

```typescript
import type { IMemoryStore, Message } from '@agent/core'
import * as fs from 'fs/promises'
import * as path from 'path'

export class FsMemoryStore implements IMemoryStore {
  constructor(private readonly dir: string) {}

  private filePath(threadId: string): string {
    return path.join(this.dir, `${threadId}.json`)
  }

  async append(threadId: string, messages: Message[]): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    const existing = await this.list(threadId)
    await fs.writeFile(this.filePath(threadId), JSON.stringify([...existing, ...messages], null, 2))
  }

  async list(threadId: string, options?: { limit?: number }): Promise<Message[]> {
    try {
      const content = await fs.readFile(this.filePath(threadId), 'utf-8')
      const messages: Message[] = JSON.parse(content)
      return options?.limit ? messages.slice(-options.limit) : messages
    } catch {
      return []
    }
  }

  async clear(threadId: string): Promise<void> {
    try {
      await fs.unlink(this.filePath(threadId))
    } catch {
      // already deleted
    }
  }
}
```

**`packages/cli/src/memory/fs-checkpoint.ts`**

```typescript
import type { ICheckpointStore, RunCheckpoint } from '@agent/core'
import * as fs from 'fs/promises'
import * as path from 'path'

export class FsCheckpointStore implements ICheckpointStore {
  constructor(private readonly dir: string) {}

  private filePath(runId: string): string {
    return path.join(this.dir, `checkpoint-${runId}.json`)
  }

  async save(checkpoint: RunCheckpoint): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    await fs.writeFile(this.filePath(checkpoint.runId), JSON.stringify(checkpoint, null, 2))
  }

  async load(runId: string): Promise<RunCheckpoint | undefined> {
    try {
      const content = await fs.readFile(this.filePath(runId), 'utf-8')
      return JSON.parse(content) as RunCheckpoint
    } catch {
      return undefined
    }
  }

  async delete(runId: string): Promise<void> {
    try {
      await fs.unlink(this.filePath(runId))
    } catch {
      // already deleted
    }
  }
}
```

**`packages/cli/src/agent.ts`**

```typescript
import * as readline from 'readline'
import { Agent } from '@agent/core'
import type { AgentConfig, IAgent, RunOptions, RunResult } from '@agent/core'
import type { CliContext } from './context'

export function createCliAgent(config: AgentConfig<CliContext>): IAgent<CliContext> {
  return new Agent(config)
}

// runWithApproval wraps agent.run() in a loop that handles pauses interactively.
// Use this instead of agent.run() when the agent has tools with needsApproval.
export async function runWithApproval(
  agent: IAgent<CliContext>,
  prompt: string,
  options: RunOptions<CliContext>,
): Promise<RunResult> {
  let result = await agent.run(prompt, options)

  while (result.status === 'paused' && result.pauseReason) {
    const reason = result.pauseReason
    const message = reason.message ?? `Tool "${reason.toolName}" requires approval`
    process.stdout.write(`\n[approval required] ${message}\nInput: ${JSON.stringify(reason.input)}\n`)

    const approved = await promptUser(`Allow tool "${reason.toolName}"? (y/n): `)
    result = await agent.resume(result.runId, {
      approvalId: reason.approvalId,
      decision: approved ? 'allow' : 'deny',
      reason: approved ? undefined : 'Declined by user',
    }, options)
  }

  return result
}

async function promptUser(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}
```

**`packages/cli/src/index.ts`**

```typescript
export type { CliContext } from './context'
export { createCliContext } from './context'
export { FsMemoryStore } from './memory/fs-memory'
export { FsCheckpointStore } from './memory/fs-checkpoint'
export { createCliAgent, runWithApproval } from './agent'
```

---

## 7. Phase 5: apps/cli-app — CLI приложение (React + Ink)

Полноценное интерактивное CLI, аналог Claude Code / Codex CLI. Устанавливается глобально, даёт команду `agent`.

> **Архитектурные правила**
> - Размещение: `apps/cli-app/` (НЕ в `packages/`)
> - `projectType: "application"` в `project.json`
> - Публикуется на npm как `@agent/cli-app` (бинарник `agent`)
> - Не импортируется другими пакетами
> - Нет path alias в `tsconfig.base.json`
> - Вместо `runWithApproval()` (readline) — `agent.execute()` + Ink modal

### 7.1. Структура

```
apps/cli-app/
├── src/
│   ├── cli.tsx                 ← entry: Commander.js + render(<App />)
│   ├── app.tsx                 ← root Ink component, Agent wiring
│   ├── store.ts                ← Zustand store
│   ├── components/
│   │   ├── ChatHistory.tsx     ← список сообщений
│   │   ├── InputBox.tsx        ← ввод (ink-text-input)
│   │   ├── StatusBar.tsx       ← модель, шаг, токены
│   │   ├── ApprovalModal.tsx   ← y/n при approval.requested
│   │   └── StreamingText.tsx   ← реал-тайм text.delta
│   └── hooks/
│       └── useAgent.ts         ← agent.execute() → Zustand store
├── project.json
├── package.json
└── tsconfig.json
```

### 7.2. Генерация

```bash
# Убедиться, что @nx/esbuild установлен той же версии, что и nx (избегаем смешивания major)
npm install -D @nx/esbuild@$(node -e "process.stdout.write(require('./node_modules/nx/package.json').version)")

nx g @nx/js:application cli-app \
  --directory=apps/cli-app \
  --bundler=esbuild \
  --projectNameAndRootFormat=as-provided \
  --unitTestRunner=none
```

### 7.3. `apps/cli-app/package.json`

```json
{
  "name": "@agent/cli-app",
  "version": "0.1.0",
  "description": "Interactive AI agent CLI",
  "type": "module",
  "bin": { "agent": "./cli.js" },
  "main": "./cli.js",
  "exports": { ".": "./cli.js" },
  "publishConfig": { "access": "public" },
  "dependencies": {
    "@agent/core": "^0.1.0",
    "@agent/cli": "^0.1.0",
    "@agent/openai": "^0.1.0",
    "react": "^18.3.0",
    "ink": "^5.0.0",
    "ink-text-input": "^6.0.0",
    "zustand": "^4.5.0",
    "commander": "^12.0.0"
  }
}
```

> `"type": "module"` обязателен для Ink (ESM-only). Пути в `bin`/`main`/`exports` — относительно `dist/apps/cli-app/`, поскольку `nx release publish` публикует именно оттуда. `"files"` не нужен — публикуем напрямую из dist.

### 7.4. `apps/cli-app/project.json`

```json
{
  "name": "@agent/cli-app",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/cli-app/src",
  "projectType": "application",
  "tags": ["scope:app", "type:app"],
  "implicitDependencies": ["@agent/core", "@agent/cli", "@agent/openai"],
  "targets": {
    "build": {
      "executor": "@nx/esbuild:esbuild",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/apps/cli-app",
        "main": "apps/cli-app/src/cli.tsx",
        "tsConfig": "apps/cli-app/tsconfig.json",
        "bundle": true,
        "platform": "node",
        "format": ["esm"],
        "generatePackageJson": true,
        "banner": { "js": "#!/usr/bin/env node" }
      },
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "npx tsc --noEmit -p apps/cli-app/tsconfig.json"
      }
    },
    "nx-release-publish": {
      "options": {
        "packageRoot": "dist/apps/cli-app"
      }
    }
  }
}
```

> `"format": ["esm"]` обязателен — Ink ESM-only.  
> `"generatePackageJson": true` — esbuild копирует `package.json` (с зависимостями) в `outputPath`; без этого `npm publish` упадёт.  
> `"nx-release-publish".packageRoot` — говорит `nx release publish`, где искать `package.json` для публикации.  
> `"banner"` добавляет shebang в бандл — файл становится исполняемым напрямую.

### 7.5. `apps/cli-app/src/store.ts`

```typescript
import { create } from 'zustand'
import type { PauseReason } from '@agent/core'

export type AppStatus = 'idle' | 'running' | 'streaming' | 'paused' | 'error'

export interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface AgentStore {
  status: AppStatus
  messages: DisplayMessage[]
  streamingText: string      // накапливает text.delta
  pauseReason: PauseReason | null
  pendingRunId: string | null
  totalTokens: number
  currentStep: number

  setStatus: (s: AppStatus) => void
  addMessage: (msg: DisplayMessage) => void
  appendStreamingDelta: (delta: string) => void
  commitStreamingText: () => void
  setPause: (reason: PauseReason, runId: string) => void
  clearPause: () => void
  addTokens: (n: number) => void
  setStep: (n: number) => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  status: 'idle',
  messages: [],
  streamingText: '',
  pauseReason: null,
  pendingRunId: null,
  totalTokens: 0,
  currentStep: 0,

  setStatus: (status) => set({ status }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendStreamingDelta: (delta) =>
    set((s) => ({ streamingText: s.streamingText + delta, status: 'streaming' })),
  commitStreamingText: () =>
    set((s) => ({
      messages: s.streamingText
        ? [...s.messages, { id: crypto.randomUUID(), role: 'assistant', text: s.streamingText }]
        : s.messages,
      streamingText: '',
      status: 'idle',
    })),
  setPause: (pauseReason, pendingRunId) => set({ pauseReason, pendingRunId, status: 'paused' }),
  clearPause: () => set({ pauseReason: null, pendingRunId: null }),
  addTokens: (n) => set((s) => ({ totalTokens: s.totalTokens + n })),
  setStep: (n) => set({ currentStep: n }),
}))
```

### 7.6. `apps/cli-app/src/hooks/useAgent.ts`

```typescript
import { useCallback, useRef } from 'react'
import type { Agent } from '@agent/core'
import type { CliContext } from '@agent/cli'
import { useAgentStore } from '../store.js'

// context and stream come from App — never from agent internals
export function useAgent(agent: Agent<CliContext>, context: CliContext, stream?: boolean) {
  const store = useAgentStore
  const agentRef = useRef(agent)
  agentRef.current = agent

  const run = useCallback(async (prompt: string) => {
    const { setStatus, addMessage, appendStreamingDelta, commitStreamingText, setPause, addTokens, setStep } =
      store.getState()

    setStatus('running')
    addMessage({ id: crypto.randomUUID(), role: 'user', text: prompt })

    for await (const event of agentRef.current.execute(prompt, { context, stream })) {
      switch (event.type) {
        case 'text.delta':       appendStreamingDelta(event.text); break
        // Non-streaming: event.text has the full text; streaming: streamingText already accumulated
        case 'text.completed':   stream ? commitStreamingText() : addMessage({ id: crypto.randomUUID(), role: 'assistant', text: event.text }); break
        case 'step.started':     setStep(event.stepNumber); break
        case 'run.completed':    addTokens(event.output.usage.totalTokens); setStatus('idle'); break
        case 'approval.requested':
          setPause(
            { type: 'approval_required', approvalId: event.approvalId, toolCallId: event.toolCallId,
              toolName: event.toolName, input: event.input, message: event.message },
            event.runId,
          )
          return  // suspend — resume() will continue
        case 'run.failed':
        case 'run.cancelled':    setStatus('error'); break
      }
    }
  }, [context, stream])

  const resume = useCallback(async (approvalId: string, runId: string, decision: 'allow' | 'deny') => {
    const { clearPause, setStatus, addMessage, appendStreamingDelta, commitStreamingText, setPause, addTokens } =
      store.getState()

    clearPause()
    setStatus('running')

    for await (const event of agentRef.current.resume(runId, { approvalId, decision }, { context, stream })) {
      switch (event.type) {
        case 'text.delta':       appendStreamingDelta(event.text); break
        case 'text.completed':   stream ? commitStreamingText() : addMessage({ id: crypto.randomUUID(), role: 'assistant', text: event.text }); break
        case 'run.completed':    addTokens(event.output.usage.totalTokens); setStatus('idle'); break
        case 'approval.requested':
          setPause(
            { type: 'approval_required', approvalId: event.approvalId, toolCallId: event.toolCallId,
              toolName: event.toolName, input: event.input, message: event.message },
            event.runId,
          )
          return
        case 'run.failed':
        case 'run.cancelled':    setStatus('error'); break
      }
    }
  }, [context, stream])

  return { run, resume }
}
```

### 7.7. `apps/cli-app/src/components/ApprovalModal.tsx`

```typescript
import React from 'react'
import { Box, Text, useInput } from 'ink'
import { useAgentStore } from '../store.js'

interface Props {
  onDecision: (decision: 'allow' | 'deny') => void
}

export function ApprovalModal({ onDecision }: Props) {
  const { pauseReason } = useAgentStore()
  if (!pauseReason) return null

  useInput((ch, key) => {
    const keyChar = ch?.toLowerCase() ?? ''
    if (keyChar === 'y') onDecision('allow')
    if (keyChar === 'n' || key.escape) onDecision('deny')
    // Enter intentionally does nothing — accidental Enter must not approve a tool call
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
      <Text bold color="yellow">⚠ Approval required</Text>
      <Text>Tool: <Text bold>{pauseReason.toolName}</Text></Text>
      {pauseReason.message && <Text dimColor>{pauseReason.message}</Text>}
      <Text>Input: {JSON.stringify(pauseReason.input, null, 2)}</Text>
      <Text> </Text>
      <Text><Text color="green">[y]</Text> Allow   <Text color="red">[n]</Text> Deny</Text>
    </Box>
  )
}
```

### 7.8. `apps/cli-app/src/components/StatusBar.tsx`

```typescript
import React from 'react'
import { Box, Text } from 'ink'
import { useAgentStore } from '../store.js'

export function StatusBar({ model }: { model: string }) {
  const { status, currentStep, totalTokens } = useAgentStore()
  const color = status === 'running' || status === 'streaming' ? 'green'
    : status === 'paused' ? 'yellow'
    : status === 'error'  ? 'red'
    : 'gray'
  return (
    <Box justifyContent="space-between" borderStyle="single" borderColor="gray">
      <Text dimColor>{model}</Text>
      <Text color={color}>{status}</Text>
      <Text dimColor>step {currentStep} · {totalTokens} tok</Text>
    </Box>
  )
}
```

### 7.9. `apps/cli-app/src/app.tsx`

```typescript
import os from 'node:os'
import path from 'node:path'
import React, { useState, useCallback } from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import { Agent } from '@agent/core'
import { createCliContext, FsMemoryStore, FsCheckpointStore } from '@agent/cli'
import { createOpenAI } from '@agent/openai'
import { useAgentStore } from './store.js'
import { ApprovalModal } from './components/ApprovalModal.js'
import { StatusBar } from './components/StatusBar.js'
import { useAgent } from './hooks/useAgent.js'

interface Props { model: string; stream?: boolean; apiKey?: string }

export function App({ model, stream, apiKey }: Props) {
  const { messages, streamingText, status, pauseReason, pendingRunId } = useAgentStore()
  const [input, setInput] = useState('')

  const context = React.useMemo(() => createCliContext(), [])

  const agent = React.useMemo(() => new Agent({
    name: 'cli-agent',
    engine: createOpenAI({ apiKey: apiKey ?? process.env.OPENAI_API_KEY! }).engine(model),
    tools: [],  // ← пользователь добавляет свои инструменты здесь
    memory: new FsMemoryStore(path.join(os.homedir(), '.agent', 'memory')),
    checkpoints: new FsCheckpointStore(path.join(os.homedir(), '.agent', 'checkpoints')),
    system: 'You are a helpful assistant.',
  }), [model, apiKey])

  const { run, resume } = useAgent(agent, context, stream)

  const handleSubmit = useCallback((val: string) => {
    if (!val.trim()) return
    setInput('')
    run(val.trim())
  }, [run])

  const handleApproval = useCallback((decision: 'allow' | 'deny') => {
    if (!pauseReason || !pendingRunId) return
    resume(pauseReason.approvalId, pendingRunId, decision)
  }, [pauseReason, pendingRunId, resume])

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar model={model} />
      <Box flexDirection="column" flexGrow={1}>
        {messages.map((msg) => (
          <Box key={msg.id} marginBottom={1}>
            <Text bold color={msg.role === 'user' ? 'cyan' : 'white'}>
              {msg.role === 'user' ? 'you: ' : 'agent: '}
            </Text>
            <Text>{msg.text}</Text>
          </Box>
        ))}
        {streamingText && (
          <Box>
            <Text bold color="white">agent: </Text>
            <Text>{streamingText}</Text>
            <Text color="green">▋</Text>
          </Box>
        )}
      </Box>
      {status === 'paused' ? (
        <ApprovalModal onDecision={handleApproval} />
      ) : (
        <Box borderStyle="single" borderColor="gray">
          <Text color="cyan">{'> '}</Text>
          <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} placeholder="Type a message..." />
        </Box>
      )}
    </Box>
  )
}
```

### 7.10. `apps/cli-app/src/cli.tsx`

```typescript
#!/usr/bin/env node
import React from 'react'
import { render } from 'ink'
import { program } from 'commander'
import { App } from './app.js'

program
  .name('agent')
  .description('Interactive AI agent CLI')
  .version('0.1.0')
  .option('-m, --model <model>', 'OpenAI model', 'gpt-4o')
  .option('-k, --api-key <key>', 'OpenAI API key (default: $OPENAI_API_KEY)')
  .option('--stream', 'Enable streaming output', false)
  .action((opts) => {
    render(
      <App model={opts.model} stream={opts.stream} apiKey={opts.apiKey} />,
      { exitOnCtrlC: true },
    )
  })

program.parse()
```

### 7.11. Обновление `nx.json` — `release.projects`

```json
"projects": ["packages/*", "packages/providers/*", "apps/cli-app"]
```

### 7.12. Запуск и публикация

```bash
# Сборка (включает зависимые пакеты благодаря dependsOn: ["^build"])
npm exec nx build @agent/cli-app

# Запуск из dist (рекомендуется — использует собранные зависимости)
node dist/apps/cli-app/cli.js --model gpt-4o --stream

# Локальный запуск через tsx — ТОЛЬКО после сборки зависимостей:
#   npm exec nx run-many -t build --projects=@agent/core,@agent/cli,@agent/openai
# Иначе @agent/core/@agent/cli/@agent/openai не разрешатся (нет dist/)
npx tsx apps/cli-app/src/cli.tsx --model gpt-4o --stream

# Глобальная установка из dist (для тестирования)
npm install -g ./dist/apps/cli-app

# После публикации на npm
npm install -g @agent/cli-app
agent --model gpt-4o --stream
agent --model gpt-4o-mini
```

---

## 8. Phase 6: @agent/browser

### 8.1. Генерация

```bash
nx g @nx/js:library browser \
  --directory=packages/browser \
  --publishable \
  --importPath=@agent/browser \
  --bundler=tsc \
  --unitTestRunner=none \
  --projectNameAndRootFormat=as-provided
```

### 8.2. `packages/browser/package.json`

```json
{
  "name": "@agent/browser",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.js",
  "types": "./index.d.ts",
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    }
  },
  "publishConfig": {
    "access": "public"
  },
  "dependencies": {
    "@agent/core": "workspace:*",
    "idb": "^8.0.0"
  },
  "sideEffects": false
}
```

### 8.3. `packages/browser/tsconfig.lib.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/packages/browser",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "lib": ["ES2022", "DOM"],
    "types": []
  },
  "include": ["src/**/*.ts"]
}
```

### 8.4. `packages/browser/project.json`

```json
{
  "name": "@agent/browser",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/browser/src",
  "projectType": "library",
  "tags": ["scope:env", "type:lib"],
  "implicitDependencies": ["@agent/core"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/browser",
        "tsConfig": "packages/browser/tsconfig.lib.json",
        "packageJson": "packages/browser/package.json",
        "main": "packages/browser/src/index.ts",
        "assets": ["packages/browser/*.md"],
        "updateBuildableProjectDepsInPackageJson": true,
        "buildableProjectDepsInPackageJsonType": "dependencies"
      },
      "dependsOn": ["^build"]
    }
  }
}
```

### 8.5. Исходные файлы

**`packages/browser/src/context.ts`**

```typescript
import type { AgentContext } from '@agent/core'

export interface BrowserContext extends AgentContext {
  dom: {
    querySelector(selector: string): Element | null
    querySelectorAll(selector: string): NodeListOf<Element>
    getInputValue(selector: string): string
    setInputValue(selector: string, value: string): void
    click(selector: string): void
    getText(selector: string): string
  }
}

export function createBrowserContext(): BrowserContext {
  return {
    dom: {
      querySelector: sel => document.querySelector(sel),
      querySelectorAll: sel => document.querySelectorAll(sel),
      getInputValue: sel => (document.querySelector(sel) as HTMLInputElement)?.value ?? '',
      setInputValue: (sel, val) => {
        const el = document.querySelector(sel) as HTMLInputElement
        if (el) el.value = val
      },
      click: sel => (document.querySelector(sel) as HTMLElement)?.click(),
      getText: sel => (document.querySelector(sel) as HTMLElement)?.textContent ?? '',
    },
  }
}
```

**`packages/browser/src/memory/indexeddb-memory.ts`**

```typescript
import { openDB } from 'idb'
import type { IMemoryStore, Message } from '@agent/core'

const DB_NAME = 'agent-memory'
const STORE = 'messages'

export class IndexedDbMemoryStore implements IMemoryStore {
  private db = openDB(DB_NAME, 1, {
    upgrade(db) { db.createObjectStore(STORE) },
  })

  async append(threadId: string, messages: Message[]): Promise<void> {
    const store = await this.db
    const existing = await this.list(threadId)
    await store.put(STORE, [...existing, ...messages], threadId)
  }

  async list(threadId: string, options?: { limit?: number }): Promise<Message[]> {
    const store = await this.db
    const messages: Message[] = (await store.get(STORE, threadId)) ?? []
    return options?.limit ? messages.slice(-options.limit) : messages
  }

  async clear(threadId: string): Promise<void> {
    const store = await this.db
    await store.delete(STORE, threadId)
  }
}
```

**`packages/browser/src/agent.ts`**

```typescript
import { Agent } from '@agent/core'
import type { AgentConfig, IAgent, RunOptions, RunResult } from '@agent/core'
import type { BrowserContext } from './context'

export function createBrowserAgent(config: AgentConfig<BrowserContext>): IAgent<BrowserContext> {
  return new Agent(config)
}

// runWithApproval wraps agent.run() in a loop that handles pauses via window.confirm.
export async function runWithApproval(
  agent: IAgent<BrowserContext>,
  prompt: string,
  options: RunOptions<BrowserContext>,
): Promise<RunResult> {
  let result = await agent.run(prompt, options)

  while (result.status === 'paused' && result.pauseReason) {
    const reason = result.pauseReason
    const message = [
      reason.message ?? `Tool "${reason.toolName}" requires approval`,
      `Input: ${JSON.stringify(reason.input)}`,
      'Allow?',
    ].join('\n')

    const approved = window.confirm(message)
    result = await agent.resume(result.runId, {
      approvalId: reason.approvalId,
      decision: approved ? 'allow' : 'deny',
      reason: approved ? undefined : 'Declined by user',
    }, options)
  }

  return result
}
```

**`packages/browser/src/index.ts`**

```typescript
export type { BrowserContext } from './context'
export { createBrowserContext } from './context'
export { IndexedDbMemoryStore } from './memory/indexeddb-memory'
export { createBrowserAgent, runWithApproval } from './agent'
```

---

## 9. Phase 7: @agent/rest

### 9.1. Генерация

```bash
nx g @nx/js:library rest \
  --directory=packages/rest \
  --publishable \
  --importPath=@agent/rest \
  --bundler=tsc \
  --unitTestRunner=none \
  --projectNameAndRootFormat=as-provided
```

### 9.2. `packages/rest/package.json`

```json
{
  "name": "@agent/rest",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.js",
  "types": "./index.d.ts",
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    }
  },
  "publishConfig": {
    "access": "public"
  },
  "dependencies": {
    "@agent/core": "workspace:*",
    "ioredis": "^5.4.0"
  },
  "peerDependencies": {
    "express": "^4.18.0 || ^5.0.0",
    "fastify": "^5.0.0"
  },
  "peerDependenciesMeta": {
    "express": { "optional": true },
    "fastify": { "optional": true }
  },
  "sideEffects": false
}
```

### 9.3. `packages/rest/project.json`

```json
{
  "name": "@agent/rest",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/rest/src",
  "projectType": "library",
  "tags": ["scope:env", "type:lib"],
  "implicitDependencies": ["@agent/core"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/rest",
        "tsConfig": "packages/rest/tsconfig.lib.json",
        "packageJson": "packages/rest/package.json",
        "main": "packages/rest/src/index.ts",
        "assets": ["packages/rest/*.md"],
        "updateBuildableProjectDepsInPackageJson": true,
        "buildableProjectDepsInPackageJsonType": "dependencies"
      },
      "dependsOn": ["^build"]
    }
  }
}
```

### 9.4. Исходные файлы

**`packages/rest/src/context.ts`**

```typescript
import type { AgentContext } from '@agent/core'

export interface RestContext extends AgentContext {
  requestId: string
  userId?: string
  headers: Record<string, string>
}
```

**`packages/rest/src/memory/redis-memory.ts`**

```typescript
import type { IMemoryStore, Message } from '@agent/core'
import type { Redis } from 'ioredis'

export class RedisMemoryStore implements IMemoryStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttl = 86400,
  ) {}

  private key(threadId: string) { return `agent:thread:${threadId}` }

  async append(threadId: string, messages: Message[]): Promise<void> {
    const existing = await this.list(threadId)
    await this.redis.set(this.key(threadId), JSON.stringify([...existing, ...messages]), 'EX', this.ttl)
  }

  async list(threadId: string, options?: { limit?: number }): Promise<Message[]> {
    const raw = await this.redis.get(this.key(threadId))
    if (!raw) return []
    const messages: Message[] = JSON.parse(raw)
    return options?.limit ? messages.slice(-options.limit) : messages
  }

  async clear(threadId: string): Promise<void> {
    await this.redis.del(this.key(threadId))
  }
}
```

**`packages/rest/src/checkpoint/redis-checkpoint.ts`**

```typescript
import type { ICheckpointStore, RunCheckpoint } from '@agent/core'
import type { Redis } from 'ioredis'

export class RedisCheckpointStore implements ICheckpointStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttl = 3600,
  ) {}

  private key(runId: string) { return `agent:checkpoint:${runId}` }

  async save(checkpoint: RunCheckpoint): Promise<void> {
    await this.redis.set(this.key(checkpoint.runId), JSON.stringify(checkpoint), 'EX', this.ttl)
  }

  async load(runId: string): Promise<RunCheckpoint | undefined> {
    const raw = await this.redis.get(this.key(runId))
    return raw ? (JSON.parse(raw) as RunCheckpoint) : undefined
  }

  async delete(runId: string): Promise<void> {
    await this.redis.del(this.key(runId))
  }
}
```

**`packages/rest/src/handlers/stream.ts`**

```typescript
import type { IAgent, AgentEvent, RunOptions, RunResult } from '@agent/core'
import type { RestContext } from '../context'

interface SseResponse {
  setHeader(name: string, value: string): void
  write(chunk: string): boolean
  end(): void
}

export async function streamAgentEvents(
  agent: IAgent<RestContext>,
  prompt: string,
  options: RunOptions<RestContext>,
  res: SseResponse,
): Promise<RunResult> {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const gen = agent.execute(prompt, options)
  let next = await gen.next()

  while (!next.done) {
    const event: AgentEvent = next.value
    res.write(`data: ${JSON.stringify(event)}\n\n`)
    next = await gen.next()
  }

  const result = next.value
  res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`)
  res.end()

  return result
}
```

**`packages/rest/src/index.ts`**

```typescript
export type { RestContext } from './context'
export { RedisMemoryStore } from './memory/redis-memory'
export { RedisCheckpointStore } from './checkpoint/redis-checkpoint'
export { streamAgentEvents } from './handlers/stream'
```

#### Пример Express-роутера

```typescript
import express from 'express'
import Redis from 'ioredis'
import { createOpenAI } from '@agent/openai'
import { Agent } from '@agent/core'
import { RedisMemoryStore, RedisCheckpointStore, streamAgentEvents } from '@agent/rest'
import type { RestContext } from '@agent/rest'

const router = express.Router()
const redis = new Redis()

const engine = createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).engine('gpt-4o-mini')
const memory = new RedisMemoryStore(redis)
const checkpoints = new RedisCheckpointStore(redis)

const agent = new Agent<RestContext>({
  name: 'rest-agent',
  engine,
  tools: [],
  memory,
  checkpoints,
})

// POST /run — stream events via SSE
router.post('/run', async (req, res) => {
  const { prompt, threadId } = req.body
  const context: RestContext = {
    requestId: req.headers['x-request-id'] as string ?? crypto.randomUUID(),
    userId: req.headers['x-user-id'] as string,
    headers: req.headers as Record<string, string>,
  }
  await streamAgentEvents(agent, prompt, { context, threadId }, res)
})

// POST /resume — continue a paused run
router.post('/resume', async (req, res) => {
  const { runId, approvalId, decision, reason } = req.body
  const context: RestContext = {
    requestId: crypto.randomUUID(),
    headers: req.headers as Record<string, string>,
  }
  const result = await agent.resume(runId, { approvalId, decision, reason }, { context })
  res.json(result)
})

export { router }
```

---

## 10. Phase 8: Примеры (apps)

### 10.1. `apps/examples/cli-devops/project.json`

```json
{
  "name": "example-cli-devops",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/examples/cli-devops/src",
  "projectType": "application",
  "tags": ["scope:example"],
  "implicitDependencies": ["@agent/core", "@agent/openai", "@agent/cli"],
  "targets": {
    "start": {
      "executor": "nx:run-commands",
      "options": {
        "command": "node --import tsx src/main.ts",
        "cwd": "apps/examples/cli-devops"
      },
      "dependsOn": ["@agent/core:build", "@agent/openai:build", "@agent/cli:build"]
    }
  }
}
```

### 10.2. `apps/examples/cli-devops/src/main.ts`

```typescript
import * as path from 'path'
import { z } from 'zod'
import { buildTool } from '@agent/core'
import { createOpenAI } from '@agent/openai'
import {
  FsMemoryStore, FsCheckpointStore,
  createCliAgent, createCliContext, runWithApproval,
} from '@agent/cli'

const engine = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! }).engine('gpt-4o-mini')

const memory = new FsMemoryStore(path.join(process.cwd(), '.agent-memory'))
const checkpoints = new FsCheckpointStore(path.join(process.cwd(), '.agent-checkpoints'))

const listFiles = buildTool({
  name: 'list_files',
  description: 'List files in a directory',
  inputSchema: z.object({ path: z.string().default('.') }),
  async execute(input, ctx) {
    return ctx.fs.list(input.path)
  },
})

const runCommand = buildTool({
  name: 'run_command',
  description: 'Run a shell command',
  inputSchema: z.object({ command: z.string() }),
  needsApproval: ({ input }) => {
    const dangerous = ['rm ', 'dd ', 'mkfs', '> /dev/'].some(d => input.command.includes(d))
    return dangerous
      ? { behavior: 'pause', message: `Dangerous command: ${input.command}` }
      : { behavior: 'allow' }
  },
  async execute(input, ctx) {
    const { stdout, stderr } = await ctx.shell.exec(input.command)
    return { stdout, stderr }
  },
})

const agent = createCliAgent({
  name: 'devops-agent',
  engine,
  system: 'You are a DevOps assistant. Help with shell commands and file operations.',
  tools: [listFiles, runCommand],
  memory,
  checkpoints,
})

async function main() {
  const ctx = createCliContext()
  const prompt = process.argv.slice(2).join(' ') || 'List the files in the current directory'

  console.log(`\nPrompt: ${prompt}\n`)

  const result = await runWithApproval(agent, prompt, {
    context: ctx,
    onEvent: event => {
      if (event.type === 'text.delta') process.stdout.write(event.text)
      else if (event.type === 'tool.started') console.log(`\n[tool] ${event.toolName}(${JSON.stringify(event.input)})`)
      else if (event.type === 'tool.finished') console.log(`[tool] ✓`)
      else if (event.type === 'tool.failed') console.error(`[tool] ✗ ${event.error}`)
      else if (event.type === 'approval.requested') console.log(`\n[approval] ${event.toolName}: ${event.message ?? 'requires approval'}`)
    },
  })

  console.log(`\n\nStatus: ${result.status}`)
  if (result.output) {
    console.log(`Tokens: ${result.output.usage.totalTokens}`)
    console.log(`Steps: ${result.output.steps.length}`)
  }
}

main().catch(console.error)
```

---

## 11. Phase 9: Тестирование

### 11.1. `packages/core/test/utils/mock-engine.ts`

```typescript
import type { IEngine, EngineCallOptions, EngineResponse, EngineStreamChunk } from '../../src'

export interface MockResponse {
  text?: string
  reasoning?: string
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
  finishReason?: EngineResponse['finishReason']
}

export class MockEngine implements IEngine {
  readonly provider = 'mock'
  readonly modelId = 'mock-model'

  private queue: MockResponse[] = []

  queueResponse(response: MockResponse): this {
    this.queue.push(response)
    return this
  }

  async call(_options: EngineCallOptions): Promise<EngineResponse> {
    const response = this.queue.shift()
    if (!response) throw new Error('MockEngine: no responses queued')
    return {
      text: response.text,
      reasoning: response.reasoning,
      toolCalls: response.toolCalls,
      finishReason: response.finishReason ?? (response.toolCalls?.length ? 'tool-calls' : 'stop'),
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      raw: response,
    }
  }

  async *stream(_options: EngineCallOptions): AsyncGenerator<EngineStreamChunk> {
    yield { type: 'finish' }
  }
}
```

### 11.2. `packages/core/test/agent.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import { Agent } from '../src/agent/agent'
import { InMemoryStore } from '../src/memory/in-memory'
import { InMemoryCheckpointStore } from '../src/memory/in-memory-checkpoint'
import { buildTool } from '../src/tool/build-tool'
import type { AgentContext } from '../src'
import { MockEngine } from './utils/mock-engine'

type Ctx = AgentContext

describe('Agent', () => {
  let engine: MockEngine
  let memory: InMemoryStore
  let checkpoints: InMemoryCheckpointStore

  beforeEach(() => {
    engine = new MockEngine()
    memory = new InMemoryStore()
    checkpoints = new InMemoryCheckpointStore()
  })

  it('completes with a text response', async () => {
    engine.queueResponse({ text: 'Hello!', finishReason: 'stop' })
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [], memory })
    const result = await agent.run('Hi', { context: {} })
    expect(result.status).toBe('completed')
    expect(result.output?.text).toBe('Hello!')
  })

  it('executes tool calls and accumulates steps', async () => {
    engine
      .queueResponse({ toolCalls: [{ id: 'c1', name: 'echo', arguments: { msg: 'hi' } }], finishReason: 'tool-calls' })
      .queueResponse({ text: 'Done', finishReason: 'stop' })

    const echo = buildTool({
      name: 'echo',
      description: 'Echo',
      inputSchema: z.object({ msg: z.string() }),
      async execute({ msg }) { return msg },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [echo], memory })
    const result = await agent.run('Echo hi', { context: {} })
    expect(result.status).toBe('completed')
    expect(result.output?.steps[0].toolCalls[0].name).toBe('echo')
    expect(result.output?.steps[0].toolCalls[0].approved).toBe(true)
  })

  it('pauses when tool returns pause decision', async () => {
    engine.queueResponse({
      toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'rm -rf /' } }],
      finishReason: 'tool-calls',
    })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause', message: 'Dangerous!' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory, checkpoints })
    const result = await agent.run('Run risky', { context: {} })

    expect(result.status).toBe('paused')
    expect(result.pauseReason?.toolName).toBe('risky')
    expect(result.pauseReason?.message).toBe('Dangerous!')
  })

  it('resumes after approval and completes', async () => {
    engine
      .queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'rm -rf /' } }], finishReason: 'tool-calls' })
      .queueResponse({ text: 'All done', finishReason: 'stop' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute({ cmd }) { return `ran: ${cmd}` },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory, checkpoints })
    const paused = await agent.run('Run risky', { context: {} })
    expect(paused.status).toBe('paused')

    const resumed = await agent.resume(paused.runId, {
      approvalId: paused.pauseReason!.approvalId,
      decision: 'allow',
    }, { context: {} })

    expect(resumed.status).toBe('completed')
    expect(resumed.output?.text).toBe('All done')
  })

  it('emits approval.requested (not run.paused) when tool pauses', async () => {
    engine.queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause', message: 'Confirm?' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory, checkpoints })
    const events: string[] = []
    const result = await agent.run('Run risky', { context: {}, onEvent: e => events.push(e.type) })

    expect(result.status).toBe('paused')
    expect(events).toContain('approval.requested')
    expect(events).not.toContain('run.paused')
  })

  it('emits approval.denied on resume with decision: deny', async () => {
    engine.queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })
    engine.queueResponse({ text: 'OK', finishReason: 'stop' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory, checkpoints })
    const paused = await agent.run('Run risky', { context: {} })

    const resumeEvents: string[] = []
    await agent.resume(paused.runId, {
      approvalId: paused.pauseReason!.approvalId,
      decision: 'deny',
      reason: 'Too dangerous',
    }, { context: {}, onEvent: e => resumeEvents.push(e.type) })

    expect(resumeEvents[0]).toBe('run.resumed')
    expect(resumeEvents[1]).toBe('approval.denied')
  })

  it('throws InvalidApprovalIdError before emitting run.resumed on wrong approvalId', async () => {
    engine.queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory, checkpoints })
    const paused = await agent.run('Run risky', { context: {} })
    expect(paused.status).toBe('paused')

    const events: string[] = []
    await expect(
      agent.resume(paused.runId, { approvalId: 'wrong-id', decision: 'allow' }, {
        context: {},
        onEvent: e => events.push(e.type),
      })
    ).rejects.toMatchObject({ code: 'INVALID_APPROVAL_ID' })

    // No events should have been emitted before the error
    expect(events).toHaveLength(0)
  })

  it('throws NoCheckpointStoreError when pause without checkpoint store', async () => {
    engine.queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory })
    await expect(agent.run('Run risky', { context: {} })).rejects.toMatchObject({ code: 'NO_CHECKPOINT_STORE' })
  })

  it('execute() yields events in correct order', async () => {
    engine.queueResponse({ text: 'Hi', finishReason: 'stop' })
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [], memory })
    const events: string[] = []

    const gen = agent.execute('Hello', { context: {} })
    let next = await gen.next()
    while (!next.done) {
      events.push(next.value.type)
      next = await gen.next()
    }

    expect(events).toEqual(['run.started', 'step.started', 'text.completed', 'step.finished', 'run.completed'])
    expect(next.value.status).toBe('completed')
  })

  it('execute() yields run.resumed → approval.granted → tool.started on resume', async () => {
    engine
      .queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })
      .queueResponse({ text: 'Done', finishReason: 'stop' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory, checkpoints })
    const paused = await agent.run('Run risky', { context: {} })

    const resumeEvents: string[] = []
    const resumed = await agent.resume(paused.runId, {
      approvalId: paused.pauseReason!.approvalId,
      decision: 'allow',
    }, {
      context: {},
      onEvent: e => resumeEvents.push(e.type),
    })

    expect(resumeEvents[0]).toBe('run.resumed')      // always first
    expect(resumeEvents[1]).toBe('approval.granted') // decision before tool execution
    expect(resumeEvents).toContain('tool.started')
    expect(resumeEvents).not.toContain('run.started')
    expect(resumed.status).toBe('completed')
  })

  it('batch pause: pre-pause results in memory, deferred in checkpoint, correct order after resume', async () => {
    engine
      .queueResponse({
        toolCalls: [
          { id: 'c1', name: 'safe', arguments: {} },
          { id: 'c2', name: 'risky', arguments: { cmd: 'x' } },
          { id: 'c3', name: 'safe', arguments: {} },
        ],
        finishReason: 'tool-calls',
      })
      .queueResponse({ text: 'All done', finishReason: 'stop' })

    const safe = buildTool({
      name: 'safe',
      description: 'Safe',
      inputSchema: z.object({}),
      async execute() { return 'ok' },
    })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'pause' }),
      async execute({ cmd }) { return `ran: ${cmd}` },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [safe, risky], memory, checkpoints })
    const paused = await agent.run('Run all', { context: {} })

    expect(paused.status).toBe('paused')

    // Before resume: only c1 result is in memory; c2 is in checkpoint, c3 skipped is deferred
    const beforeMessages = await memory.list(paused.threadId)
    const beforeToolResults = beforeMessages.filter(m => m.role === 'tool')
    expect(beforeToolResults).toHaveLength(1) // only c1; c2 in checkpoint, c3 deferred

    const resumed = await agent.resume(paused.runId, {
      approvalId: paused.pauseReason!.approvalId,
      decision: 'allow',
    }, { context: {} })

    expect(resumed.status).toBe('completed')

    // After resume: memory has c1, c2 (approved), c3 (skipped) — in correct order
    const afterMessages = await memory.list(paused.threadId)
    const afterToolResults = afterMessages.filter(m => m.role === 'tool')
    expect(afterToolResults).toHaveLength(3)
    expect(afterToolResults[0].toolCallId).toBe('c1')
    expect(afterToolResults[1].toolCallId).toBe('c2')
    expect(afterToolResults[2].toolCallId).toBe('c3')
  })

  it('denies tool and continues loop', async () => {
    engine
      .queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })
      .queueResponse({ text: 'OK', finishReason: 'stop' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'deny', reason: 'Not allowed' }),
      async execute({ cmd }) { return cmd },
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory })
    const result = await agent.run('Run risky', { context: {} })
    expect(result.status).toBe('completed')
  })

  it('emits reasoning.completed before text.completed when engine returns reasoning', async () => {
    engine.queueResponse({ text: 'Answer', finishReason: 'stop', reasoning: 'Let me think...' } as any)
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [], memory })
    const events: string[] = []

    await agent.run('Hi', { context: {}, onEvent: e => events.push(e.type) })

    expect(events).toContain('reasoning.completed')
    expect(events).toContain('text.completed')
    const reasoningIdx = events.indexOf('reasoning.completed')
    const textIdx = events.indexOf('text.completed')
    expect(reasoningIdx).toBeLessThan(textIdx)
  })

  it('does not emit reasoning.completed when engine returns none', async () => {
    engine.queueResponse({ text: 'Answer', finishReason: 'stop' })
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [], memory })
    const events: string[] = []

    await agent.run('Hi', { context: {}, onEvent: e => events.push(e.type) })

    expect(events).not.toContain('reasoning.completed')
    expect(events).not.toContain('reasoning.delta')
  })

  it('tool.started is not emitted when tool is denied or paused', async () => {
    engine.queueResponse({ toolCalls: [{ id: 'c1', name: 'risky', arguments: { cmd: 'x' } }], finishReason: 'tool-calls' })

    const risky = buildTool({
      name: 'risky',
      description: 'Risky',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: () => ({ behavior: 'deny' }),
      async execute({ cmd }) { return cmd },
    })

    const events: string[] = []
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [risky], memory })
    await agent.run('Run risky', { context: {}, onEvent: e => events.push(e.type) })

    expect(events).not.toContain('tool.started')
  })

  it('stores messages in memory with threadId', async () => {
    engine.queueResponse({ text: 'Hello', finishReason: 'stop' })
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [], memory })
    const threadId = 'thread-123'
    await agent.run('Hi', { context: {}, threadId })
    const messages = await memory.list(threadId)
    expect(messages.some(m => m.role === 'user')).toBe(true)
    expect(messages.some(m => m.role === 'assistant')).toBe(true)
  })

  // ── Terminal state tests ────────────────────────────────────────────────────

  it('emits run.cancelled and returns cancelled status when abortSignal is pre-aborted', async () => {
    // Signal already aborted before run starts — checked at first iteration
    engine.queueResponse({ text: 'Hi', finishReason: 'stop' })
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [], memory })
    const events: string[] = []
    const controller = new AbortController()
    controller.abort()

    const result = await agent.run('Hello', {
      context: {},
      abortSignal: controller.signal,
      onEvent: e => events.push(e.type),
    })

    expect(result.status).toBe('cancelled')
    expect(result.error).toBe('Aborted')
    expect(events).toContain('run.cancelled')
    expect(events).not.toContain('step.started')
  })

  it('emits run.cancelled (not run.failed) when engine throws AbortError after signal fires', async () => {
    const controller = new AbortController()
    const abortEngine = {
      provider: 'mock' as const,
      modelId: 'abort-engine',
      async call() {
        // Simulate SDK honouring the signal and throwing AbortError mid-request
        controller.abort()
        throw new DOMException('Aborted', 'AbortError')
      },
      async *stream() { yield { type: 'finish' as const } },
    }
    const agent = new Agent<Ctx>({ name: 'test', engine: abortEngine, tools: [], memory })
    const events: string[] = []

    const result = await agent.run('Hello', {
      context: {},
      abortSignal: controller.signal,
      onEvent: e => events.push(e.type),
    })

    expect(result.status).toBe('cancelled')
    expect(result.error).toBe('Aborted')
    expect(events).toContain('run.cancelled')
    expect(events).not.toContain('run.failed')
  })

  it('emits run.cancelled before second tool.started when abort fires during first tool', async () => {
    const controller = new AbortController()
    let callCount = 0

    const echo = buildTool({
      name: 'echo',
      description: 'Echo',
      inputSchema: z.object({ v: z.string() }),
      async execute({ v }) {
        callCount++
        if (callCount === 1) controller.abort()  // abort during first tool execution
        return v
      },
    })

    engine.queueResponse({
      toolCalls: [
        { id: 'c1', name: 'echo', arguments: { v: 'first' } },
        { id: 'c2', name: 'echo', arguments: { v: 'second' } },
      ],
      finishReason: 'tool-calls',
    })

    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [echo], memory })
    const toolStartedIds: string[] = []
    const events: string[] = []

    const result = await agent.run('Go', {
      context: {},
      abortSignal: controller.signal,
      onEvent: e => {
        events.push(e.type)
        if (e.type === 'tool.started') toolStartedIds.push((e as any).toolCallId)
      },
    })

    expect(result.status).toBe('cancelled')
    expect(events).toContain('run.cancelled')
    expect(toolStartedIds).toContain('c1')      // first tool ran
    expect(toolStartedIds).not.toContain('c2')  // second tool never started
  })

  it('emits run.failed and returns failed status when engine throws unexpectedly', async () => {
    // MockEngine overridden to simulate an infrastructure crash
    const crashEngine = {
      provider: 'mock' as const,
      modelId: 'crash',
      async call() { throw new Error('Network timeout') },
      async *stream() { yield { type: 'finish' as const } },
    }
    const agent = new Agent<Ctx>({ name: 'test', engine: crashEngine, tools: [], memory })
    const events: string[] = []

    const result = await agent.run('Hello', { context: {}, onEvent: e => events.push(e.type) })

    expect(result.status).toBe('failed')
    expect(result.error).toBe('Network timeout')
    expect(events).toContain('run.failed')
  })

  it('emits run.failed and returns failed status when maxSteps exceeded', async () => {
    // Queue only tool-call responses so the agent never reaches text → loop exhausts
    const echo = buildTool({
      name: 'echo',
      description: 'Echo',
      inputSchema: z.object({ v: z.string() }),
      async execute({ v }) { return v },
    })
    for (let i = 0; i < 3; i++) {
      engine.queueResponse({ toolCalls: [{ id: `c${i}`, name: 'echo', arguments: { v: 'x' } }], finishReason: 'tool-calls' })
    }
    const agent = new Agent<Ctx>({ name: 'test', engine, tools: [echo], memory })
    const events: string[] = []

    const result = await agent.run('Go', { context: {}, maxSteps: 2, onEvent: e => events.push(e.type) })

    expect(result.status).toBe('failed')
    expect(result.error).toContain('maximum steps')
    expect(events).toContain('run.failed')
    expect(events).not.toContain('run.completed')
  })
})
```

### 11.3. `packages/core/test/build-tool.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { buildTool } from '../src/tool/build-tool'

describe('buildTool', () => {
  it('validates and executes', async () => {
    const add = buildTool({
      name: 'add',
      description: 'Add two numbers',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      async execute({ a, b }) { return a + b },
    })

    expect(await add.execute({ a: 1, b: 2 }, {})).toBe(3)
    await expect(add.execute({ a: '1', b: 2 } as any, {})).rejects.toThrow()
  })

  it('generates correct JSON schema', () => {
    const search = buildTool({
      name: 'search',
      description: 'Search files',
      inputSchema: z.object({ query: z.string(), limit: z.number().optional() }),
      async execute({ query }) { return [query] },
    })

    const schema = search.toSchema()
    expect(schema.type).toBe('function')
    expect(schema.function.name).toBe('search')
    expect(schema.function.parameters.properties.query.type).toBe('string')
    expect(schema.function.parameters.additionalProperties).toBe(false)
  })

  it('needsApproval returns pause for dangerous input', async () => {
    const rm = buildTool({
      name: 'shell',
      description: 'Run command',
      inputSchema: z.object({ cmd: z.string() }),
      needsApproval: ({ input }) =>
        input.cmd.startsWith('rm')
          ? { behavior: 'pause', message: 'Dangerous!' }
          : { behavior: 'allow' },
      async execute({ cmd }) { return cmd },
    })

    expect(await rm.needsApproval!({ input: { cmd: 'ls' }, context: {} })).toEqual({ behavior: 'allow' })
    expect(await rm.needsApproval!({ input: { cmd: 'rm -rf /' }, context: {} })).toMatchObject({ behavior: 'pause' })
  })
})

### 11.3. Запуск тестов

```bash
# Только core
nx test @agent/core

# Все пакеты параллельно
nx run-many -t test

# С coverage
nx test @agent/core --coverage

# Затронутые изменениями
nx affected -t test
```

---

## 12. Phase 10: Release и публикация

**Цель:** Настроить автоматическое версионирование и публикацию через `nx release`.

### 12.1. Принцип работы `nx release`

```
git commit  →  nx release version  →  nx release changelog  →  nx release publish
```

- `nx release version` — анализирует conventional commits, обновляет `version` в `package.json` каждой библиотеки независимо
- `nx release changelog` — генерирует `CHANGELOG.md` для каждого пакета и создаёт GitHub Release
- `nx release publish` — запускает `npm publish` для `dist/packages/**` (включая `dist/packages/providers/*`)

### 12.2. Конфигурация в `nx.json`

```json
{
  "release": {
    "projects": ["packages/*", "packages/providers/*"],
    "projectsRelationship": "independent",
    "version": {
      "conventionalCommits": true,
      "generatorOptions": {
        "currentVersionResolver": "git-tag",
        "specifierSource": "conventional-commits"
      }
    },
    "changelog": {
      "projectChangelogs": true,
      "workspaceChangelog": true
    },
    "git": {
      "commit": true,
      "tag": true,
      "commitMessage": "chore(release): publish {projectName}@{version} [skip ci]",
      "tagPattern": "{projectName}@{version}"
    }
  }
}
```

### 12.3. Сценарии релиза

```bash
# Dry run — посмотреть что изменится
nx release --dry-run

# Релиз конкретного пакета
nx release --projects=@agent/core

# Полный релиз всех пакетов
nx release

# Только публикация (если версии уже обновлены)
nx release publish

# Публикация в dry-run режиме
nx release publish --dry-run
```

### 12.4. `publishConfig` в каждом `package.json`

Каждый пакет должен содержать:

```json
{
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org"
  }
}
```

### 12.5. `.npmrc` в корне (опционально)

```ini
# Автоматически используется при публикации
registry=https://registry.npmjs.org
access=public
```

### 12.6. Conventional Commits — примеры

```
feat(core): add streaming support to Agent          → minor bump
fix(openai): handle null content in response        → patch bump
feat(cli)!: rename createCliContext to mkCliCtx     → major bump (breaking)
chore: update dependencies                          → no bump
```

---

## 13. Phase 11: Документация

Идентична предыдущему плану (Phase 11), добавить секцию про `nx release`.

---

## 14. Чеклист готовности

### Инфраструктура

- [ ] Nx workspace инициализирован (`nx.json`, `tsconfig.base.json`, npm workspaces в `package.json`)
- [ ] `npm install` работает без ошибок
- [ ] Path aliases настроены в `tsconfig.base.json`
- [ ] `nx build @agent/core` создаёт `dist/packages/core/`

### @agent/core

- [x] Phase 1-2 core MVP implemented and verified
- [x] Phase 3.5 streaming mode implemented and verified

- [ ] `project.json` настроен с `build`, `test`, `typecheck` targets
- [ ] `package.json` с `publishConfig` и корректными `exports`
- [ ] Все типы определены (`types/*`)
- [ ] `Agent` class реализован (`run`, `resume`, `execute`, `_loop`)
- [ ] `buildTool` реализован
- [ ] `InMemoryStore` реализован (threadId API)
- [ ] `InMemoryCheckpointStore` реализован
- [ ] Custom errors определены (включая `CheckpointNotFoundError`, `InvalidRunStatusError`, `NoCheckpointStoreError`)
- [ ] Unit тесты проходят (`nx test @agent/core`)

### @agent/openai

- [x] Phase 3 OpenAI provider MVP implemented and verified

- [ ] `project.json` с `dependsOn: ["^build"]`
- [ ] `OpenAIEngine` реализован
- [ ] `OpenAIProvider` и `createOpenAI` работают
- [ ] `nx build @agent/openai` собирает с зависимостями

### @agent/cli

- [ ] `CliContext` с `shell` и `fs`
- [ ] `FsMemoryStore` с `append/list/clear(threadId)` работает
- [ ] `FsCheckpointStore` работает
- [ ] `createCliAgent` возвращает `Agent`
- [ ] `runWithApproval` обрабатывает pause через readline в цикле

### apps/cli-app

- [ ] `nx build @agent/cli-app` собирает без ошибок в `dist/apps/cli-app/`
- [ ] `dist/apps/cli-app/cli.js` содержит shebang (`#!/usr/bin/env node`)
- [ ] `dist/apps/cli-app/package.json` содержит `"bin"`, `"type": "module"`, корректные `exports`
- [ ] `node dist/apps/cli-app/cli.js --help` выводит usage без ошибок
- [ ] `npm install -g ./dist/apps/cli-app` устанавливает команду `agent`
- [ ] `nx-release-publish` target публикует из `dist/apps/cli-app`
- [ ] Approval flow работает: `approval.requested` → ApprovalModal → `[y/n]` → `resume()`

### @agent/browser

- [ ] `BrowserContext` с DOM API
- [ ] `IndexedDbMemoryStore` с `append/list/clear(threadId)` работает
- [ ] `createBrowserAgent` возвращает `Agent`
- [ ] `runWithApproval` обрабатывает pause через `window.confirm` в цикле

### @agent/rest

- [ ] `RestContext` определен
- [ ] `RedisMemoryStore` с `append/list/clear(threadId)` работает
- [ ] `RedisCheckpointStore` работает
- [ ] `streamAgentEvents` handler (SSE) готов
- [ ] Express-роутер с `/run` и `/resume` эндпоинтами

### Release

- [ ] `nx release --dry-run` работает корректно
- [ ] `dist/packages/**/package.json` содержит правильные `exports` (включая providers)
- [ ] GitHub Actions CI проходит
- [ ] `nx release publish --dry-run` не выдаёт ошибок

### Качество

- [ ] `nx run-many -t test` — все тесты проходят
- [ ] `nx run-many -t typecheck` — нет ошибок TypeScript
- [ ] `nx affected -t build test` — работает в CI
- [ ] README написан

---

## Порядок выполнения

```
Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 3.5 -> Phase 4 -> Phase 5 -> Phase 6 -> Phase 7 -> Phase 8 -> Phase 9 -> Phase 10 -> Phase 11
```

### Команды для проверки прогресса

```bash
npm install                           # после каждого изменения package.json
nx build @agent/core                  # собрать один пакет
nx run-many -t build                  # собрать все пакеты
nx run-many -t test                   # запустить все тесты
nx run-many -t typecheck              # проверка типов
nx affected -t build test --base=main # только изменённые проекты
nx graph                              # визуализация графа зависимостей
nx release --dry-run                  # preview релиза
```

### Полезные Nx команды

```bash
# Просмотр всех проектов
nx show projects

# Граф зависимостей в браузере
nx graph

# Запуск конкретного target с логами
nx build @agent/core --verbose

# Сбросить Nx кэш
nx reset

# Запуск в параллели с ограничением
nx run-many -t build --parallel=4
```

---

## Отклонения от плана

_Здесь документируются изменения относительно оригинальной спецификации._
