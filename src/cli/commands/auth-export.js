const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const axios = require('axios');

const logger = require('../utils/logger');

async function authExportCommand(realmName, options = {}) {
  try {
    const keycloakUrl = options.keycloakUrl || 'http://auth.localhost';
    const adminUser = options.adminUser || 'admin';
    const adminPass = options.adminPass || 'admin';
    const outputPath = options.output || path.join(process.cwd(), 'auth', 'config', `${realmName}.json`);
    
    logger.header(`Exporting Keycloak Realm: ${chalk.green(realmName)}`);
    
    logger.info(`Connecting to Keycloak at ${keycloakUrl}...`);
    
    // Get admin token
    const token = await getKeycloakToken(keycloakUrl, adminUser, adminPass);
    
    // Export realm configuration
    try {
      const response = await axios.get(`${keycloakUrl}/admin/realms/${realmName}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      const realmData = response.data;
      
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));
      
      // Write realm configuration to file
      await fs.writeJson(outputPath, realmData, { spaces: 2 });
      
      logger.success(`Realm '${realmName}' exported successfully!`);
      logger.info(`Configuration saved to: ${chalk.cyan(outputPath)}`);
      
      // Show file size for reference
      const stats = await fs.stat(outputPath);
      logger.info(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
      
    } catch (error) {
      if (error.response && error.response.status === 404) {
        logger.error(`Realm '${realmName}' not found in Keycloak.`);
        logger.info('Available realms can be listed using the Keycloak admin console.');
        process.exit(1);
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    logger.error(`Failed to export realm: ${error.message}`);
    process.exit(1);
  }
}

async function getKeycloakToken(keycloakUrl, adminUser, adminPass) {
  try {
    const response = await axios.post(
      `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: adminUser,
        password: adminPass
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    return response.data.access_token;
  } catch (error) {
    if (error.response) {
      throw new Error(`Authentication failed: ${error.response.data.error_description || error.response.statusText}`);
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to Keycloak at ${keycloakUrl}. Make sure Keycloak is running.`);
    } else {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }
}

module.exports = authExportCommand;