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
- [7.5. Phase 5.5: CLI tools MVP](#75-phase-55-cli-tools-mvp)
- [7.6. Phase 5.6: Advanced CLI UX + Sessions](#76-phase-56-advanced-cli-ux--sessions)
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
    "@agent/core": "workspace:*",
    "@vscode/ripgrep": "^1.15.0"
  },
  "sideEffects": false
}
```

> `@vscode/ripgrep` скачивает platform-specific binary на `npm install` через `postinstall` скрипт — **без runtime-download**. Если install-скрипты отключены или binary недоступен, `search_files` падает обратно на Node.js fallback.

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
import * as childProcess from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { AgentContext } from '@agent/core'

const execAsync = promisify(childProcess.exec)

// Patch existing context.ts — do NOT rewrite the file.
// Keep the node: import style shown above. If the file already has older imports without node:,
// update them to node: while patching.
// Add these two interfaces and extend CliShell with spawn():

export interface CliShellExecOptions {
  timeoutMs?: number   // kills the child process on expiry (SIGTERM via child_process.exec timeout)
}

export interface CliShellSpawnOptions {
  timeoutMs?: number      // kills the process on expiry — spawn throws
  maxBufferBytes?: number // kill + throw if stdout+stderr exceeds this (default: 10 MB)
  cwd?: string            // override working directory (default: context.shell.cwd)
}

export interface CliShellSpawnResult {
  stdout: string
  stderr: string
  exitCode: number     // never throws on non-zero exit; throws only on ENOENT, timeout, or buffer overflow
}

// Extend the existing CliContext interface — shell block gets exec + spawn:
//
// shell: {
//   cwd: string
//   exec(command: string, options?: CliShellExecOptions): Promise<{ stdout: string; stderr: string; exitCode: number }>
//   spawn(command: string, args: string[], options?: CliShellSpawnOptions): Promise<CliShellSpawnResult>
// }
//
// In createCliContext, update shell — add exec update + new spawn method:
//
//   async exec(command, execOpts) {
//     try {
//       const result = await execAsync(command, {
//         cwd, timeout: execOpts?.timeoutMs, maxBuffer: 10 * 1024 * 1024,
//       })
//       return { stdout: String(result.stdout), stderr: String(result.stderr), exitCode: 0 }
//     } catch (err: any) {
//       if (err.killed || err.signal === 'SIGTERM') throw new Error('Command timed out')
//       return { stdout: String(err.stdout ?? ''), stderr: String(err.stderr ?? ''), exitCode: err.code ?? 1 }
//     }
//   },
//
//   async spawn(command, args, spawnOpts) {
//     const maxBytes = spawnOpts?.maxBufferBytes ?? 10 * 1024 * 1024
//     return new Promise((resolve, reject) => {
//       const child = childProcess.spawn(command, args, {
//         cwd: spawnOpts?.cwd ?? cwd,
//         stdio: ['ignore', 'pipe', 'pipe'],
//       })
//       let stdout = '', stderr = '', done = false
//       const finish = (result: CliShellSpawnResult | Error) => {
//         if (done) return   // guard against double-resolve after timeout
//         done = true
//         clearTimeout(timer)
//         result instanceof Error ? reject(result) : resolve(result)
//       }
//       child.stdout.on('data', (d: Buffer) => {
//         stdout += d.toString()
//         if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxBytes) {
//           child.kill('SIGTERM')
//           finish(new Error('Process output exceeded maxBufferBytes'))
//         }
//       })
//       child.stderr.on('data', (d: Buffer) => {
//         stderr += d.toString()
//         if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxBytes) {
//           child.kill('SIGTERM')
//           finish(new Error('Process output exceeded maxBufferBytes'))
//         }
//       })
//       let timer: ReturnType<typeof setTimeout> | undefined
//       if (spawnOpts?.timeoutMs) {
//         timer = setTimeout(() => {
//           child.kill('SIGTERM')
//           finish(new Error('Command timed out'))
//         }, spawnOpts.timeoutMs)
//       }
//       child.on('error', (err) => finish(err))   // ENOENT → reject
//       child.on('close', (code) => finish({ stdout, stderr, exitCode: code ?? 1 }))
//     })
//   },
//
// Add at top of context.ts (keep existing node: imports):
//   import * as childProcess from 'node:child_process'
//
// Keep existing path.resolve(cwd) and fs.write mkdir({recursive: true}) unchanged.

export function createCliContext(options: { cwd?: string } = {}): CliContext {
  const cwd = options.cwd ?? process.cwd()
  return {
    shell: {
      cwd,
      async exec(command, execOpts) {
        // timeout causes child_process.exec to send SIGTERM — process is actually killed
        return execAsync(command, { cwd, timeout: execOpts?.timeoutMs })
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

## 7.5. Phase 5.5: CLI tools MVP

**Цель:** дать cli-app минимальный безопасный набор инструментов — без него агент не может ничего делать с файлами и оболочкой.

> **Не делать в этой фазе:** apply_patch, git-автоматизация, project-wide indexing, планировщик, multi-agent.

### 5.5.1. Структура новых файлов в `@agent/cli`

```
packages/cli/src/
├── tools/
│   ├── fs-read.ts
│   ├── fs-write.ts
│   ├── fs-list.ts
│   ├── search-files.ts   ← search_files (rg backend + Node fallback)
│   ├── rg-resolver.ts    ← resolveRipgrepCommand() — internal, not exported
│   ├── shell-exec.ts
│   └── index.ts          ← createCliTools()
├── system-prompt.ts      ← getDefaultCliSystemPrompt()
```

> **Расположение `rg-resolver.ts`**: находится рядом с `search-files.ts` в `tools/` — это внутренняя деталь `search_files`, не утилита общего назначения. Если захочется чище, будущий вариант рефакторинга: `tools/search-files/index.ts`, `tools/search-files/rg-resolver.ts`, `tools/search-files/node-search.ts`.

### 5.5.2. Общие константы и утилиты

**`packages/cli/src/tools/index.ts`**

```typescript
import path from 'node:path'
import type { ITool } from '@agent/core'
import type { CliContext } from '../context.js'
import { buildFsReadTool } from './fs-read.js'
import { buildFsWriteTool } from './fs-write.js'
import { buildFsListTool } from './fs-list.js'
import { buildSearchFilesTool } from './search-files.js'
import { buildShellExecTool } from './shell-exec.js'

export interface CliToolsOptions {
  allowOutsideCwd?: boolean    // разрешить пути за пределами cwd (default: false)
  maxOutputChars?: number      // truncate tool output in JS chars (default: 8_000)
  maxFileChars?: number        // fs_read: max chars when no offset/limit (default: 100_000)
  maxSearchFileChars?: number  // search_files Node fallback: max chars per file (default: 512_000)
  shellTimeoutMs?: number      // shell timeout — process is killed on expiry (default: 30_000)
  // NOTE: no rgPath — ripgrep resolution is internal to @agent/cli
}

// Context is NOT a parameter — it arrives in tool.execute(input, context) from core.
// Options are build-time config only.
export function createCliTools(options: CliToolsOptions = {}): ITool<any, any, CliContext>[] {
  const opts = {
    allowOutsideCwd: false,
    maxOutputChars: 8_000,
    maxFileChars: 100_000,
    maxSearchFileChars: 512_000,
    shellTimeoutMs: 30_000,
    ...options,
  }
  return [
    buildFsReadTool(opts),
    buildFsWriteTool(opts),
    buildFsListTool(opts),
    buildSearchFilesTool(opts),
    buildShellExecTool(opts),
  ]
}

// Shared path guard — uses path.relative() for cross-platform correctness
export function resolveSafe(cwd: string, inputPath: string, allowOutside: boolean): string {
  const root = path.resolve(cwd)
  const target = path.resolve(root, inputPath)
  const rel = path.relative(root, target)
  if (!allowOutside && (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))) {
    throw new Error(`Path "${inputPath}" is outside the workspace (${root})`)
  }
  return target
}

// Truncate long output with a clear marker
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + `\n\n[...truncated ${text.length - maxChars} chars]`
}

export type ResolvedCliToolsOptions = Required<CliToolsOptions>

export { resolveSafe, truncate }
```

### 5.5.3. `packages/cli/src/tools/fs-read.ts`

```typescript
import { z } from 'zod'
import { buildTool } from '@agent/core'
import type { CliContext } from '../context.js'
import { resolveSafe, truncate } from './index.js'
import type { ResolvedCliToolsOptions } from './index.js'

export function buildFsReadTool(opts: ResolvedCliToolsOptions) {
  return buildTool<{ path: string; offset?: number; limit?: number }, string, CliContext>({
    name: 'fs_read',
    description:
      'Read a file from the workspace. Returns file content as text. ' +
      `Without offset/limit: returns up to ${opts.maxFileChars} chars (beginning of file). ` +
      'For large files, use offset/limit (line numbers) to read any chunk regardless of file size.',
    inputSchema: z.object({
      path: z.string().describe('File path relative to workspace root'),
      offset: z.number().int().min(0).optional().describe('Start line (0-based)'),
      limit: z.number().int().min(1).optional().describe('Max lines to return'),
    }),
    async execute({ path: filePath, offset, limit }, context) {
      const resolved = resolveSafe(context.shell.cwd, filePath, opts.allowOutsideCwd)
      let content = await context.fs.read(resolved)
      if (offset !== undefined || limit !== undefined) {
        // offset/limit are specified — slice by lines regardless of file size
        const lines = content.split('\n')
        const start = offset ?? 0
        const end = limit !== undefined ? start + limit : lines.length
        content = lines.slice(start, end).join('\n')
      } else if (content.length > opts.maxFileChars) {
        // No chunking requested: cap large files.
        // For files beyond maxFileChars, use offset/limit to read specific chunks.
        content = content.slice(0, opts.maxFileChars) +
          `\n\n[...file truncated at ${opts.maxFileChars} chars — use offset/limit to read further]`
      }
      return truncate(content, opts.maxOutputChars)
    },
  })
}
```

### 5.5.4. `packages/cli/src/tools/fs-write.ts`

```typescript
import { z } from 'zod'
import { buildTool } from '@agent/core'
import type { CliContext } from '../context.js'
import { resolveSafe } from './index.js'
import type { ResolvedCliToolsOptions } from './index.js'

