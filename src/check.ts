import { extname } from "node:path";
import { imageSize } from "image-size";

export interface Rules {
  maxBytes: number;
  maxDimension: number;
  svg: { maxBytes: number; allowEmbeddedBitmap: boolean };
}

export interface Violation {
  path: string;
  problem: string;
  hint: string;
}

const KB = 1024;
// An <image> element or a non-SVG data URI means the SVG carries a bitmap.
const EMBEDDED_BITMAP = /<image[\s>]|data:image\/(?!svg)/i;

const LFS_POINTER_PREFIX = "version https://git-lfs.github.com/spec/v1";

const formatKb = (bytes: number) => `${Math.round(bytes / KB)} KB`;

function checkBytes(path: string, size: number, maxBytes: number, hint: string): Violation[] {
  if (size <= maxBytes) return [];
  return [{ path, problem: `${formatKb(size)} · 超过 ${formatKb(maxBytes)}`, hint }];
}

const unrecognized = (path: string): Violation => ({
  path,
  problem: "无法识别的图片",
  hint: "文件已损坏或扩展名与实际格式不符，请重新导出",
});

function checkSvg(path: string, content: Buffer, rules: Rules): Violation[] {
  const text = content.toString("utf8");
  if (!/<svg[\s>]/i.test(text)) return [unrecognized(path)];
  const violations = checkBytes(path, content.length, rules.svg.maxBytes, "用 svgo 压缩，或简化 Figma 中的路径后重新导出");
  if (!rules.svg.allowEmbeddedBitmap && EMBEDDED_BITMAP.test(text)) {
    violations.push({
      path,
      problem: "内嵌位图 · SVG 不允许内嵌位图",
      hint: "把位图单独导出为 webp/png 引用，SVG 只保留矢量部分",
    });
  }
  return violations;
}

function checkBitmap(path: string, content: Buffer, rules: Rules): Violation[] {
  const violations = checkBytes(path, content.length, rules.maxBytes, "转成 webp/avif 或降低导出质量");
  let width = 0;
  let height = 0;
  try {
    ({ width = 0, height = 0 } = imageSize(content));
  } catch {
    return [unrecognized(path)];
  }
  if (Math.max(width, height) > rules.maxDimension) {
    violations.push({
      path,
      problem: `${width}×${height} · 超过最长边 ${rules.maxDimension}px`,
      hint: "按显示尺寸的 2x 导出，或换用更小的切图",
    });
  }
  return violations;
}

export function checkImage(path: string, content: Buffer, rules: Rules): Violation[] {
  // Images tracked by LFS are an accepted way to keep large files out of git history.
  if (content.subarray(0, LFS_POINTER_PREFIX.length).toString("ascii") === LFS_POINTER_PREFIX) return [];
  const check = extname(path).toLowerCase() === ".svg" ? checkSvg : checkBitmap;
  return check(path, content, rules);
}
