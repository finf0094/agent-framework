import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { AgentContext } from '@agent/core';

const execAsync = promisify(exec);

export interface CliShell {
    readonly cwd: string;
    exec(command: string): Promise<{ stdout: string; stderr: string }>;
}

export interface CliFs {
    read(filePath: string): Promise<string>;
    write(filePath: string, content: string): Promise<void>;
    list(dirPath: string): Promise<string[]>;
}

export interface CliContext extends AgentContext {
    shell: CliShell;
    fs: CliFs;
}

export function createCliContext(options: { cwd?: string } = {}): CliContext {
    const cwd = path.resolve(options.cwd ?? process.cwd());

    return {
        shell: {
            cwd,
            async exec(command) {
                const result = await execAsync(command, { cwd, encoding: 'utf8' });
                return {
                    stdout: String(result.stdout),
                    stderr: String(result.stderr)
                };
            }
        },
        fs: {
            async read(filePath) {
                return fs.readFile(path.resolve(cwd, filePath), 'utf8');
            },
            async write(filePath, content) {
                const target = path.resolve(cwd, filePath);
                await fs.mkdir(path.dirname(target), { recursive: true });
                await fs.writeFile(target, content, 'utf8');
            },
            async list(dirPath) {
                const entries = await fs.readdir(path.resolve(cwd, dirPath), { withFileTypes: true });
                return entries.map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`);
            }
        }
    };
}
