import { Command } from "@oclif/core";
import { HELP_TEXT } from "../help-text.js";

export default class Help extends Command {
  static description = "Show SOR usage instructions";

  static examples = ["sor help"];

  async run(): Promise<void> {
    this.log(HELP_TEXT);
  }
}
