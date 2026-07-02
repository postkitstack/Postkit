import fs from "fs";
import path from "path";
import {projectRoot} from "../../../common/config";

const DEFAULT_REALM_NAME = "postkit";
const DEFAULT_REALM_TEMPLATE_PATH = ".postkit/auth/realm/postkit.json";

const MINIMAL_REALM_TEMPLATE = {
  realm: DEFAULT_REALM_NAME,
  enabled: true,
  clients: [],
  roles: {
    realm: [],
    client: {},
  },
};

/**
 * Scaffold the default realm template at .postkit/auth/realm/postkit.json.
 * Safe to call multiple times — never overwrites existing files.
 * Returns true if created, false if already existed.
 */
export function scaffoldRealmTemplate(): boolean {
  const realmDir = path.join(projectRoot, ".postkit", "auth", "realm");
  const realmFile = path.join(realmDir, "postkit.json");

  fs.mkdirSync(realmDir, {recursive: true});

  if (fs.existsSync(realmFile)) return false;
  fs.writeFileSync(realmFile, JSON.stringify(MINIMAL_REALM_TEMPLATE, null, 2) + "\n");
  return true;
}

export {DEFAULT_REALM_TEMPLATE_PATH};
