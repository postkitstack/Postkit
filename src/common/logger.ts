import chalk from "chalk";

export const logger = {
  info: (message: string) => {
    console.log(chalk.blue("info") + " " + message);
  },

  success: (message: string) => {
    console.log(chalk.green("success") + " " + message);
  },

  warn: (message: string) => {
    console.log(chalk.yellow("warn") + " " + message);
  },

  error: (message: string) => {
    console.log(chalk.red("error") + " " + message);
  },

  debug: (message: string, verbose?: boolean) => {
    if (verbose) {
      console.log(chalk.gray("debug") + " " + message);
    }
  },

  step: (step: number, total: number, message: string) => {
    console.log(chalk.cyan(`[${step}/${total}]`) + " " + message);
  },

  blank: () => {
    console.log();
  },

  heading: (title: string) => {
    console.log();
    console.log(chalk.bold.underline(title));
    console.log();
  },

  box: (content: string) => {
    const lines = content.split("\n");
    const maxLen = Math.max(...lines.map((l) => l.length));
    const border = chalk.gray("─".repeat(maxLen + 4));

    console.log(chalk.gray("┌") + border + chalk.gray("┐"));
    for (const line of lines) {
      console.log(
        chalk.gray("│") + "  " + line.padEnd(maxLen) + "  " + chalk.gray("│"),
      );
    }
    console.log(chalk.gray("└") + border + chalk.gray("┘"));
  },

  sql: (sql: string) => {
    console.log(chalk.magenta(sql));
  },

  diff: (added: string[], removed: string[]) => {
    for (const line of added) {
      console.log(chalk.green("+ " + line));
    }
    for (const line of removed) {
      console.log(chalk.red("- " + line));
    }
  },

  table: (headers: string[], rows: string[][]) => {
    const colWidths = headers.map((h, i) => {
      const maxRowWidth = Math.max(...rows.map((r) => (r[i] || "").length));
      return Math.max(h.length, maxRowWidth);
    });

    const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(" | ");
    const separator = colWidths.map((w) => "-".repeat(w)).join("-+-");

    console.log(chalk.bold(headerRow));
    console.log(chalk.gray(separator));
    for (const row of rows) {
      console.log(
        row.map((c, i) => (c || "").padEnd(colWidths[i])).join(" | "),
      );
    }
  },
};
