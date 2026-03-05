#!/usr/bin/env node

import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { planCommand } from './commands/plan.js';
import { applyCommand } from './commands/apply.js';
import { commitCommand } from './commands/commit.js';
import { statusCommand } from './commands/status.js';
import { abortCommand } from './commands/abort.js';
import { grantsCommand } from './commands/grants.js';

const program = new Command();

program
  .name('migr')
  .description('Session-based database migration CLI tool')
  .version('1.0.0');

// Global options
program
  .option('-v, --verbose', 'Enable verbose output')
  .option('--dry-run', 'Show what would be done without making changes');

// Start command
program
  .command('start')
  .description('Clone remote database to local and start a migration session')
  .action(async () => {
    const options = program.opts();
    await startCommand(options);
  });

// Plan command
program
  .command('plan')
  .description('Generate schema diff (shows what will change)')
  .action(async () => {
    const options = program.opts();
    await planCommand(options);
  });

// Apply command
program
  .command('apply')
  .description('Apply schema changes to local cloned database')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (cmdOptions) => {
    const options = { ...program.opts(), ...cmdOptions };
    await applyCommand(options);
  });

// Commit command
program
  .command('commit <description>')
  .description('Create migration file and apply to remote database')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (description, cmdOptions) => {
    const options = { ...program.opts(), ...cmdOptions };
    await commitCommand(description, options);
  });

// Status command
program
  .command('status')
  .description('Show current session state and pending changes')
  .action(async () => {
    const options = program.opts();
    await statusCommand(options);
  });

// Abort command
program
  .command('abort')
  .description('Cancel session and cleanup local clone')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (cmdOptions) => {
    const options = { ...program.opts(), ...cmdOptions };
    await abortCommand(options);
  });

// Grants command
program
  .command('grants')
  .description('Regenerate and show grant statements')
  .option('--apply', 'Apply grants to database')
  .option('--target <target>', 'Target database: local or remote', 'local')
  .action(async (cmdOptions) => {
    const options = { ...program.opts(), ...cmdOptions };
    await grantsCommand(options);
  });

// Parse and run
program.parse();