export function buildFsWriteTool(opts: ResolvedCliToolsOptions) {
  return buildTool<{ path: string; content: string }, string, CliContext>({
    name: 'fs_write',
    description: 'Write (or overwrite) a file in the workspace. Requires user approval.',
    inputSchema: z.object({
      path: z.string().describe('File path relative to workspace root'),
      content: z.string().describe('Full file content to write'),
    }),
    needsApproval({ input }) {
      return {
        behavior: 'pause',
        message: `Write ${input.content.length} chars to "${input.path}"?`,
      }
    },
    async execute({ path: filePath, content }, context) {
      const resolved = resolveSafe(context.shell.cwd, filePath, opts.allowOutsideCwd)
      await context.fs.write(resolved, content)
      return `Written ${content.length} chars to ${filePath}`
    },
  })
}
```

### 5.5.5. `packages/cli/src/tools/fs-list.ts`

```typescript
import { z } from 'zod'
import { buildTool } from '@agent/core'
import type { CliContext } from '../context.js'
import { resolveSafe } from './index.js'
import type { ResolvedCliToolsOptions } from './index.js'

export function buildFsListTool(opts: ResolvedCliToolsOptions) {
  return buildTool<{ path?: string }, string, CliContext>({
    name: 'fs_list',
    description: 'List files and directories. Defaults to workspace root.',
    inputSchema: z.object({
      path: z.string().optional().describe('Directory path relative to workspace root'),
    }),
    async execute({ path: dirPath }, context) {
      const resolved = resolveSafe(context.shell.cwd, dirPath ?? '.', opts.allowOutsideCwd)
      const entries = await context.fs.list(resolved)
      return entries.join('\n')
    },
  })
}
```

### 5.5.6. `packages/cli/src/tools/rg-resolver.ts`

Internal helper — не экспортируется из `@agent/cli`. Выбирает backend в порядке: env → bundled → system.

```typescript
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function getBundledRgPath(): string | undefined {
  try {
    // @vscode/ripgrep ships a platform binary via postinstall — no runtime download
    const { rgPath } = require('@vscode/ripgrep') as { rgPath: unknown }
    return typeof rgPath === 'string' ? rgPath : undefined
  } catch {
    return undefined
  }
}

// Resolution order:
//   1. AGENT_RG_PATH env (user override)
//   2. @vscode/ripgrep bundled binary
//   3. 'rg' (system PATH — caller handles ENOENT → Node fallback)
export function resolveRipgrepCommand(): string {
  return process.env['AGENT_RG_PATH'] ?? getBundledRgPath() ?? 'rg'
}
```

### 5.5.7. `packages/cli/src/tools/search-files.ts`

```typescript
import nodefs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { buildTool } from '@agent/core'
import type { CliContext } from '../context.js'
import { resolveSafe, truncate } from './index.js'
import type { ResolvedCliToolsOptions } from './index.js'
import { resolveRipgrepCommand } from './rg-resolver.js'

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.nx', '.next', 'coverage', '__pycache__'])

const RG_ARGS_BASE = [
  '--line-number', '--no-heading', '--color=never', '--hidden',
  '--glob', '!.git/**', '--glob', '!node_modules/**', '--glob', '!dist/**',
  '--glob', '!.nx/**', '--glob', '!.next/**', '--glob', '!coverage/**', '--glob', '!__pycache__/**',
]

// Node.js fallback search
async function nodeSearch(
  resolved: string,
  cwd: string,
  regex: RegExp,
  maxMatches: number,
  maxFileChars: number,
): Promise<{ lines: string[]; stopped: boolean }> {
  const lines: string[] = []

  async function searchDir(dir: string): Promise<void> {
    const entries = await nodefs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (lines.length >= maxMatches) return
      if (SKIP_DIRS.has(entry.name)) continue
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await searchDir(entryPath)
      } else {
        try {
          let content = await nodefs.readFile(entryPath, 'utf-8')
          if (content.length > maxFileChars) content = content.slice(0, maxFileChars)
          const rel = path.relative(cwd, entryPath)
          content.split('\n').forEach((line, i) => {
            if (lines.length < maxMatches && regex.test(line)) {
              lines.push(`${rel}:${i + 1}: ${line}`)
            }
          })
        } catch { /* skip binary/unreadable */ }
      }
    }
  }

  const stat = await nodefs.stat(resolved)
  if (stat.isFile()) {
    let content = await nodefs.readFile(resolved, 'utf-8')
    if (content.length > maxFileChars) content = content.slice(0, maxFileChars)
    const rel = path.relative(cwd, resolved)
    content.split('\n').forEach((line, i) => {
      if (lines.length < maxMatches && regex.test(line)) lines.push(`${rel}:${i + 1}: ${line}`)
    })
  } else {
    await searchDir(resolved)
  }

  return { lines, stopped: lines.length >= maxMatches }
}

export function buildSearchFilesTool(opts: ResolvedCliToolsOptions) {
  return buildTool<
    { pattern: string; path?: string; caseSensitive?: boolean; maxMatches?: number },
    string,
    CliContext
  >({
    name: 'search_files',
    description:
      'Search for a text pattern in files. Uses ripgrep when available, Node.js fallback otherwise. ' +
      'Returns "file:line: content" lines. First line shows backend used. ' +
      'Skips .git, node_modules, dist, coverage.',
    inputSchema: z.object({
      pattern: z.string().describe('Search pattern (ripgrep/JS regex syntax)'),
      path: z.string().optional().describe('Directory or file to search (default: workspace root)'),
      caseSensitive: z.boolean().optional().describe('Case-sensitive search (default: false)'),
      maxMatches: z.number().int().min(1).max(1000).optional().describe('Max matches to return (default: 500)'),
    }),
    async execute({ pattern, path: searchPath, caseSensitive, maxMatches: maxMatchesOpt }, context) {
      const resolved = resolveSafe(context.shell.cwd, searchPath ?? '.', opts.allowOutsideCwd)
      const maxMatches = maxMatchesOpt ?? 500

      // ── ripgrep backend ────────────────────────────────────────────────────
      const rgCommand = resolveRipgrepCommand()
      const rgArgs = [
        ...RG_ARGS_BASE,
        ...(caseSensitive ? [] : ['--ignore-case']),
        '--', pattern, resolved,
      ]

      let usedRg = false
      try {
        const { stdout, exitCode } = await context.shell.spawn(rgCommand, rgArgs, {
          timeoutMs: opts.shellTimeoutMs,
        })
        usedRg = true

        if (exitCode === 0) {
          const trimmed = stdout.trimEnd()
          const allLines = trimmed ? trimmed.split('\n') : []
          const lines = allLines.slice(0, maxMatches)
          const stopped = allLines.length > maxMatches
          const output = `backend: rg\n` +
            (lines.join('\n') || '(no matches)') +
            (stopped ? '\n[...stopped at max matches]' : '')
          return truncate(output, opts.maxOutputChars)
        }

        if (exitCode === 1) {
          // exitCode 1 = no matches — not an error
          return truncate(`backend: rg\n(no matches)`, opts.maxOutputChars)
        }

        // exitCode > 1: rg error — fall through to Node fallback
      } catch (err: any) {
        // timeout propagates up — do not fall back
        if (err.message?.includes('timed out') || err.message?.includes('maxBufferBytes')) throw err
        // ENOENT or other spawn error → Node fallback
      }

      // ── Node.js fallback ───────────────────────────────────────────────────
      let regex: RegExp
      try {
        regex = new RegExp(pattern, caseSensitive ? '' : 'i')
      } catch {
        return `backend: node\nError: invalid regex pattern "${pattern}"`
      }

      const { lines, stopped } = await nodeSearch(
        resolved, context.shell.cwd, regex, maxMatches, opts.maxSearchFileChars,
      )
      const backend = usedRg ? 'node (rg fallback)' : 'node'
      const output = `backend: ${backend}\n` +
        (lines.length > 0 ? lines.join('\n') : '(no matches)') +
        (stopped ? '\n[...stopped at max matches]' : '')
      return truncate(output, opts.maxOutputChars)
    },
  })
}
```

### 5.5.8. `packages/cli/src/tools/shell-exec.ts`

```typescript
import { z } from 'zod'
import { buildTool } from '@agent/core'
import type { CliContext } from '../context.js'
import { truncate } from './index.js'
import type { ResolvedCliToolsOptions } from './index.js'

export function buildShellExecTool(opts: ResolvedCliToolsOptions) {
  return buildTool<{ command: string }, string, CliContext>({
    name: 'shell_exec',
    description:
      'Run a shell command in the workspace directory. ' +
      `Output is truncated to ${opts.maxOutputChars} chars. Timeout: ${opts.shellTimeoutMs}ms (process is killed on expiry). ` +
      'Requires user approval. Avoid destructive or irreversible commands.',
    inputSchema: z.object({
      command: z.string().describe('Shell command to execute'),
    }),
    needsApproval({ input }) {
      return {
        behavior: 'pause',
        message: `Run command: ${input.command}`,
      }
    },
    async execute({ command }, context) {
      // shell.exec never throws on non-zero exit — timeout/signal errors still throw
      const { stdout, stderr, exitCode } = await context.shell.exec(command, { timeoutMs: opts.shellTimeoutMs })
      const parts = [
        exitCode !== 0 ? `Exit code: ${exitCode}` : null,
        stdout ? `STDOUT:\n${stdout}` : null,
        stderr ? `STDERR:\n${stderr}` : null,
      ].filter(Boolean)
      return truncate(parts.join('\n') || '(no output)', opts.maxOutputChars)
    },
  })
}
```

> `context.shell.exec`: non-zero exit code не бросает исключение — возвращает `{ stdout, stderr, exitCode }` как обычный результат. Timeout/signal бросает исключение (становится `tool.failed`). `maxBuffer: 10 MB` предотвращает OOM до `truncate()`.

### 5.5.10. `packages/cli/src/system-prompt.ts`

```typescript
export function getDefaultCliSystemPrompt(cwd: string): string {
  return `You are a local CLI coding assistant running in: ${cwd}

Available tools:
- fs_read      — read a file (supports offset/limit for large files)
- fs_write     — write or overwrite a file (requires approval)
- fs_list      — list directory contents
- search_files — search text in files using regex (uses ripgrep when available, Node.js fallback otherwise)
- shell_exec   — run a shell command (requires approval, 30s timeout)

Rules:
- Always read relevant files before making changes.
- Prefer targeted edits; explain every change briefly.
- Do not access paths outside the workspace unless the user explicitly allows it.
- fs_write and shell_exec pause for user approval — never assume they will be auto-approved.
- When output is truncated, request a narrower command or read specific files directly.
- Avoid destructive commands (rm -rf, DROP TABLE, etc.) unless the user explicitly asks.`
}
```

### 5.5.11. Обновление `packages/cli/src/index.ts`

```typescript
export type { CliContext, CliFs, CliShell } from './context.js'
export { createCliContext } from './context.js'
export { FsMemoryStore } from './memory/fs-memory.js'
export { FsCheckpointStore } from './memory/fs-checkpoint.js'
export type { ApprovalAdapter, ApprovalRequest, ApprovalResponse, RunWithApprovalOptions } from './agent.js'
export { ReadlineApprovalAdapter, createCliAgent, runWithApproval } from './agent.js'
export type { CliToolsOptions } from './tools/index.js'
export { createCliTools } from './tools/index.js'
export { getDefaultCliSystemPrompt } from './system-prompt.js'
// NOTE: rg-resolver.ts is intentionally NOT exported — it is an internal implementation detail.
// resolveRipgrepCommand() is not part of the public API.
```

### 5.5.12. Подключение в `apps/cli-app/src/app.tsx`

Не переписывать `app.tsx`. Добавить патч в существующий файл:

```typescript
// Добавить в импорты:
import { createCliTools, getDefaultCliSystemPrompt } from '@agent/cli'

