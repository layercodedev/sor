import { Command, Flags } from "@oclif/core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  url?: string;
  key?: string;
}

export abstract class BaseCommand extends Command {
  static baseFlags = {
    output: Flags.string({
      char: "o",
      description: "Output format",
      options: ["json", "table", "csv"],
      default: "json",
    }),
  };

  protected configDir = join(homedir(), ".sor");
  protected configPath = join(this.configDir, "config.json");

  protected getConfig(): Config {
    if (!existsSync(this.configPath)) {
      return {};
    }
    const content = readFileSync(this.configPath, "utf-8");
    return JSON.parse(content);
  }

  protected saveConfig(config: Config): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  protected async api<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const config = this.getConfig();

    if (!config.url || !config.key) {
      const missing = [];
      if (!config.url) missing.push("url");
      if (!config.key) missing.push("key");

      this.error(
        `Configuration missing: ${missing.join(", ")}\n\n` +
        `Setup instructions:\n` +
        `  $ sor config set url https://your-worker.your-subdomain.workers.dev\n` +
        `  $ sor config set key <your-api-key>\n\n` +
        `Generate and set API key during deployment:\n` +
        `  $ export SOR_KEY=$(uuidgen)\n` +
        `  $ echo $SOR_KEY | wrangler secret put SOR_API_KEY\n` +
        `  $ sor config set key $SOR_KEY\n`
      );
    }

    const url = `${config.url}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.key,
        ...options.headers,
      },
    });

    const data = (await response.json()) as T & { error?: string };

    if (!response.ok && data.error) {
      this.error(data.error);
    }

    return data;
  }

  protected formatOutput(
    data: any,
    format: string,
    columns?: string[]
  ): void {
    if (format === "json") {
      this.log(JSON.stringify(data, null, 2));
      return;
    }

    // For table and csv, we need an array of objects
    const rows = Array.isArray(data) ? data : data.rows || data.dbs || data.migrations || [data];

    if (rows.length === 0) {
      this.log("No data");
      return;
    }

    // Get columns from first row if not specified
    const cols = columns || Object.keys(rows[0]);

    if (format === "csv") {
      // CSV output
      this.log(cols.join(","));
      for (const row of rows) {
        this.log(cols.map((c) => JSON.stringify(row[c] ?? "")).join(","));
      }
      return;
    }

    if (format === "table") {
      // Simple table output
      const widths = cols.map((c) =>
        Math.max(c.length, ...rows.map((r: any) => String(r[c] ?? "").length))
      );

      // Header
      this.log(cols.map((c, i) => c.padEnd(widths[i])).join(" | "));
      this.log(widths.map((w) => "-".repeat(w)).join("-+-"));

      // Rows
      for (const row of rows) {
        this.log(
          cols.map((c, i) => String(row[c] ?? "").padEnd(widths[i])).join(" | ")
        );
      }
    }
  }
}
