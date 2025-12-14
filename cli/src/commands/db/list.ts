import { BaseCommand } from "../../base.js";

export default class DbList extends BaseCommand {
  static description = "List all databases";

  static examples = ["sor db list", "sor db list -o table"];

  static flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DbList);

    const result = await this.api<{ dbs: any[] }>("/dbs");
    this.formatOutput(result.dbs, flags.output, ["name", "created_at"]);
  }
}
