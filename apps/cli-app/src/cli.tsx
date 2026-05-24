import { render } from 'ink';
import { Command } from 'commander';
import { pathToFileURL } from 'node:url';
import { App } from './app.js';

export function runCli(argv = process.argv): void {
    const program = new Command();

    program
        .name('agent')
        .description('Interactive AI agent CLI')
        .version('0.1.0')
        .option('-m, --model <model>', 'Model override')
        .option('-k, --api-key <key>', 'OpenAI API key (default: $OPENAI_API_KEY)')
        .option('-b, --base-url <url>', 'OpenAI-compatible API base URL')
        .option('--stream', 'Enable streaming output')
        .action((options: { model?: string; stream?: boolean; apiKey?: string; baseUrl?: string }) => {
            render(<App model={options.model} stream={options.stream} apiKey={options.apiKey} baseURL={options.baseUrl} />, {
                exitOnCtrlC: true
            });
        });

    program.parse(argv);
}

if (isDirectEntry()) {
    runCli();
}

function isDirectEntry(): boolean {
    return process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
}
