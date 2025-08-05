const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const axios = require('axios');

const logger = require('../utils/logger');

async function authImportCommand(realmFile, options = {}) {
  try {
    const keycloakUrl = options.keycloakUrl || 'http://auth.localhost';
    const adminUser = options.adminUser || 'admin';
    const adminPass = options.adminPass || 'admin';
    
    logger.header(`Importing Keycloak Realm: ${chalk.green(path.basename(realmFile))}`);
    
    // Check if realm file exists
    if (!await fs.pathExists(realmFile)) {
      logger.error(`Realm file not found: ${realmFile}`);
      process.exit(1);
    }
    
    // Read and parse realm file
    const realmData = await fs.readJson(realmFile);
    const realmName = realmData.realm;
    
    if (!realmName) {
      logger.error('Invalid realm file: missing realm name');
      process.exit(1);
    }
    
    logger.info(`Connecting to Keycloak at ${keycloakUrl}...`);
    
    // Get admin token
    const token = await getKeycloakToken(keycloakUrl, adminUser, adminPass);
    
    // Check if realm already exists
    try {
      await axios.get(`${keycloakUrl}/admin/realms/${realmName}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      logger.warning(`Realm '${realmName}' already exists. This will update the existing realm.`);
      
      // Update existing realm
      await axios.put(`${keycloakUrl}/admin/realms/${realmName}`, realmData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      logger.success(`Realm '${realmName}' updated successfully!`);
      
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // Realm doesn't exist, create it
        await axios.post(`${keycloakUrl}/admin/realms`, realmData, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        logger.success(`Realm '${realmName}' created successfully!`);
      } else {
        throw error;
      }
    }
    
    logger.info(`\nRealm URL: ${keycloakUrl}/realms/${realmName}`);
    logger.info(`Admin Console: ${keycloakUrl}/admin/master/console/#/${realmName}`);
    
  } catch (error) {
    logger.error(`Failed to import realm: ${error.message}`);
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

module.exports = authImportCommand;