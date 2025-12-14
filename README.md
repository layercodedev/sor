# SOR - SQLite on Rest

SQLite databases deployed on Cloudflare Durable Objects with a REST API and CLI.

## Quick Start

### 1. Deploy the Backend

```bash
git clone https://github.com/layercodedev/sor.git
cd sor
bun install
bun run --cwd worker deploy
bunx --cwd worker wrangler secret put SOR_API_KEY
```

Or run locally for development:

```bash
bun run --cwd worker dev
```

### 2. Install the CLI

```bash
# Install globally (recommended)
bun add -g @layercode/sor

# Configure
sor config set url https://your-worker.your-subdomain.workers.dev
sor config set key your-api-key
```

Or use without installing:

```bash
bunx @layercode/sor config set url https://your-worker.your-subdomain.workers.dev
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
sor db list                    # List all databases
sor db create mydb             # Create a database
sor db delete mydb             # Delete a database

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

## Development

```bash
bun install          # Install dependencies
bun run test         # Run all tests (99 tests)
bun run --cwd worker dev   # Start local dev server
```

Use repo cli with bun link:

```bash
cd cli && bun link
```
