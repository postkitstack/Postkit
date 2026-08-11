---
sidebar_position: 1
---

# Agent Skills

PostKit ships with **agent skills** — reusable instruction sets that teach AI coding assistants (Claude Code, Cursor, Codex, etc.) how to work with PostKit workflows. Skills follow the [Agent Skills open standard](https://agentskills.io).

## Available Skills

| Skill | Invoke | When It Triggers |
|-------|--------|-----------------|
| `postkit-migrate` | `/postkit-migrate` | Database migrations, deploys, schema diffs |
| `postkit-setup` | `/postkit-setup` | Project init, config, remotes setup |
| `postkit-schema` | `/postkit-schema` | Editing `db/schema/` files |
| `postkit-auth` | `/postkit-auth` | Keycloak, auth config, SSO |

## Install Skills

Use the [skills CLI](https://github.com/vercel-labs/skills) to install PostKit skills into your project:

```bash
# Install all PostKit skills (interactive)
npx skills add postkitstack/Postkit

# List available skills first
npx skills add postkitstack/Postkit --list

# Install specific skills only
npx skills add postkitstack/Postkit --skill postkit-migrate --skill postkit-schema

# Install for a specific agent (e.g., Claude Code)
npx skills add postkitstack/Postkit -a claude-code

# Non-interactive (CI/CD friendly) — name each skill explicitly.
# Avoid `--all`: it expands to every skill *and* every agent, and it
# bypasses the internal-skill filter, so it also pulls PostKit's own
# repo-maintenance skills into your project.
npx skills add postkitstack/Postkit -y --agent claude-code \
  --skill postkit-migrate --skill postkit-setup \
  --skill postkit-schema --skill postkit-auth
```

### Scope

| Scope | Flag | Location (Claude Code) | Use Case |
|-------|------|------------------------|----------|
| **Project** (default) | | `./.claude/skills/` | Committed with your project, shared with team |
| **Global** | `-g` | `~/.claude/skills/` | Available across all your projects |

The exact directory depends on the agent. Claude Code uses `.claude/skills/`; Cursor, Codex, Cline, Gemini CLI, and GitHub Copilot share the standard `.agents/skills/`; Windsurf and Roo Code use `.windsurf/skills/` and `.roo/skills/`. The CLI picks the right one for each agent you install to.

By default, skills are **symlinked** — a single source of truth that's easy to update. Use `--copy` for independent copies when symlinks aren't supported.

### Verify the Install

```bash
npx skills list
```

You should see the four `postkit-*` skills. In Claude Code, `/postkit-migrate` and friends become available in new sessions.

### Update Skills

```bash
# Update all installed skills
npx skills update

# Update a specific skill
npx skills update postkit-auth
```

## Supported Agents

PostKit skills work with any agent that supports the Agent Skills standard, including:

| Agent | `--agent` flag |
|-------|---------------|
| Claude Code | `claude-code` |
| Cursor | `cursor` |
| Codex | `codex` |
| Cline | `cline` |
| Gemini CLI | `gemini-cli` |
| GitHub Copilot | `github-copilot` |
| Windsurf | `windsurf` |
| Roo Code | `roo` |

The `npx skills add` CLI auto-detects which agents you have installed. See the [full list of supported agents](https://github.com/vercel-labs/skills#supported-agents).
