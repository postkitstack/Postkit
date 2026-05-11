import {Command} from "commander";
import {withInitCheck} from "../../common/init-check";
import {upCommand} from "./commands/up";
import {downCommand} from "./commands/down";
import {statusCommand} from "./commands/status";
import {logsCommand} from "./commands/logs";
import {restartCommand} from "./commands/restart";

export function registerStackModule(program: Command): void {
  const stack = program
    .command("stack")
    .description("Manage local backend service stack");

  // Up command
  stack
    .command("up")
    .description("Start all or selected backend services")
    .argument("[services...]", "Services to start (postgres, keycloak, postgrest)")
    .option("--no-wait", "Skip health check waiting")
    .action(async (services: string[], cmdOptions: Record<string, unknown>) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await upCommand(options as never, services);
      });
    });

  // Down command
  stack
    .command("down")
    .description("Stop and remove all stack containers")
    .option("--volumes", "Remove persistent volumes too")
    .action(async (cmdOptions: Record<string, unknown>) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await downCommand(options as never);
      });
    });

  // Status command
  stack
    .command("status")
    .description("Show running services, ports, and health")
    .action(async (cmdOptions: Record<string, unknown>) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await statusCommand(options as never);
      });
    });

  // Logs command
  stack
    .command("logs")
    .description("Tail logs for stack services")
    .argument("[service]", "Service name to tail (omit for all)")
    .option("-f, --follow", "Follow log output (default: true)")
    .option("--no-follow", "Don't follow log output")
    .option("-n, --tail <number>", "Number of lines to show", "100")
    .action(async (service: string | undefined, cmdOptions: Record<string, unknown>) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await logsCommand(options as never, service);
      });
    });

  // Restart command
  stack
    .command("restart")
    .description("Restart a stack service")
    .argument("[service]", "Service name to restart (omit for all)")
    .action(async (service: string | undefined, cmdOptions: Record<string, unknown>) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await restartCommand(options as never, service);
      });
    });
}
