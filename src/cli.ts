import { parseArgs } from "node:util";
import { checkImage, type Violation } from "./check.js";
import { ConfigError, rulesFor } from "./config.js";
import { messages } from "./messages.js";
import { allFiles, explicitFiles, stagedFiles, type ImageFile } from "./sources.js";

const EXIT_OK = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_ERROR = 2;

const cwd = process.cwd();

function collectFiles(options: { staged?: boolean; all?: boolean }, paths: string[]): ImageFile[] {
  if (options.staged) return stagedFiles(cwd);
  if (options.all) return allFiles(cwd);
  return explicitFiles(paths, cwd);
}

function checkFile(file: ImageFile): Violation[] {
  const rules = rulesFor(file.absPath);
  return rules ? checkImage(file.path, file.read(), rules) : [];
}

function printText(violations: Violation[]): void {
  if (violations.length === 0) return;
  for (const v of violations) console.log(`${v.path} · ${v.problem} · ${v.hint}`);
  console.log(`\n${messages.summary(violations.length)}`);
}

function main(): number {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      staged: { type: "boolean" },
      all: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(messages.usage);
    return EXIT_OK;
  }
  const violations = collectFiles(values, positionals).flatMap(checkFile);
  if (values.json) console.log(JSON.stringify(violations, null, 2));
  else printText(violations);
  return violations.length > 0 ? EXIT_VIOLATIONS : EXIT_OK;
}

try {
  process.exitCode = main();
} catch (error) {
  const message = error instanceof ConfigError ? messages.configError(error.message) : error instanceof Error ? error.message : String(error);
  console.error(`image-gate: ${message}`);
  process.exitCode = EXIT_ERROR;
}
