#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import { runCli } from '../../dist/apps/cli-app/cli.js'

export * from '../../dist/apps/cli-app/cli.js'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli()
}
