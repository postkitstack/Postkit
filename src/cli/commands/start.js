const path = require('path');
const logger = require('../utils/logger');
const dockerUtils = require('../utils/docker');

async function startCommand(options) {
  try {
    const projectPath = process.cwd();
    
    // Determine mode
    const isDev = options.dev || (!options.prod && !options.production);
    const mode = isDev ? 'development' : 'production';
    
    logger.header(`Starting PostKit services in ${mode} mode`);
    
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
    
    logger.info(`Building and starting services...`);
    
    // Determine which profiles to use
    const profiles = [];
    if (isDev) {
      profiles.push('dev');
    } else {
      profiles.push('prod');
    }
    
    // Parse specific services if provided
    let specificServices = [];
    if (options.services) {
      specificServices = options.services.split(',').map(s => s.trim());
      logger.info(`Starting specific services: ${specificServices.join(', ')}`);
    }
    
    // Build services first
    await dockerUtils.buildServices(projectPath, specificServices);
    
    // Start services
    const startOptions = { 
      detached: options.detached !== false,
      profiles: profiles
    };
    
    if (specificServices.length > 0) {
      startOptions.services = specificServices;
    }
    
    await dockerUtils.startServices(projectPath, startOptions);
    
    // Wait for services to be healthy in detached mode
    if (options.detached !== false) {
      const servicesHealthy = await dockerUtils.waitForServices(projectPath);
      
      if (servicesHealthy) {
        logger.success(`Services started successfully in ${mode} mode`);
        logger.info('Use "docker-compose logs -f" to view logs');
      } else {
        logger.error('Some services failed to start properly');
        logger.info('Check logs with: docker-compose logs');
        process.exit(1);
      }
    } else {
      logger.success(`Services started in ${mode} mode`);
    }
    
    // Show available services
    logger.info('Available services:');
    logger.info('  • Traefik Dashboard: http://traefik.localhost:8080');
    logger.info('  • PostgREST API: http://rest.localhost');
    logger.info('  • Swagger UI: http://swagger.localhost');
    logger.info('  • Keycloak: http://auth.localhost');
    logger.info('  • Functions Runtime: http://functions.localhost');
    logger.info('  • Storage API: http://storage.localhost');
    logger.info('  • Image Proxy: http://imgproxy.localhost');
    
    if (!options.detached) {
      logger.info('\nPress Ctrl+C to stop all services');
    }
    
  } catch (error) {
    logger.error(`Failed to start services: ${error.message}`);
    process.exit(1);
  }
}

module.exports = startCommand;