import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { getSession, formatSessionDuration } from '../utils/session.js';
import { testConnection, getTableCount } from '../services/database.js';
import { getPlanFileContent } from '../services/pgschema.js';
import { runDbmateStatus } from '../services/dbmate.js';
import type { CommandOptions } from '../types/index.js';

export async function statusCommand(options: CommandOptions): Promise<void> {
  try {
    const session = await getSession();

    logger.heading('Migration Session Status');

    if (!session || !session.active) {
      logger.info('No active migration session.');
      logger.blank();
      logger.info('Run "npm run migr start" to begin a new session.');

      // Show dbmate status anyway
      if (options.verbose) {
        await showDbmateStatus();
      }

      return;
    }

    // Session info
    logger.info('Session Information:');
    logger.blank();

    const rows: string[][] = [
      ['Status', chalk.green('Active')],
      ['Started', session.startedAt],
      ['Duration', formatSessionDuration(session.startedAt)],
      ['Snapshot', session.remoteSnapshot],
    ];

    logger.table(['Property', 'Value'], rows);

    logger.blank();

    // Pending changes
    logger.info('Pending Changes:');
    logger.blank();

    const planned = session.pendingChanges.planned
      ? chalk.green('Yes')
      : chalk.yellow('No');
    const applied = session.pendingChanges.applied
      ? chalk.green('Yes')
      : chalk.yellow('No');

    const changeRows: string[][] = [
      ['Plan Generated', planned],
      ['Applied to Local', applied],
    ];

    if (session.pendingChanges.planFile) {
      changeRows.push(['Plan File', session.pendingChanges.planFile]);
    }

    logger.table(['Stage', 'Status'], changeRows);

    logger.blank();

    // Database connection status
    logger.info('Database Connections:');
    logger.blank();

    const localConnected = await testConnection(session.localDbUrl);
    const remoteConnected = await testConnection(session.remoteDbUrl);

    const connRows: string[][] = [
      [
        'Local Clone',
        localConnected ? chalk.green('Connected') : chalk.red('Disconnected'),
      ],
      [
        'Remote',
        remoteConnected ? chalk.green('Connected') : chalk.red('Disconnected'),
      ],
    ];

    if (localConnected) {
      const localTables = await getTableCount(session.localDbUrl);
      connRows.push(['Local Tables', String(localTables)]);
    }

    if (remoteConnected) {
      const remoteTables = await getTableCount(session.remoteDbUrl);
      connRows.push(['Remote Tables', String(remoteTables)]);
    }

    logger.table(['Database', 'Status'], connRows);

    logger.blank();

    // Show plan preview if exists
    if (session.pendingChanges.planFile) {
      const planContent = await getPlanFileContent();

      if (planContent) {
        logger.info('Plan Preview (first 20 lines):');
        logger.blank();

        const lines = planContent.split('\n').slice(0, 20);
        for (const line of lines) {
          console.log(`  ${line}`);
        }

        if (planContent.split('\n').length > 20) {
          logger.info('  ... (truncated)');
        }
      }
    }

    logger.blank();

    // Next steps
    logger.info('Next Steps:');

    if (!session.pendingChanges.planned) {
      logger.info('  - Modify schema files in db/schema/');
      logger.info('  - Run "npm run migr plan" to generate a plan');
    } else if (!session.pendingChanges.applied) {
      logger.info('  - Review the plan above');
      logger.info('  - Run "npm run migr apply" to test on local clone');
    } else {
      logger.info('  - Run "npm run migr commit <description>" to finalize');
    }

    logger.info('  - Run "npm run migr abort" to cancel the session');
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function showDbmateStatus(): Promise<void> {
  try {
    const { getConfig } = await import('../utils/config.js');
    const config = getConfig();

    logger.blank();
    logger.info('Dbmate Status (Remote):');
    logger.blank();

    const status = await runDbmateStatus(config.remoteDbUrl);
    console.log(status);
  } catch {
    // Ignore errors for dbmate status
  }
}
