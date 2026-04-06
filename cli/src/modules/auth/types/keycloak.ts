/**
 * Keycloak API types
 */

export interface KeycloakClient {
  secret?: string;
  [key: string]: unknown;
}

export interface KeycloakStorageProvider {
  config?: {bindCredential?: string; [key: string]: unknown};
  [key: string]: unknown;
}

export interface KeycloakComponents {
  "org.keycloak.keys.KeyProvider"?: unknown;
  "org.keycloak.storage.UserStorageProvider"?: KeycloakStorageProvider[];
  [key: string]: unknown;
}

export interface KeycloakIdentityProvider {
  config?: {clientSecret?: string; [key: string]: unknown};
  [key: string]: unknown;
}

export interface KeycloakRealm {
  users?: unknown[];
  clients?: KeycloakClient[];
  components?: KeycloakComponents;
  smtpServer?: {password?: string; [key: string]: unknown};
  identityProviders?: KeycloakIdentityProvider[];
  defaultRole?: {id?: string; [key: string]: unknown};
  [key: string]: unknown;
}
