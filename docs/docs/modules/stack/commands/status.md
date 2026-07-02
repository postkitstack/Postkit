---
sidebar_position: 3
---

# stack status

Show running services, ports, and health status.

## Usage

```bash
postkit stack status
```

## What It Does

Reads `.postkit/stack/docker-compose.yml` and queries Docker for the current state of each container. Displays a table with service name, container name, state, health, and ports.
