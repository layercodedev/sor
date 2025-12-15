import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Config } from "@oclif/core";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Test config directory
const testDir = join(tmpdir(), `sor-test-${process.pid}`);
const testConfigDir = join(testDir, ".sor");

// Override homedir for tests
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => testDir,
  };
});

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function setupConfig(config: { url?: string; key?: string } = {}) {
  mkdirSync(testConfigDir, { recursive: true });
  writeFileSync(join(testConfigDir, "config.json"), JSON.stringify(config));
}

function cleanupConfig() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true });
  }
}

beforeEach(() => {
  mockFetch.mockReset();
  cleanupConfig();
});

afterEach(() => {
  cleanupConfig();
});

describe("Config Set Command", () => {
  it("saves url to config file", async () => {
    const ConfigSetCommand = (await import("../commands/config/set.js")).default;

    // Create a mock config for oclif
    const config = await Config.load({ root: process.cwd() });
    const cmd = new ConfigSetCommand(["url", "http://test.example.com"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(logSpy).toHaveBeenCalledWith("Set url = http://test.example.com");

    // Verify config was saved
    const savedConfig = JSON.parse(
      require("node:fs").readFileSync(join(testConfigDir, "config.json"), "utf-8")
    );
    expect(savedConfig.url).toBe("http://test.example.com");
  });

  it("saves key to config file", async () => {
    const ConfigSetCommand = (await import("../commands/config/set.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new ConfigSetCommand(["key", "my-api-key"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(logSpy).toHaveBeenCalledWith("Set key = my-api-key");
  });
});

describe("DB List Command", () => {
  it("lists databases", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        dbs: [{ name: "testdb", created_at: "2025-01-01T00:00:00Z" }],
      }),
    });

    const DbListCommand = (await import("../commands/db/list.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbListCommand([], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8787/dbs",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "test-key",
        }),
      })
    );
    expect(logSpy).toHaveBeenCalled();
  });

  it("formats output as table", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        dbs: [
          { name: "db1", created_at: "2025-01-01" },
          { name: "db2", created_at: "2025-01-02" },
        ],
      }),
    });

    const DbListCommand = (await import("../commands/db/list.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbListCommand(["-o", "table"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    // Check table output contains headers and separators
    const calls = logSpy.mock.calls.flat().join("\n");
    expect(calls).toContain("name");
    expect(calls).toContain("db1");
    expect(calls).toContain("|");
  });
});

describe("DB Create Command", () => {
  it("creates a database", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, name: "newdb" }),
    });

    const DbCreateCommand = (await import("../commands/db/create.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbCreateCommand(["newdb"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8787/dbs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "newdb" }),
      })
    );
    expect(logSpy).toHaveBeenCalledWith("Created database: newdb");
  });

  it("creates a database with description", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, name: "myapp" }),
    });

    const DbCreateCommand = (await import("../commands/db/create.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbCreateCommand(["myapp", "--desc", "My app database"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8787/dbs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "myapp", description: "My app database" }),
      })
    );
    expect(logSpy).toHaveBeenCalledWith("Created database: myapp");
  });
});

describe("DB Delete Command", () => {
  it("deletes a database", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, name: "olddb" }),
    });

    const DbDeleteCommand = (await import("../commands/db/delete.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbDeleteCommand(["olddb"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8787/dbs/olddb",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(logSpy).toHaveBeenCalledWith("Deleted database: olddb");
  });
});

describe("DB Schema Command", () => {
  it("gets database schema", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        schema: [
          {
            table: "users",
            columns: [
              { name: "id", type: "INTEGER", notnull: 1, pk: 1, dflt_value: null },
              { name: "name", type: "TEXT", notnull: 0, pk: 0, dflt_value: null },
            ],
          },
        ],
      }),
    });

    const DbSchemaCommand = (await import("../commands/db/schema.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbSchemaCommand(["testdb"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8787/db/testdb/schema",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "test-key",
        }),
      })
    );
    expect(logSpy).toHaveBeenCalled();
  });
});

describe("SQL Command", () => {
  it("executes SQL query", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rows: [{ id: 1, name: "Alice" }],
        columns: ["id", "name"],
        rowsRead: 1,
        rowsWritten: 0,
      }),
    });

    const SqlCommand = (await import("../commands/sql.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new SqlCommand(["testdb", "SELECT * FROM users"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8787/db/testdb/sql",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sql: "SELECT * FROM users", params: [] }),
      })
    );
    expect(logSpy).toHaveBeenCalled();
  });

  it("passes params to SQL query", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rows: [{ id: 1, name: "Alice" }],
        columns: ["id", "name"],
        rowsRead: 1,
        rowsWritten: 0,
      }),
    });

    const SqlCommand = (await import("../commands/sql.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new SqlCommand(["testdb", "SELECT * FROM users WHERE id = ?", "-p", "[1]"], config);

    await cmd.run();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ sql: "SELECT * FROM users WHERE id = ?", params: [1] }),
      })
    );
  });

  it("outputs CSV format", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rows: [{ id: 1, name: "Alice" }],
        columns: ["id", "name"],
        rowsRead: 1,
        rowsWritten: 0,
      }),
    });

    const SqlCommand = (await import("../commands/sql.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new SqlCommand(["testdb", "SELECT * FROM users", "-o", "csv"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("id,name");
  });
});

