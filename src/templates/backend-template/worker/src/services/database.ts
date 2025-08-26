import {Pool, PoolClient, QueryResult, QueryResultRow} from "pg";

export interface DatabaseConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface QueryOptions {
  name?: string;
  text: string;
  values?: any[];
}

export interface TransactionCallback<T> {
  (client: PoolClient): Promise<T>;
}

export interface DatabaseService {
  query<T extends QueryResultRow = any>(
    sql: string,
    params?: any[]
  ): Promise<QueryResult<T>>;
  queryOne<T extends QueryResultRow = any>(
    sql: string,
    params?: any[]
  ): Promise<T | null>;
  queryMany<T extends QueryResultRow = any>(
    sql: string,
    params?: any[]
  ): Promise<T[]>;
  transaction<T>(callback: TransactionCallback<T>): Promise<T>;
  getClient(): Promise<PoolClient>;
  close(): Promise<void>;
}

class DatabaseServiceImpl implements DatabaseService {
  private pool: Pool;
  private isConnected: boolean = false;

  constructor(config?: DatabaseConfig) {
    const dbConfig = config || {
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    this.pool = new Pool(dbConfig);

    this.pool.on("error", (err) => {
      console.error("Unexpected error on idle client", err);
    });

    this.pool.on("connect", () => {
      if (!this.isConnected) {
        console.log("Database connected successfully");
        this.isConnected = true;
      }
    });
  }

  async query<T extends QueryResultRow = any>(
    sql: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    try {
      const start = Date.now();
      const result = await this.pool.query<T>(sql, params);
      const duration = Date.now() - start;

      console.log("Executed query", {
        sql: sql.substring(0, 100) + (sql.length > 100 ? "..." : ""),
        duration: `${duration}ms`,
        rows: result.rowCount,
      });

      return result;
    } catch (error) {
      console.error("Database query error:", {
        sql: sql.substring(0, 100) + (sql.length > 100 ? "..." : ""),
        params,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  async queryOne<T extends QueryResultRow = any>(
    sql: string,
    params?: any[]
  ): Promise<T | null> {
    const result = await this.query<T>(sql, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async queryMany<T extends QueryResultRow = any>(
    sql: string,
    params?: any[]
  ): Promise<T[]> {
    const result = await this.query<T>(sql, params);
    return result.rows;
  }

  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  async close(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
    console.log("Database connection pool closed");
  }
}

// Singleton instance
const databaseService = new DatabaseServiceImpl();

// Common query patterns
export const DatabaseQueries = {
  // User queries
  findUserById: (id: string) =>
    databaseService.queryOne("SELECT * FROM users WHERE id = $1", [id]),

  findUserByEmail: (email: string) =>
    databaseService.queryOne("SELECT * FROM users WHERE email = $1", [email]),

  createUser: (userData: {name: string; email: string}) =>
    databaseService.queryOne(
      "INSERT INTO users (name, email, created_at) VALUES ($1, $2, NOW()) RETURNING *",
      [userData.name, userData.email]
    ),

  // Generic table operations
  findById: (table: string, id: string) =>
    databaseService.queryOne(`SELECT * FROM ${table} WHERE id = $1`, [id]),

  findAll: (table: string, limit?: number) => {
    const sql = limit
      ? `SELECT * FROM ${table} LIMIT $1`
      : `SELECT * FROM ${table}`;
    const params = limit ? [limit] : undefined;
    return databaseService.queryMany(sql, params);
  },

  count: (table: string, whereClause?: string, params?: any[]) => {
    const sql = whereClause
      ? `SELECT COUNT(*) as count FROM ${table} WHERE ${whereClause}`
      : `SELECT COUNT(*) as count FROM ${table}`;
    return databaseService.queryOne<{count: string}>(sql, params);
  },

  // Audit/logging
  logActivity: (activity: {user_id?: string; action: string; details?: any}) =>
    databaseService.query(
      "INSERT INTO activity_log (user_id, action, details, created_at) VALUES ($1, $2, $3, NOW())",
      [activity.user_id, activity.action, JSON.stringify(activity.details)]
    ),
};

export default databaseService;
