import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import picomatch from "picomatch";
import type { Rules } from "./check.js";

type PartialRules = Partial<Omit<Rules, "svg">> & { svg?: Partial<Rules["svg"]> };

interface Override extends PartialRules {
  files: string | string[];
}

interface Allow {
  path: string;
  reason: string;
}

interface Config extends PartialRules {
  overrides?: Override[];
  allow?: Allow[];
}

interface LoadedConfig {
  dir: string;
  config: Config;
}

const RC_FILE = ".imagegaterc.json";
const PACKAGE_KEY = "imageGate";

export const DEFAULT_RULES: Rules = {
  maxBytes: 500 * 1024,
  maxDimension: 2560,
  svg: { maxBytes: 100 * 1024, allowEmbeddedBitmap: false },
};

export class ConfigError extends Error {}

function readJson(path: string) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ConfigError(`${path}: 不是合法的 JSON（${(error as Error).message}）`);
  }
}

const isNonEmptyString = (value: unknown) => typeof value === "string" && value.trim() !== "";

function validate(config: Config, source: string): Config {
  for (const entry of config.overrides ?? []) {
    const patterns = Array.isArray(entry.files) ? entry.files : [entry.files];
    if (patterns.length === 0 || !patterns.every(isNonEmptyString)) {
      throw new ConfigError(`${source}: overrides 的每一项都需要 files（glob 字符串或字符串数组）`);
    }
  }
  for (const entry of config.allow ?? []) {
    if (!isNonEmptyString(entry.path) || !isNonEmptyString(entry.reason)) {
      throw new ConfigError(`${source}: allow 的每一项都需要 path 和非空的 reason，以便 review 时看到豁免理由`);
    }
  }
  return config;
}

function readConfigIn(dir: string): Config | undefined {
  const rc = join(dir, RC_FILE);
  if (existsSync(rc)) return validate(readJson(rc), rc);
  const pkg = join(dir, "package.json");
  const config = existsSync(pkg) ? readJson(pkg)[PACKAGE_KEY] : undefined;
  return config && validate(config, `${pkg}#${PACKAGE_KEY}`);
}

// Matches the case-insensitive extension filter, and lets `public/**` reach dot directories.
const GLOB_OPTIONS = { dot: true, nocase: true };

const cache = new Map<string, LoadedConfig | undefined>();

/** Nearest config walking up from `dir`, stopping at the git root or the filesystem root. */
function findConfig(dir: string): LoadedConfig | undefined {
  if (cache.has(dir)) return cache.get(dir);
  const config = readConfigIn(dir);
  const parent = dirname(dir);
  const atBoundary = existsSync(join(dir, ".git")) || parent === dir;
  const found = config ? { dir, config } : atBoundary ? undefined : findConfig(parent);
  cache.set(dir, found);
  return found;
}

function merge(base: Rules, patch: PartialRules): Rules {
  const { svg, ...rest } = patch;
  return { ...base, ...rest, svg: { ...base.svg, ...svg } };
}

/** Rules that apply to `absPath`, or `null` when the file is exempted via `allow`. */
export function rulesFor(absPath: string): Rules | null {
  const found = findConfig(dirname(absPath));
  if (!found) return DEFAULT_RULES;
  const { overrides = [], allow = [], ...topLevel } = found.config;
  const relPath = relative(found.dir, absPath).replaceAll("\\", "/");
  if (allow.some((a) => picomatch(a.path, GLOB_OPTIONS)(relPath))) return null;
  return overrides
    .filter((o) => picomatch(o.files, GLOB_OPTIONS)(relPath))
    .reduce((rules, { files: _files, ...patch }) => merge(rules, patch), merge(DEFAULT_RULES, topLevel));
}
