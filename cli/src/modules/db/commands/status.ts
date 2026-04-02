import chalk from "chalk";
import {logger} from "../../../common/logger";
import {getSession, formatSessionDuration} from "../utils/session";
import {testConnection, getTableCount} from "../services/database";
import {getPlanFileContent} from "../services/pgschema";
import {runDbmateStatus} from "../services/dbmate";
import {getPendingCommittedMigrations} from "../utils/committed";
import type {CommandOptions} from "../../../common/types";

async function showCommittedMigrations(): Promise<void> {
  const pendingMigrations = await getPendingCommittedMigrations();

  if (pendingMigrations.length === 0) {
    return;
  }

  logger.blank();
  logger.info("Committed Migrations (Pending Deployment):");
  logger.blank();

  for (const cm of pendingMigrations) {
    const committedAt = new Date(cm.committedAt).toLocaleString();
    logger.info(`  • ${cm.migrationFile.name}`);
    logger.info(`    Description: ${cm.description}`);
    logger.info(`    Merged from: ${cm.sessionMigrations.length} session migration(s)`);
    logger.info(`    Committed: ${committedAt}`);
    logger.blank();
  }
}

export async function statusCommand(options: CommandOptions): Promise<void> {
  try {
    const session = await getSession();
    const pendingCommitted = await getPendingCommittedMigrations();

    if (options.json) {
      const localConnected = session?.active ? await testConnection(session.localDbUrl) : false;
      const remoteConnected = session?.active ? await testConnection(session.remoteDbUrl) : false;
      console.log(JSON.stringify({
        sessionActive: session?.active ?? false,
        startedAt: session?.startedAt ?? null,
        remoteName: session?.remoteName ?? null,
        remoteSnapshot: session?.remoteSnapshot ?? null,
        pendingChanges: session?.pendingChanges ?? null,
        connections: session?.active ? {local: localConnected, remote: remoteConnected} : null,
        pendingCommittedMigrations: pendingCommitted.length,
      }, null, 2));
      return;
    }

    logger.heading("Migration Session Status");

    if (!session || !session.active) {
      logger.info("No active migration session.");
      logger.blank();
      logger.info('Run "postkit db start" to begin a new session.');

      // Show committed migrations even without active session
      await showCommittedMigrations();

      // Show dbmate status anyway
      if (options.verbose) {
        await showDbmateStatus();
      }

      return;
    }

    // Session info
    logger.info("Session Information:");
    logger.blank();

    const rows: string[][] = [
      ["Status", chalk.green("Active")],
      ["Started", session.startedAt],
      ["Duration", formatSessionDuration(session.startedAt)],
      ["Snapshot", session.remoteSnapshot],
    ];

    if (session.remoteName) {
      rows.push(["Remote", session.remoteName]);
    }

    logger.table(["Property", "Value"], rows);

    logger.blank();

    // Pending changes
    logger.info("Pending Changes:");
    logger.blank();

    const planned = session.pendingChanges.planned
      ? chalk.green("Yes")
      : chalk.yellow("No");
    const applied = session.pendingChanges.applied
      ? chalk.green("Yes")
      : chalk.yellow("No");

    const changeRows: string[][] = [
      ["Plan Generated", planned],
      ["Applied to Local", applied],
    ];

    if (session.pendingChanges.planFile) {
      changeRows.push(["Plan File", session.pendingChanges.planFile]);
    }

    if (session.pendingChanges.migrationFiles.length > 0) {
      changeRows.push([
        "Session Migrations",
        String(session.pendingChanges.migrationFiles.length),
      ]);
    }

    logger.table(["Stage", "Status"], changeRows);

    logger.blank();

    // Database connection status
    logger.info("Database Connections:");
    logger.blank();

    const localConnected = await testConnection(session.localDbUrl);
    const remoteConnected = await testConnection(session.remoteDbUrl);

    const connRows: string[][] = [
      [
        "Local Clone",
        localConnected ? chalk.green("Connected") : chalk.red("Disconnected"),
      ],
      [
        "Remote",
        remoteConnected ? chalk.green("Connected") : chalk.red("Disconnected"),
      ],
    ];

    if (localConnected) {
      const localTables = await getTableCount(session.localDbUrl);
      connRows.push(["Local Tables", String(localTables)]);
    }

    if (remoteConnected) {
      const remoteTables = await getTableCount(session.remoteDbUrl);
      connRows.push(["Remote Tables", String(remoteTables)]);
    }

    logger.table(["Database", "Status"], connRows);

    logger.blank();

    // Show plan preview if exists
    if (session.pendingChanges.planFile) {
      const planContent = await getPlanFileContent();

      if (planContent) {
        logger.info("Plan Preview (first 20 lines):");
        logger.blank();

        const lines = planContent.split("\n").slice(0, 20);
        for (const line of lines) {
          console.log(`  ${line}`);
        }

        if (planContent.split("\n").length > 20) {
          logger.info("  ... (truncated)");
        }
      }
    }

    logger.blank();

    // Show committed migrations
    await showCommittedMigrations();

    // Next steps
    logger.info("Next Steps:");

    if (!session.pendingChanges.planned) {
      logger.info("  - Modify schema files in db/schema/");
      logger.info('  - Run "postkit db plan" to generate a plan');
      logger.info('  - Run "postkit db migrate <name>" to create a manual migration');
    } else if (!session.pendingChanges.applied) {
      logger.info("  - Review the plan above");
      logger.info('  - Run "postkit db apply" to test on local clone');
    } else {
      logger.info('  - Run "postkit db commit" to commit session migrations');
    }

    logger.info('  - Run "postkit db abort" to cancel the session');

    if (pendingCommitted.length > 0) {
      logger.info('  - Run "postkit db deploy" to deploy committed migrations');
    }
  } catch (error) {
    throw error;
  }
}

async function showDbmateStatus(): Promise<void> {
  try {
    const {resolveRemote} = await import("../utils/remotes");

    logger.blank();
    logger.info("Dbmate Status (Remote):");
    logger.blank();

    const {url} = resolveRemote();
    const status = await runDbmateStatus(url);
    console.log(status);
  } catch {
    // Ignore errors for dbmate status
  }
}
