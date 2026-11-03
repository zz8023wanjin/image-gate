# image-gate

English | [简体中文](README.zh-CN.md)

Pre-commit gate that blocks oversized images by pixel dimensions, file size, and bitmap-embedded SVGs, with per-project thresholds.

When implementing Figma designs, agents often download images far larger than they will ever be displayed, and both humans and agents tend to miss it. image-gate stops these images before they are committed and tells you exactly how to fix them.

## Rules

| Type | Rule | Default limit |
| --- | --- | --- |
| png / jpg / jpeg / webp / gif / avif | File size | 500 KB |
| Same as above | Longest side in pixels | 2560px |
| svg | File size | 100 KB |
| svg | Embedded bitmap (an `<image>` referencing a non-SVG resource, or a non-SVG `data:image/...`) | Not allowed |

- Images that cannot be decoded (corrupted, or extension doesn't match the content) are blocked.
- Git LFS pointer files and deleted files are skipped.
- Any violation fails the check (exit code 1); config or runtime errors exit with code 2.

## Install

```sh
npm i -D image-gate
```

Requires Node.js ≥ 18.3.

## Usage

```sh
image-gate <files...>  # Check the given files (this is how lint-staged calls it)
image-gate --staged    # Check images added or modified in the index, reading staged content, not the working tree
image-gate --all       # Check every non-ignored image in the repository
image-gate --json ...  # Print violations as a JSON array for CI or agents to parse
```

Example output:

```
src/assets/banner.png · 3200×1800 · longest side exceeds 2560px · export at 2x the display size, or use a smaller slice

image-gate: 1 problem(s). If an image really must stay, register it under allow in .imagegaterc.json with a reason.
```

Each line reads `path · problem · fix hint`. Messages are in Chinese when the locale (`LC_ALL`, `LC_MESSAGES`, `LANG`, or the OS locale if none is set) starts with `zh`, and in English otherwise.

With `--json`, each violation also carries structured fields, so CI and agents don't have to parse the message:

```json
[
  {
    "path": "src/assets/banner.png",
    "rule": "maxDimension",
    "actual": 3200,
    "limit": 2560,
    "problem": "3200×1800 · longest side exceeds 2560px",
    "hint": "export at 2x the display size, or use a smaller slice"
  }
]
```

`rule` is one of `maxBytes`, `maxDimension`, `svg.maxBytes`, `svg.allowEmbeddedBitmap` (named after the config field that sets the limit) or `unrecognized`. `actual` and `limit` are in bytes for the size rules and in pixels of the longest side for `maxDimension`; the other rules omit them.

## Git hooks

image-gate doesn't depend on any hook manager. Pick one:

**simple-git-hooks** (`package.json`)

```json
{
  "simple-git-hooks": {
    "pre-commit": "npx image-gate --staged"
  }
}
```

**husky** (`.husky/pre-commit`)

```sh
npx image-gate --staged
```

**lefthook** (`lefthook.yml`)

```yaml
pre-commit:
  commands:
    image-gate:
      run: npx image-gate --staged
```

**lint-staged** (lint-staged passes the file list)

```json
{
  "lint-staged": {
    "*.{png,jpg,jpeg,webp,gif,avif,svg}": "image-gate"
  }
}
```

## CI

Check only the images changed on the current branch:

```sh
git diff --name-only --diff-filter=ACMR origin/master... | xargs npx image-gate
```

Or check the whole repository:

```sh
npx image-gate --all
```

## Configuration

Create `.imagegaterc.json` in the project root, or put the config under the `imageGate` field of `package.json`. Every field is optional:

```json
{
  "maxBytes": 512000,
  "maxDimension": 2560,
  "svg": { "maxBytes": 102400, "allowEmbeddedBitmap": false },
  "overrides": [
    { "files": "public/hero/**", "maxDimension": 3840 }
  ],
  "allow": [
    { "path": "public/og.png", "reason": "OG image needs high quality, approved by design" }
  ]
}
```

- `overrides`: match files by glob to loosen or tighten limits; when several match, they are applied in order.
- `allow`: fully exempt matching files; `reason` is required. Every exemption shows up in the diff, so reviewers see it.
- Globs and paths are relative to the directory containing the config file, case-insensitive, and `**` also matches dot directories.
- For each checked file, the **nearest** config is found by walking up from its directory to the git root; configs at different levels are not merged. Packages in a monorepo can have their own limits.
- The config is validated strictly: limits must be positive integers, `allowEmbeddedBitmap` must be a boolean, and unknown (e.g. misspelled) fields are rejected. Any of these exits with code 2 instead of silently using the wrong limit.

## Instructions for agents

Copy the section below into your project's `CLAUDE.md` or `AGENTS.md` so agents follow the limits when downloading images, instead of finding out at commit time:

```markdown
## Image assets

This project uses image-gate to check images before commit; oversized images are blocked: bitmaps must be at most 500 KB with the longest side at most 2560px; SVGs must be at most 100 KB and must not embed bitmaps.

- When exporting or downloading images from Figma, export at 2x the display size, never the original or 4x.
- Prefer webp for photos; prefer pure vector SVG for icons and illustrations.
- After adding an image, run `npx image-gate <file>` and fix whatever the output suggests.
- If an image really must exceed the limits, don't bypass the gate: add it to `allow` in `.imagegaterc.json` with a `reason` and leave it for human review.
```

## License

MIT
