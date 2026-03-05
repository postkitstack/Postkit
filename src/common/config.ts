import {config as dotenvConfig} from "dotenv";
import path from "path";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI root is the Postkit project directory
export const cliRoot = path.resolve(__dirname, "..", "..");

// Load .env from CLI root
dotenvConfig({path: path.join(cliRoot, ".env")});

// Project root is the db directory (parent of tools)
export const projectRoot = path.resolve(cliRoot, "..", "..");
