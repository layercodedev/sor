import { DurableObject } from "cloudflare:workers";
import { SYSTEM_MIGRATIONS } from "./system-migrations.js";
import {
  renderStudioLandingPage,
  renderStudioDatabasePage,
} from "./studio.js";

interface Env {
  DB: DurableObjectNamespace<Db>;
  SOR_API_KEY: string;
  STUDIO_URL: string;
}

// Db Durable Object - each instance is a separate SQLite database
export class Db extends DurableObject<Env> {
  private ensureMigrationsTable() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sor_migrations (
        name TEXT PRIMARY KEY,
        sql TEXT NOT NULL,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async sql(query: string, params: any[] = []): Promise<any> {
    try {
      const cursor = this.ctx.storage.sql.exec(query, ...params);
      return {
        rows: cursor.toArray(),
        columns: cursor.columnNames,
        rowsRead: cursor.rowsRead,
        rowsWritten: cursor.rowsWritten,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  async migrate(name: string, sql: string): Promise<any> {
    this.ensureMigrationsTable();

    // Check if already applied
    const existing = this.ctx.storage.sql
      .exec("SELECT name FROM _sor_migrations WHERE name = ?", name)
      .toArray();

    if (existing.length > 0) {
      return { ok: false, error: "Migration already applied", name };
    }

    try {
      // Run migration in transaction
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(sql);
        this.ctx.storage.sql.exec(
          "INSERT INTO _sor_migrations (name, sql) VALUES (?, ?)",
          name,
          sql
        );
      });

      return { ok: true, name };
    } catch (error: any) {
      return { ok: false, error: error.message, name };
    }
  }

  async listMigrations(): Promise<any> {
    this.ensureMigrationsTable();
    const cursor = this.ctx.storage.sql.exec(
      "SELECT name, applied_at FROM _sor_migrations ORDER BY applied_at"
    );
    return { migrations: cursor.toArray() };
  }

  async getSchema(): Promise<any> {
    try {
      // Get all tables (excluding internal SQLite tables and our migrations table)
      const tablesCursor = this.ctx.storage.sql.exec(`
        SELECT name FROM sqlite_master
        WHERE type='table'
        AND name NOT LIKE 'sqlite_%'
        AND name != '_sor_migrations'
        ORDER BY name
      `);
      const tables = tablesCursor.toArray();

      // For each table, get its schema
      const schema = [];
      for (const table of tables) {
        const tableName = (table as any).name;
        const infoCursor = this.ctx.storage.sql.exec(
          `PRAGMA table_info(${tableName})`
        );
        const columns = infoCursor.toArray();
        schema.push({ table: tableName, columns });
      }

      return { schema };
    } catch (error: any) {
      return { error: error.message };
    }
  }
}

// Helper to get JSON body
async function getBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

// Helper to return JSON response
function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Registry DB name (stores list of all user databases)
const REGISTRY_DB = "_sor_registry";

// Main Worker
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Studio route - protected by Cloudflare Zero Trust Access (no auth check here)
    if (url.pathname === "/__studio") {
      const dbName = url.searchParams.get("db");
      if (!dbName) {
        return renderStudioLandingPage(env.SOR_API_KEY, env.STUDIO_URL);
      }
      return renderStudioDatabasePage(dbName, env.SOR_API_KEY, env.STUDIO_URL);
    }

    // Auth check
    const apiKey = request.headers.get("X-API-Key");
    if (apiKey !== env.SOR_API_KEY) {
      return json({ error: "Unauthorized" }, 401);
    }
    const path = url.pathname;
    const method = request.method;

    // Helper to get registry DO
    const getRegistry = () => {
      const id = env.DB.idFromName(REGISTRY_DB);
      return env.DB.get(id);
    };

    // Apply system migrations to registry
    const ensureSystemMigrations = async (registry: Db) => {
      for (const migration of SYSTEM_MIGRATIONS) {
        // Call existing migrate() method - no new migration logic
        const result = await registry.migrate(migration.name, migration.sql);
        if (!result.ok && result.error !== "Migration already applied") {
          console.error(`System migration failed: ${migration.name}`, result.error);
        }
      }
    };

    // Helper to ensure registry has dbs table via migrations
    const ensureRegistry = async () => {
      const registry = getRegistry();
      await ensureSystemMigrations(registry);
    };

    // Routes
    try {
      // POST /dbs - Create new database
      if (method === "POST" && path === "/dbs") {
        const { name, description } = await getBody<{ name: string; description?: string }>(request);

        if (!name || typeof name !== "string") {
          return json({ error: "name is required" }, 400);
        }

        if (name.startsWith("_sor_")) {
          return json({ error: "Database name cannot start with _sor_" }, 400);
        }

        await ensureRegistry();
        const registry = getRegistry();

        // Check if exists
        const existing = await registry.sql(
          "SELECT name FROM dbs WHERE name = ?",
          [name]
        );
        if (existing.rows.length > 0) {
          return json({ error: "Database already exists", name }, 409);
        }

        // Create entry in registry
        await registry.sql(
          "INSERT INTO dbs (name, description) VALUES (?, ?)",
          [name, description || null]
        );

        return json({ ok: true, name }, 201);
      }

      // GET /dbs - List all databases
      if (method === "GET" && path === "/dbs") {
        await ensureRegistry();
        const registry = getRegistry();
        const result = await registry.sql(
          "SELECT name, description, created_at FROM dbs ORDER BY created_at"
        );
        return json({ dbs: result.rows });
      }

      // DELETE /dbs/:name - Delete a database
      const deleteMatch = path.match(/^\/dbs\/([^/]+)$/);
      if (method === "DELETE" && deleteMatch) {
        const name = decodeURIComponent(deleteMatch[1]);

        if (name.startsWith("_sor_")) {
          return json({ error: "Cannot delete system database" }, 400);
        }

        await ensureRegistry();
        const registry = getRegistry();

        // Check if exists
        const existing = await registry.sql(
          "SELECT name FROM dbs WHERE name = ?",
          [name]
        );
        if (existing.rows.length === 0) {
          return json({ error: "Database not found", name }, 404);
        }

        // Remove from registry
        await registry.sql("DELETE FROM dbs WHERE name = ?", [name]);

        // Note: The actual DO storage persists until Cloudflare garbage collects it
        // There's no API to explicitly delete a DO's storage

        return json({ ok: true, name });
      }

      // POST /db/:db/sql - Execute SQL
      const sqlMatch = path.match(/^\/db\/([^/]+)\/sql$/);
      if (method === "POST" && sqlMatch) {
        const dbName = decodeURIComponent(sqlMatch[1]);
        const { sql, params = [] } = await getBody<{
          sql: string;
          params?: any[];
        }>(request);

        if (!sql || typeof sql !== "string") {
          return json({ error: "sql is required" }, 400);
        }

        const id = env.DB.idFromName(dbName);
        const db = env.DB.get(id);
        const result = await db.sql(sql, params);

        if (result.error) {
          return json({ error: result.error }, 400);
        }

        return json(result);
      }

      // POST /db/:db/migrate - Run migration
      const migrateMatch = path.match(/^\/db\/([^/]+)\/migrate$/);
      if (method === "POST" && migrateMatch) {
        const dbName = decodeURIComponent(migrateMatch[1]);
        const { name, sql } = await getBody<{ name: string; sql: string }>(
          request
        );

        if (!name || typeof name !== "string") {
          return json({ error: "name is required" }, 400);
        }
        if (!sql || typeof sql !== "string") {
          return json({ error: "sql is required" }, 400);
        }

        const id = env.DB.idFromName(dbName);
        const db = env.DB.get(id);
        const result = await db.migrate(name, sql);

        return json(result, result.ok ? 200 : 400);
      }

      // GET /db/:db/migrations - List migrations
      const migrationsMatch = path.match(/^\/db\/([^/]+)\/migrations$/);
      if (method === "GET" && migrationsMatch) {
        const dbName = decodeURIComponent(migrationsMatch[1]);

        const id = env.DB.idFromName(dbName);
        const db = env.DB.get(id);
        const result = await db.listMigrations();

        return json(result);
      }

      // GET /db/:db/schema - Get database schema
      const schemaMatch = path.match(/^\/db\/([^/]+)\/schema$/);
      if (method === "GET" && schemaMatch) {
        const dbName = decodeURIComponent(schemaMatch[1]);

        // Get schema from database
        const id = env.DB.idFromName(dbName);
        const db = env.DB.get(id);
        const result = await db.getSchema();

        if (result.error) {
          return json({ error: result.error }, 400);
        }

        // Get description from registry
        await ensureRegistry();
        const registry = getRegistry();
        const dbInfo = await registry.sql(
          "SELECT description FROM dbs WHERE name = ?",
          [dbName]
        );

        // Add description to result
        const description = dbInfo.rows.length > 0 ? (dbInfo.rows[0] as any).description : null;
        return json({ ...result, description });
      }

      // 404 for unknown routes
      return json({ error: "Not found" }, 404);
    } catch (error: any) {
      return json({ error: error.message }, 500);
    }
  },
};
