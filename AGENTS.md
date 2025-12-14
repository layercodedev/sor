# SOR - SQLite on Rest

SOR provides SQLite databases deployed on Cloudflare Durable Objects with a REST API and CLI.

## Setup

1. Install dependencies (from repo root):
   ```bash
   bun install
   ```

2. Deploy the worker to Cloudflare:
   ```bash
   bun run --cwd worker deploy
   ```

3. Set the API key secret:
   ```bash
   bunx --cwd worker wrangler secret put SOR_API_KEY
   ```

4. Build the CLI:
   ```bash
   bun run --cwd cli build
   ```

5. Configure the CLI with your worker URL and API key:
   ```bash
   ./cli/bin/run.js config set url https://your-worker.your-subdomain.workers.dev
   ./cli/bin/run.js config set key your-api-key
   ```

## CLI Commands

### Database Management

```bash
# List all databases
sor db list

# Create a new database
sor db create mydb

# Delete a database
sor db delete mydb
```

### SQL Execution

```bash
# Execute a query
sor sql mydb "SELECT * FROM users"

# Execute with parameters (prevents SQL injection)
sor sql mydb "INSERT INTO users (name, email) VALUES (?, ?)" --params '["Alice", "alice@example.com"]'

# Output formats: json (default), table, csv
sor sql mydb "SELECT * FROM users" -o table
sor sql mydb "SELECT * FROM users" -o csv
```

### Migrations

```bash
# Run a migration
sor migrate mydb 001_create_users "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)"

# List applied migrations
sor migrations mydb
```

## Usage with Codex

When working with SOR databases, use the CLI to execute SQL queries. Always use parameterized queries for user-provided values.

Example workflow:
```bash
# Create a database for the project
sor db create projectdb

# Set up schema with migrations
sor migrate projectdb 001_init "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"

# Query data
sor sql projectdb "SELECT * FROM items" -o table

# Insert with params
sor sql projectdb "INSERT INTO items (name) VALUES (?)" -p '["New Item"]'
```

## Architecture

- **Worker**: Cloudflare Worker that routes requests to Durable Objects
- **Durable Objects**: Each database is a separate DO with SQLite storage (up to 10GB)
- **CLI**: oclif-based CLI for managing databases and executing SQL

## API Endpoints

- `GET /dbs` - List databases
- `POST /dbs` - Create database `{"name": "dbname"}`
- `DELETE /dbs/:name` - Delete database
- `POST /db/:name/sql` - Execute SQL `{"sql": "...", "params": []}`
- `POST /db/:name/migrate` - Run migration `{"name": "...", "sql": "..."}`
- `GET /db/:name/migrations` - List migrations

All endpoints require `X-API-Key` header.
