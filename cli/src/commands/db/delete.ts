import { Args } from "@oclif/core";
import { BaseCommand } from "../../base.js";

export default class DbDelete extends BaseCommand {
  static description = "Delete a database";

  static examples = ["sor db delete mydb"];

  static args = {
    name: Args.string({
      description: "Database name",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(DbDelete);

    const result = await this.api<{ ok: boolean; name: string }>(
      `/dbs/${encodeURIComponent(args.name)}`,
      { method: "DELETE" }
    );

    this.log(`Deleted database: ${result.name}`);
  }
}
