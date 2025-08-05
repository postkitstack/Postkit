const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const inquirer = require('inquirer');

const logger = require('../utils/logger');

async function migrateDownCommand(options = {}) {
  try {
    logger.header('Rolling Back Migration');
    
    const projectPath = process.cwd();
    const migrationsDir = path.join(projectPath, 'db/migrations');
    
    // Check if migrations directory exists
    if (!await fs.pathExists(migrationsDir)) {
      logger.error('Migrations directory not found. Run this command from your project root.');
      process.exit(1);
    }
    
    // Ask for confirmation unless --force is used
    if (!options.force) {
      const { confirm } = await inquirer.default.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to rollback the last migration?',
          default: false
        }
      ]);
      
      if (!confirm) {
        logger.info('Migration rollback cancelled.');
        return;
      }
    }
    
    await runDbmate(['down'], projectPath, options);
    
    logger.success('Migration rolled back successfully!');
    
    // Show status after rollback
    logger.info('');
    await runDbmate(['status'], projectPath, options);
    
  } catch (error) {
    logger.error(`Migration rollback failed: ${error.message}`);
    process.exit(1);
  }
}

async function runDbmate(args, projectPath, options = {}) {
  const dbUrl = options.url || process.env.DATABASE_URL || 'postgres://app_user:password@localhost:5432/app_db';
  const migrationsDir = path.join(projectPath, 'db/migrations');
  
  return new Promise((resolve, reject) => {
    const dbmate = spawn('npx', ['dbmate', ...args], {
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        DBMATE_MIGRATIONS_DIR: migrationsDir,
        DBMATE_SCHEMA_FILE: path.join(projectPath, 'db/schema.sql')
      },
      stdio: 'inherit'
    });

    dbmate.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`dbmate exited with code ${code}`));
      }
    });

    dbmate.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('dbmate not found. Run: npm install --save-dev dbmate'));
      } else {
        reject(error);
      }
    });
  });
}

module.exports = migrateDownCommand;