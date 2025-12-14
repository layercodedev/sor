# SOR: SQLite on Rest

A system for deploying SQLite databases on Cloudflare Durable Objects with a CLI for raw SQL access.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Worker (sor)                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Routes:                                                  │  │
│  │  POST /dbs               → Create new db                  │  │
│  │  GET  /dbs               → List all dbs                   │  │
│  │  POST /db/:db/sql        → Execute SQL on db DO           │  │
│  │  POST /db/:db/migrate    → Run migration on db DO         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │              Durable Objects (SQLite-backed)              │  │
│  │                                                           │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                │  │
│  │  │   _sor_registry │  │    user-db-1    │  ...           │  │
│  │  │   (db list)     │  │                 │                │  │
│  │  │  ┌───────────┐  │  │  ┌───────────┐  │                │  │
│  │  │  │ SQLite DB │  │  │  │ SQLite DB │  │                │  │
│  │  │  └───────────┘  │  │  └───────────┘  │                │  │
│  │  └─────────────────┘  └─────────────────┘                │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        Bun CLI (sor)                            │
│  - Sends raw SQL to worker                                      │
│  - Sends migrations to worker                                   │
│  - JSON output by default, --human for pretty tables            │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Cloudflare Worker + Durable Object

**Files to create:**
- `worker/wrangler.toml`
- `worker/src/index.ts` - Worker entry, routing, and Db DO class (single file)

**Worker routes:**
```
POST /dbs                 - Create db {name: string}
GET  /dbs                 - List dbs
DELETE /dbs/:name         - Delete db
POST /db/:db/sql          - Execute SQL {sql: string, params?: any[]}
POST /db/:db/migrate      - Run migration {name: string, sql: string}
GET  /db/:db/migrations   - List applied migrations
```

**Authentication:**
- Single API key via `X-API-Key` header
- Stored as Worker secret (`SOR_API_KEY`)

**wrangler.toml:**
```toml
name = "sor"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[durable_objects.bindings]]
name = "DB"
class_name = "Db"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Db"]
```

**Db Durable Object:**
```typescript
export class Db extends DurableObject {
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
    const cursor = this.ctx.storage.sql.exec(query, ...params);
    return {
      rows: cursor.toArray(),
      columns: cursor.columnNames,
      rowsRead: cursor.rowsRead,
      rowsWritten: cursor.rowsWritten
    };
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

    // Run migration in transaction
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(sql);
      this.ctx.storage.sql.exec(
        "INSERT INTO _sor_migrations (name, sql) VALUES (?, ?)",
        name, sql
      );
    });

    return { ok: true, name };
  }

  async listMigrations(): Promise<any> {
    this.ensureMigrationsTable();
    const cursor = this.ctx.storage.sql.exec(
      "SELECT name, applied_at FROM _sor_migrations ORDER BY applied_at"
    );
    return { migrations: cursor.toArray() };
  }
}
```

### Phase 2: Registry Db

The `_sor_registry` DO stores db list:

```sql
CREATE TABLE dbs (
  name TEXT PRIMARY KEY,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

Worker queries this via same SQL mechanism for `/dbs` routes.

### Phase 3: Bun CLI (using oclif)

**Why oclif:**
- Built by Salesforce/Heroku, enterprise-grade
- First-class TypeScript support
- Plugin architecture for future extensibility
- Auto-generated help and documentation
- Clean command structure with decorators

**Files to create:**
- `cli/src/index.ts` - CLI entry point
- `cli/src/commands/config/set.ts` - Config command
- `cli/src/commands/db/list.ts` - List dbs
- `cli/src/commands/db/create.ts` - Create db
- `cli/src/commands/db/delete.ts` - Delete db
- `cli/src/commands/sql.ts` - Execute SQL
- `cli/src/commands/migrate.ts` - Run migration
- `cli/src/commands/migrations.ts` - List migrations

**CLI Commands:**
```bash
# Configuration
sor config set url https://sor.mycompany.workers.dev
sor config set key <api-key>

# Db management
sor db list
sor db create <name>
sor db delete <name>

# SQL execution
sor sql <db> "SELECT * FROM users"
sor sql <db> "INSERT INTO users (name) VALUES (?)" --params '["Alice"]'

# Migrations
sor migrate <db> <migration-name> "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"
sor migrations <db>

# Output formats (global options)
-o, --output <format>   json (default), table, csv
```

**Setup:**
```bash
npx oclif generate cli
# or use oclif-bun fork for better Bun compatibility
```

## File Structure

```
sor/
├── worker/
│   ├── wrangler.toml
│   ├── package.json
│   └── src/
│       └── index.ts           # Worker + Db DO (single file)
├── cli/
│   ├── package.json
│   └── src/
│       ├── index.ts           # oclif entry
│       └── commands/
│           ├── config/
│           │   └── set.ts     # sor config set
│           ├── db/
│           │   ├── list.ts    # sor db list
│           │   ├── create.ts  # sor db create
│           │   └── delete.ts  # sor db delete
│           ├── sql.ts         # sor sql <db> "query"
│           ├── migrate.ts     # sor migrate <db> <name> "sql"
│           └── migrations.ts  # sor migrations <db>
└── README.md
```

## Implementation Order

1. **Worker** - Single index.ts with routing + Db DO class + registry + migrations
2. **CLI** - oclif scaffold + commands for config, db, sql, migrate

## API Spec

### POST /dbs
```json
// Request
{"name": "mydb"}

// Response
{"ok": true, "name": "mydb"}
```

### GET /dbs
```json
// Response
{"dbs": [{"name": "mydb", "created_at": "2025-01-01T00:00:00Z"}]}
```

### POST /db/:db/sql
```json
// Request
{"sql": "SELECT * FROM users WHERE id = ?", "params": [1]}

// Response
{
  "rows": [{"id": 1, "name": "Alice"}],
  "columns": ["id", "name"],
  "rowsRead": 1,
  "rowsWritten": 0
}
```

### POST /db/:db/migrate
```json
// Request
{"name": "001_create_users", "sql": "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"}

// Response
{"ok": true, "name": "001_create_users"}

// If already applied:
{"ok": false, "error": "Migration already applied", "name": "001_create_users"}
```

### GET /db/:db/migrations
```json
// Response
{
  "migrations": [
    {"name": "001_create_users", "applied_at": "2025-01-01T00:00:00Z"},
    {"name": "002_add_email", "applied_at": "2025-01-02T00:00:00Z"}
  ]
}
```
