import { Args } from "@oclif/core";
import { BaseCommand } from "../base.js";

export default class Migrations extends BaseCommand {
  static description = "List migrations for a database";

  static examples = ["sor migrations mydb", "sor migrations mydb -o table"];

  static flags = {
    ...BaseCommand.baseFlags,
  };

  static args = {
    db: Args.string({
      description: "Database name",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Migrations);

    const result = await this.api<{ migrations: any[] }>(
      `/db/${encodeURIComponent(args.db)}/migrations`
    );

    this.formatOutput(result.migrations, flags.output, ["name", "applied_at"]);
  }
}
