import { Args } from "@oclif/core";
import { BaseCommand } from "../../base.js";

export default class DbSchema extends BaseCommand {
  static description = "Get database schema";

  static examples = [
    "sor db schema mydb",
    "sor db schema mydb -o table",
    "sor db schema mydb -o json",
  ];

  static flags = {
    ...BaseCommand.baseFlags,
  };

  static args = {
    db: Args.string({ description: "Database name", required: true }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DbSchema);

    const result = await this.api<{ schema: any[] }>(
      `/db/${encodeURIComponent(args.db)}/schema`
    );

    if (flags.output === "json") {
      this.formatOutput(result, flags.output);
      return;
    }

    // For table and csv output, flatten the schema
    const rows = result.schema.flatMap((tableInfo: any) =>
      tableInfo.columns.map((col: any) => ({
        table: tableInfo.table,
        column: col.name,
        type: col.type,
        nullable: col.notnull === 0 ? "YES" : "NO",
        primary_key: col.pk === 1 ? "YES" : "NO",
        default_value: col.dflt_value ?? "",
      }))
    );

    if (rows.length === 0) {
      this.log("No tables found");
      return;
    }

    this.formatOutput(rows, flags.output, [
      "table",
      "column",
      "type",
      "nullable",
      "primary_key",
      "default_value",
    ]);
  }
}
