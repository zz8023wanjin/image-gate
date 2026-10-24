import { parseArgs } from "node:util";
import { checkImage, type Violation } from "./check.js";
import { ConfigError, rulesFor } from "./config.js";
import { allFiles, explicitFiles, stagedFiles, type ImageFile } from "./sources.js";

const EXIT_OK = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_ERROR = 2;

const USAGE = `用法: image-gate [选项] [文件...]

  不带选项时检查传入的文件（适配 lint-staged）。

选项:
  --staged   检查暂存区中新增/修改的图片（读取暂存内容）
  --all      检查仓库中所有未被忽略的图片
  --json     以 JSON 数组输出违规项
  -h, --help 显示帮助

退出码: 0 通过，1 存在违规，2 配置或运行错误`;

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
  console.log(`\nimage-gate: ${violations.length} 个问题。确需保留时，在 .imagegaterc.json 的 allow 中登记该文件并写明 reason。`);
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
    console.log(USAGE);
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
  const message = error instanceof ConfigError ? `配置错误：${error.message}` : error instanceof Error ? error.message : String(error);
  console.error(`image-gate: ${message}`);
  process.exitCode = EXIT_ERROR;
}
