const { execSync, spawn } = require('child_process');
const logger = require('./logger');

class DockerUtils {
  checkDockerInstalled() {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      execSync('docker-compose --version', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
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
      const args = ['docker-compose', ...command.split(' ')];
      
      logger.info(`Running: ${args.join(' ')}`);
      
      const child = spawn(args[0], args.slice(1), {
        cwd,
        stdio: detached ? 'ignore' : 'inherit',
        detached
      });

      if (detached) {
        child.unref();
        resolve();
        return;
      }

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Docker Compose exited with code ${code}`));
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
    let command = 'up';
    
    if (detached) {
      command += ' -d';
    }
    
    if (profile) {
      command += ` --profile ${profile}`;
    }
    
    if (profiles && Array.isArray(profiles)) {
      for (const prof of profiles) {
        command += ` --profile ${prof}`;
      }
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
}

module.exports = new DockerUtils();