import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import katex from "katex";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import taskLists from "markdown-it-task-lists";
import texmath from "markdown-it-texmath";

export interface MarkdownRendererOptions {
  assets?: Record<string, string>;
  allowRemoteImages?: boolean;
}

export function createMarkdownRenderer(options: MarkdownRendererOptions = {}): MarkdownIt {
  const assets = options.assets ?? {};
  const allowRemoteImages = options.allowRemoteImages ?? true;
  const renderer = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    highlight: (source, language) => {
      if (language && language !== "mermaid" && hljs.getLanguage(language)) {
        try {
          return hljs.highlight(source, { language }).value;
        } catch {
          // Fall through to escaped, unhighlighted source.
        }
      }
      return "";
    },
  });

  renderer.use(taskLists as never, { enabled: false, label: true });
  renderer.use(anchor as never, { permalink: false });
  renderer.use(texmath as never, { engine: katex, delimiters: "dollars" });

  const originalImage = renderer.renderer.rules.image ?? ((tokens, index, renderOptions, _env, self) => self.renderToken(tokens, index, renderOptions));
  renderer.renderer.rules.image = (tokens, index, renderOptions, env, self) => {
    const token = tokens[index];
    const source = token?.attrGet("src") ?? "";

    if (/^https?:/i.test(source) && !allowRemoteImages) {
      const label = escapeHtml(token?.content || "Remote image");
      return `<span class="inkglow-blocked-image">Remote image blocked: ${label}</span>`;
    }

    if (assets[source]) token?.attrSet("src", assets[source]);
    token?.attrSet("loading", "lazy");
    return originalImage(tokens, index, renderOptions, env, self);
  };

  return renderer;
}

export function sanitizeMarkdownHtml(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["loading", "dir"],
  });
}

export function stripFrontmatter(markdownSource: string): string {
  return markdownSource.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;",
  })[character] ?? character);
}
