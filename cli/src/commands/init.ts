import { Command } from "@oclif/core";

export default class Init extends Command {
  static description = "Show SOR usage instructions for AI coding assistants";

  static examples = ["sor init"];

  async run(): Promise<void> {
    this.log(`
# SOR - SQLite on Rest

SOR provides SQLite databases via a simple CLI.

## Commands

  sor db list                    List all databases
  sor db create <name>           Create a new database
  sor db delete <name>           Delete a database

  sor sql <db> "<query>"         Execute SQL query
  sor sql <db> "<query>" -p '[]' Execute SQL with parameters
  sor sql <db> "<query>" -o table Output as table
  sor sql <db> "<query>" -o csv   Output as CSV

  sor migrate <db> <name> "<sql>" Run a migration
  sor migrations <db>             List applied migrations

  sor config set url <url>        Set API URL
  sor config set key <key>        Set API key

## Examples

  # Create a database and table
  sor db create myapp
  sor migrate myapp 001_users "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)"

  # Insert data with parameters (prevents SQL injection)
  sor sql myapp "INSERT INTO users (name, email) VALUES (?, ?)" -p '["Alice", "alice@example.com"]'

  # Query data
  sor sql myapp "SELECT * FROM users" -o table

---
Add this to your AGENTS.md or CLAUDE.md:

  Learn how to use SOR databases by running: sor init
`);
  }
}
