import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../base.js";

export default class Sql extends BaseCommand {
  static description = "Execute SQL on a database";

  static examples = [
    'sor sql mydb "SELECT * FROM users"',
    'sor sql mydb "INSERT INTO users (name) VALUES (?)" --params \'["Alice"]\'',
    'sor sql mydb "SELECT * FROM users" -o table',
  ];

  static flags = {
    ...BaseCommand.baseFlags,
    params: Flags.string({
      char: "p",
      description: "JSON array of parameters",
      default: "[]",
    }),
  };

  static args = {
    db: Args.string({
      description: "Database name",
      required: true,
    }),
    query: Args.string({
      description: "SQL query to execute",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Sql);

    let params: any[];
    try {
      params = JSON.parse(flags.params);
    } catch {
      this.error("Invalid params JSON");
    }

    const result = await this.api<{
      rows: any[];
      columns: string[];
      rowsRead: number;
      rowsWritten: number;
    }>(`/db/${encodeURIComponent(args.db)}/sql`, {
      method: "POST",
      body: JSON.stringify({ sql: args.query, params }),
    });

    this.formatOutput(result.rows, flags.output, result.columns);
  }
}
