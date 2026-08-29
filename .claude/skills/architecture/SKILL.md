---
name: architecture
description: Review and propose system architecture decisions, generate ADRs.
metadata:
  internal: true
---

# Architecture Skill

Review and propose architecture decisions for the PostKit CLI project.

## Project Context

- `CLAUDE.md` — Project structure and module architecture
- `cli/docs/architecture.md` — Current system architecture documentation
- `cli/docs/db.md` — Database module architecture
- `cli/docs/auth.md` — Auth module architecture

## Workflow

### Step 1: Scope the Review
Determine what needs architectural analysis:
- New module proposal
- Cross-module dependency concern
- Performance or scalability question
- Technology choice (e.g., binary bundling, config format)
- Breaking change impact

### Step 2: Analyze Current Architecture
1. Read relevant source files in `cli/src/`
2. Check module boundaries in `cli/src/modules/*/index.ts`
3. Review dependency direction (commands → services → utils)
4. Identify coupling points and potential issues

### Step 3: Generate ADR
Create an Architecture Decision Record in `cli/docs/adr/`:

```markdown
# NNNN: Title

**Status**: Proposed | Accepted | Deprecated | Superseded
**Date**: YYYY-MM-DD

## Context
[What is the issue motivating this decision?]

## Decision
[What is the change being proposed?]

## Consequences
[What becomes easier or more difficult?]

## Alternatives Considered
[What other options were evaluated?]
```

### Step 4: Review Checklist
- [ ] Module boundaries respected
- [ ] Dependency direction correct (commands → services)
- [ ] Error propagation consistent
- [ ] Configuration validation approach
- [ ] Binary resolution strategy
- [ ] Plugin extensibility maintained

## ADR Naming
- Store in `cli/docs/adr/`
- Format: `NNNN-kebab-case-title.md`
- Number sequentially from existing ADRs
