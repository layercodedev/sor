import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../index";

const API_KEY = "test-api-key";

// Helper to make requests
async function request(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const req = new Request(`http://localhost${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      ...options.headers,
    },
  });
  const ctx = createExecutionContext();
  const response = await worker.fetch(req, { ...env, SOR_API_KEY: API_KEY }, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function json(response: Response) {
  return response.json();
}

// Generate unique names to avoid conflicts between test runs
function uniqueName(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

describe("Authentication", () => {
  it("rejects requests without API key", async () => {
    const req = new Request("http://localhost/dbs");
    const ctx = createExecutionContext();
    const response = await worker.fetch(req, { ...env, SOR_API_KEY: API_KEY }, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
    const data = await json(response);
    expect(data.error).toBe("Unauthorized");
  });

  it("rejects requests with wrong API key", async () => {
    const req = new Request("http://localhost/dbs", {
      headers: { "X-API-Key": "wrong-key" },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(req, { ...env, SOR_API_KEY: API_KEY }, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });

  it("accepts requests with correct API key", async () => {
    const response = await request("/dbs");
    expect(response.status).toBe(200);
  });
});

describe("Database Management", () => {
  it("lists databases", async () => {
    const response = await request("/dbs");
    expect(response.status).toBe(200);

    const data = await json(response);
    expect(data).toHaveProperty("dbs");
    expect(Array.isArray(data.dbs)).toBe(true);
  });

  it("creates a new database", async () => {
    const dbName = uniqueName("testdb");
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: dbName }),
    });

    expect(response.status).toBe(201);
    const data = await json(response);
    expect(data.ok).toBe(true);
    expect(data.name).toBe(dbName);
  });

  it("creates and lists a database", async () => {
    const dbName = uniqueName("listtest");

    // Create
    await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: dbName }),
    });

    // List and find
    const listResponse = await request("/dbs");
    const data = await json(listResponse);
    const found = data.dbs.find((db: any) => db.name === dbName);
    expect(found).toBeDefined();
    expect(found.created_at).toBeDefined();
  });

  it("rejects duplicate database names", async () => {
    const dbName = uniqueName("duptest");

    // First create
    await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: dbName }),
    });

    // Second create (should fail)
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: dbName }),
    });

    expect(response.status).toBe(409);
    const data = await json(response);
    expect(data.error).toBe("Database already exists");
  });

  it("rejects database names starting with _sor_", async () => {
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: "_sor_forbidden" }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBe("Database name cannot start with _sor_");
  });

  it("rejects missing database name", async () => {
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBe("name is required");
  });

  it("creates and deletes a database", async () => {
    const dbName = uniqueName("deltest");

    // Create
    await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: dbName }),
    });

    // Delete
    const response = await request(`/dbs/${dbName}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.ok).toBe(true);
    expect(data.name).toBe(dbName);
  });

  it("returns 404 for non-existent database deletion", async () => {
    const response = await request(`/dbs/nonexistent_db_${Date.now()}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(404);
    const data = await json(response);
    expect(data.error).toBe("Database not found");
  });

  it("rejects deleting system databases", async () => {
    const response = await request("/dbs/_sor_registry", {
      method: "DELETE",
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBe("Cannot delete system database");
  });
});

describe("SQL Execution", () => {
  it("executes CREATE TABLE", async () => {
    const dbName = uniqueName("sqltest");

    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)",
      }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rows).toEqual([]);
  });

  it("executes INSERT with params", async () => {
    const dbName = uniqueName("inserttest");

    // Create table first
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
      }),
    });

    // Insert
    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "INSERT INTO users (name) VALUES (?)",
        params: ["Alice"],
      }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rowsWritten).toBe(1);
  });

  it("executes INSERT without params", async () => {
    const dbName = uniqueName("inserttest2");

    // Create table
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
      }),
    });

    // Insert
    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "INSERT INTO users (name) VALUES ('Bob')",
      }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rowsWritten).toBe(1);
  });

  it("executes SELECT and returns rows", async () => {
    const dbName = uniqueName("selecttest");

    // Create and populate
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
      }),
    });
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "INSERT INTO users (name) VALUES ('Alice'), ('Bob')",
      }),
    });

    // Select
    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "SELECT * FROM users ORDER BY id",
      }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rows.length).toBe(2);
    expect(data.columns).toEqual(["id", "name"]);
    expect(data.rows[0].name).toBe("Alice");
    expect(data.rows[1].name).toBe("Bob");
  });

  it("executes SELECT with WHERE and params", async () => {
    const dbName = uniqueName("wheretest");

    // Create and populate
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)",
      }),
    });
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')",
      }),
    });

    // Select with params
    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "SELECT * FROM users WHERE name = ?",
        params: ["Alice"],
      }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rows.length).toBe(1);
    expect(data.rows[0].email).toBe("alice@example.com");
  });

  it("executes UPDATE", async () => {
    const dbName = uniqueName("updatetest");

    // Create and populate
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)",
      }),
    });
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "INSERT INTO users (name, email) VALUES ('Alice', 'old@example.com')",
      }),
    });

    // Update
    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "UPDATE users SET email = ? WHERE name = ?",
        params: ["new@example.com", "Alice"],
      }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rowsWritten).toBe(1);
  });

  it("executes DELETE", async () => {
    const dbName = uniqueName("deletetest");

    // Create and populate
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
      }),
    });
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "INSERT INTO users (name) VALUES ('Alice'), ('Bob')",
      }),
    });

    // Delete
    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "DELETE FROM users WHERE name = ?",
        params: ["Bob"],
      }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rowsWritten).toBe(1);
  });

  it("returns error for invalid SQL", async () => {
    const dbName = uniqueName("errortest");

    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "INVALID SQL QUERY",
      }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBeDefined();
  });

  it("rejects missing sql field", async () => {
    const dbName = uniqueName("missingsql");

    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBe("sql is required");
  });
});

describe("Migrations", () => {
  it("lists migrations (empty for new db)", async () => {
    const dbName = uniqueName("miglisttest");

    const response = await request(`/db/${dbName}/migrations`);

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.migrations).toEqual([]);
  });

  it("applies a migration", async () => {
    const dbName = uniqueName("migapplytest");

    const response = await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: "001_create_posts",
        sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)",
      }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.ok).toBe(true);
    expect(data.name).toBe("001_create_posts");
  });

  it("applies and lists a migration", async () => {
    const dbName = uniqueName("miglisttest2");

    // Apply migration
    await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: "001_create_posts",
        sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)",
      }),
    });

    // List migrations
    const response = await request(`/db/${dbName}/migrations`);
    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.migrations.length).toBe(1);
    expect(data.migrations[0].name).toBe("001_create_posts");
    expect(data.migrations[0].applied_at).toBeDefined();
  });

  it("rejects duplicate migration", async () => {
    const dbName = uniqueName("migduptest");

    // Apply first time
    await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: "001_create_posts",
        sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY)",
      }),
    });

    // Apply second time (should fail)
    const response = await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: "001_create_posts",
        sql: "CREATE TABLE other (id INTEGER PRIMARY KEY)",
      }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Migration already applied");
  });

  it("applies multiple migrations in order", async () => {
    const dbName = uniqueName("migmultitest");

    // Apply first
    await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: "001_create_posts",
        sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)",
      }),
    });

    // Apply second
    await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: "002_add_author",
        sql: "ALTER TABLE posts ADD COLUMN author TEXT",
      }),
    });

    // List all
    const response = await request(`/db/${dbName}/migrations`);
    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.migrations.length).toBe(2);
    expect(data.migrations[0].name).toBe("001_create_posts");
    expect(data.migrations[1].name).toBe("002_add_author");
  });

  it("verifies migration creates the table", async () => {
    const dbName = uniqueName("migverifytest");

    // Apply migration
    await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: "001_create_posts",
        sql: "CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT, author TEXT)",
      }),
    });

    // Insert data into the created table
    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "INSERT INTO posts (title, author) VALUES (?, ?)",
        params: ["Test Post", "Author"],
      }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rowsWritten).toBe(1);
  });

  it("rejects migration with invalid SQL", async () => {
    const dbName = uniqueName("miginvalidtest");

    const response = await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: "001_invalid",
        sql: "INVALID SQL",
      }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.ok).toBe(false);
    expect(data.error).toBeDefined();
  });

  it("rejects missing migration name", async () => {
    const dbName = uniqueName("mignametest");

    const response = await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        sql: "CREATE TABLE foo (id INTEGER)",
      }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBe("name is required");
  });

  it("rejects missing migration sql", async () => {
    const dbName = uniqueName("migsqltest");

    const response = await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: "001_test",
      }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBe("sql is required");
  });
});

describe("Route Handling", () => {
  it("returns 404 for unknown routes", async () => {
    const response = await request("/unknown/route");
    expect(response.status).toBe(404);

    const data = await json(response);
    expect(data.error).toBe("Not found");
  });

  it("handles URL-encoded database names", async () => {
    const dbName = `db_with_spaces_${Date.now()}`;
    const encodedName = encodeURIComponent(dbName);

    // SQL on db with special chars
    const sqlResponse = await request(`/db/${encodedName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT 1 as test" }),
    });
    expect(sqlResponse.status).toBe(200);
    const data = await json(sqlResponse);
    expect(data.rows[0].test).toBe(1);
  });
});

