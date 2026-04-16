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

### `Grants/seeds failed during apply`

**Solution:** Re-run `postkit db apply` — it resumes from where it left off

### `Deploy failed during dry run`

**Solution:** No changes were made to the target. Fix the issue and retry.

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
