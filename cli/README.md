# SOR CLI

Command-line interface for SOR (SQLite on Rest) - manage SQLite databases on Cloudflare Durable Objects.

## Installation

```bash
# Using npm
npm install -g @layercode/sor

# Using bun
bun add -g @layercode/sor

# Or use without installing
npx @layercode/sor <command>
bunx @layercode/sor <command>
```

## Setup

First, configure your SOR backend URL and API key:

```bash
sor config set url https://your-worker.your-subdomain.workers.dev
sor config set key your-api-key
```

## Quick Start

```bash
# Setup project instructions for AI assistants
sor init

# Create a database
sor db create mydb

# Execute SQL
sor sql mydb "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"
sor sql mydb "INSERT INTO users (name) VALUES (?)" -p '["Alice"]'
sor sql mydb "SELECT * FROM users"

# Run migrations
sor migrate mydb 001_init "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"
sor migrations mydb
```

## Commands

### Database Management
- `sor db list` - List all databases
- `sor db create <name>` - Create a new database
- `sor db delete <name>` - Delete a database

### SQL Execution
- `sor sql <db> <query>` - Execute SQL query
  - `-p, --params` - Query parameters as JSON array
  - `-o, --output` - Output format: json (default), table, csv

### Migrations
- `sor migrate <db> <name> <sql>` - Run a migration
- `sor migrations <db>` - List applied migrations

### Configuration
- `sor config set <key> <value>` - Set configuration (url, key)

### Project Setup
- `sor init` - Add SOR instructions to project for AI assistants

## Full Documentation

For complete documentation including backend setup and API details, see the [main repository](https://github.com/layercodedev/sor).

## License

MIT
