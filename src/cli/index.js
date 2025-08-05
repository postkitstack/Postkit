#!/usr/bin/env node

const { Command } = require('commander');
const packageJson = require('../../package.json');

const initCommand = require('./commands/init');
const startCommand = require('./commands/start');
const restartCommand = require('./commands/restart');
const createCommand = require('./commands/create');
const migrateCommand = require('./commands/migrate');
const migrateCreateCommand = require('./commands/migrate-create');
const migrateUpCommand = require('./commands/migrate-up');
const migrateDownCommand = require('./commands/migrate-down');
const migrateStatusCommand = require('./commands/migrate-status');
const authImportCommand = require('./commands/auth-import');
const authExportCommand = require('./commands/auth-export');
const helpCommand = require('./commands/help');

const program = new Command();

program
  .name('postkit')
  .description('CLI tool for managing PostKit projects with the Appri stack')
  .version(packageJson.version);

program
  .command('init')
  .argument('<project-name>', 'name of the project to create')
  .description('Initialize a new PostKit project')
  .option('-t, --template <template>', 'template to use', 'default')
  .option('--with-worker', 'include Graphile Worker service', true)
  .option('--with-storage', 'include PG-Storage service', true)
  .option('--with-functions', 'include Functions Runtime service', true)
  .option('--skip-docker', 'skip Docker Compose startup', false)
  .action(initCommand);

program
  .command('start')
  .description('Start services')
  .option('--dev', 'start in development mode', false)
  .option('--prod', 'start in production mode', false)
  .option('-d, --detached', 'run in detached mode', true)
  .option('-s, --services <services>', 'specific services to start (comma-separated)')
  .action(startCommand);

program
  .command('restart')
  .argument('<service>', 'name of the service to restart')
  .description('Restart a specific service')
  .action(restartCommand);

program
  .command('create')
  .description('Create new project components')
  .addCommand(
    new Command('task')
      .argument('<task-name>', 'name of the task to create')
      .description('Create a new Graphile Worker task')
      .action((taskName) => createCommand('task', taskName))
  )
  .addCommand(
    new Command('function')
      .argument('<function-name>', 'name of the function to create')
      .description('Create a new serverless function')
      .option('-t, --typescript', 'create TypeScript function', false)
      .action((functionName, options) => createCommand('function', functionName, options))
  )

program
  .command('migrate')
  .description('Run database migrations')
  .option('--up', 'run up migrations (default)', true)
  .option('--down', 'run down migrations', false)
  .option('--status', 'show migration status', false)
  .action(migrateCommand);

// New dbmate-powered migration commands
program
  .command('migrate:create')
  .argument('<name>', 'migration name')
  .description('Create a new migration file using dbmate')
  .action(migrateCreateCommand);

program
  .command('migrate:up')
  .description('Apply pending migrations using dbmate')
  .option('--url <url>', 'database URL (defaults to DATABASE_URL env var)')
  .action(migrateUpCommand);

program
  .command('migrate:down')
  .description('Rollback the last migration using dbmate')
  .option('--url <url>', 'database URL (defaults to DATABASE_URL env var)')
  .option('--force', 'skip confirmation prompt')
  .action(migrateDownCommand);

program
  .command('migrate:status')
  .description('Show migration status using dbmate')
  .option('--url <url>', 'database URL (defaults to DATABASE_URL env var)')
  .action(migrateStatusCommand);

program
  .command('auth:import')
  .argument('<realm-file>', 'path to Keycloak realm JSON file')
  .description('Import Keycloak realm configuration')
  .option('--keycloak-url <url>', 'Keycloak URL (defaults to http://auth.localhost)')
  .option('--admin-user <user>', 'admin username (defaults to admin)')
  .option('--admin-pass <pass>', 'admin password (defaults to admin)')
  .action(authImportCommand);

program
  .command('auth:export')
  .argument('<realm-name>', 'name of the Keycloak realm to export')
  .description('Export Keycloak realm configuration to auth/config folder')
  .option('--keycloak-url <url>', 'Keycloak URL (defaults to http://auth.localhost)')
  .option('--admin-user <user>', 'admin username (defaults to admin)')
  .option('--admin-pass <pass>', 'admin password (defaults to admin)')
  .option('-o, --output <path>', 'output file path (defaults to auth/config/<realm-name>.json)')
  .action(authExportCommand);

program
  .command('help')
  .argument('[command]', 'command to get help for')
  .description('Show detailed help for PostKit CLI commands')
  .action(helpCommand);

// Legacy commands for backward compatibility
program
  .command('dev')
  .description('Start development environment (legacy)')
  .option('-d, --detached', 'run in detached mode', false)
  .action((options) => startCommand({ dev: true, detached: options.detached }));

program
  .command('prod')
  .description('Start production environment (legacy)')
  .option('-d, --detached', 'run in detached mode', false)
  .action((options) => startCommand({ prod: true, detached: options.detached }));

program.parse();