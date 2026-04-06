/**
 * Schema statement types
 */

export interface GrantStatement {
  schema: string;
  content: string;
}

export interface SeedStatement {
  name: string;
  content: string;
}

export interface InfraStatement {
  name: string;
  content: string;
}
