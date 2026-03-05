#!/usr/bin/env node

import {Command} from "commander";
import {registerDbModule} from "./modules/db/index.js";

const program = new Command();

program
  .name("postkit")
  .description("PostKit - Developer toolkit for database management and more")
  .version("1.0.0");

// Global options
program
  .option("-v, --verbose", "Enable verbose output")
  .option("--dry-run", "Show what would be done without making changes");

// Register modules
registerDbModule(program);

// Parse and run
program.parse();
