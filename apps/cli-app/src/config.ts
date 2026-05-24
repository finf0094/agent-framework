import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface CliAppConfig {
    apiKey?: string
    baseURL?: string
    model?: string
    stream?: boolean
    dataDir?: string
}

export const DEFAULT_AGENT_DIR = path.join(os.homedir(), '.agent')
export const DEFAULT_CONFIG_PATH = path.join(DEFAULT_AGENT_DIR, 'config.json')

export function loadCliAppConfig(configPath = DEFAULT_CONFIG_PATH): CliAppConfig {
    if (!fs.existsSync(configPath)) return {}

    const content = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(content) as Record<string, unknown>

    return {
        apiKey: readString(parsed.apiKey),
        baseURL: readString(parsed.baseURL ?? parsed.baseUrl),
        model: readString(parsed.model),
        stream: typeof parsed.stream === 'boolean' ? parsed.stream : undefined,
        dataDir: readString(parsed.dataDir),
    }
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined
}