// В существующий new Agent({...}) добавить две строки:
//   tools: createCliTools(),
//   system: getDefaultCliSystemPrompt(context.shell.cwd),
//
// Dependency array useMemo — сохранить текущий (не перечислять здесь,
// чтобы не расходиться с реальным app.tsx). Если context стабилен
// (создан в useMemo([], [])), добавлять его в deps не нужно.
```

### 5.5.13. Тесты `packages/cli/test/tools.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as os from 'node:os'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createCliContext } from '../src/context.js'
import { createCliTools } from '../src/tools/index.js'

// Helper: find tool by name
function getTool(tools: ReturnType<typeof createCliTools>, name: string) {
  const t = tools.find((t) => t.name === name)
  if (!t) throw new Error(`Tool ${name} not found`)
  return t
}

describe('CLI tools', () => {
  let tmpDir: string
  let ctx: ReturnType<typeof createCliContext>
  let tools: ReturnType<typeof createCliTools>

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-cli-tools-'))
    ctx = createCliContext({ cwd: tmpDir })
    tools = createCliTools()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ── fs_read ──────────────────────────────────────────────────────────────
  it('fs_read: reads a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'Hello, world!')
    const result = await getTool(tools, 'fs_read').execute({ path: 'hello.txt' }, ctx)
    expect(result).toBe('Hello, world!')
  })

  it('fs_read: offset and limit slice by lines', async () => {
    const lines = ['a', 'b', 'c', 'd', 'e']
    await fs.writeFile(path.join(tmpDir, 'lines.txt'), lines.join('\n'))
    const result = await getTool(tools, 'fs_read').execute({ path: 'lines.txt', offset: 1, limit: 2 }, ctx)
    expect(result).toBe('b\nc')
  })

  it('fs_read: truncates at maxFileChars when no offset/limit', async () => {
    const bigContent = 'x'.repeat(200_000)
    await fs.writeFile(path.join(tmpDir, 'big.txt'), bigContent)
    const smallTools = createCliTools({ maxFileChars: 100 })
    const result = await getTool(smallTools, 'fs_read').execute({ path: 'big.txt' }, ctx)
    expect(result).toContain('[...file truncated')
  })

  it('fs_read: offset/limit bypasses maxFileChars — reads any chunk of large file', async () => {
    // Build a file where line 200 is beyond maxFileChars but reachable via offset
    const lines = Array.from({ length: 300 }, (_, i) => `line${i}`)
    await fs.writeFile(path.join(tmpDir, 'large.txt'), lines.join('\n'))
    const smallTools = createCliTools({ maxFileChars: 10 })  // tiny maxFileChars
    const result = await getTool(smallTools, 'fs_read').execute(
      { path: 'large.txt', offset: 200, limit: 3 },
      ctx,
    )
    expect(result).toContain('line200')
    expect(result).toContain('line202')
    expect(result).not.toContain('[...file truncated')
  })

  it('fs_read: blocks path traversal outside cwd', async () => {
    await expect(
      getTool(tools, 'fs_read').execute({ path: '../../etc/passwd' }, ctx),
    ).rejects.toThrow('outside the workspace')
  })

  // ── fs_list ───────────────────────────────────────────────────────────────
  it('fs_list: lists workspace root', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.ts'), '')
    await fs.mkdir(path.join(tmpDir, 'sub'))
    const result = await getTool(tools, 'fs_list').execute({}, ctx)
    expect(result).toContain('a.ts')
    expect(result).toContain('sub/')
  })

  it('fs_list: blocks traversal outside cwd', async () => {
    await expect(
      getTool(tools, 'fs_list').execute({ path: '../' }, ctx),
    ).rejects.toThrow('outside the workspace')
  })

  // ── fs_write ──────────────────────────────────────────────────────────────
  it('fs_write: writes a file', async () => {
    await getTool(tools, 'fs_write').execute({ path: 'out.txt', content: 'data' }, ctx)
    const content = await fs.readFile(path.join(tmpDir, 'out.txt'), 'utf-8')
    expect(content).toBe('data')
  })

  it('fs_write: requires approval (needsApproval returns pause)', () => {
    const tool = getTool(tools, 'fs_write')
    const decision = tool.needsApproval!({ input: { path: 'x.txt', content: 'y' }, context: ctx })
    expect(decision).toMatchObject({ behavior: 'pause' })
  })

  it('fs_write: blocks path traversal', async () => {
    await expect(
      getTool(tools, 'fs_write').execute({ path: '../../evil.txt', content: 'bad' }, ctx),
    ).rejects.toThrow('outside the workspace')
  })

  // ── shell_exec ────────────────────────────────────────────────────────────
  it('shell_exec: requires approval (needsApproval returns pause)', () => {
    const tool = getTool(tools, 'shell_exec')
    const decision = tool.needsApproval!({ input: { command: 'echo hi' }, context: ctx })
    expect(decision).toMatchObject({ behavior: 'pause' })
  })

  it('shell_exec: returns stdout for zero-exit command', async () => {
    const result = await getTool(tools, 'shell_exec').execute(
      { command: 'node -e "process.stdout.write(\'ok\')"' },
      ctx,
    )
    expect(result).toContain('ok')
  })

  it('shell_exec: non-zero exit returns output, not exception', async () => {
    // node exits with code 1 — should return tool result with exitCode, not throw
    const result = await getTool(tools, 'shell_exec').execute(
      { command: 'node -e "process.stderr.write(\'err\'); process.exit(1)"' },
      ctx,
    )
    expect(result).toContain('Exit code: 1')
    expect(result).toContain('err')
  })

  it('shell_exec: truncates output exceeding maxOutputChars', async () => {
    const smallTools = createCliTools({ maxOutputChars: 10 })
    const result = await getTool(smallTools, 'shell_exec').execute(
      { command: 'node -e "process.stdout.write(\'x\'.repeat(200))"' },
      ctx,
    )
    expect(result).toContain('[...truncated')
    expect(result.indexOf('[...truncated')).toBeLessThanOrEqual(15)
  })

  it('shell_exec: kills process after timeout', async () => {
    const fastTimeout = createCliTools({ shellTimeoutMs: 100 })
    await expect(
      getTool(fastTimeout, 'shell_exec').execute(
        { command: 'node -e "setTimeout(() => {}, 5000)"' },
        ctx,
      ),
    ).rejects.toThrow('timed out')
  })

  // ── search_files — helpers ────────────────────────────────────────────────
  // Most search_files tests use a fake spawn so they don't require rg installed.
  function makeSpawnResult(stdout: string, exitCode = 0) {
    return { stdout, stderr: '', exitCode }
  }

  function ctxWithSpawn(spawnFn: typeof ctx.shell.spawn) {
    return { ...ctx, shell: { ...ctx.shell, spawn: spawnFn } }
  }

  // ── search_files — rg backend ─────────────────────────────────────────────
  it('search_files: createCliTools has no rgPath option', () => {
    const opts: import('../src/tools/index.js').CliToolsOptions = {}
    expect('rgPath' in opts).toBe(false)
  })

  it('search_files: rg success returns backend: rg', async () => {
    const fakeCtx = ctxWithSpawn(async () => makeSpawnResult('src/a.ts:1: const x = 42'))
    const result = await getTool(tools, 'search_files').execute({ pattern: 'const x' }, fakeCtx)
    expect(result).toContain('backend: rg')
    expect(result).toContain('src/a.ts:1')
  })

  it('search_files: empty rg stdout (exitCode 0) returns no matches, not crash', async () => {
    const fakeCtx = ctxWithSpawn(async () => makeSpawnResult(''))
    const result = await getTool(tools, 'search_files').execute({ pattern: 'x' }, fakeCtx)
    expect(result).toContain('backend: rg')
    expect(result).toContain('(no matches)')
  })

  it('search_files: passes shellTimeoutMs into spawn options', async () => {
    const capturedOpts: any[] = []
    const fakeCtx = ctxWithSpawn(async (_cmd, _args, opts) => {
      capturedOpts.push(opts)
      return makeSpawnResult('')
    })
    const customTools = createCliTools({ shellTimeoutMs: 5_000 })
    await getTool(customTools, 'search_files').execute({ pattern: 'x' }, fakeCtx)
    expect(capturedOpts[0]?.timeoutMs).toBe(5_000)
  })

  it('search_files: spawn maxBufferBytes overflow throws, does not fall back to Node', async () => {
    const fakeCtx = ctxWithSpawn(async () => {
      throw new Error('Process output exceeded maxBufferBytes')
    })
    await expect(
      getTool(tools, 'search_files').execute({ pattern: 'x' }, fakeCtx),
    ).rejects.toThrow('maxBufferBytes')
  })

  it('search_files: rg exitCode 1 = no matches, not error', async () => {
    const fakeCtx = ctxWithSpawn(async () => makeSpawnResult('', 1))
    const result = await getTool(tools, 'search_files').execute({ pattern: 'xyz' }, fakeCtx)
    expect(result).toContain('backend: rg')
    expect(result).toContain('(no matches)')
  })

  it('search_files: rg ENOENT falls back to Node backend', async () => {
    await fs.writeFile(path.join(tmpDir, 'code.ts'), 'const x = 42')
    const fakeCtx = ctxWithSpawn(async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) })
    const result = await getTool(tools, 'search_files').execute({ pattern: 'const x' }, fakeCtx)
    expect(result).toContain('backend: node')
    expect(result).toContain('const x')
  })

  it('search_files: rg exitCode > 1 falls back to Node backend', async () => {
    await fs.writeFile(path.join(tmpDir, 'code.ts'), 'hello world')
    const fakeCtx = ctxWithSpawn(async () => makeSpawnResult('', 2))
    const result = await getTool(tools, 'search_files').execute({ pattern: 'hello' }, fakeCtx)
    expect(result).toContain('backend: node')
    expect(result).toContain('hello')
  })

  it('search_files: AGENT_RG_PATH env overrides bundled rg', async () => {
    const spawnCalls: string[] = []
    const fakeCtx = ctxWithSpawn(async (cmd) => { spawnCalls.push(cmd); return makeSpawnResult('') })
    process.env['AGENT_RG_PATH'] = '/custom/rg'
    try {
      await getTool(tools, 'search_files').execute({ pattern: 'x' }, fakeCtx)
    } finally {
      delete process.env['AGENT_RG_PATH']
    }
    expect(spawnCalls[0]).toBe('/custom/rg')
  })

  // ── search_files — Node fallback ──────────────────────────────────────────
  it('search_files (Node): finds pattern', async () => {
    await fs.writeFile(path.join(tmpDir, 'code.ts'), 'const x = 42\nconst y = 0')
    const fakeCtx = ctxWithSpawn(async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) })
    const result = await getTool(tools, 'search_files').execute({ pattern: 'const x' }, fakeCtx)
    expect(result).toContain('code.ts')
    expect(result).toContain('const x')
  })

  it('search_files (Node): case-insensitive by default', async () => {
    await fs.writeFile(path.join(tmpDir, 'readme.md'), 'Hello World')
    const fakeCtx = ctxWithSpawn(async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) })
    const result = await getTool(tools, 'search_files').execute({ pattern: 'hello' }, fakeCtx)
    expect(result).toContain('Hello World')
  })

  it('search_files (Node): skips node_modules', async () => {
    await fs.mkdir(path.join(tmpDir, 'node_modules', 'pkg'), { recursive: true })
    await fs.writeFile(path.join(tmpDir, 'node_modules', 'pkg', 'index.js'), 'const secret = 1')
    const fakeCtx = ctxWithSpawn(async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) })
    const result = await getTool(tools, 'search_files').execute({ pattern: 'secret' }, fakeCtx)
    expect(result).toContain('(no matches)')
  })

  it('search_files (Node): invalid regex returns clear error, not exception', async () => {
    const fakeCtx = ctxWithSpawn(async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) })
    const result = await getTool(tools, 'search_files').execute({ pattern: '[invalid' }, fakeCtx)
    expect(result).toContain('invalid regex')
    expect(result).not.toContain('throw')
  })

  it('search_files: maxMatches respected', async () => {
    const lines = Array.from({ length: 50 }, (_, i) => `match line ${i}`).join('\n')
    await fs.writeFile(path.join(tmpDir, 'big.ts'), lines)
    const fakeCtx = ctxWithSpawn(async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) })
    const result = await getTool(tools, 'search_files').execute({ pattern: 'match', maxMatches: 5 }, fakeCtx)
    const matchLines = result.split('\n').filter(l => l.includes('match line'))
    expect(matchLines.length).toBeLessThanOrEqual(5)
  })

  it('search_files (Node): maxSearchFileChars limits per-file reading', async () => {
    const huge = 'x'.repeat(600_000) + '\ntarget line'
    await fs.writeFile(path.join(tmpDir, 'huge.ts'), huge)
    const smallTools = createCliTools({ maxSearchFileChars: 100 })
    const fakeCtx = ctxWithSpawn(async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) })
    const result = await getTool(smallTools, 'search_files').execute({ pattern: 'target' }, fakeCtx)
    // 'target' is beyond maxSearchFileChars so not found
    expect(result).toContain('(no matches)')
  })
})
```

### 5.5.14. Checklist Phase 5.5

- [ ] `createCliTools(options?)` не имеет `rgPath` в публичных опциях, возвращает `ITool<any, any, CliContext>[]`
- [ ] `@vscode/ripgrep` добавлен в `dependencies` `packages/cli/package.json`
- [ ] `rg-resolver.ts` внутренний, не экспортируется из `@agent/cli` — только `import` внутри `search-files.ts`
- [ ] `search_files`: rg backend передаёт `{ timeoutMs: opts.shellTimeoutMs }` в `spawn`
- [ ] `search_files`: rg stdout parsing — один `split('\n')`, пустой stdout → `allLines = []`, не crash
- [ ] `search_files`: exitCode 1 = no matches; ENOENT/exitCode>1 → Node fallback; timeout/maxBufferBytes → throw, no fallback
- [ ] `search_files`: Node fallback — pure JS, invalid regex → clear tool result, `maxSearchFileChars` per file
- [ ] Первая строка результата `search_files` — `backend: rg` / `backend: node` / `backend: node (rg fallback)`
- [ ] `CliShell.spawn`: `maxBufferBytes` (default 10 MB) — убивает процесс и бросает `"Process output exceeded maxBufferBytes"`; одиночный `done` guard предотвращает double-resolve после timeout
- [ ] `CliShell.spawn` добавлен через патч context.ts с `import * as childProcess from 'node:child_process'`; non-zero не бросает, ENOENT/timeout/maxBufferBytes бросают
- [ ] `getDefaultCliSystemPrompt` упоминает `search_files` (не `fs_grep`), не упоминает `rgPath`
- [ ] `resolveSafe()` использует `path.relative()` для кроссплатформенной проверки
- [ ] `fs_read`: без offset/limit — обрезает по `maxFileChars`; с offset/limit — читает любой кусок
- [ ] `fs_write` требует approval, блокирует traversal
- [ ] `shell_exec`: non-zero exit → tool result с `Exit code / STDOUT / STDERR`; `maxBuffer: 10 MB`
- [ ] Тесты `search_files` не требуют rg — используют `ctxWithSpawn` mock
- [ ] Тесты кроссплатформенные: нет `sleep`, нет системного `grep` или `rg`
- [ ] `context.ts` не переписан целиком — добавлен `spawn`, расширена сигнатура `exec`
- [ ] `nx test @agent/cli` — все тесты проходят

---

## 7.6. Phase 5.6: Advanced CLI UX + Sessions

### 5.6.1. Цель

Сделать `apps/cli-app` удобным интерактивным coding-agent CLI: сессии с персистентностью, slash-команды, resume после approval, улучшенный StatusBar/ChatHistory. Scope ограничен `@agent/cli` и `apps/cli-app` — `@agent/core` не трогается.

### 5.6.2. Структура новых файлов

```
packages/cli/src/
├── session/
│   ├── model.ts          ← CliSession type, CliSessionStatus
│   ├── fs-session.ts     ← FsSessionStore
│   └── helpers.ts        ← createSessionId, createThreadId, getSessionTitle
└── index.ts              ← export FsSessionStore, CliSession, helpers