describe("Migrate Command", () => {
  it("runs a migration", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, name: "001_create_users" }),
    });

    const MigrateCommand = (await import("../commands/migrate.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new MigrateCommand([
      "testdb",
      "001_create_users",
      "CREATE TABLE users (id INTEGER PRIMARY KEY)",
    ], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8787/db/testdb/migrate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "001_create_users",
          sql: "CREATE TABLE users (id INTEGER PRIMARY KEY)",
        }),
      })
    );
    expect(logSpy).toHaveBeenCalledWith("Applied migration: 001_create_users");
  });
});

describe("Migrations Command", () => {
  it("lists migrations", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        migrations: [
          { name: "001_create_users", applied_at: "2025-01-01" },
          { name: "002_add_email", applied_at: "2025-01-02" },
        ],
      }),
    });

    const MigrationsCommand = (await import("../commands/migrations.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new MigrationsCommand(["testdb"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8787/db/testdb/migrations",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-API-Key": "test-key" }),
      })
    );
    expect(logSpy).toHaveBeenCalled();
  });
});

describe("Error Handling", () => {
  it("errors when URL not configured", async () => {
    // No config setup

    const DbListCommand = (await import("../commands/db/list.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbListCommand([], config);

    await expect(cmd.run()).rejects.toThrow("Configuration missing: url, key");
  });

  it("errors when API key not configured", async () => {
    setupConfig({ url: "http://localhost:8787" }); // No key

    const DbListCommand = (await import("../commands/db/list.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbListCommand([], config);

    await expect(cmd.run()).rejects.toThrow("Configuration missing: key");
  });

  it("handles API errors", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Database not found" }),
    });

    const DbDeleteCommand = (await import("../commands/db/delete.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbDeleteCommand(["nonexistent"], config);

    await expect(cmd.run()).rejects.toThrow("Database not found");
  });
});

describe("Edge Cases - SQL Command", () => {
  it("handles invalid params JSON", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    const SqlCommand = (await import("../commands/sql.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new SqlCommand(["testdb", "SELECT 1", "-p", "not valid json"], config);

    await expect(cmd.run()).rejects.toThrow();
  });

  it("handles empty result set", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rows: [],
        columns: ["id", "name"],
        rowsRead: 0,
        rowsWritten: 0,
      }),
    });

    const SqlCommand = (await import("../commands/sql.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new SqlCommand(["testdb", "SELECT * FROM empty_table"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    // Should not throw, should log empty result
    expect(logSpy).toHaveBeenCalled();
  });

  it("handles result with NULL values in JSON output", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rows: [{ id: 1, name: null, email: "test@test.com" }],
        columns: ["id", "name", "email"],
        rowsRead: 1,
        rowsWritten: 0,
      }),
    });

    const SqlCommand = (await import("../commands/sql.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new SqlCommand(["testdb", "SELECT * FROM users"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("null");
  });

  it("handles result with unicode data", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rows: [{ content: "日本語 emoji: 🎉" }],
        columns: ["content"],
        rowsRead: 1,
        rowsWritten: 0,
      }),
    });

    const SqlCommand = (await import("../commands/sql.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new SqlCommand(["testdb", "SELECT content FROM posts"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("日本語");
    expect(output).toContain("🎉");
  });

  it("handles CSV output with special characters", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rows: [{ name: 'John "Johnny" Doe', note: "Line1\nLine2" }],
        columns: ["name", "note"],
        rowsRead: 1,
        rowsWritten: 0,
      }),
    });

    const SqlCommand = (await import("../commands/sql.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new SqlCommand(["testdb", "SELECT * FROM users", "-o", "csv"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    // CSV should handle quotes and newlines
    expect(logSpy).toHaveBeenCalled();
  });

  it("handles table output with long values", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rows: [{ description: "a".repeat(200) }],
        columns: ["description"],
        rowsRead: 1,
        rowsWritten: 0,
      }),
    });

    const SqlCommand = (await import("../commands/sql.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new SqlCommand(["testdb", "SELECT * FROM posts", "-o", "table"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    // Should handle long values without crashing
    expect(logSpy).toHaveBeenCalled();
  });
});

