import DOMPurify from "dompurify";
import mermaid from "mermaid";
import "katex/dist/katex.min.css";
import "./export.css";
import { createMarkdownRenderer, sanitizeMarkdownHtml, stripFrontmatter } from "../webview/markdownRenderer";

type ExportData = {
  markdown: string;
  assets: Record<string, string>;
  allowRemoteImages: boolean;
  title: string;
  options: {
    paperSize: "A4" | "A3" | "Letter";
    orientation: "portrait" | "landscape";
    margin: "narrow" | "normal" | "wide";
    theme: "light" | "dark";
    includeOutline: boolean;
    headerText: string;
    footerText: string;
    customCss: string;
  };
};

const dataElement = document.querySelector<HTMLScriptElement>("#inkglow-export-data");
if (!dataElement?.textContent) throw new Error("Inkglow export data is missing.");

const data = JSON.parse(dataElement.textContent) as ExportData;
const previewElement = document.querySelector<HTMLElement>("#preview");
if (!previewElement) throw new Error("Inkglow export root is missing.");
const preview: HTMLElement = previewElement;

document.title = data.title;
document.body.classList.toggle("theme-dark", data.options.theme === "dark");
addCustomCss(data.options.customCss);
addPageChrome(data.options.headerText, data.options.footerText);
const markdown = createMarkdownRenderer({
  assets: data.assets,
  allowRemoteImages: data.allowRemoteImages,
});
const rawHtml = markdown.render(stripFrontmatter(data.markdown));
preview.innerHTML = sanitizeMarkdownHtml(rawHtml);

for (const element of preview.querySelectorAll("p, h1, h2, h3, h4, h5, h6, blockquote, li, td, th")) {
  element.setAttribute("dir", "auto");
}

if (data.options.includeOutline) addOutline();

void renderMermaidDiagrams();

async function renderMermaidDiagrams(): Promise<void> {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "default",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
  });

  const blocks = [...preview.querySelectorAll<HTMLElement>("pre > code.language-mermaid")];
  for (const [index, code] of blocks.entries()) {
    const source = code.textContent ?? "";
    const pre = code.parentElement;
    if (!pre || !source.trim()) continue;

    try {
      const { svg } = await mermaid.render(`inkglow-export-mermaid-${index}`, source);
      const diagram = document.createElement("div");
      diagram.className = "mermaid-diagram";
      diagram.innerHTML = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        ADD_ATTR: ["class", "style", "viewBox", "aria-labelledby", "role"],
      });
      pre.replaceWith(diagram);
    } catch (error) {
      const errorBox = document.createElement("div");
      errorBox.className = "mermaid-error";
      errorBox.textContent = `Mermaid could not render this diagram: ${formatError(error)}`;
      pre.after(errorBox);
    }
  }

  document.documentElement.dataset.inkglowReady = "true";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Mermaid error";
}

function addOutline(): void {
  const headings = [...preview.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6")]
    .filter((heading) => Boolean(heading.textContent?.trim()));
  if (!headings.length) return;

  const outline = document.createElement("nav");
  outline.className = "export-outline";
  outline.setAttribute("aria-label", "Table of contents");
  const title = document.createElement("h2");
  title.textContent = "目录";
  outline.append(title);

  const list = document.createElement("ol");
  for (const heading of headings) {
    const item = document.createElement("li");
    item.dataset.level = heading.tagName.slice(1);
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent?.trim() ?? "";
    item.append(link);
    list.append(item);
  }
  outline.append(list);
  preview.before(outline);
}

function addPageChrome(headerText: string, footerText: string): void {
  if (headerText.trim()) {
    const header = document.createElement("div");
    header.className = "export-header";
    header.textContent = headerText;
    document.body.append(header);
  }
  if (footerText.trim()) {
    const footer = document.createElement("div");
    footer.className = "export-footer";
    footer.textContent = footerText;
    document.body.append(footer);
  }
}

function addCustomCss(css: string): void {
  if (!css.trim()) return;
  const style = document.createElement("style");
  style.dataset.inkglowCustom = "true";
  style.textContent = css;
  document.head.append(style);
}