apps/cli-app/src/
├── commands/
│   ├── registry.ts       ← CommandDef[], executeCommand()
│   └── parser.ts         ← parseSlashCommand()
├── hooks/
│   └── useAgent.ts       ← updated: null-safe, AsyncGenerator, session callbacks, updateSession helper
├── store.ts              ← EXTENDED (same Phase 5 file): add UiMessage, SessionSlice, MessagesSlice
├── components/
│   ├── StatusBar.tsx      ← updated: session title, status, stream
│   ├── ChatHistory.tsx    ← updated: notice/error kinds
│   ├── InputBox.tsx       ← updated: command mode hint
│   └── ApprovalModal.tsx  ← Phase 5 API kept (onDecision prop, reads pauseReason from store)
└── app.tsx               ← agent via useMemo, useAgentStore selectors, command dispatch
```

### 5.6.3. `@agent/cli` — Session model

**`packages/cli/src/session/model.ts`**

```typescript
export type CliSessionStatus = 'active' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface CliSession {
    id: string
    threadId: string
    title: string
    cwd: string
    model: string
    stream: boolean
    createdAt: string   // ISO 8601
    updatedAt: string   // ISO 8601
    lastRunId?: string
    pendingRunId?: string
    status: CliSessionStatus
    metadata?: Record<string, unknown>
}
```

### 5.6.4. `@agent/cli` — FsSessionStore

**`packages/cli/src/session/fs-session.ts`**

```typescript
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { CliSession } from './model.js'

export class FsSessionStore {
    constructor(private readonly dir: string) {}

    async create(input: Omit<CliSession, 'createdAt' | 'updatedAt'>): Promise<CliSession> {
        const now = new Date().toISOString()
        const session: CliSession = { ...input, createdAt: now, updatedAt: now }
        await this.save(session)
        return session
    }

    async save(session: CliSession): Promise<void> {
        await fs.mkdir(this.dir, { recursive: true })
        const filePath = this._filePath(session.id)
        await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf8')
    }

    async load(id: string): Promise<CliSession | undefined> {
        try {
            const raw = await fs.readFile(this._filePath(id), 'utf8')
            return JSON.parse(raw) as CliSession
        } catch {
            return undefined
        }
    }

    async list(options?: { limit?: number }): Promise<CliSession[]> {
        await fs.mkdir(this.dir, { recursive: true })
        const entries = await fs.readdir(this.dir)
        const sessions: CliSession[] = []
        for (const entry of entries) {
            if (!entry.endsWith('.json')) continue
            try {
                const raw = await fs.readFile(path.join(this.dir, entry), 'utf8')
                sessions.push(JSON.parse(raw) as CliSession)
            } catch {
                // skip corrupt files
            }
        }
        sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        return options?.limit ? sessions.slice(0, options.limit) : sessions
    }

    async delete(id: string): Promise<void> {
        try {
            await fs.unlink(this._filePath(id))
        } catch {
            // ignore missing file
        }
    }

    async loadByPrefix(prefix: string): Promise<
        { type: 'found'; session: CliSession } |
        { type: 'ambiguous'; count: number } |
        { type: 'not-found' }
    > {
        const matches = (await this.list()).filter(s => s.id.startsWith(prefix))
        if (matches.length === 0) return { type: 'not-found' }
        if (matches.length > 1) return { type: 'ambiguous', count: matches.length }
        return { type: 'found', session: matches[0]! }
    }

    private _filePath(id: string): string {
        return path.join(this.dir, `${id}.json`)
    }
}
```

> Сообщения (MemoryStore) хранятся отдельно по `threadId` — не дублируются в session JSON.

### 5.6.5. `@agent/cli` — Session helpers

**`packages/cli/src/session/helpers.ts`**

```typescript
import { randomUUID } from 'node:crypto'

export function createSessionId(): string {
    return randomUUID()
}

export function createThreadId(sessionId: string): string {
    return `thread-${sessionId}`
}

export function getSessionTitle(prompt: string): string {
    const line = prompt.replace(/[\r\n]+/g, ' ').trim()
    if (!line) return 'New session'
    return line.length > 60 ? line.slice(0, 60) : line
}
```

IDs are UUID v4 — file-safe by construction (hex + hyphens). No LLM call for title.

### 5.6.6. `@agent/cli` — index.ts additions

```typescript
// existing exports unchanged ...

// NEW — sessions
export type { CliSession, CliSessionStatus } from './session/model.js'
export { FsSessionStore } from './session/fs-session.js'
export { createSessionId, createThreadId, getSessionTitle } from './session/helpers.js'
```

### 5.6.7. `apps/cli-app` — Extend `store.ts` (Phase 5 file)

**`apps/cli-app/src/store.ts`** is the Phase 5 file that exports `useAgentStore`. Phase 5.6 **extends it in-place** — no new `store/` directory, no second Zustand store. Add `UiMessage` type and two new slices to the existing `AgentStore` interface and the existing `create(...)` call.

```typescript
// --- Phase 5.6 additions to apps/cli-app/src/store.ts ---

