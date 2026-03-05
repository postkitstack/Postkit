import ora from 'ora';
import inquirer from 'inquirer';
import { logger } from '../utils/logger.js';
import { getSession, deleteSession } from '../utils/session.js';
import { getPlanFileContent, deletePlanFile } from '../services/pgschema.js';
import { createMigrationFile, runDbmateMigrate } from '../services/dbmate.js';
import { deleteGeneratedSchema } from '../services/schema-generator.js';
import { testConnection } from '../services/database.js';
import type { CommandOptions } from '../types/index.js';

export async function commitCommand(
  description: string,
  options: CommandOptions
): Promise<void> {
  const spinner = ora();

  try {
    // Validate description
    if (!description || description.trim().length === 0) {
      logger.error('Migration description is required.');
      logger.info('Usage: npm run migr commit "description_of_changes"');
      process.exit(1);
    }

    // Check for active session
    const session = await getSession();

    if (!session || !session.active) {
      logger.error('No active migration session.');
      logger.info('Run "npm run migr start" to begin a new session.');
      process.exit(1);
    }

    // Check if plan exists
    if (!session.pendingChanges.planned || !session.pendingChanges.planFile) {
      logger.error('No migration plan found.');
      logger.info('Run "npm run migr plan" first to generate a plan.');
      process.exit(1);
    }

    logger.heading('Committing Migration');

    // Show the plan
    logger.step(1, 5, 'Loading plan...');
    const planContent = await getPlanFileContent();

    if (!planContent || planContent.trim().length === 0) {
      logger.error('Plan file is empty.');
      logger.info('Run "npm run migr plan" to regenerate the plan.');
      process.exit(1);
    }

    logger.info('Changes to be committed:');
    logger.blank();
    console.log(planContent);
    logger.blank();

    // Confirm unless force flag
    if (!options.force && !options.dryRun) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Create migration file and apply to remote database?',
          default: false,
        },
      ]);

      if (!confirm) {
        logger.info('Commit cancelled.');
        return;
      }
    }

    // Create migration file
    logger.step(2, 5, 'Creating migration file...');
    spinner.start('Writing migration file...');

    let migrationFile;

    if (options.dryRun) {
      spinner.info('Dry run - skipping file creation');
      migrationFile = {
        name: `00000000000000_${description}.sql`,
        path: '/path/to/migration.sql',
        timestamp: '00000000000000',
      };
    } else {
      migrationFile = await createMigrationFile(description, planContent);
      spinner.succeed(`Migration file created: ${migrationFile.name}`);
      logger.info(`Path: ${migrationFile.path}`);
    }

    // Test remote connection
    logger.step(3, 5, 'Testing remote database connection...');
    spinner.start('Connecting to remote database...');

    const remoteConnected = await testConnection(session.remoteDbUrl);

    if (!remoteConnected) {
      spinner.fail('Failed to connect to remote database');
      logger.error('Could not connect to the remote database.');
      logger.warn(`Migration file was created: ${migrationFile.path}`);
      logger.info('You can apply it manually later with: dbmate up');
      process.exit(1);
    }

    spinner.succeed('Connected to remote database');

    // Apply to remote
    logger.step(4, 5, 'Applying migration to remote database...');

    if (options.dryRun) {
      spinner.info('Dry run - skipping remote apply');
    } else {
      spinner.start('Running dbmate migrate...');

      const migrateResult = await runDbmateMigrate(session.remoteDbUrl);

      if (!migrateResult.success) {
        spinner.fail('Failed to apply migration');
        logger.error('Migration failed on remote database:');
        console.log(migrateResult.output);
        logger.warn(`Migration file exists at: ${migrationFile.path}`);
        logger.info('Fix the issue and run manually: dbmate up');
        process.exit(1);
      }

      spinner.succeed('Migration applied to remote database');

      if (migrateResult.output) {
        logger.debug(migrateResult.output, options.verbose);
      }
    }

    // Cleanup session
    logger.step(5, 5, 'Cleaning up session...');

    if (!options.dryRun) {
      await deletePlanFile();
      await deleteGeneratedSchema();
      await deleteSession();
      spinner.succeed('Session cleaned up');
    }

    logger.blank();
    logger.success('Migration committed successfully!');
    logger.blank();
    logger.info(`Migration: ${migrationFile.name}`);
    logger.info(`Description: ${description}`);
    logger.blank();
    logger.info('The migration has been applied to the remote database.');
    logger.info('Run "npm run migr start" to begin a new migration session.');
  } catch (error) {
    spinner.fail('Failed to commit migration');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
