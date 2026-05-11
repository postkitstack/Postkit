import fs from "fs";
import path from "path";
import type {StackConfig} from "../types/config";
import {getStackDir} from "../utils/stack-config";

/** All supported service names. */
export const ALL_SERVICES = ["postgres", "keycloak", "postgrest"] as const;
export type ServiceName = (typeof ALL_SERVICES)[number];

/**
 * Resolve which services to start based on user selection.
 * Always includes postgres if keycloak or postgrest are selected (dependency).
 */
export function getSelectedServices(
  config: StackConfig,
  requested: string[],
): ServiceName[] {
  // Validate requested names
  const valid = new Set<string>(ALL_SERVICES);
  for (const name of requested) {
    if (!valid.has(name)) {
      throw new Error(
        `Unknown service: "${name}". Available services: ${ALL_SERVICES.join(", ")}`,
      );
    }
  }

  // If none specified, use all enabled services
  const selected = requested.length > 0
    ? requested
    : ALL_SERVICES.filter((s) => {
        const svc = config[s as keyof StackConfig];
        return typeof svc === "object" && "enabled" in svc ? svc.enabled : true;
      });

  // Always include postgres if keycloak or postgrest are selected
  const set = new Set<ServiceName>(selected as ServiceName[]);
  if (set.has("keycloak") || set.has("postgrest")) {
    set.add("postgres");
  }

  return Array.from(set);
}

/**
 * Generate a docker-compose.yml string from the resolved config.
 */
export function generateComposeFile(
  config: StackConfig,
  services: ServiceName[],
): string {
  const sections: string[] = ["services:"];

  if (services.includes("postgres")) {
    sections.push(renderPostgres(config));
  }

  if (services.includes("keycloak")) {
    sections.push(renderKeycloak(config));
  }

  if (services.includes("postgrest")) {
    sections.push(renderPostgrest(config));
  }

  // Network
  sections.push(`
networks:
  ${config.network}:
    driver: bridge
`);

  // Volumes
  const volumes: string[] = [];
  if (services.includes("postgres")) {
    volumes.push(`  ${config.postgres.volume}:`);
  }
  if (services.includes("keycloak")) {
    volumes.push(`  ${config.keycloak.volume}:`);
  }
  if (volumes.length > 0) {
    sections.push("volumes:\n" + volumes.join("\n") + "\n");
  }

  return sections.join("\n") + "\n";
}

/**
 * Write the compose file to .postkit/stack/docker-compose.yml.
 * Returns the file path.
 */
export function writeComposeFile(
  config: StackConfig,
  services: ServiceName[],
): string {
  const stackDir = getStackDir();
  fs.mkdirSync(stackDir, {recursive: true});

  const content = generateComposeFile(config, services);
  const filePath = path.join(stackDir, "docker-compose.yml");
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// ============================================
// Service Renderers
// ============================================

function renderPostgres(config: StackConfig): string {
  const pg = config.postgres;
  const image = pg.image.replace("${pgVersion}", String(pg.pgVersion));
  return `
  postgres:
    image: ${image}
    container_name: postkit-postgres
    ports:
      - "${pg.port}:5432"
    environment:
      POSTGRES_USER: ${pg.user}
      POSTGRES_PASSWORD: ${pg.password}
      POSTGRES_DB: ${pg.database}
    volumes:
      - ${pg.volume}:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${pg.user}"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - ${config.network}
`;
}

function renderKeycloak(config: StackConfig): string {
  const kc = config.keycloak;
  const pg = config.postgres;
  return `
  keycloak:
    image: ${kc.image}
    container_name: postkit-keycloak
    command: start-dev
    ports:
      - "${kc.port}:8080"
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/${pg.database}
      KC_DB_USERNAME: ${pg.user}
      KC_DB_PASSWORD: ${pg.password}
      KEYCLOAK_ADMIN: ${kc.adminUser}
      KEYCLOAK_ADMIN_PASSWORD: ${kc.adminPassword}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8080/ -o /dev/null || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 15
      start_period: 45s
    networks:
      - ${config.network}
`;
}

function renderPostgrest(config: StackConfig): string {
  const pr = config.postgrest;
  const pg = config.postgres;
  return `
  postgrest:
    image: ${pr.image}
    container_name: postkit-postgrest
    ports:
      - "${pr.port}:3000"
    environment:
      PGRST_DB_URI: postgres://${pg.user}:${pg.password}@postgres:5432/${pg.database}
      PGRST_DB_SCHEMAS: ${pr.dbSchema}
      PGRST_DB_ANON_ROLE: ${pr.dbAnonRole}
      PGRST_JWT_SECRET: ${pr.jwtSecret}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - ${config.network}
`;
}
