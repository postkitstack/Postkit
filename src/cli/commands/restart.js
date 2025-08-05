const path = require('path');
const logger = require('../utils/logger');
const dockerUtils = require('../utils/docker');

const VALID_SERVICES = [
  'traefik',
  'db', 'database',
  'migrate',
  'rest', 'api',
  'swagger',
  'keycloak', 'auth',
  'keycloak-config-cli',
  'worker',
  'functions',
  'imgproxy',
  'storage',
  'post-storage-migrate'
];

async function restartCommand(serviceName) {
  try {
    const projectPath = process.cwd();
    
    logger.header(`Restarting service: ${serviceName}`);
    
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
    
    // Validate service name
    const normalizedServiceName = normalizeServiceName(serviceName);
    if (!VALID_SERVICES.includes(normalizedServiceName)) {
      logger.error(`Invalid service name: ${serviceName}`);
      logger.info('Valid services:');
      logger.info('  • traefik - API Gateway');
      logger.info('  • db/database - PostgreSQL database');
      logger.info('  • rest/api - PostgREST API');
      logger.info('  • swagger - API documentation');
      logger.info('  • keycloak/auth - Authentication service');
      logger.info('  • worker - Background job processing');
      logger.info('  • functions - Functions runtime');
      logger.info('  • storage - File storage');
      logger.info('  • imgproxy - Image processing');
      process.exit(1);
    }
    
    // Get the actual service name for docker-compose
    const dockerServiceName = getDockerServiceName(normalizedServiceName);
    
    logger.info(`Stopping ${dockerServiceName}...`);
    await dockerUtils.stopService(projectPath, dockerServiceName);
    
    logger.info(`Starting ${dockerServiceName}...`);
    await dockerUtils.startService(projectPath, dockerServiceName);
    
    logger.success(`Service ${serviceName} restarted successfully`);
    
    // Show service URL if applicable
    const serviceUrl = getServiceUrl(normalizedServiceName);
    if (serviceUrl) {
      logger.info(`Service available at: ${serviceUrl}`);
    }
    
  } catch (error) {
    logger.error(`Failed to restart service ${serviceName}: ${error.message}`);
    process.exit(1);
  }
}

function normalizeServiceName(serviceName) {
  const normalized = serviceName.toLowerCase().trim();
  
  // Handle aliases
  const aliases = {
    'database': 'db',
    'api': 'rest',
    'auth': 'keycloak'
  };
  
  return aliases[normalized] || normalized;
}

function getDockerServiceName(serviceName) {
  // Some services might have different names in docker-compose
  const mapping = {
    'keycloak': 'keycloak',
    'auth': 'keycloak',
    'db': 'db',
    'database': 'db',
    'rest': 'rest',
    'api': 'rest'
  };
  
  return mapping[serviceName] || serviceName;
}

function getServiceUrl(serviceName) {
  const urls = {
    'traefik': 'http://traefik.localhost:8080',
    'rest': 'http://rest.localhost',
    'api': 'http://rest.localhost',
    'swagger': 'http://swagger.localhost',
    'keycloak': 'http://auth.localhost',
    'auth': 'http://auth.localhost',
    'functions': 'http://functions.localhost',
    'storage': 'http://storage.localhost',
    'imgproxy': 'http://imgproxy.localhost'
  };
  
  return urls[serviceName];
}

module.exports = restartCommand;