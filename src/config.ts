import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import picomatch from "picomatch";
import type { Rules } from "./check.js";
import { messages } from "./messages.js";

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
    throw new ConfigError(`${path}: ${messages.invalidJson((error as Error).message)}`);
  }
}

const isNonEmptyString = (value: unknown) => typeof value === "string" && value.trim() !== "";
const isPositiveInteger = (value: unknown) => Number.isInteger(value) && (value as number) > 0;
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const LIMIT_FIELDS = ["maxBytes", "maxDimension"];
const RULE_FIELDS = [...LIMIT_FIELDS, "svg"];
const SVG_FIELDS = ["maxBytes", "allowEmbeddedBitmap"];

/**
 * Rejects unknown fields and wrongly typed limits up front: a misspelled field would otherwise be ignored,
 * and a string limit would compare as NaN and block every image.
 */
function validate(config: unknown, source: string): Config {
  const fail = (detail: string): never => {
    throw new ConfigError(`${source}: ${detail}`);
  };
  const checkKnownFields = (value: Record<string, unknown>, prefix: string, known: string[]) => {
    const unknownField = Object.keys(value).find((key) => !known.includes(key));
    if (unknownField) fail(messages.unknownField(prefix + unknownField));
  };
  const checkRules = (rules: Record<string, unknown>, prefix: string, extraFields: string[]) => {
    checkKnownFields(rules, prefix, [...RULE_FIELDS, ...extraFields]);
    for (const key of LIMIT_FIELDS) {
      if (key in rules && !isPositiveInteger(rules[key])) fail(messages.notPositiveInteger(prefix + key));
    }
    if (!("svg" in rules)) return;
    const svg = rules.svg;
    if (!isPlainObject(svg)) return fail(messages.notObject(`${prefix}svg`));
    checkKnownFields(svg, `${prefix}svg.`, SVG_FIELDS);
    if ("maxBytes" in svg && !isPositiveInteger(svg.maxBytes)) fail(messages.notPositiveInteger(`${prefix}svg.maxBytes`));
    if ("allowEmbeddedBitmap" in svg && typeof svg.allowEmbeddedBitmap !== "boolean") {
      fail(messages.notBoolean(`${prefix}svg.allowEmbeddedBitmap`));
    }
  };

  if (!isPlainObject(config)) return fail(messages.configNotObject);
  const entriesOf = (key: "overrides" | "allow") => {
    const entries = config[key] ?? [];
    if (!Array.isArray(entries)) return fail(messages.notArray(key));
    return entries.map((entry, i) => (isPlainObject(entry) ? entry : fail(messages.notObject(`${key}[${i}]`))));
  };

  checkRules(config, "", ["overrides", "allow"]);
  entriesOf("overrides").forEach((entry, i) => {
    checkRules(entry, `overrides[${i}].`, ["files"]);
    const patterns = Array.isArray(entry.files) ? entry.files : [entry.files];
    if (patterns.length === 0 || !patterns.every(isNonEmptyString)) fail(messages.overrideNeedsFiles(`overrides[${i}]`));
  });
  entriesOf("allow").forEach((entry, i) => {
    checkKnownFields(entry, `allow[${i}].`, ["path", "reason"]);
    if (!isNonEmptyString(entry.path) || !isNonEmptyString(entry.reason)) fail(messages.allowNeedsReason(`allow[${i}]`));
  });
  return config as Config;
}

function readConfigIn(dir: string): Config | undefined {
  const rc = join(dir, RC_FILE);
  if (existsSync(rc)) return validate(readJson(rc), rc);
  const pkg = join(dir, "package.json");
  const config = existsSync(pkg) ? readJson(pkg)?.[PACKAGE_KEY] : undefined;
  return config === undefined ? undefined : validate(config, `${pkg}#${PACKAGE_KEY}`);
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
