const chalk = require('chalk');
const ora = require('ora');

class Logger {
  constructor() {
    this.spinner = null;
  }

  info(message) {
    console.log(chalk.blue('ℹ'), message);
  }

  success(message) {
    console.log(chalk.green('✓'), message);
  }

  warning(message) {
    console.log(chalk.yellow('⚠'), message);
  }

  error(message) {
    console.log(chalk.red('✗'), message);
  }

  startSpinner(message) {
    this.spinner = ora(message).start();
  }

  stopSpinner(message, success = true) {
    if (this.spinner) {
      if (success) {
        this.spinner.succeed(message);
      } else {
        this.spinner.fail(message);
      }
      this.spinner = null;
    }
  }

  header(message) {
    console.log();
    console.log(chalk.cyan.bold('🚀 PostKit CLI'));
    console.log(chalk.cyan('─'.repeat(50)));
    console.log(chalk.white(message));
    console.log();
  }
}

module.exports = new Logger();