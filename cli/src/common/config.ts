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

// Load .env from CLI root
dotenvConfig({path: path.join(cliRoot, ".env")});

// Project root is the db directory (parent of tools)
// Since cli is inside Postkit, we adjust this to point to the same relative parent as before (Postkit's parent's parent)
export const projectRoot = path.resolve(cliRoot, "..", "..", "..");
