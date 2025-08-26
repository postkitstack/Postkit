const { execSync, spawn } = require('child_process');
const logger = require('./logger');

class DockerUtils {
  getDockerComposeCommand() {
    // Check for new docker compose command first
    try {
      execSync('docker compose version', { stdio: 'ignore' });
      return 'docker compose';
    } catch {
      // Fall back to legacy docker-compose
      try {
        execSync('docker-compose --version', { stdio: 'ignore' });
        return 'docker-compose';
      } catch {
        return null;
      }
    }
  }

  checkDockerInstalled() {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      return this.getDockerComposeCommand() !== null;
    } catch (error) {
      return false;
    }
  }

  getDockerComposeVersion() {
    try {
      const composeCmd = this.getDockerComposeCommand();
      if (!composeCmd) return { major: 1, minor: 27, patch: 0 };
      
      const versionCmd = composeCmd === 'docker compose' ? 'docker compose version' : 'docker-compose --version';
      const output = execSync(versionCmd, { encoding: 'utf8' });
      const match = output.match(/version\s+(?:v)?(\d+)\.(\d+)\.(\d+)/i);
      if (match) {
        return {
          major: parseInt(match[1]),
          minor: parseInt(match[2]),
          patch: parseInt(match[3])
        };
      }
    } catch (error) {
      // Fallback to assuming newer version for v2+
    }
    return { major: 2, minor: 0, patch: 0 }; // Assume v2+ which supports profiles
  }

  supportsProfiles() {
    const version = this.getDockerComposeVersion();
    // Docker Compose v2+ always supports profiles, v1.28+ supports profiles
    return version.major >= 2 || (version.major === 1 && version.minor >= 28);
  }

  isDockerRunning() {
    try {
      execSync('docker info', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  async runDockerCompose(command, options = {}) {
    const { cwd = process.cwd(), detached = false } = options;
    
    return new Promise((resolve, reject) => {
      const composeCmd = this.getDockerComposeCommand();
      if (!composeCmd) {
        reject(new Error('Docker Compose not found'));
        return;
      }
      
      const args = composeCmd.split(' ').concat(command.split(' '));
      
      logger.info(`Running: ${args.join(' ')}`);
      
      const child = spawn(args[0], args.slice(1), {
        cwd,
        stdio: detached ? 'pipe' : 'inherit',
        detached: false // Never detach the child process
      });

      // Collect output for detached mode
      let stdout = '';
      let stderr = '';
      
      if (detached) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Docker Compose exited with code ${code}. Error: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  async buildServices(cwd, services = []) {
    const serviceArgs = services.length > 0 ? ` ${services.join(' ')}` : '';
    await this.runDockerCompose(`build${serviceArgs}`, { cwd });
  }

  async startServices(cwd, options = {}) {
    const { detached = false, profile, profiles, services } = options;
    let command = '';
    
    // Add profile flags BEFORE the up command if Docker Compose supports them
    if (this.supportsProfiles()) {
      if (profile) {
        command += `--profile ${profile} `;
      }
      
      if (profiles && Array.isArray(profiles)) {
        for (const prof of profiles) {
          command += `--profile ${prof} `;
        }
      }
    } else if (profile || profiles) {
      logger.warn('Docker Compose profiles not supported in this version. Starting all services.');
    }
    
    command += 'up';
    
    if (detached) {
      command += ' -d';
    }
    
    if (services && Array.isArray(services)) {
      command += ` ${services.join(' ')}`;
    }
    
    await this.runDockerCompose(command, { cwd, detached });
  }

  async startService(cwd, serviceName) {
    await this.runDockerCompose(`up -d ${serviceName}`, { cwd });
  }

  async stopService(cwd, serviceName) {
    await this.runDockerCompose(`stop ${serviceName}`, { cwd });
  }

  async restartService(cwd, serviceName) {
    await this.runDockerCompose(`restart ${serviceName}`, { cwd });
  }

  async stopServices(cwd) {
    await this.runDockerCompose('down', { cwd });
  }

  async getServiceLogs(cwd, service) {
    return new Promise((resolve, reject) => {
      const child = spawn('docker-compose', ['logs', service], {
        cwd,
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Failed to get logs for ${service}`));
        }
      });
    });
  }

  async runMigration(cwd, command = 'up') {
    const validCommands = ['up', 'down', 'status', 'create', 'new'];
    if (!validCommands.includes(command)) {
      throw new Error(`Invalid migration command: ${command}`);
    }

    await this.runDockerCompose(`run --rm migrate ${command}`, { cwd });
  }

  async getMigrationStatus(cwd) {
    return new Promise((resolve, reject) => {
      const child = spawn('docker-compose', ['run', '--rm', 'migrate', 'status'], {
        cwd,
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Migration status failed: ${errorOutput || 'Unknown error'}`));
        }
      });
    });
  }

  async waitForServices(cwd, maxWaitTime = 30000) {
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds
    
    logger.info('Waiting for services to be healthy...');
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const result = await this.runDockerCompose('ps --format json', { cwd, detached: true });
        
        if (result.stdout) {
          const services = result.stdout.trim().split('\n')
            .filter(line => line.trim())
            .map(line => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter(service => service !== null);
          
          if (services.length === 0) {
            // No services found, wait a bit more
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            continue;
          }
          
          const runningServices = services.filter(service => 
            service.State === 'running' || service.State === 'Up'
          );
          
          const failedServices = services.filter(service => 
            service.State === 'exited' && service.ExitCode !== 0
          );
          
          if (failedServices.length > 0) {
            logger.error(`Services failed to start: ${failedServices.map(s => s.Service || s.Name).join(', ')}`);
            return false;
          }
          
          if (runningServices.length === services.length && services.length > 0) {
            logger.success(`All ${services.length} services are running`);
            return true;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error) {
        // If ps command fails, try basic ps command
        try {
          await this.runDockerCompose('ps', { cwd, detached: true });
          await new Promise(resolve => setTimeout(resolve, checkInterval));
        } catch {
          logger.error('Failed to check service status');
          return false;
        }
      }
    }
    
    logger.warn('Timeout waiting for services to be healthy');
    return false;
  }
}

module.exports = new DockerUtils();