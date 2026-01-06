# SOR - SQLite on Rest

SQLite databases deployed on Cloudflare Durable Objects with a REST API and CLI.

## Quick Start

### 1. Deploy the Backend to your Cloudflare account

```bash
git clone https://github.com/layercodedev/sor.git
cd sor/worker
npm install
npm run deploy
export SOR_KEY=$(uuidgen)
echo $SOR_KEY
npx wrangler secret put SOR_API_KEY
echo "✓ API Key set. Configure your CLI with:"
echo "  sor config set url https://sor.your-subdomain.workers.dev # Use URL from deploy output above"
echo "  sor config set key $SOR_KEY"
```

#### Optional: Custom Studio URL

By default, the `/studio` route uses [Outerbase Studio](https://studio.outerbase.com) for the database viewer. To use a self-hosted viewer:

```bash
npx wrangler secret put STUDIO_URL
# Enter your custom studio URL, e.g., https://your-studio.workers.dev
```

### Or run locally:

```bash
cd worker
export SOR_KEY=$(uuidgen)
echo "SOR_API_KEY=$SOR_KEY" > .dev.vars
npm run dev
echo "✓ Local dev server running. Configure your CLI with:"
echo "  sor config set url http://localhost:8787"
echo "  sor config set key $SOR_KEY"
```

### 2. Install the CLI

```bash
# Install globally (recommended)
npm install -g @layercode/sor

# Configure (if you didn't follow the config instructions above after deployment)
sor config set url https://your-worker.your-subdomain.workers.dev
sor config set key $SOR_KEY
```

Or use without installing:

```bash
npx @layercode/sor config set url https://your-worker.your-subdomain.workers.dev
```

### 3. Setup Your Project

Add SOR instructions to your AI coding assistant:

Claude:

```bash
sor init >> CLAUDE.md
```

Codex:

```bash
sor init >> AGENTS.md
```

Next time you use your coding agent, it will run `sor init` automatically and update its CLAUDE.md or AGENTS.md file will the full SOR usage instructions.

## CLI Commands

```bash
# Database management
sor db list                              # List all databases
sor db create mydb                       # Create a database
sor db create mydb --desc "My app db"    # Create with description
sor db delete mydb                       # Delete a database
sor db schema mydb                       # Get database schema

# Execute SQL
sor sql mydb "SELECT * FROM users"
sor sql mydb "INSERT INTO users (name) VALUES (?)" -p '["Alice"]'
sor sql mydb "SELECT * FROM users" -o table   # Output as table
sor sql mydb "SELECT * FROM users" -o csv     # Output as CSV

# Migrations
sor migrate mydb 001_init "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"
sor migrations mydb            # List applied migrations
```

## Architecture

- **Worker**: Cloudflare Worker routing requests to Durable Objects
- **Durable Objects**: Each database is a separate DO with SQLite storage (up to 10GB)
- **CLI**: oclif-based CLI for managing databases and executing SQL

### Migrations

SOR uses a migration system for both user databases and the registry database:

**User Database Migrations:**
- Applied via `sor migrate` command or `POST /db/:name/migrate`
- Tracked in each database's `_sor_migrations` table
- Ensures safe, atomic schema evolution

**System Migrations (Registry):**
- Automatically applied to the `_sor_registry` database
- Defined in `worker/src/system-migrations.ts`
- Applied on first request after deployment (idempotent)
- Uses the same migration infrastructure as user databases

To add a new system migration:
```typescript
// worker/src/system-migrations.ts
export const SYSTEM_MIGRATIONS = [
  // ... existing migrations
  {
    name: "002_add_new_column",
    sql: "ALTER TABLE dbs ADD COLUMN new_column TEXT"
  }
];
```

Deploy the worker and the migration will apply automatically on the next request.

## API Endpoints

All endpoints require `X-API-Key` header.

| Method | Endpoint               | Description                                   |
| ------ | ---------------------- | --------------------------------------------- |
| GET    | `/dbs`                 | List databases                                |
| POST   | `/dbs`                 | Create database `{"name": "dbname"}`          |
| DELETE | `/dbs/:name`           | Delete database                               |
| POST   | `/db/:name/sql`        | Execute SQL `{"sql": "...", "params": []}`    |
| POST   | `/db/:name/migrate`    | Run migration `{"name": "...", "sql": "..."}` |
| GET    | `/db/:name/migrations` | List migrations                               |
| GET    | `/db/:name/schema`     | Get database schema                           |

## Development

```bash
# Worker
cd worker
npm install
npm test             # Run worker tests
npm run dev          # Start local dev server

# CLI
cd cli
npm install
npm run build        # Build CLI
npm test             # Run CLI tests
npm link             # Link CLI for local development
```
