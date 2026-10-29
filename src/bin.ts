#!/usr/bin/env node
import { EXIT_ERROR, runCli } from './cli.js';

try {
  process.exitCode = runCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
} catch {
  // runCli already turns errors into EXIT_ERROR; this only guards the I/O wiring.
  process.exitCode = EXIT_ERROR;
}
