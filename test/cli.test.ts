import { describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { git, makePng, makeRepo, run, writeFiles } from "./helpers.js";

describe("image-gate", () => {
  it("blocks an image whose longest side exceeds the default limit", () => {
    const dir = makeRepo({ "hero.png": makePng(3000, 10), "icon.png": makePng(64, 64) });

    const result = run(dir, "hero.png", "icon.png");

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("hero.png");
    expect(result.stdout).toContain("3000×10");
    expect(result.stdout).not.toContain("icon.png");
  });

  it("blocks an image whose file size exceeds the default limit", () => {
    const dir = makeRepo({ "photo.png": makePng(500, 400, true) });

    const result = run(dir, "photo.png");

    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/photo\.png · \d+ KB · 超过 500 KB/);
  });

  it("blocks an SVG that embeds a bitmap but passes a pure vector SVG", () => {
    const embedded = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="data:image/png;base64,iVBORw0KGgo=" /></svg>`;
    const vector = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path d="M0 0h10v10z"/></svg>`;
    const dir = makeRepo({ "embedded.svg": embedded, "vector.svg": vector });

    const result = run(dir, "embedded.svg", "vector.svg");

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("embedded.svg");
    expect(result.stdout).toContain("内嵌位图");
    expect(result.stdout).not.toContain("vector.svg");
  });

  it("blocks a vector SVG larger than the SVG size limit", () => {
    const path = `<path d="${"M0 0h10v10z".repeat(10_000)}"/>`;
    const dir = makeRepo({ "bloated.svg": `<svg xmlns="http://www.w3.org/2000/svg">${path}</svg>` });

    const result = run(dir, "bloated.svg");

    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/bloated\.svg · \d+ KB · 超过 100 KB/);
  });

  it("blocks a file that cannot be decoded as an image", () => {
    const dir = makeRepo({ "broken.png": "not really a png" });

    const result = run(dir, "broken.png");

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("broken.png · 无法识别的图片");
  });

  it("skips Git LFS pointer files", () => {
    const pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393\nsize 9000000\n";
    const dir = makeRepo({ "big.png": pointer });

    const result = run(dir, "big.png");

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("--staged checks the staged content rather than the working tree", () => {
    const dir = makeRepo({ "hero.png": makePng(3000, 10) });
    git(dir, "add", "hero.png");
    writeFiles(dir, { "hero.png": makePng(100, 10) });

    const result = run(dir, "--staged");

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("hero.png · 3000×10");
  });

  it("--staged ignores staged deletions", () => {
    const dir = makeRepo({ "hero.png": makePng(3000, 10) });
    git(dir, "add", "hero.png");
    git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init", "--no-verify");
    rmSync(join(dir, "hero.png"));
    git(dir, "add", "-A");

    const result = run(dir, "--staged");

    expect(result.code).toBe(0);
  });

  it("relaxes limits for files matched by an override", () => {
    const config = { overrides: [{ files: "public/hero/**", maxDimension: 4000 }] };
    const dir = makeRepo({
      ".imagegaterc.json": JSON.stringify(config),
      "public/hero/banner.png": makePng(3000, 10),
      "public/other.png": makePng(3000, 10),
    });

    const result = run(dir, "public/hero/banner.png", "public/other.png");

    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("banner.png");
    expect(result.stdout).toContain("public/other.png");
  });

  it("exempts a file listed in allow", () => {
    const config = { allow: [{ path: "public/og.png", reason: "OG 图需要高质量" }] };
    const dir = makeRepo({ ".imagegaterc.json": JSON.stringify(config), "public/og.png": makePng(3000, 10) });

    const result = run(dir, "public/og.png");

    expect(result.code).toBe(0);
  });

  it("reports a config error when an allow entry has no reason", () => {
    const config = { allow: [{ path: "public/og.png" }] };
    const dir = makeRepo({ ".imagegaterc.json": JSON.stringify(config), "public/og.png": makePng(3000, 10) });

    const result = run(dir, "public/og.png");

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("reason");
  });

  it("uses the config nearest to each file, including package.json#imageGate", () => {
    const dir = makeRepo({
      ".imagegaterc.json": JSON.stringify({ maxDimension: 4000 }),
      "root.png": makePng(3000, 10),
      "packages/web/package.json": JSON.stringify({ name: "web", imageGate: { maxDimension: 1000 } }),
      "packages/web/logo.png": makePng(2000, 10),
    });

    const result = run(dir, "root.png", "packages/web/logo.png");

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("packages/web/logo.png · 2000×10 · 超过最长边 1000px");
    expect(result.stdout).not.toContain("root.png");
  });

  it("--json prints violations as a machine-readable array", () => {
    const dir = makeRepo({ "hero.png": makePng(3000, 10) });

    const result = run(dir, "--json", "hero.png");

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual([
      { path: "hero.png", problem: "3000×10 · 超过最长边 2560px", hint: expect.any(String) },
    ]);
  });

  it("--all checks every image in the repository except ignored ones", () => {
    const dir = makeRepo({
      ".gitignore": "dist/\n",
      "src/assets/hero.png": makePng(3000, 10),
      "dist/hero.png": makePng(3000, 10),
    });

    const result = run(dir, "--all");

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("src/assets/hero.png");
    expect(result.stdout).not.toContain("dist/hero.png");
  });
});
