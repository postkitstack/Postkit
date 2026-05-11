---
sidebar_position: 100
---

# Troubleshooting

## Common Issues

### `pgschema is not installed`

**Solution:** pgschema should be bundled in `vendor/pgschema/`. Verify the binary for your platform exists, or install manually and set `db.pgSchemaBin` in config.

### `dbmate is not installed`

**Solution:** dbmate should be installed via npm. Run `npm install` in the CLI directory, or install manually (`brew install dbmate`) and set `db.dbmateBin` in config.

### `Failed to connect to remote database`

**Solution:** Check the remote URL in `postkit db remote list`

### `No remotes configured`

**Solution:** Add a remote with `postkit db remote add <name> <url>`

### `No active migration session`

**Solution:** Run `postkit db start` first

### `Plan file is empty`

**Solution:** Schema files match current DB — make changes first

### `Schema files have changed since the plan was generated`

**Solution:** Schema files were modified after running `plan`. Run `postkit db plan` again

### `Seeds failed during apply`

**Solution:** Re-run `postkit db apply` — it resumes from where it left off

### `Deploy failed during dry run`

**Solution:** No changes were made to the target. Fix the issue and retry.

## Docker / Auto-Container Issues

### `Docker not found`

**Solution:** Install [Docker Desktop](https://www.docker.com/products/docker-desktop/). Docker is only needed when `db.localDbUrl` is empty in `postkit.secrets.json`. Alternatively, set `localDbUrl` to use an existing local PostgreSQL instance.

### `Docker is not running`

**Solution:** Start Docker Desktop before running `postkit db start` or `postkit db deploy`.

### `Failed to start container`

**Solution:** The `postgres:{version}-alpine` image could not be started. Ensure you have internet access to pull the image, or pre-pull it:
```bash
docker pull postgres:16-alpine
```
Check that Docker has enough memory allocated (at least 512MB recommended).

### Container not cleaned up after abort

**Solution:** If a container was left running after an interrupted session, stop it manually:
```bash
docker stop <containerID>
docker rm <containerID>
```
The container ID is stored in `.postkit/db/session.json` under `containerID` if the session file still exists.

## Import Issues

### `Import: pgschema plan produced no output`

**Solution:** Schema directory may be empty after normalization. Check that the source DB has objects in the target schema.

### `Import: column does not exist during local apply`

**Solution:** Infrastructure SQL (roles, schemas) must be applied to the local database before dbmate runs the baseline migration. Ensure `schema/infra/` files exist and are valid. The import command applies infra automatically — if this fails, check the role/schema SQL for syntax errors.

### `Import: relation does not exist during pgschema plan`

**Solution:** The pgschema dump ordering may not account for foreign key or policy dependencies between tables. This is handled internally by pgschema. Ensure you are using the latest version of pgschema.

### `Import: Could not insert migration tracking record`

**Solution:** Non-fatal. The local database migration succeeded but the source database tracking record failed. Manually insert the version into `schema_migrations` on the source DB.

## Getting Help

If you're still stuck, please open an issue on [GitHub](https://github.com/appritechnologies/postkit/issues).
