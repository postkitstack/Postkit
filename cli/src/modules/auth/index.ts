import {Command} from "commander";
import {withInitCheck} from "../../common/init-check";
import {exportCommand} from "./commands/export";
import {importCommand} from "./commands/import";
import {syncCommand} from "./commands/sync";

export function registerAuthModule(program: Command): void {
  const auth = program
    .command("auth")
    .description("Keycloak realm configuration management");

  // Export command
  auth
    .command("export")
    .description("Export realm from source Keycloak, clean, and save")
    .option("-f, --force", "Skip confirmation prompts")
    .action(async (cmdOptions) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await exportCommand(options);
      });
    });

  // Import command
  auth
    .command("import")
    .description("Import cleaned realm config to target Keycloak")
    .option("-f, --force", "Skip confirmation prompts")
    .action(async (cmdOptions) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await importCommand(options);
      });
    });

  // Sync command (export + import)
  auth
    .command("sync")
    .description("Export + Import in sequence (full sync)")
    .option("-f, --force", "Skip confirmation prompts")
    .action(async (cmdOptions) => {
      await withInitCheck(async () => {
        const options = {...program.opts(), ...cmdOptions};
        await syncCommand(options);
      });
    });
}
