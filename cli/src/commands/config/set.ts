import { Args } from "@oclif/core";
import { BaseCommand } from "../../base.js";

export default class ConfigSet extends BaseCommand {
  static description = "Set configuration value";

  static examples = [
    "sor config set url https://sor.example.workers.dev",
    "sor config set key my-api-key",
  ];

  static args = {
    key: Args.string({
      description: "Config key (url or key)",
      required: true,
      options: ["url", "key"],
    }),
    value: Args.string({
      description: "Config value",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigSet);

    const config = this.getConfig();
    config[args.key as "url" | "key"] = args.value;
    this.saveConfig(config);

    this.log(`Set ${args.key} = ${args.value}`);
  }
}