import type { CliSession } from '@agent/cli'

// New types (add at top of file):
export type UiMessageKind = 'user' | 'assistant' | 'notice' | 'error'

export interface UiMessage {
    id: string
    kind: UiMessageKind
    text: string
}

// New fields appended to existing AgentStore interface:
//
//   currentSession: CliSession | null
//   sessions: CliSession[]
//   uiMessages: UiMessage[]
//   setCurrentSession(session: CliSession | null): void
//   setSessions(sessions: CliSession[]): void
//   addUiMessage(kind: UiMessageKind, text: string): void
//   clearUiMessages(): void
//   setPauseReason(pr: PauseReason | null): void   // reuses existing pauseReason field; wraps set()

// Initializer additions inside create(...):
//
//   currentSession: null,
//   sessions: [],
//   uiMessages: [],
//   setCurrentSession: (session) => set({ currentSession: session }),
//   setSessions: (sessions) => set({ sessions }),
//   addUiMessage: (kind, text) => set(s => ({
//       uiMessages: [...s.uiMessages, { id: Math.random().toString(36).slice(2), kind, text }]
//   })),
//   clearUiMessages: () => set({ uiMessages: [] }),
//   setPauseReason: (pr) => set({ pauseReason: pr }),
```

> `useAgentStore` is the single export — unchanged name. `UiMessage` is imported from `'../store.js'` (or `'./store.js'`) by all consumers. No separate types file. UI-only transient state (e.g., text input value) stays local with `useState`.

### 5.6.8. `apps/cli-app` — Slash command parser

**`apps/cli-app/src/commands/parser.ts`**

```typescript
export type KnownCommandName =
    | 'help' | 'new' | 'sessions' | 'resume' | 'clear'
    | 'status' | 'model' | 'stream' | 'tools' | 'cwd'
    | 'cd' | 'config' | 'exit' | 'quit'

export interface ParsedCommand {
    name: KnownCommandName | 'unknown'
    raw: string
    args: string[]
}

const KNOWN: Set<string> = new Set([
    'help', 'new', 'sessions', 'resume', 'clear',
    'status', 'model', 'stream', 'tools', 'cwd',
    'cd', 'config', 'exit', 'quit'
])

export function parseSlashCommand(input: string): ParsedCommand | null {
    const trimmed = input.trim()
    if (!trimmed.startsWith('/')) return null

    const parts = trimmed.slice(1).split(/\s+/)
    const name = parts[0]?.toLowerCase() ?? ''
    const args = parts.slice(1)

    if (KNOWN.has(name)) {
        return { name: name as KnownCommandName, raw: trimmed, args }
    }
    return { name: 'unknown', raw: trimmed, args: [name, ...args] }
}
```

### 5.6.9. `apps/cli-app` — Command registry

**`apps/cli-app/src/commands/registry.ts`**

```typescript
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { CliSession } from '@agent/cli'
import { createSessionId, createThreadId, getSessionTitle, FsSessionStore } from '@agent/cli'
import type { ParsedCommand } from './parser.js'

export interface CommandContext {
    session: CliSession | null
    sessions: CliSession[]
    model: string
    apiKey: string | undefined
    stream: boolean
    cwd: string
    sessionStore: FsSessionStore
    agent: import('@agent/core').IAgent<any>
    addNotice(text: string): void
    addError(text: string): void
    clearMessages(): void
    setSession(session: CliSession): void
    setSessions(sessions: CliSession[]): void
    setModel(model: string): void
    setStream(on: boolean): void
    setCwd(cwd: string): void
    exit(): void
}

export async function executeCommand(
    cmd: ParsedCommand,
    ctx: CommandContext
): Promise<void> {
    switch (cmd.name) {
        case 'help':
            ctx.addNotice(HELP_TEXT)
            break

        case 'new': {
            const id = createSessionId()
            const threadId = createThreadId(id)
            const session = await ctx.sessionStore.create({
                id, threadId,
                title: 'New session',
                cwd: ctx.cwd,
                model: ctx.model,
                stream: ctx.stream,
                status: 'active'
            })
            ctx.setSession(session)
            ctx.clearMessages()
            ctx.addNotice(`Started new session ${id}`)
            break
        }

        case 'sessions': {
            const list = await ctx.sessionStore.list({ limit: 10 })
            ctx.setSessions(list)
            if (list.length === 0) {
                ctx.addNotice('No sessions found.')
            } else {
                ctx.addNotice(
                    list.map(s => `${s.id}  ${s.status.padEnd(10)}  ${s.title}`).join('\n')
                )
            }
            break
        }

        case 'resume': {
            const id = cmd.args[0]
            if (!id) {
                const list = await ctx.sessionStore.list({ limit: 10 })
                ctx.setSessions(list)
                if (list.length === 0) {
                    ctx.addNotice('No sessions. Use /new to start one.')
                } else {
                    ctx.addNotice(
                        'Recent sessions:\n' +
                        list.map(s => `  ${s.id}  ${s.status.padEnd(10)}  ${s.title}`).join('\n') +
                        '\n\nUse /resume <id> to load one.'
                    )
                }
                break
            }
            // Try exact match first, then prefix match
            let loaded: CliSession | undefined = await ctx.sessionStore.load(id)
            if (!loaded) {
                const prefixResult = await ctx.sessionStore.loadByPrefix(id)
                if (prefixResult.type === 'ambiguous') {
                    ctx.addError(`Ambiguous session id prefix "${id}" matches ${prefixResult.count} sessions. Use a longer prefix.`)
                    break
                }
                if (prefixResult.type === 'not-found') {
                    ctx.addError(`Session not found: ${id}`)
                    break
                }
                loaded = prefixResult.session
            }
            ctx.setSession(loaded)
            ctx.clearMessages()
            ctx.addNotice(`Resumed session ${loaded.id}: ${loaded.title}`)
            break
        }

        case 'clear':
            ctx.clearMessages()
            break

        case 'status': {
            const s = ctx.session
            ctx.addNotice(
                [
                    `model:      ${ctx.model}`,
                    `cwd:        ${ctx.cwd}`,
                    `session:    ${s ? s.id : 'none'}`,
                    `threadId:   ${s ? s.threadId : 'none'}`,
                    `stream:     ${ctx.stream}`,
                    `status:     ${s ? s.status : 'none'}`,
                    `pendingRun: ${s?.pendingRunId ?? 'none'}`
                ].join('\n')
            )
            break
        }

        case 'model': {
            const newModel = cmd.args[0]
            if (!newModel) {
                ctx.addNotice(`Current model: ${ctx.model}`)
            } else {
                ctx.setModel(newModel)
                if (ctx.session) {
                    const updated: CliSession = { ...ctx.session, model: newModel, updatedAt: new Date().toISOString() }
                    await ctx.sessionStore.save(updated)
                    ctx.setSession(updated)
                }
                ctx.addNotice(`Model set to ${newModel}`)
            }
            break
        }

        case 'stream': {
            const arg = cmd.args[0]?.toLowerCase()
            if (arg !== 'on' && arg !== 'off') {
                ctx.addError('Usage: /stream on|off')
                break
            }
            const on = arg === 'on'
            ctx.setStream(on)
            if (ctx.session) {
                const updated: CliSession = { ...ctx.session, stream: on, updatedAt: new Date().toISOString() }
                await ctx.sessionStore.save(updated)
                ctx.setSession(updated)
            }
            ctx.addNotice(`Streaming ${on ? 'enabled' : 'disabled'}`)
            break
        }

        case 'tools':
            ctx.addNotice(
                ctx.agent.tools.map(t => `  ${t.name}${Boolean(t.needsApproval) ? '  [approval]' : ''}`).join('\n')
            )
            break

        case 'cwd':
            ctx.addNotice(`cwd: ${ctx.cwd}`)
            break

        case 'cd': {
            const target = cmd.args[0]
            if (!target) { ctx.addError('Usage: /cd <path>'); break }
            const resolved = path.resolve(ctx.cwd, target)
            let stat: import('node:fs').Stats
            try {
                stat = await fs.stat(resolved)
            } catch {
                ctx.addError(`Directory not found: ${resolved}`)
                break
            }
            if (!stat.isDirectory()) {
                ctx.addError(`Not a directory: ${resolved}`)
                break
            }
            ctx.setCwd(resolved)
            if (ctx.session) {
                const updated: CliSession = { ...ctx.session, cwd: resolved, updatedAt: new Date().toISOString() }
                await ctx.sessionStore.save(updated)
                ctx.setSession(updated)
            }
            ctx.addNotice(`cwd changed to ${resolved}`)
            break
        }

        case 'config':
            ctx.addNotice(
                [
                    `model:   ${ctx.model}`,
                    `apiKey:  ${ctx.apiKey ? 'present' : 'missing'}`,
                    `stream:  ${ctx.stream}`,
                    `cwd:     ${ctx.cwd}`
                ].join('\n')
            )
            break

        case 'exit':
        case 'quit':
            ctx.exit()
            break

        case 'unknown':
        default:
            ctx.addError(`Unknown command: ${cmd.raw}. Type /help for available commands.`)
            break
    }
}

const HELP_TEXT = `
Available commands:
  /help               Show this help
  /new                Start a new session
  /sessions           List recent sessions
  /resume [id]        Resume session by id (omit id to list; prefix match supported)
  /clear              Clear chat display (memory unchanged)
  /status             Show current session info
  /model [id]         Show or set model
  /stream on|off      Enable or disable streaming
  /tools              List available tools
  /cwd                Show current working directory
  /cd <path>          Change working directory (must exist and be a directory)
  /config             Show config (api key hidden)
  /exit, /quit        Exit the app
`.trim()
```

### 5.6.10. `apps/cli-app` — App state and startup

**`apps/cli-app/src/app.tsx`** (additions and changes — existing structure from Phase 5 kept):

```typescript
import React, { useCallback, useState } from 'react'
import { useApp } from 'ink'
import * as path from 'node:path'
import * as os from 'node:os'
import { createOpenAI } from '@agent/openai'
import type { CliSession } from '@agent/cli'
import {
    createCliAgent, createCliContext, createCliTools, getDefaultCliSystemPrompt,
    FsMemoryStore, FsCheckpointStore, FsSessionStore,
    createSessionId, createThreadId, getSessionTitle
} from '@agent/cli'
import { useAgentStore } from './store.js'
import { parseSlashCommand } from './commands/parser.js'
import { executeCommand } from './commands/registry.js'
import { useAgent } from './hooks/useAgent.js'
import { StatusBar } from './components/StatusBar.js'
import { ChatHistory } from './components/ChatHistory.js'
import { InputBox } from './components/InputBox.js'
import { ApprovalModal } from './components/ApprovalModal.js'