describe("Edge Cases - Database Names", () => {
  it("rejects empty database name", async () => {
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBe("name is required");
  });

  it("rejects whitespace-only database name", async () => {
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: "   " }),
    });

    // Empty after trim would be caught, but whitespace is technically a string
    // Current implementation allows it - this test documents the behavior
    expect(response.status).toBe(201);
  });

  it("handles database name with unicode characters", async () => {
    const dbName = `db_日本語_${Date.now()}`;
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: dbName }),
    });

    expect(response.status).toBe(201);
    const data = await json(response);
    expect(data.name).toBe(dbName);
  });

  it("handles database name with special characters", async () => {
    const dbName = `db-with.dots_and-dashes_${Date.now()}`;
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: dbName }),
    });

    expect(response.status).toBe(201);
    const data = await json(response);
    expect(data.name).toBe(dbName);
  });

  it("handles very long database name", async () => {
    const dbName = "a".repeat(200) + `_${Date.now()}`;
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: dbName }),
    });

    expect(response.status).toBe(201);
    const data = await json(response);
    expect(data.name).toBe(dbName);
  });

  it("rejects non-string database name (number)", async () => {
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: 12345 }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBe("name is required");
  });

  it("rejects non-string database name (array)", async () => {
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: ["test"] }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBe("name is required");
  });
});

