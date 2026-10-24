# 墨光 Markdown 预览

一款专注于本地体验的 VS Code Markdown 预览插件。

## Included in the first release

- Standard Markdown, tables, task lists, anchors, and automatic links
- Code highlighting and code-copy controls
- KaTeX mathematics
- Mermaid diagrams
- Relative local images and Markdown links
- Built-in hierarchical heading outline with active-section tracking, one-click navigation, and collapsible levels
- In-document search with match count, previous/next navigation, and active-match highlighting
- VS Code light/dark theme integration
- HTML sanitization and a restrictive Webview content-security policy

## Commands

- **墨光 Markdown 预览：打开预览** — 默认在当前编辑器组中打开
- **墨光 Markdown 预览：在侧边打开预览**
- **墨光 Markdown 预览：导出 PDF** — 使用本机 Chrome 或 Chromium 生成 A4 PDF

PDF 导出默认查找本机 Chrome、Microsoft Edge 或 Chromium。也可以通过
`inkglowMarkdownPreview.chromePath` 配置浏览器可执行文件的绝对路径。未找到浏览器时，插件会生成可手动打印的 HTML 文件。

PDF 导出还支持通过设置配置纸张尺寸、方向、页边距、浅色/深色主题、目录、页眉、页脚和自定义 CSS。

## Development

```bash
pnpm install
pnpm run build
# Open this folder in VS Code, then press F5.
```

## Attribution

渲染行为参考了 BearAI Markdown 及其上游 MDHero 项目。墨光 Markdown 预览是独立的 VS Code 实现，不包含这些项目中的 Tauri、Svelte、工作区浏览、编辑、AI、PDF 导出或演示文稿功能。

分发源自 BearAI Markdown 的代码时，请保留其 MIT 许可证以及 `NOTICE` 中的上游署名。
