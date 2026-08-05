import {logger} from "../../../common/logger";
import {PostkitError} from "../../../common/errors";
import {commandExists} from "../../../common/shell";
import {checkPgschemaInstalled} from "./pgschema";
import {checkDbmateInstalled} from "./dbmate";

export async function checkPsqlInstalled(): Promise<boolean> {
  return commandExists("psql");
}

export interface DbPrerequisitesOptions {
  /**
   * Also require the native `psql` client binary. Several code paths (infra
   * apply, direct/non-container clone) shell out to `psql` on the host — on
   * Windows this fails with an opaque `spawn psql ENOENT` if it's missing,
   * instead of a clear upfront error, unless checked here first.
   */
  requirePsql?: boolean;
}

export async function checkDbPrerequisites(
  verbose: boolean,
  options: DbPrerequisitesOptions = {},
): Promise<void> {
  const pgschemaInstalled = await checkPgschemaInstalled();
  const dbmateInstalled = await checkDbmateInstalled();

  if (!pgschemaInstalled) {
    throw new PostkitError(
      "pgschema binary not found.",
      "Visit: https://github.com/pgschema/pgschema",
    );
  }

  if (!dbmateInstalled) {
    throw new PostkitError(
      "dbmate binary not found.",
      "Install with: brew install dbmate  or  go install github.com/amacneil/dbmate@latest",
    );
  }

  if (options.requirePsql) {
    const psqlInstalled = await checkPsqlInstalled();

    if (!psqlInstalled) {
      throw new PostkitError(
        "psql binary not found.",
        "Install the PostgreSQL client tools:\n" +
        "  macOS:   brew install libpq && brew link --force libpq\n" +
        "  Linux:   apt install postgresql-client  (or your distro's equivalent)\n" +
        "  Windows: winget install PostgreSQL.PostgreSQL, then add its bin/ folder to PATH\n" +
        "Then open a new terminal and verify with: psql --version",
      );
    }
  }

  logger.debug("Prerequisites check passed", verbose);
}
