const path = require('path');
const logger = require('../utils/logger');
const dockerUtils = require('../utils/docker');

async function devCommand(options) {
  try {
    logger.header('Starting PostKit Development Environment');
    
    const projectPath = process.cwd();
    
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
    
    logger.info('Building and starting development services...');
    
    // Build services
    await dockerUtils.buildServices(projectPath);
    
    // Start services in development mode
    await dockerUtils.startServices(projectPath, { 
      detached: options.detached,
      profile: 'dev'
    });
    
    if (options.detached) {
      logger.success('Development environment started in detached mode');
      logger.info('Use "docker-compose logs -f" to view logs');
    } else {
      logger.success('Development environment started');
    }
    
    logger.info('Available services:');
    logger.info('  • Traefik Dashboard: http://traefik.localhost:8080');
    logger.info('  • PostgREST API: http://rest.localhost');
    logger.info('  • Swagger UI: http://swagger.localhost');
    logger.info('  • Keycloak: http://auth.localhost');
    logger.info('  • Storage API: http://storage.localhost');
    logger.info('  • Image Proxy: http://imgproxy.localhost');
    
    logger.info('\nPress Ctrl+C to stop all services');
    
  } catch (error) {
    logger.error(`Failed to start development environment: ${error.message}`);
    process.exit(1);
  }
}

module.exports = devCommand;