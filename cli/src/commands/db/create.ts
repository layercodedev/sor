import { Args } from "@oclif/core";
import { BaseCommand } from "../../base.js";

export default class DbCreate extends BaseCommand {
  static description = "Create a new database";

  static examples = ["sor db create mydb"];

  static args = {
    name: Args.string({
      description: "Database name",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(DbCreate);

    const result = await this.api<{ ok: boolean; name: string }>("/dbs", {
      method: "POST",
      body: JSON.stringify({ name: args.name }),
    });

    this.log(`Created database: ${result.name}`);
  }
}
