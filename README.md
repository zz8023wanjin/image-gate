# image-gate

Pre-commit gate that blocks oversized images by pixel dimensions, file size, and bitmap-embedded SVGs, with per-project thresholds.

实现 Figma 设计稿时，agent 经常下载远超显示需要的大图，人和 agent 都容易忽略。image-gate 在提交前拦下这些图片，并给出可以照着执行的修复建议。

## 检查规则

| 类型 | 规则 | 默认阈值 |
| --- | --- | --- |
| png / jpg / jpeg / webp / gif / avif | 文件大小 | 500 KB |
| 同上 | 最长边像素 | 2560px |
| svg | 文件大小 | 100 KB |
| svg | 内嵌位图（引用非 SVG 资源的 `<image>`，或非 SVG 的 `data:image/...`） | 不允许 |

- 无法解析的图片（损坏、扩展名与内容不符）会被拦截。
- Git LFS 指针文件、已删除的文件会被跳过。
- 超标即拦截（退出码 1）；配置或运行错误退出码为 2。

## 安装

```sh
npm i -D image-gate
```

需要 Node.js ≥ 18.3。

## 用法

```sh
image-gate <文件...>   # 检查传入的文件（lint-staged 用这种方式）
image-gate --staged    # 检查暂存区里新增或修改的图片，读的是暂存内容而非工作区
image-gate --all       # 检查仓库里所有未被忽略的图片
image-gate --json ...  # 以 JSON 数组输出违规项，便于 CI 或 agent 解析
```

输出示例：

```
src/assets/banner.png · 3200×1800 · 超过最长边 2560px · 按显示尺寸的 2x 导出，或换用更小的切图

image-gate: 1 个问题。确需保留时，在 .imagegaterc.json 的 allow 中登记该文件并写明 reason。
```

## 接入 git hook

image-gate 不依赖任何 hook 管理器，选一种即可。

**simple-git-hooks**（`package.json`）

```json
{
  "simple-git-hooks": {
    "pre-commit": "npx image-gate --staged"
  }
}
```

**husky**（`.husky/pre-commit`）

```sh
npx image-gate --staged
```

**lefthook**（`lefthook.yml`）

```yaml
pre-commit:
  commands:
    image-gate:
      run: npx image-gate --staged
```

**lint-staged**（文件列表由 lint-staged 传入）

```json
{
  "lint-staged": {
    "*.{png,jpg,jpeg,webp,gif,avif,svg}": "image-gate"
  }
}
```

## 接入 CI

只检查本次分支改动的图片：

```sh
git diff --name-only --diff-filter=ACMR origin/master... | xargs npx image-gate
```

或检查全仓库：

```sh
npx image-gate --all
```

## 配置

在项目根目录创建 `.imagegaterc.json`，或者写在 `package.json` 的 `imageGate` 字段里。所有字段都是可选的：

```json
{
  "maxBytes": 512000,
  "maxDimension": 2560,
  "svg": { "maxBytes": 102400, "allowEmbeddedBitmap": false },
  "overrides": [
    { "files": "public/hero/**", "maxDimension": 3840 }
  ],
  "allow": [
    { "path": "public/og.png", "reason": "OG 图要求高质量，由设计确认" }
  ]
}
```

- `overrides`：按 glob 匹配文件，放宽或收紧阈值；多条都匹配时按顺序叠加。
- `allow`：完全豁免匹配的文件，`reason` 必填。每次豁免都会出现在 diff 里，review 时能看到。
- glob 和路径都相对于配置文件所在的目录，不区分大小写，`**` 也会匹配以点开头的目录。
- 对每个被检查的文件，从它所在目录往上找**最近的**一份配置，直到 git 根目录为止；不同层级的配置不会合并。monorepo 的子包可以有自己的阈值。

## 给 agent 的说明

把下面这段复制到项目的 `CLAUDE.md` 或 `AGENTS.md` 里，让 agent 在下载图片时就遵守约束，不必等到提交时被拦截：

```markdown
## 图片资源

本项目用 image-gate 在提交前检查图片，超标会被拦截：位图不超过 500 KB、最长边不超过 2560px；SVG 不超过 100 KB 且不得内嵌位图。

- 从 Figma 导出或下载图片时，按显示尺寸的 2x 导出，不要下载原图或 4x。
- 照片类图片优先用 webp；图标和插画优先用纯矢量 SVG。
- 每次新增图片后运行 `npx image-gate <文件>` 自查，按输出中的建议修复。
- 图片确需超标时不要绕过门禁，在 `.imagegaterc.json` 的 `allow` 中登记并写明 `reason`，交给人 review。
```

## License

MIT
