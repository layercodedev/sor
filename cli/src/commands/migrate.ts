import { Args } from "@oclif/core";
import { BaseCommand } from "../base.js";

export default class Migrate extends BaseCommand {
  static description = "Run a migration on a database";

  static examples = [
    'sor migrate mydb 001_create_users "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"',
  ];

  static args = {
    db: Args.string({
      description: "Database name",
      required: true,
    }),
    name: Args.string({
      description: "Migration name",
      required: true,
    }),
    sql: Args.string({
      description: "SQL to execute",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(Migrate);

    const result = await this.api<{ ok: boolean; name: string; error?: string }>(
      `/db/${encodeURIComponent(args.db)}/migrate`,
      {
        method: "POST",
        body: JSON.stringify({ name: args.name, sql: args.sql }),
      }
    );

    if (result.ok) {
      this.log(`Applied migration: ${result.name}`);
    } else {
      this.error(result.error || "Migration failed");
    }
  }
}