// No agent prop — agent created internally via useMemo
interface AppProps {
    model: string
    apiKey: string | undefined
    baseURL?: string
    stream?: boolean
}

export default function App({ model: initialModel, apiKey, baseURL, stream: initialStream }: AppProps) {
    const { exit } = useApp()

    // Session/message state from the extended Phase 5 Zustand store
    const {
        pauseReason, pendingRunId,
        currentSession, setCurrentSession, sessions, setSessions,
        uiMessages, addUiMessage, clearUiMessages,
        setPauseReason
    } = useAgentStore()

    // UI config kept in local state (model/stream/cwd change via slash commands, not app re-mount)
    const [model, setModel] = useState(initialModel)
    const [stream, setStream] = useState(initialStream ?? true)
    const [cwd, setCwd] = useState(() => process.cwd())

    const dataDir = React.useMemo(() => path.join(os.homedir(), '.agent'), [])
    const sessionStore    = React.useMemo(() => new FsSessionStore(path.join(dataDir, 'sessions')), [dataDir])
    const memoryStore     = React.useMemo(() => new FsMemoryStore(path.join(dataDir, 'memory')), [dataDir])
    const checkpointStore = React.useMemo(() => new FsCheckpointStore(path.join(dataDir, 'checkpoints')), [dataDir])
    const context = React.useMemo(() => createCliContext({ cwd }), [cwd])
    const tools   = React.useMemo(() => createCliTools(), [])

    // agent = null when apiKey is missing; useAgent is null-safe
    const agent = React.useMemo(() => {
        if (!apiKey) return null
        return createCliAgent({
            name: 'cli-agent',
            engine: createOpenAI({ apiKey, baseURL }).engine(model),
            system: getDefaultCliSystemPrompt(cwd),
            tools,
            memory: memoryStore,
            checkpoints: checkpointStore
        })
        // cwd dep: system prompt changes with /cd; model dep: /model recreates engine
    }, [model, apiKey, baseURL, cwd, tools, memoryStore, checkpointStore])

    // Show error notice on startup if apiKey missing
    React.useEffect(() => {
        if (!apiKey) addUiMessage('error', 'No API key configured. Set OPENAI_API_KEY or pass --api-key.')
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const addNotice = (text: string) => addUiMessage('notice', text)
    const addError  = (text: string) => addUiMessage('error', text)

    const ensureSession = useCallback(async (firstPrompt: string): Promise<CliSession> => {
        if (currentSession) return currentSession
        const id = createSessionId()
        const threadId = createThreadId(id)
        const title = getSessionTitle(firstPrompt)
        const session = await sessionStore.create({
            id, threadId, title, cwd, model, stream, status: 'active'
        })
        setCurrentSession(session)
        return session
    }, [currentSession, cwd, model, stream, sessionStore, setCurrentSession])

    const { submitPrompt, resolveApproval, isRunning } = useAgent(
        agent, context, stream, currentSession,
        { onSessionUpdate: setCurrentSession, onPauseReason: setPauseReason, onError: addError, sessionStore }
    )

    // ApprovalModal uses Phase 5 onDecision API and reads pauseReason from store
    const handleApproval = useCallback((decision: 'allow' | 'deny') => {
        resolveApproval(decision)
    }, [resolveApproval])

    const handleSubmit = async (input: string) => {
        const cmd = parseSlashCommand(input)
        if (cmd) {
            await executeCommand(cmd, {
                session: currentSession, sessions, model, apiKey, stream, cwd,
                sessionStore, agent,
                addNotice, addError,
                clearMessages: clearUiMessages,
                setSession: setCurrentSession, setSessions, setModel, setStream, setCwd, exit
            })
            return
        }

        // Normal prompt — passes full session so useAgent extracts threadId without stale closure
        addUiMessage('user', input)
        const session = await ensureSession(input)
        submitPrompt(input, session)
    }

    return (
        <Box flexDirection="column" height="100%">
            <StatusBar model={model} cwd={cwd} session={currentSession} stream={stream} isRunning={isRunning} />
            <ChatHistory messages={uiMessages} agentEvents={[]} />
            {pauseReason ? (
                <ApprovalModal onDecision={handleApproval} />
            ) : (
                <InputBox onSubmit={handleSubmit} isRunning={isRunning} />
            )}
        </Box>
    )
}
```

> **Provider**: `createOpenAI({ apiKey, baseURL }).engine(model)` — same pattern as Phase 5, no raw SDK imports in `cli-app`. Agent deps include `cwd` so `/cd` → agent recreates → new system prompt for next prompt. Agent is `null` when `apiKey` is missing; `useAgent` is null-safe and `submitPrompt` is a no-op in that case.
>
> **ApprovalModal**: the Phase 5 component API is **kept** — `onDecision` prop, reads `pauseReason` from `useAgentStore()`. `useAgent` writes `pauseReason` to the store via `onPauseReason` callback. No migration of the component required.

### 5.6.11. `apps/cli-app` — useAgent hook (updated)

**`apps/cli-app/src/hooks/useAgent.ts`**

```typescript
import React from 'react'
import type { IAgent, AgentEvent } from '@agent/core'
import type { CliContext, CliSession, FsSessionStore } from '@agent/cli'
import type { PauseReason } from '@agent/core'

interface UseAgentOptions {
    onSessionUpdate(session: CliSession): void
    onPauseReason(pr: PauseReason | null): void  // writes to store so ApprovalModal can read it
    onError(msg: string): void
    sessionStore: FsSessionStore
}

export function useAgent(
    agent: IAgent<CliContext> | null,  // null when apiKey is missing
    context: CliContext,
    stream: boolean,
    currentSession: CliSession | null,
    options: UseAgentOptions
) {
    const [isRunning, setIsRunning] = React.useState(false)
    const [agentEvents, setAgentEvents] = React.useState<AgentEvent[]>([])

    // Refs keep latest values accessible inside handleEvent without stale closure
    const sessionRef = React.useRef<CliSession | null>(currentSession)
    React.useEffect(() => { sessionRef.current = currentSession }, [currentSession])

    const optionsRef = React.useRef(options)
    React.useEffect(() => { optionsRef.current = options }, [options])

    // Stores the PauseReason from the last approval.requested event — used by resolveApproval
    const approvalRef = React.useRef<PauseReason | null>(null)

    // updateSession: reads from sessionRef, patches, updates ref immediately, notifies store, persists.
    // Updating the ref immediately prevents run.started/approval.requested/run.completed from
    // overwriting each other before React re-renders.
    const updateSession = React.useCallback((patch: Partial<CliSession>) => {
        const session = sessionRef.current
        if (!session) return
        const updated: CliSession = { ...session, ...patch, updatedAt: new Date().toISOString() }
        sessionRef.current = updated  // immediate update prevents stale base in next event
        optionsRef.current.onSessionUpdate(updated)
        optionsRef.current.sessionStore.save(updated).catch(() => {})
    }, []) // stable — reads/writes via refs

    const handleEvent = React.useCallback((event: AgentEvent) => {
        setAgentEvents(prev => [...prev, event])

        if (event.type === 'run.started') {
            updateSession({ lastRunId: event.runId })
        }

        if (event.type === 'approval.requested') {
            // Build PauseReason from event fields — do NOT read event.pauseReason
            const pauseReason: PauseReason = {
                type: 'approval_required',
                approvalId: event.approvalId,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                input: event.input,
                message: event.message
            }
            approvalRef.current = pauseReason
            optionsRef.current.onPauseReason(pauseReason)  // writes to store → ApprovalModal renders
            updateSession({ pendingRunId: event.runId, status: 'paused' })
        }

        if (event.type === 'run.completed') {
            approvalRef.current = null
            optionsRef.current.onPauseReason(null)
            updateSession({ pendingRunId: undefined, status: 'completed' })
        }

        if (event.type === 'run.failed') {
            approvalRef.current = null
            optionsRef.current.onPauseReason(null)
            updateSession({ status: 'failed' })
        }

        if (event.type === 'run.cancelled') {
            approvalRef.current = null
            optionsRef.current.onPauseReason(null)
            updateSession({ status: 'cancelled' })
        }
    }, [updateSession]) // stable — updateSession is also stable

    // agent.execute returns AsyncGenerator<AgentEvent, RunResult> — iterate with for await
    // submitPrompt is a no-op when agent is null (missing apiKey)
    const submitPrompt = React.useCallback((prompt: string, session: CliSession) => {
        if (!agent) return
        setIsRunning(true)
        setAgentEvents([]);
        (async () => {
            try {
                for await (const event of agent.execute(prompt, { context, threadId: session.threadId, stream })) {
                    handleEvent(event)
                }
            } catch (err) {
                optionsRef.current.onError(err instanceof Error ? err.message : String(err))
            } finally {
                setIsRunning(false)
            }
        })()
    }, [agent, context, stream, handleEvent])

    // agent.resume returns Promise<RunResult> — called with await, onEvent passed as callback
    const resolveApproval = React.useCallback((decision: 'allow' | 'deny') => {
        const currentApproval = approvalRef.current
        const session = sessionRef.current
        if (!agent || !currentApproval || !session?.pendingRunId) {
            if (!agent) optionsRef.current.onError('No agent configured (missing API key)')
            else if (!session?.pendingRunId) optionsRef.current.onError('No pending run to resume')
            return
        }
        const pendingRunId = session.pendingRunId
        setIsRunning(true);
        (async () => {
            try {
                await agent.resume(
                    pendingRunId,
                    { approvalId: currentApproval.approvalId, decision },
                    { context, stream, onEvent: handleEvent }
                )
            } catch (err) {
                optionsRef.current.onError(err instanceof Error ? err.message : String(err))
            } finally {
                setIsRunning(false)
            }
        })()
    }, [agent, context, stream, handleEvent])

    return { isRunning, agentEvents, submitPrompt, resolveApproval }
}
```

> **API contracts**: `agent.execute` → `AsyncGenerator<AgentEvent, RunResult>`, iterated with `for await`. `agent.resume` → `Promise<RunResult>`, called with `await` + `onEvent: handleEvent`. `useAgent` accepts `null` agent (no-op). `updateSession` updates `sessionRef` immediately to avoid race between run events. `onPauseReason` writes to the store so `ApprovalModal` (which reads from `useAgentStore`) can react.

### 5.6.12. `apps/cli-app` — UI components (updated)

**`StatusBar.tsx`** additions:

```typescript
interface StatusBarProps {
    model: string
    cwd: string
    session: CliSession | null
    stream: boolean
    isRunning: boolean
    step?: number
    totalTokens?: number
}

// Display: model | basename(cwd) | session-title-or-short-id | status | stream:on/off | [running] | tokens
function StatusBar({ model, cwd, session, stream, isRunning, step, totalTokens }: StatusBarProps) {
    const cwdBase = path.basename(cwd) || cwd
    const sessionLabel = session
        ? (session.title !== 'New session' ? session.title.slice(0, 20) : session.id.slice(0, 8))
        : 'no session'
    const statusLabel = session?.status ?? ''

    return (
        <Box borderStyle="single" paddingX={1}>
            <Text color="cyan">{model}</Text>
            <Text> | </Text>
            <Text color="yellow">{cwdBase}</Text>
            <Text> | </Text>
            <Text color="green">{sessionLabel}</Text>
            {statusLabel ? <Text color="gray"> [{statusLabel}]</Text> : null}
            <Text> | stream:{stream ? 'on' : 'off'}</Text>
            {isRunning ? <Text color="magenta"> [running]</Text> : null}
            {totalTokens ? <Text color="gray"> tokens:{totalTokens}</Text> : null}
        </Box>
    )
}
```

**`ChatHistory.tsx`** — support `UiMessage` kinds:

```typescript
import type { UiMessage } from '../store/types.js'

function kindColor(kind: UiMessage['kind']): string {
    switch (kind) {
        case 'user':      return 'white'
        case 'assistant': return 'green'
        case 'notice':    return 'cyan'
        case 'error':     return 'red'
    }
}

function kindPrefix(kind: UiMessage['kind']): string {
    switch (kind) {
        case 'user':      return '> '
        case 'assistant': return ''
        case 'notice':    return '• '
        case 'error':     return '✗ '
    }
}
```

**`InputBox.tsx`** — command mode hint:

```typescript
// If value starts with '/', show dim hint text below input:
// "Command mode — type /help for available commands"
```

### 5.6.13. Tests — `@agent/cli`

**`packages/cli/src/session/__tests__/fs-session.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { FsSessionStore } from '../fs-session.js'

describe('FsSessionStore', () => {
    let tmpDir: string
    let store: FsSessionStore

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-sessions-'))
        store = new FsSessionStore(tmpDir)
    })
    afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }) })

    it('create and load round-trips', async () => {
        const s = await store.create({ id: 'abc', threadId: 'thread-abc', title: 'T', cwd: '/tmp', model: 'm', stream: true, status: 'active' })
        const loaded = await store.load('abc')
        expect(loaded).toMatchObject({ id: 'abc', title: 'T' })
        expect(loaded?.createdAt).toBeTruthy()
    })

    it('save updates updatedAt', async () => {
        const s = await store.create({ id: 'x', threadId: 'thread-x', title: 'X', cwd: '/', model: 'm', stream: false, status: 'active' })
        const updated = { ...s, title: 'Updated', updatedAt: new Date().toISOString() }
        await store.save(updated)
        const loaded = await store.load('x')
        expect(loaded?.title).toBe('Updated')
    })

    it('list sorted by updatedAt desc', async () => {
        await store.create({ id: 'a', threadId: 'ta', title: 'A', cwd: '/', model: 'm', stream: true, status: 'active' })
        await new Promise(r => setTimeout(r, 5))
        await store.create({ id: 'b', threadId: 'tb', title: 'B', cwd: '/', model: 'm', stream: true, status: 'active' })
        const list = await store.list()
        expect(list[0]?.id).toBe('b')
        expect(list[1]?.id).toBe('a')
    })

    it('list with limit', async () => {
        for (let i = 0; i < 5; i++) {
            await store.create({ id: `s${i}`, threadId: `t${i}`, title: `S${i}`, cwd: '/', model: 'm', stream: true, status: 'active' })
            await new Promise(r => setTimeout(r, 2))
        }
        const list = await store.list({ limit: 3 })
        expect(list).toHaveLength(3)
    })

    it('load returns undefined for missing id', async () => {
        expect(await store.load('nonexistent')).toBeUndefined()
    })

    it('delete removes file', async () => {
        await store.create({ id: 'del', threadId: 'tdel', title: 'D', cwd: '/', model: 'm', stream: true, status: 'active' })
        await store.delete('del')
        expect(await store.load('del')).toBeUndefined()
    })

    it('ids are file-safe (UUID format)', async () => {
        const { createSessionId } = await import('../helpers.js')
        const id = createSessionId()
        expect(id).toMatch(/^[0-9a-f-]+$/)
    })
})
```

**`packages/cli/src/session/__tests__/helpers.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { getSessionTitle, createThreadId } from '../helpers.js'

