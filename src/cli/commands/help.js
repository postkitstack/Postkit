const chalk = require('chalk');
const logger = require('../utils/logger');

function helpCommand(command) {
  logger.header('PostKit CLI Help');
  
  if (command) {
    showCommandHelp(command);
  } else {
    showGeneralHelp();
  }
}

function showGeneralHelp() {
  console.log(chalk.cyan('\n🚀 PostKit CLI - Comprehensive Project Management\n'));
  
  console.log(chalk.yellow('PROJECT MANAGEMENT:'));
  console.log('  postkit init <project-name>     Initialize a new PostKit project');
  console.log('  postkit start [options]         Start services');
  console.log('  postkit restart <service>       Restart a specific service');
  console.log('  postkit dev                     Start development environment');
  console.log('  postkit prod                    Start production environment');
  
  console.log(chalk.yellow('\nDATABASE OPERATIONS:'));
  console.log('  postkit migrate:create <name>   Create a new migration file');
  console.log('  postkit migrate:up              Apply pending migrations');
  console.log('  postkit migrate:down            Rollback the last migration');
  console.log('  postkit migrate:status          Show migration status');
  console.log('  postkit migrate                 Run migrations (legacy)');
  
  console.log(chalk.yellow('\nAUTHENTICATION MANAGEMENT:'));
  console.log('  postkit auth:import <file>      Import Keycloak realm configuration');
  console.log('  postkit auth:export <realm>     Export Keycloak realm configuration');
  
  console.log(chalk.yellow('\nDEVELOPMENT TOOLS:'));
  console.log('  postkit create task <name>      Create a new Graphile Worker task');
  console.log('  postkit create function <name>  Create a new serverless function');
  
  console.log(chalk.yellow('\nCLI HELP:'));
  console.log('  postkit help                    Show this help message');
  console.log('  postkit help <command>          Show detailed help for a command');
  console.log('  postkit --help                  Show basic CLI usage');
  console.log('  postkit --version               Show CLI version');
  
  console.log(chalk.green('\n📖 For detailed command options, use: postkit <command> --help'));
  console.log(chalk.green('📚 Full documentation: https://github.com/your-org/postkit\n'));
}

function showCommandHelp(command) {
  const helpTexts = {
    'init': {
      description: 'Initialize a new PostKit project with the Appri stack',
      usage: 'postkit init <project-name> [options]',
      options: [
        '--with-worker          Include Graphile Worker service (default: true)',
        '--with-storage         Include PG-Storage service (default: true)', 
        '--with-functions       Include Functions Runtime service (default: true)',
        '--skip-docker          Skip Docker Compose startup (default: false)'
      ],
      examples: [
        'postkit init my-awesome-api',
        'postkit init blog-api --skip-docker',
        'postkit init minimal-api --no-with-worker --no-with-storage'
      ]
    },
    'start': {
      description: 'Start project services using Docker Compose',
      usage: 'postkit start [options]',
      options: [
        '--dev                  Start in development mode',
        '--prod                 Start in production mode',
        '-d, --detached         Run in detached mode (default: true)',
        '-s, --services <list>  Start specific services (comma-separated)'
      ],
      examples: [
        'postkit start',
        'postkit start --dev',
        'postkit start --services auth,db'
      ]
    },
    'migrate:create': {
      description: 'Create a new database migration file using dbmate',
      usage: 'postkit migrate:create <migration-name>',
      examples: [
        'postkit migrate:create add_users_table',
        'postkit migrate:create update_product_schema'
      ]
    },
    'auth:import': {
      description: 'Import Keycloak realm configuration from JSON file',
      usage: 'postkit auth:import <realm-file> [options]',
      options: [
        '--keycloak-url <url>   Keycloak URL (default: http://auth.localhost)',
        '--admin-user <user>    Admin username (default: admin)',
        '--admin-pass <pass>    Admin password (default: admin)'
      ],
      examples: [
        'postkit auth:import realm.json',
        'postkit auth:import production-realm.json --keycloak-url https://auth.myapp.com'
      ]
    },
    'auth:export': {
      description: 'Export Keycloak realm configuration to JSON file',
      usage: 'postkit auth:export <realm-name> [options]',
      options: [
        '--keycloak-url <url>   Keycloak URL (default: http://auth.localhost)',
        '--admin-user <user>    Admin username (default: admin)',
        '--admin-pass <pass>    Admin password (default: admin)',
        '-o, --output <path>    Output file path (default: auth/config/<realm>.json)'
      ],
      examples: [
        'postkit auth:export my-realm',
        'postkit auth:export production --output ./backups/prod-realm.json'
      ]
    },
    'create': {
      description: 'Create new project components',
      usage: 'postkit create <type> <name> [options]',
      subcommands: [
        'task <name>            Create a new Graphile Worker task',
        'function <name>        Create a new serverless function'
      ],
      options: [
        '--typescript           Create TypeScript function (for functions only)'
      ],
      examples: [
        'postkit create task send-email',
        'postkit create function user-profile',
        'postkit create function webhook-handler --typescript'
      ]
    }
  };
  
  const help = helpTexts[command];
  
  if (!help) {
    console.log(chalk.red(`\n❌ No help available for command: ${command}`));
    console.log(chalk.yellow('Available commands:'));
    Object.keys(helpTexts).forEach(cmd => {
      console.log(`  ${cmd}`);
    });
    console.log(chalk.green('\nUse "postkit help" to see all commands.\n'));
    return;
  }
  
  console.log(chalk.cyan(`\n📖 Help for: ${chalk.bold(command)}\n`));
  console.log(chalk.white(help.description));
  
  console.log(chalk.yellow('\nUSAGE:'));
  console.log(`  ${help.usage}`);
  
  if (help.subcommands) {
    console.log(chalk.yellow('\nSUBCOMMANDS:'));
    help.subcommands.forEach(sub => console.log(`  ${sub}`));
  }
  
  if (help.options) {
    console.log(chalk.yellow('\nOPTIONS:'));
    help.options.forEach(opt => console.log(`  ${opt}`));
  }
  
  if (help.examples) {
    console.log(chalk.yellow('\nEXAMPLES:'));
    help.examples.forEach(example => console.log(`  ${chalk.dim('$')} ${example}`));
  }
  
  console.log(chalk.green(`\nFor more options: postkit ${command} --help\n`));
}

module.exports = helpCommand;