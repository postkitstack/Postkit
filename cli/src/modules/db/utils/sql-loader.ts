import fs from "fs/promises";
import path from "path";

/**
 * Reads all .sql files in `dirPath`, concatenates them with `-- filename` headers,
 * and returns a single `{name, content}` entry — or an empty array if no files exist.
 */
export async function loadSqlGroup(
  dirPath: string,
  groupName: string,
): Promise<{name: string; content: string}[]> {
  const files = await fs.readdir(dirPath);
  const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

  const contents: string[] = [];

  for (const file of sqlFiles) {
    const filePath = path.join(dirPath, file);
    const content = await fs.readFile(filePath, "utf-8");
    contents.push(`-- ${file}`);
    contents.push(content.trim());
  }

  if (contents.length === 0) {
    return [];
  }

  return [{name: groupName, content: contents.join("\n\n")}];
}
