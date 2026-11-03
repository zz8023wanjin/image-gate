import { extname } from "node:path";
import { imageSize } from "image-size";
import type { ISizeCalculationResult } from "image-size/dist/types/interface.js";
import { messages } from "./messages.js";

export interface Rules {
  maxBytes: number;
  maxDimension: number;
  svg: { maxBytes: number; allowEmbeddedBitmap: boolean };
}

/** Named after the config field that sets the limit, so callers know what to fix or override. */
type Rule = "maxBytes" | "maxDimension" | "svg.maxBytes" | "svg.allowEmbeddedBitmap" | "unrecognized";

export interface Violation {
  path: string;
  rule: Rule;
  /** Measured value (bytes, or pixels of the longest side) for limit rules. */
  actual?: number;
  limit?: number;
  problem: string;
  hint: string;
}

// A non-SVG data URI, or an <image> (optionally namespaced) whose href is not another SVG.
const EMBEDDED_BITMAP = /data:image\/(?!svg)|<(?:[\w-]+:)?image\b[^>]*?href\s*=\s*["'](?![^"']*\.svg(?:[?#][^"']*)?["'])/i;
// Formats image-size may report for each extension; avif files carry their HEIF brand as the type.
const TYPES_BY_EXTENSION: Record<string, string[]> = {
  ".png": ["png"],
  ".jpg": ["jpg"],
  ".jpeg": ["jpg"],
  ".webp": ["webp"],
  ".gif": ["gif"],
  ".avif": ["avif", "avis", "mif1", "msf1"],
};

const LFS_POINTER_PREFIX = "version https://git-lfs.github.com/spec/v1";

function checkBytes(path: string, size: number, maxBytes: number, rule: Rule, hint: string): Violation[] {
  if (size <= maxBytes) return [];
  return [{ path, rule, actual: size, limit: maxBytes, problem: messages.tooLarge(size, maxBytes), hint }];
}

const unrecognized = (path: string): Violation => ({
  path,
  rule: "unrecognized",
  problem: messages.unrecognized,
  hint: messages.unrecognizedHint,
});

function checkSvg(path: string, content: Buffer, rules: Rules): Violation[] {
  const text = content.toString("utf8");
  if (!/<svg[\s>]/i.test(text)) return [unrecognized(path)];
  const violations = checkBytes(path, content.length, rules.svg.maxBytes, "svg.maxBytes", messages.svgBytesHint);
  if (!rules.svg.allowEmbeddedBitmap && EMBEDDED_BITMAP.test(text)) {
    violations.push({
      path,
      rule: "svg.allowEmbeddedBitmap",
      problem: messages.embeddedBitmap,
      hint: messages.embeddedBitmapHint,
    });
  }
  return violations;
}

function checkBitmap(path: string, content: Buffer, rules: Rules): Violation[] {
  const violations = checkBytes(path, content.length, rules.maxBytes, "maxBytes", messages.bitmapBytesHint);
  let size: ISizeCalculationResult;
  try {
    size = imageSize(content);
  } catch {
    return [unrecognized(path)];
  }
  const { width = 0, height = 0, type = "" } = size;
  if (!TYPES_BY_EXTENSION[extname(path).toLowerCase()]?.includes(type)) return [unrecognized(path)];
  const longestSide = Math.max(width, height);
  if (longestSide > rules.maxDimension) {
    violations.push({
      path,
      rule: "maxDimension",
      actual: longestSide,
      limit: rules.maxDimension,
      problem: messages.tooWide(width, height, rules.maxDimension),
      hint: messages.tooWideHint,
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
