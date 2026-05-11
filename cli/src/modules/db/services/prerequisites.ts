import {logger} from "../../../common/logger";
import {PostkitError} from "../../../common/errors";
import {checkPgschemaInstalled} from "./pgschema";
import {checkDbmateInstalled} from "./dbmate";

export async function checkDbPrerequisites(verbose: boolean): Promise<void> {
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

  logger.debug("Prerequisites check passed", verbose);
}
