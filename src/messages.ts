const KB = 1024;

const formatKb = (bytes: number) => `${Math.round(bytes / KB)} KB`;

const zh = {
  tooLarge: (size: number, max: number) => `${formatKb(size)} · 超过 ${formatKb(max)}`,
  bitmapBytesHint: "转成 webp/avif 或降低导出质量",
  svgBytesHint: "用 svgo 压缩，或简化 Figma 中的路径后重新导出",
  tooWide: (width: number, height: number, max: number) => `${width}×${height} · 超过最长边 ${max}px`,
  tooWideHint: "按显示尺寸的 2x 导出，或换用更小的切图",
  embeddedBitmap: "内嵌位图 · SVG 不允许内嵌位图",
  embeddedBitmapHint: "把位图单独导出为 webp/png 引用，SVG 只保留矢量部分",
  unrecognized: "无法识别的图片",
  unrecognizedHint: "文件已损坏或扩展名与实际格式不符，请重新导出",
  summary: (count: number) =>
    `image-gate: ${count} 个问题。确需保留时，在 .imagegaterc.json 的 allow 中登记该文件并写明 reason。`,
  configError: (message: string) => `配置错误：${message}`,
  invalidJson: (detail: string) => `不是合法的 JSON（${detail}）`,
  configNotObject: "配置必须是 JSON 对象",
  notObject: (field: string) => `${field} 必须是对象`,
  notArray: (field: string) => `${field} 必须是数组`,
  unknownField: (field: string) => `未知字段 ${field}，请检查拼写`,
  notPositiveInteger: (field: string) => `${field} 必须是正整数`,
  notBoolean: (field: string) => `${field} 必须是 true 或 false`,
  overrideNeedsFiles: (field: string) => `${field} 需要 files（glob 字符串或字符串数组）`,
  allowNeedsReason: (field: string) => `${field} 需要 path 和非空的 reason，以便 review 时看到豁免理由`,
  usage: `用法: image-gate [选项] [文件...]

  不带选项时检查传入的文件（适配 lint-staged）。

选项:
  --staged   检查暂存区中新增/修改的图片（读取暂存内容）
  --all      检查仓库中所有未被忽略的图片
  --json     以 JSON 数组输出违规项
  -h, --help 显示帮助

退出码: 0 通过，1 存在违规，2 配置或运行错误`,
};

const en: typeof zh = {
  tooLarge: (size, max) => `${formatKb(size)} · exceeds ${formatKb(max)}`,
  bitmapBytesHint: "convert to webp/avif or lower the export quality",
  svgBytesHint: "compress with svgo, or simplify the paths in Figma and re-export",
  tooWide: (width, height, max) => `${width}×${height} · longest side exceeds ${max}px`,
  tooWideHint: "export at 2x the display size, or use a smaller slice",
  embeddedBitmap: "embedded bitmap · SVGs must not embed bitmaps",
  embeddedBitmapHint: "export the bitmap separately as webp/png and reference it; keep only vectors in the SVG",
  unrecognized: "unrecognized image",
  unrecognizedHint: "the file is corrupted or its extension doesn't match its format; re-export it",
  summary: (count) =>
    `image-gate: ${count} problem(s). If an image really must stay, register it under allow in .imagegaterc.json with a reason.`,
  configError: (message) => `config error: ${message}`,
  invalidJson: (detail) => `invalid JSON (${detail})`,
  configNotObject: "the config must be a JSON object",
  notObject: (field) => `${field} must be an object`,
  notArray: (field) => `${field} must be an array`,
  unknownField: (field) => `unknown field ${field}; check the spelling`,
  notPositiveInteger: (field) => `${field} must be a positive integer`,
  notBoolean: (field) => `${field} must be true or false`,
  overrideNeedsFiles: (field) => `${field} needs files (a glob string or an array of them)`,
  allowNeedsReason: (field) => `${field} needs a path and a non-empty reason, so reviewers can see why it is exempt`,
  usage: `Usage: image-gate [options] [files...]

  Without options, checks the given files (for lint-staged).

Options:
  --staged   Check images added or modified in the index (reads staged content)
  --all      Check every non-ignored image in the repository
  --json     Print violations as a JSON array
  -h, --help Show this help

Exit codes: 0 passed, 1 violations found, 2 config or runtime error`,
};

// POSIX locale variables win; otherwise fall back to the OS locale (Windows rarely sets LANG).
const locale =
  process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale;

export const messages = /^zh/i.test(locale) ? zh : en;
