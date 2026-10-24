import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

export interface ImageFile {
  /** Path as shown to the user, relative to the current directory. */
  path: string;
  absPath: string;
  read: () => Buffer;
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"]);
// Large staged blobs must not overflow execFileSync's default 1 MB buffer.
const MAX_BLOB_BUFFER = 1024 * 1024 * 1024;

const isImage = (path: string) => IMAGE_EXTENSIONS.has(extname(path).toLowerCase());

function git(args: string[], cwd: string): Buffer {
  return execFileSync("git", args, { cwd, maxBuffer: MAX_BLOB_BUFFER });
}

const gitRoot = (cwd: string) => git(["rev-parse", "--show-toplevel"], cwd).toString("utf8").trim();

const splitNul = (out: Buffer) => out.toString("utf8").split("\0").filter(Boolean);

function toImageFile(absPath: string, cwd: string, read: () => Buffer): ImageFile {
  return { path: relative(cwd, absPath).replaceAll("\\", "/"), absPath, read };
}

export function explicitFiles(paths: string[], cwd: string): ImageFile[] {
  return paths.filter(isImage).map((p) => {
    const absPath = resolve(cwd, p);
    return toImageFile(absPath, cwd, () => readFileSync(absPath));
  });
}

/** Added, copied, modified or renamed files in the index, read from their staged blobs. */
export function stagedFiles(cwd: string): ImageFile[] {
  const root = gitRoot(cwd);
  const paths = splitNul(git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], root));
  return paths.filter(isImage).map((p) => toImageFile(resolve(root, p), cwd, () => git(["cat-file", "blob", `:${p}`], root)));
}

/** Tracked and untracked-but-not-ignored files in the working tree. */
export function allFiles(cwd: string): ImageFile[] {
  const root = gitRoot(cwd);
  const paths = splitNul(git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], root));
  return paths.filter(isImage).map((p) => {
    const absPath = resolve(root, p);
    return toImageFile(absPath, cwd, () => readFileSync(absPath));
  });
}
