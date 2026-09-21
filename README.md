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

## Development

```bash
pnpm install
pnpm run build
# Open this folder in VS Code, then press F5.
```

## Attribution

渲染行为参考了 BearAI Markdown 及其上游 MDHero 项目。墨光 Markdown 预览是独立的 VS Code 实现，不包含这些项目中的 Tauri、Svelte、工作区浏览、编辑、AI、PDF 导出或演示文稿功能。

分发源自 BearAI Markdown 的代码时，请保留其 MIT 许可证以及 `NOTICE` 中的上游署名。
