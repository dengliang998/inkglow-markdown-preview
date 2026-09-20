# Inkglow Markdown Preview

A focused, local-first Markdown preview extension for VS Code.

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

- **Inkglow Markdown Preview: Open Preview** — opens in the active editor group by default
- **Inkglow Markdown Preview: Open Preview to the Side**

## Development

```bash
pnpm install
pnpm run build
# Open this folder in VS Code, then press F5.
```

## Attribution

The rendering behavior was designed with reference to BearAI Markdown and its upstream MDHero project. Inkglow is a standalone VS Code implementation and does not include Tauri, Svelte, workspace browsing, editing, AI, PDF export, or presentation features from those applications.

When distributing code derived from BearAI Markdown, retain its MIT license and the associated upstream attribution in `NOTICE`.
