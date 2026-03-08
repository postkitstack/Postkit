import {config as dotenvConfig} from "dotenv";
import path from "path";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI root is the `cli` folder
const isBuilt = __dirname.endsWith("dist");
export const cliRoot = isBuilt
  ? path.resolve(__dirname, "..")
  : path.resolve(__dirname, "..", "..");

// Project root is where the user runs the command
export const projectRoot = process.cwd();

// Load .env from project root
dotenvConfig({path: path.join(projectRoot, ".env")});
