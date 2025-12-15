import { Command } from "@oclif/core";
import { HELP_TEXT } from "../help-text.js";

export default class Init extends Command {
  static description = "Show SOR usage instructions for AI coding assistants";

  static examples = ["sor init"];

  async run(): Promise<void> {
    this.log(HELP_TEXT);
  }
}
