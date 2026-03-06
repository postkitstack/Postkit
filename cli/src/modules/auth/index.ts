import {Command} from "commander";
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
    .action(async () => {
      const options = program.opts();
      await exportCommand(options);
    });

  // Import command
  auth
    .command("import")
    .description("Import cleaned realm config to target Keycloak")
    .action(async () => {
      const options = program.opts();
      await importCommand(options);
    });

  // Sync command (export + import)
  auth
    .command("sync")
    .description("Export + Import in sequence (full sync)")
    .action(async () => {
      const options = program.opts();
      await syncCommand(options);
    });
}