describe("Edge Cases - Database Commands", () => {
  it("handles database name with special characters", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, name: "db-with.special_chars" }),
    });

    const DbCreateCommand = (await import("../commands/db/create.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbCreateCommand(["db-with.special_chars"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(logSpy).toHaveBeenCalledWith("Created database: db-with.special_chars");
  });

  it("handles empty database list", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ dbs: [] }),
    });

    const DbListCommand = (await import("../commands/db/list.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbListCommand([], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    // Should handle empty list gracefully
    expect(logSpy).toHaveBeenCalled();
  });

  it("handles database list in table format when empty", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ dbs: [] }),
    });

    const DbListCommand = (await import("../commands/db/list.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbListCommand(["-o", "table"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(logSpy).toHaveBeenCalled();
  });
});

describe("Edge Cases - Config Command", () => {
  it("handles setting empty url", async () => {
    const ConfigSetCommand = (await import("../commands/config/set.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new ConfigSetCommand(["url", ""], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(logSpy).toHaveBeenCalledWith("Set url = ");
  });

  it("preserves existing config when setting new value", async () => {
    setupConfig({ url: "http://old.example.com", key: "old-key" });

    const ConfigSetCommand = (await import("../commands/config/set.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new ConfigSetCommand(["url", "http://new.example.com"], config);

    await cmd.run();

    // Verify key was preserved
    const savedConfig = JSON.parse(
      require("node:fs").readFileSync(join(testConfigDir, "config.json"), "utf-8")
    );
    expect(savedConfig.url).toBe("http://new.example.com");
    expect(savedConfig.key).toBe("old-key");
  });
});

describe("Edge Cases - Migration Commands", () => {
  it("handles migration with empty result", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ migrations: [] }),
    });

    const MigrationsCommand = (await import("../commands/migrations.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new MigrationsCommand(["testdb"], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    expect(logSpy).toHaveBeenCalled();
  });

  it("handles migration failure response", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: "Migration already applied", name: "001_test" }),
    });

    const MigrateCommand = (await import("../commands/migrate.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new MigrateCommand(["testdb", "001_test", "CREATE TABLE test (id INT)"], config);

    await expect(cmd.run()).rejects.toThrow("Migration already applied");
  });
});

describe("Security Tests - CLI", () => {
  it("sends API key in header, not URL", async () => {
    setupConfig({ url: "http://localhost:8787", key: "secret-api-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ dbs: [] }),
    });

    const DbListCommand = (await import("../commands/db/list.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbListCommand([], config);

    await cmd.run();

    // Verify API key is in headers, not in URL
    expect(mockFetch).toHaveBeenCalledWith(
      expect.not.stringContaining("secret-api-key"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "secret-api-key",
        }),
      })
    );
  });

  it("handles response with unexpected fields", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        dbs: [{ name: "testdb", created_at: "2025-01-01" }],
        unexpected_field: "<script>alert('xss')</script>",
        __proto__: { malicious: true },
      }),
    });

    const DbListCommand = (await import("../commands/db/list.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbListCommand([], config);

    const logSpy = vi.spyOn(cmd, "log");
    await cmd.run();

    // Should handle extra fields gracefully
    expect(logSpy).toHaveBeenCalled();
  });

  it("handles corrupted config file gracefully", async () => {
    mkdirSync(testConfigDir, { recursive: true });
    writeFileSync(join(testConfigDir, "config.json"), "{ corrupted json");

    const DbListCommand = (await import("../commands/db/list.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbListCommand([], config);

    // Should throw a clear error about config
    await expect(cmd.run()).rejects.toThrow();
  });

  it("handles network error", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockRejectedValueOnce(new Error("Network error: Connection refused"));

    const DbListCommand = (await import("../commands/db/list.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbListCommand([], config);

    await expect(cmd.run()).rejects.toThrow("Network error");
  });

  it("handles timeout error", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockRejectedValueOnce(new Error("Request timeout"));

    const DbListCommand = (await import("../commands/db/list.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new DbListCommand([], config);

    await expect(cmd.run()).rejects.toThrow("timeout");
  });

  it("encodes database name in URL", async () => {
    setupConfig({ url: "http://localhost:8787", key: "test-key" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rows: [],
        columns: [],
        rowsRead: 0,
        rowsWritten: 0,
      }),
    });

    const SqlCommand = (await import("../commands/sql.js")).default;
    const config = await Config.load({ root: process.cwd() });
    const cmd = new SqlCommand(["db with spaces", "SELECT 1"], config);

    await cmd.run();

    // Verify URL encoding
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("db%20with%20spaces"),
      expect.any(Object)
    );
  });
});
