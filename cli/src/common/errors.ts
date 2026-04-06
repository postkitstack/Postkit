/**
 * PostkitError — user-facing errors with an optional hint and exit code.
 *
 * Throwing this from any command bubbles up to `withInitCheck`, which logs
 * the message + hint and exits cleanly. Unexpected bugs (TypeError, etc.)
 * are NOT PostkitError and will be re-thrown to the unhandledRejection handler.
 */
export class PostkitError extends Error {
  constructor(
    message: string,
    public readonly hint?: string,
    public readonly exitCode: number = 1,
  ) {
    super(message);
    this.name = "PostkitError";
  }
}