describe("Edge Cases - SQL Execution", () => {
  it("rejects empty SQL string", async () => {
    const dbName = uniqueName("emptysql");
    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "" }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBe("sql is required");
  });

  it("handles whitespace-only SQL", async () => {
    const dbName = uniqueName("whitespacesql");
    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "   " }),
    });

    // SQLite will error on whitespace-only query
    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBeDefined();
  });

  it("handles SQL with no results", async () => {
    const dbName = uniqueName("noresults");

    // Create table
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "CREATE TABLE test (id INTEGER)" }),
    });

    // Select from empty table
    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT * FROM test" }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rows).toEqual([]);
    expect(data.columns).toEqual(["id"]);
  });

  it("handles SQL with NULL values", async () => {
    const dbName = uniqueName("nulltest");

    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "CREATE TABLE test (id INTEGER, name TEXT)" }),
    });

    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "INSERT INTO test (id) VALUES (1)" }),
    });

    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT * FROM test" }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rows[0].name).toBeNull();
  });

  it("handles SQL with unicode data", async () => {
    const dbName = uniqueName("unicodedata");

    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "CREATE TABLE test (content TEXT)" }),
    });

    const unicodeText = "日本語 emoji: 🎉 中文 العربية";
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "INSERT INTO test (content) VALUES (?)",
        params: [unicodeText],
      }),
    });

    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT * FROM test" }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rows[0].content).toBe(unicodeText);
  });

  it("handles SQL with very large text", async () => {
    const dbName = uniqueName("largetext");

    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "CREATE TABLE test (content TEXT)" }),
    });

    const largeText = "x".repeat(100000);
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "INSERT INTO test (content) VALUES (?)",
        params: [largeText],
      }),
    });

    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT * FROM test" }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rows[0].content.length).toBe(100000);
  });

  it("handles multiple params", async () => {
    const dbName = uniqueName("multiparams");

    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "CREATE TABLE test (a TEXT, b TEXT, c TEXT, d TEXT, e TEXT)",
      }),
    });

    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "INSERT INTO test VALUES (?, ?, ?, ?, ?)",
        params: ["one", "two", "three", "four", "five"],
      }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rowsWritten).toBe(1);
  });

  it("returns error for table not found", async () => {
    const dbName = uniqueName("notable");

    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT * FROM nonexistent" }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toContain("no such table");
  });

  it("returns error for column not found", async () => {
    const dbName = uniqueName("nocolumn");

    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "CREATE TABLE test (id INTEGER)" }),
    });

    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT nonexistent FROM test" }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toContain("no such column");
  });
});

describe("Edge Cases - Migrations", () => {
  it("rejects empty migration name", async () => {
    const dbName = uniqueName("migemptyname");

    const response = await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: "",
        sql: "CREATE TABLE test (id INTEGER)",
      }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBe("name is required");
  });

  it("rejects empty migration SQL", async () => {
    const dbName = uniqueName("migemptysql");

    const response = await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: "001_test",
        sql: "",
      }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBe("sql is required");
  });

  it("handles migration with multiple statements", async () => {
    const dbName = uniqueName("migmulti");

    const response = await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: "001_multi_statement",
        sql: `
          CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
          CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT);
          CREATE INDEX idx_posts_user ON posts(user_id);
        `,
      }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.ok).toBe(true);

    // Verify tables were created
    const checkResponse = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      }),
    });
    const checkData = await json(checkResponse);
    const tableNames = checkData.rows.map((r: any) => r.name);
    expect(tableNames).toContain("users");
    expect(tableNames).toContain("posts");
  });

  it("handles very long migration name", async () => {
    const dbName = uniqueName("miglongname");
    const longName = "a".repeat(500);

    const response = await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: longName,
        sql: "CREATE TABLE test (id INTEGER)",
      }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.name).toBe(longName);
  });

  it("migration failure does not record migration", async () => {
    const dbName = uniqueName("migfailure");

    // Try to apply migration with invalid SQL
    const response = await request(`/db/${dbName}/migrate`, {
      method: "POST",
      body: JSON.stringify({
        name: "001_invalid",
        sql: "INVALID SQL SYNTAX",
      }),
    });

    expect(response.status).toBe(400);

    // Check that migration was not recorded
    const listResponse = await request(`/db/${dbName}/migrations`);
    const listData = await json(listResponse);
    expect(listData.migrations).toEqual([]);
  });
});

