const path = require('path');
const logger = require('../utils/logger');
const dockerUtils = require('../utils/docker');

async function migrateCommand(options) {
  try {
    const projectPath = process.cwd();
    
    logger.header('Database Migration');
    
    // Check if Docker is available
    if (!dockerUtils.checkDockerInstalled()) {
      logger.error('Docker or Docker Compose not found. Please install Docker first.');
      process.exit(1);
    }
    
    if (!dockerUtils.isDockerRunning()) {
      logger.error('Docker is not running. Please start Docker first.');
      process.exit(1);
    }
    
    // Check if docker-compose.yml exists
    const dockerComposePath = path.join(projectPath, 'docker-compose.yml');
    if (!await require('../utils/file-utils').fileExists(dockerComposePath)) {
      logger.error('No docker-compose.yml found. Run "postkit init <project-name>" first.');
      process.exit(1);
    }
    
    // Check if migrations directory exists
    const migrationsPath = path.join(projectPath, 'db/migrations');
    if (!await require('../utils/file-utils').fileExists(migrationsPath)) {
      logger.error('No migrations directory found. Make sure your project is properly initialized.');
      process.exit(1);
    }
    
    if (options.status) {
      await showMigrationStatus(projectPath);
      return;
    }
    
    const command = options.down ? 'down' : 'up';
    
    logger.info(`Running ${command} migrations...`);
    
    try {
      // Run migrations using dbmate container
      await dockerUtils.runMigration(projectPath, command);
      
      logger.success(`Database migrations ${command} completed successfully!`);
      
      // Show current status after migration
      logger.info('');
      await showMigrationStatus(projectPath);
      
    } catch (error) {
      logger.error(`Migration failed: ${error.message}`);
      
      // Try to show current status even if migration failed
      try {
        logger.info('');
        logger.info('Current migration status:');
        await showMigrationStatus(projectPath);
      } catch (statusError) {
        // Ignore status check errors
      }
      
      process.exit(1);
    }
    
  } catch (error) {
    logger.error(`Migration command failed: ${error.message}`);
    process.exit(1);
  }
}

async function showMigrationStatus(projectPath) {
  try {
    logger.startSpinner('Checking migration status...');
    
    const status = await dockerUtils.getMigrationStatus(projectPath);
    
    logger.stopSpinner('Migration status retrieved');
    
    if (status.trim()) {
      console.log(status);
    } else {
      logger.info('No migration status information available.');
    }
  } catch (error) {
    logger.stopSpinner('Failed to get migration status', false);
    logger.warning(`Could not retrieve migration status: ${error.message}`);
  }
}

module.exports = migrateCommand;