describe('getSessionTitle', () => {
    it('returns first 60 chars of single-line prompt', () => {
        const long = 'a'.repeat(100)
        expect(getSessionTitle(long)).toHaveLength(60)
    })

    it('collapses newlines to space', () => {
        expect(getSessionTitle('hello\nworld')).toBe('hello world')
    })

    it('returns "New session" for empty input', () => {
        expect(getSessionTitle('')).toBe('New session')
        expect(getSessionTitle('   \n  ')).toBe('New session')
    })

    it('createThreadId format', () => {
        expect(createThreadId('abc')).toBe('thread-abc')
    })
})
```

### 5.6.14. Tests — `apps/cli-app`

**`apps/cli-app/src/commands/__tests__/parser.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { parseSlashCommand } from '../parser.js'

describe('parseSlashCommand', () => {
    it('returns null for normal text', () => {
        expect(parseSlashCommand('hello')).toBeNull()
        expect(parseSlashCommand('')).toBeNull()
    })

    it('parses /resume with id', () => {
        const cmd = parseSlashCommand('/resume abc123')
        expect(cmd?.name).toBe('resume')
        expect(cmd?.args).toEqual(['abc123'])
    })

    it('parses /stream on', () => {
        const cmd = parseSlashCommand('/stream on')
        expect(cmd?.name).toBe('stream')
        expect(cmd?.args).toEqual(['on'])
    })

    it('parses /stream off', () => {
        const cmd = parseSlashCommand('/stream off')
        expect(cmd?.name).toBe('stream')
        expect(cmd?.args).toEqual(['off'])
    })

    it('parses /model with id', () => {
        const cmd = parseSlashCommand('/model gpt-4o')
        expect(cmd?.name).toBe('model')
        expect(cmd?.args).toEqual(['gpt-4o'])
    })

    it('returns unknown for unrecognized command', () => {
        const cmd = parseSlashCommand('/foobar')
        expect(cmd?.name).toBe('unknown')
        expect(cmd?.args[0]).toBe('foobar')
    })

    it('is case-insensitive for command name', () => {
        expect(parseSlashCommand('/HELP')?.name).toBe('help')
        expect(parseSlashCommand('/New')?.name).toBe('new')
    })
})
```

**`apps/cli-app/src/commands/__tests__/registry.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeCommand } from '../registry.js'
import { parseSlashCommand } from '../parser.js'
import type { CommandContext } from '../registry.js'

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
    return {
        session: null,
        sessions: [],
        model: 'claude-opus-4-7',
        apiKey: 'sk-test',
        stream: true,
        cwd: '/tmp',
        sessionStore: {
            create: vi.fn().mockResolvedValue({ id: 'new-id', threadId: 'thread-new-id', title: 'X', cwd: '/tmp', model: 'claude-opus-4-7', stream: true, status: 'active', createdAt: '', updatedAt: '' }),
            save: vi.fn().mockResolvedValue(undefined),
            load: vi.fn().mockResolvedValue(undefined),
            list: vi.fn().mockResolvedValue([]),
            delete: vi.fn().mockResolvedValue(undefined)
        } as any,
        agent: { tools: [] } as any,
        addNotice: vi.fn(),
        addError: vi.fn(),
        clearMessages: vi.fn(),
        setSession: vi.fn(),
        setSessions: vi.fn(),
        setModel: vi.fn(),
        setStream: vi.fn(),
        setCwd: vi.fn(),
        exit: vi.fn(),
        ...overrides
    }
}

