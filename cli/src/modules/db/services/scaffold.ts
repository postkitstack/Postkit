import fs from "fs";
import path from "path";
import {projectRoot} from "../../../common/config";

const ROLES_SQL = `-- PostgREST roles — created by postkit init
-- Edit freely; applied by 'postkit stack up' before services start.

DO $\$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $\$;
DO $\$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $\$;
DO $\$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $\$;
DO $\$ BEGIN CREATE ROLE app_user NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $\$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, app_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role, app_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role, app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role, app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role, app_user;
`;

/**
 * Scaffold db/infra/ directory and a default roles.sql for PostgREST.
 * Safe to call multiple times — never overwrites existing files.
 * Returns true if roles.sql was created, false if it already existed.
 */
export function scaffoldDbInfra(): boolean {
  const infraDir = path.join(projectRoot, "db", "infra");
  const rolesFile = path.join(infraDir, "roles.sql");

  fs.mkdirSync(infraDir, {recursive: true});

  if (fs.existsSync(rolesFile)) return false;
  fs.writeFileSync(rolesFile, ROLES_SQL);
  return true;
}
