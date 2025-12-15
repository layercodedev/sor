import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../../base.js";

export default class DbCreate extends BaseCommand {
  static description = "Create a new database";

  static examples = [
    "sor db create mydb",
    "sor db create mydb --desc 'My application database'",
  ];

  static flags = {
    desc: Flags.string({
      char: "d",
      description: "Database description",
    }),
  };

  static args = {
    name: Args.string({
      description: "Database name",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DbCreate);

    const body: { name: string; description?: string } = { name: args.name };
    if (flags.desc) {
      body.description = flags.desc;
    }

    const result = await this.api<{ ok: boolean; name: string }>("/dbs", {
      method: "POST",
      body: JSON.stringify(body),
    });

    this.log(`Created database: ${result.name}`);
  }
}
