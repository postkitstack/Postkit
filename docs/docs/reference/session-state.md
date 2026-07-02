---
sidebar_position: 3
---

# Session State

The database module uses a session-based workflow. Session state is tracked in `.postkit/db/session.json`.

## Session State Structure

```json
{
  "active": true,
  "startedAt": "2026-02-11T12:00:00Z",
  "clonedAt": "20260211120000",
  "remoteName": "staging",
  "localDbUrl": "postgres://postgres:postkit_local@localhost:15432/postkit_local",
  "remoteDbUrl": "postgres://user:pass@staging-host:5432/myapp",
  "containerID": "abc123def456",
  "pendingChanges": {
    "planned": false,
    "applied": false,
    "planFiles": {},
    "migrationFiles": [],
    "description": null,
    "schemaFingerprints": {},
    "migrationApplied": false,
    "seedsApplied": false
  }
}
```

## Fields

| Field | Description |
|-------|-------------|
| `active` | Whether a session is currently active |
| `startedAt` | ISO timestamp when session was started |
| `clonedAt` | Timestamp when remote DB was cloned |
| `remoteName` | Name of the remote that was cloned |
| `localDbUrl` | Local database connection URL |
| `remoteDbUrl` | Remote database connection URL |
| `containerID` | Docker container ID (present only when PostKit auto-started a container) |
| `pendingChanges` | Object tracking changes in the session |

### pendingChanges

| Field | Description |
|-------|-------------|
| `planned` | Whether a plan has been generated |
| `applied` | Whether changes have been applied |
| `planFiles` | Map of schema name → plan file path (e.g. `{"public": ".postkit/db/plan_public.sql"}`) |
| `migrationFiles` | Array of migration file paths |
| `description` | Migration description |
| `schemaFingerprints` | Map of schema name → SHA-256 hash of that schema's source files |
| `migrationApplied` | Whether dbmate migration was applied |
| `seedsApplied` | Whether seeds were applied |

## Session Lifecycle

1. **Start**: `postkit db start` creates a new session
2. **Plan**: `postkit db plan` generates a plan and updates state
3. **Apply**: `postkit db apply` applies changes and updates state
4. **Commit**: `postkit db commit` finalizes the session and clears it
5. **Abort**: `postkit db abort` cancels the session and cleans up

## Related Files

| File | Description |
|------|-------------|
| `.postkit/db/session.json` | Current session state |
| `.postkit/db/committed.json` | Committed migrations tracking |
| `.postkit/db/plan_<name>.sql` | Generated migration plan per schema (e.g. `plan_public.sql`, `plan_app.sql`) |
| `.postkit/db/schema_<name>.sql` | Generated schema artifact per schema |
| `.postkit/db/session/` | Session migrations (temporary) |
| `.postkit/db/migrations/` | Committed migrations (for deploy) |
