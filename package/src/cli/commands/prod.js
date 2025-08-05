const path = require('path');
const logger = require('../utils/logger');
const dockerUtils = require('../utils/docker');

async function prodCommand(options) {
  try {
    logger.header('Starting PostKit Production Environment');
    
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
    
    logger.info('Building and starting production services...');
    
    // Build services
    await dockerUtils.buildServices(projectPath);
    
    // Start services in production mode
    await dockerUtils.startServices(projectPath, { 
      detached: options.detached,
      profile: 'prod'
    });
    
    if (options.detached) {
      logger.success('Production environment started in detached mode');
      logger.info('Use "docker-compose logs -f" to view logs');
    } else {
      logger.success('Production environment started');
    }
    
    logger.info('Available services:');
    logger.info('  • Traefik Dashboard: http://traefik.localhost:8080');
    logger.info('  • PostgREST API: http://rest.localhost');
    logger.info('  • Swagger UI: http://swagger.localhost');
    logger.info('  • Keycloak: http://auth.localhost');
    logger.info('  • Storage API: http://storage.localhost');
    logger.info('  • Image Proxy: http://imgproxy.localhost');
    
    logger.info('\nServices running in production mode');
    logger.info('Use "docker-compose down" to stop all services');
    
  } catch (error) {
    logger.error(`Failed to start production environment: ${error.message}`);
    process.exit(1);
  }
}

module.exports = prodCommand;