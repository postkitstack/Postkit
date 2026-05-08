import {PostkitError} from "../../../common/errors";
import {getSession} from "./session";
import {resolveRemote} from "./remotes";

export interface ApplyTarget {
  url: string;
  label: string;
}

export async function resolveApplyTarget(
  targetOption: string | undefined,
): Promise<ApplyTarget> {
  if (!targetOption || targetOption === "local") {
    const session = await getSession();
    if (!session?.active) {
      throw new PostkitError(
        "No active session — cannot resolve local target.",
        'Run "postkit db start" first.',
      );
    }
    return {url: session.localDbUrl, label: "local"};
  }

  if (targetOption === "remote") {
    const session = await getSession();
    if (session?.active) {
      return {url: session.remoteDbUrl, label: `remote (${session.remoteName ?? "unknown"})`};
    }
    // No session — fall back to default remote
    const {name, url} = resolveRemote();
    return {url, label: `remote (${name})`};
  }

  throw new PostkitError(`Unknown target: ${targetOption}`, 'Use "local" or "remote".');
}