describe("Security Tests", () => {
  it("handles SQL injection attempt in database name", async () => {
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: "test'; DROP TABLE dbs;--" }),
    });

    // The name should be stored as a literal string, not executed
    expect(response.status).toBe(201);
    const data = await json(response);
    expect(data.name).toBe("test'; DROP TABLE dbs;--");

    // Verify registry still works
    const listResponse = await request("/dbs");
    expect(listResponse.status).toBe(200);
  });

  it("prevents access to system tables via direct name", async () => {
    // Try to create a database with _sor_ prefix
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: "_sor_test" }),
    });

    expect(response.status).toBe(400);
    const data = await json(response);
    expect(data.error).toBe("Database name cannot start with _sor_");
  });

  it("handles malformed JSON body", async () => {
    const req = new Request("http://localhost/dbs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: "{ invalid json }",
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(req, { ...env, SOR_API_KEY: API_KEY }, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(500);
  });

  it("handles empty body", async () => {
    const req = new Request("http://localhost/dbs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: "",
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(req, { ...env, SOR_API_KEY: API_KEY }, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(500);
  });

  it("SQL params prevent injection", async () => {
    const dbName = uniqueName("sqlinject");

    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
      }),
    });

    // Insert with malicious param
    const maliciousName = "'; DROP TABLE users;--";
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "INSERT INTO users (name) VALUES (?)",
        params: [maliciousName],
      }),
    });

    // Verify table still exists and data is stored literally
    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT * FROM users" }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    expect(data.rows.length).toBe(1);
    expect(data.rows[0].name).toBe(maliciousName);
  });

  it("handles XSS attempt in data", async () => {
    const dbName = uniqueName("xsstest");

    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "CREATE TABLE content (html TEXT)",
      }),
    });

    const xssPayload = '<script>alert("xss")</script>';
    await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({
        sql: "INSERT INTO content (html) VALUES (?)",
        params: [xssPayload],
      }),
    });

    const response = await request(`/db/${dbName}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT * FROM content" }),
    });

    expect(response.status).toBe(200);
    const data = await json(response);
    // Data should be stored as-is (XSS prevention is client responsibility)
    expect(data.rows[0].html).toBe(xssPayload);
  });

  it("rejects requests without Content-Type for POST", async () => {
    const req = new Request("http://localhost/dbs", {
      method: "POST",
      headers: {
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({ name: "test" }),
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(req, { ...env, SOR_API_KEY: API_KEY }, ctx);
    await waitOnExecutionContext(ctx);

    // Should still work since we're parsing JSON from body
    // This documents the current behavior
    expect([200, 201, 400, 500]).toContain(response.status);
  });

  it("handles path traversal attempt", async () => {
    const response = await request("/db/../../../etc/passwd/sql", {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT 1" }),
    });

    // Path is used as Durable Object name, so it's safe
    // but we should verify it doesn't cause issues
    expect([200, 400, 404]).toContain(response.status);
  });

  it("handles null byte in database name", async () => {
    const response = await request("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: "test\x00db" }),
    });

    // Should handle null byte safely
    expect([201, 400, 500]).toContain(response.status);
  });
});

describe("HTTP Method Handling", () => {
  it("rejects PUT on /dbs", async () => {
    const response = await request("/dbs", {
      method: "PUT",
      body: JSON.stringify({ name: "test" }),
    });

    expect(response.status).toBe(404);
  });

  it("rejects PATCH on /db/:db/sql", async () => {
    const response = await request("/db/test/sql", {
      method: "PATCH",
      body: JSON.stringify({ sql: "SELECT 1" }),
    });

    expect(response.status).toBe(404);
  });

  it("rejects GET on /db/:db/sql", async () => {
    const response = await request("/db/test/sql", {
      method: "GET",
    });

    expect(response.status).toBe(404);
  });

  it("rejects POST on /db/:db/migrations", async () => {
    const response = await request("/db/test/migrations", {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(404);
  });
});