describe('command registry', () => {
    it('/new creates session and clears messages', async () => {
        const ctx = makeCtx()
        await executeCommand(parseSlashCommand('/new')!, ctx)
        expect(ctx.sessionStore.create).toHaveBeenCalled()
        expect(ctx.clearMessages).toHaveBeenCalled()
        expect(ctx.setSession).toHaveBeenCalled()
    })

    it('/resume loads session by id', async () => {
        const loaded = { id: 'abc', threadId: 'thread-abc', title: 'T', cwd: '/', model: 'm', stream: true, status: 'active', createdAt: '', updatedAt: '' }
        const ctx = makeCtx({ sessionStore: { load: vi.fn().mockResolvedValue(loaded) } as any })
        await executeCommand(parseSlashCommand('/resume abc')!, ctx)
        expect(ctx.setSession).toHaveBeenCalledWith(loaded)
        expect(ctx.clearMessages).toHaveBeenCalled()
    })

    it('/resume with missing id shows error', async () => {
        const ctx = makeCtx({ sessionStore: { load: vi.fn().mockResolvedValue(undefined), list: vi.fn().mockResolvedValue([]) } as any })
        await executeCommand(parseSlashCommand('/resume missing')!, ctx)
        expect(ctx.addError).toHaveBeenCalledWith(expect.stringContaining('not found'))
    })

    it('/clear clears messages only', async () => {
        const ctx = makeCtx()
        await executeCommand(parseSlashCommand('/clear')!, ctx)
        expect(ctx.clearMessages).toHaveBeenCalled()
        expect(ctx.setSession).not.toHaveBeenCalled()
    })

    it('/config masks api key', async () => {
        const ctx = makeCtx({ apiKey: 'sk-secret' })
        await executeCommand(parseSlashCommand('/config')!, ctx)
        const notice: string = (ctx.addNotice as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(notice).toContain('present')
        expect(notice).not.toContain('sk-secret')
    })

    it('/cd resolves path and updates cwd', async () => {
        const ctx = makeCtx({ cwd: '/home/user' })
        await executeCommand(parseSlashCommand('/cd projects')!, ctx)
        expect(ctx.setCwd).toHaveBeenCalledWith(expect.stringContaining('projects'))
    })

    it('/model without arg shows current model', async () => {
        const ctx = makeCtx({ model: 'claude-opus-4-7' })
        await executeCommand(parseSlashCommand('/model')!, ctx)
        const notice: string = (ctx.addNotice as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(notice).toContain('claude-opus-4-7')
    })

    it('/stream off disables streaming', async () => {
        const ctx = makeCtx({ stream: true })
        await executeCommand(parseSlashCommand('/stream off')!, ctx)
        expect(ctx.setStream).toHaveBeenCalledWith(false)
    })

    it('/stream with bad arg shows error', async () => {
        const ctx = makeCtx()
        await executeCommand(parseSlashCommand('/stream maybe')!, ctx)
        expect(ctx.addError).toHaveBeenCalled()
    })
})
```

**`apps/cli-app/src/hooks/__tests__/useAgent.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAgent } from '../useAgent.js'
import type { CliContext, CliSession } from '@agent/cli'

// agent.execute returns AsyncGenerator<AgentEvent, RunResult>
async function* makeExecuteGen(events: any[] = []) {
    for (const event of events) yield event
    return {} // RunResult
}

async function* makeThrowingGen() {
    throw new Error('boom')
    yield undefined as any
}

function makeAgent(events: any[] = [], throwOnExecute = false) {
    return {
        execute: vi.fn(() => throwOnExecute ? makeThrowingGen() : makeExecuteGen(events)),
        // agent.resume returns Promise<RunResult>, not AsyncGenerator
        resume: vi.fn().mockResolvedValue({}),
        tools: []
    } as any
}

function makeSession(overrides: Partial<CliSession> = {}): CliSession {
    return {
        id: 'sid', threadId: 'thread-sid', title: 'T', cwd: '/', model: 'm',
        stream: true, status: 'active', createdAt: '', updatedAt: '', ...overrides
    }
}

const context = {} as CliContext
const baseOptions = {
    onSessionUpdate: vi.fn(),
    onError: vi.fn(),
    sessionStore: { save: vi.fn().mockResolvedValue(undefined) } as any
}

describe('useAgent', () => {
    it('submitPrompt passes session.threadId to agent.execute', async () => {
        const agent = makeAgent()
        const session = makeSession()
        const { result } = renderHook(() => useAgent(agent, context, true, session, baseOptions))
        act(() => { result.current.submitPrompt('hello', session) })
        await vi.waitFor(() =>
            expect(agent.execute).toHaveBeenCalledWith('hello', expect.objectContaining({ threadId: 'thread-sid' }))
        )
    })

    it('execute error becomes onError, not unhandled rejection', async () => {
        const agent = makeAgent([], true)
        const session = makeSession()
        const opts = { ...baseOptions, onError: vi.fn() }
        const { result } = renderHook(() => useAgent(agent, context, true, session, opts))
        act(() => { result.current.submitPrompt('hello', session) })
        await vi.waitFor(() => expect(opts.onError).toHaveBeenCalledWith('boom'))
    })

    it('approval.requested sets approval from event fields (not event.pauseReason)', async () => {
        const approvalEvent = {
            type: 'approval.requested',
            runId: 'run-1',
            approvalId: 'ap1',
            toolCallId: 'tc1',
            toolName: 'shell_exec',
            input: { command: 'ls' },
            message: undefined
        }
        const agent = makeAgent([approvalEvent])
        const session = makeSession()
        const opts = {
            onSessionUpdate: vi.fn(),
            onError: vi.fn(),
            sessionStore: { save: vi.fn().mockResolvedValue(undefined) } as any
        }
        const { result } = renderHook(() => useAgent(agent, context, true, session, opts))
        act(() => { result.current.submitPrompt('hello', session) })
        await vi.waitFor(() => expect(result.current.approval).not.toBeNull())
        expect(result.current.approval?.approvalId).toBe('ap1')
        expect(result.current.approval?.toolName).toBe('shell_exec')
        expect(opts.onSessionUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'paused', pendingRunId: 'run-1' })
        )
    })

    it('run.completed clears pendingRunId and sets status completed', async () => {
        const completedEvent = { type: 'run.completed', runId: 'run-1' }
        const agent = makeAgent([completedEvent])
        const session = makeSession({ pendingRunId: 'run-1', status: 'paused' })
        const opts = {
            onSessionUpdate: vi.fn(),
            onError: vi.fn(),
            sessionStore: { save: vi.fn().mockResolvedValue(undefined) } as any
        }
        const { result } = renderHook(() => useAgent(agent, context, true, session, opts))
        act(() => { result.current.submitPrompt('hello', session) })
        await vi.waitFor(() =>
            expect(opts.onSessionUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'completed', pendingRunId: undefined })
            )
        )
    })

    it('resolveApproval calls agent.resume with onEvent callback (not for-await)', async () => {
        // First get approval state set via an approval event
        const approvalEvent = {
            type: 'approval.requested', runId: 'run-1',
            approvalId: 'ap1', toolCallId: 'tc1', toolName: 'shell_exec', input: {}
        }
        const agent = makeAgent([approvalEvent])
        const session = makeSession({ pendingRunId: 'run-1' })
        const opts = {
            onSessionUpdate: vi.fn(),
            onError: vi.fn(),
            sessionStore: { save: vi.fn().mockResolvedValue(undefined) } as any
        }
        const { result } = renderHook(() => useAgent(agent, context, true, session, opts))
        act(() => { result.current.submitPrompt('hello', session) })
        await vi.waitFor(() => expect(result.current.approval).not.toBeNull())
        act(() => { result.current.resolveApproval('allow') })
        await vi.waitFor(() =>
            expect(agent.resume).toHaveBeenCalledWith(
                'run-1',
                { approvalId: 'ap1', decision: 'allow' },
                expect.objectContaining({ onEvent: expect.any(Function) })
            )
        )
    })

    it('resolveApproval shows error if pendingRunId missing', async () => {
        const agent = makeAgent()
        const session = makeSession({ pendingRunId: undefined })
        const opts = { ...baseOptions, onError: vi.fn() }
        const { result } = renderHook(() => useAgent(agent, context, true, session, opts))
        // resolveApproval with no approval state — approval is null, so returns early without calling resume
        act(() => { result.current.resolveApproval('allow') })
        expect(agent.resume).not.toHaveBeenCalled()
    })
})
```

### 5.6.15. Checklist Phase 5.6

**`@agent/cli` — session store**
- [ ] `CliSession` / `CliSessionStatus` — exported from `@agent/cli`
- [ ] `FsSessionStore.create/load/save/list/delete` — list sorted by `updatedAt` desc; file-safe IDs (UUID)
- [ ] `FsSessionStore.loadByPrefix(prefix)` — returns `{ type: 'found'; session } | { type: 'ambiguous'; count } | { type: 'not-found' }`; ambiguous if prefix matches >1 session
- [ ] `createSessionId` / `createThreadId` / `getSessionTitle` — exported from `@agent/cli`
- [ ] `getSessionTitle` — deterministic, no LLM call, ≤60 chars, collapses newlines, fallback "New session"

**`apps/cli-app` — store and types**
- [ ] `UiMessage` / `UiMessageKind` defined in `store/types.ts`, not in `app.tsx`; imported from `store/types.ts` by all consumers
- [ ] Phase 5 Zustand store extended with `SessionSlice` + `MessagesSlice` — no `useState` for session/messages data

**`apps/cli-app` — command parser and registry**
- [ ] `parseSlashCommand` — returns `ParsedCommand | null`; case-insensitive name; unknown → `{ name: 'unknown' }`
- [ ] `CommandContext.apiKey` typed as `string | undefined`
- [ ] `/config` — masks apiKey (shows `present` / `missing`, never the value)
- [ ] `/stream on|off` — validates arg, shows error on bad input
- [ ] `/resume <id>` — exact match via `load`, then prefix match via `loadByPrefix`; shows full session id; ambiguous prefix → error with count; missing → error
- [ ] `/resume` with no id — lists recent sessions with full ids
- [ ] `/new` — creates session + threadId, clears UI messages
- [ ] `/cd` — resolves path, checks `fs.stat` (errors if missing or not a directory); after cwd change: `context` and `agent` useMemos recreate → next prompt uses new cwd and updated system prompt
- [ ] `/model` no arg — shows current; with arg — sets model; agent useMemo recreates → next prompt uses new model
- [ ] `/tools` — uses `Boolean(t.needsApproval)`

**`apps/cli-app` — App**
- [ ] `App` has no `agent` prop; agent created via `createCliAgent(config)` inside `React.useMemo`
- [ ] Agent config: `engine` = `OpenAIEngine`, `system` = `getDefaultCliSystemPrompt(cwd)`, `memory` = `FsMemoryStore`, `checkpoints` = `FsCheckpointStore`, `tools`
- [ ] Agent useMemo deps include `model`, `apiKey`, `baseURL`, `cwd`, `tools`, `memoryStore`, `checkpointStore`
- [ ] `submitPrompt(input, session)` receives full `CliSession` — threadId extracted inside `useAgent`, no stale closure
- [ ] `ensureSession` — creates session lazily on first prompt if none active

**`apps/cli-app` — useAgent**
- [ ] `UseAgentOptions`: `onSessionUpdate`, `onError`, `sessionStore` only
- [ ] `handleEvent` reads session/options via `sessionRef` / `optionsRef` — stable callback, no stale closure
- [ ] `submitPrompt(prompt, session)` — async IIFE, `for await (event of agent.execute(prompt, { context, threadId: session.threadId, stream }))`, errors → `onError`
- [ ] `resolveApproval` — `await agent.resume(pendingRunId, { approvalId, decision }, { context, stream, onEvent: handleEvent })`; errors if `pendingRunId` missing or agent throws
- [ ] `approval.requested` event: builds `PauseReason` from `event.approvalId/toolCallId/toolName/input/message` directly — not `event.pauseReason`
- [ ] `run.completed` → clears `pendingRunId`, sets `status: completed`, saves session
- [ ] `run.failed` / `run.cancelled` → updates session status, saves session
- [ ] No access to agent private fields

**`apps/cli-app` — UI**
- [ ] `StatusBar` — model, cwd basename, session title/short-id, status, stream indicator, running state
- [ ] `ChatHistory` — `user` / `assistant` / `notice` / `error` kinds with distinct colors; imports `UiMessage` from `store/types.ts`
- [ ] `InputBox` — command mode hint when input starts with `/`
- [ ] `ApprovalModal` — props unchanged from Phase 5 (`approval: PauseReason`, `onResolve: (decision) => void`)

**Persistence**
- [ ] Session metadata in `FsSessionStore`; messages in `FsMemoryStore` by `threadId` — no duplication

**Tests**
- [ ] `FsSessionStore` — CRUD + list sort + limit + missing load + delete
- [ ] `FsSessionStore.loadByPrefix` — found / ambiguous / not-found cases
- [ ] `getSessionTitle` — empty, long, newlines
- [ ] `parseSlashCommand` — known, unknown, case-insensitive, with/without args
- [ ] Registry — `/new`, `/resume` (found/ambiguous/missing), `/clear`, `/config`, `/cd`, `/model`, `/stream`
- [ ] `useAgent` — `submitPrompt` passes `session.threadId`; error → `onError`; approval fields (not `.pauseReason`); completed event; `resolveApproval` calls `agent.resume` with `onEvent`

**Verification**
- `npx nx run @agent/cli:test --skip-nx-cache`
- `npx nx run @agent/cli:typecheck --skip-nx-cache`
- `npx nx run @agent/cli:build --skip-nx-cache`
- `npx nx run @agent/cli-app:typecheck --skip-nx-cache`
- `npx nx run @agent/cli-app:build --skip-nx-cache`

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
