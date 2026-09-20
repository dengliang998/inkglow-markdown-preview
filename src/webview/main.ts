import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import katex from "katex";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import taskLists from "markdown-it-task-lists";
import texmath from "markdown-it-texmath";
import mermaid from "mermaid";
import "katex/dist/katex.min.css";
import "./styles.css";

type RenderMessage = {
  type: "render";
  markdown: string;
  assets: Record<string, string>;
  allowRemoteImages: boolean;
};

type VsCodeApi = {
  postMessage(message: { type: "ready" } | { type: "openExternal" | "openLocal"; href: string }): void;
};

type OutlineEntry = {
  heading: HTMLHeadingElement;
  level: number;
  children: OutlineEntry[];
};

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const previewRoot = document.querySelector<HTMLElement>("#preview");
if (!previewRoot) throw new Error("Inkglow preview root is missing.");
const preview: HTMLElement = previewRoot;
const searchToggle = requireElement<HTMLButtonElement>("#search-toggle");
const searchPanel = requireElement<HTMLElement>("#search-panel");
const searchClose = requireElement<HTMLButtonElement>("#search-close");
const searchInput = requireElement<HTMLInputElement>("#search-input");
const searchPrevious = requireElement<HTMLButtonElement>("#search-previous");
const searchNext = requireElement<HTMLButtonElement>("#search-next");
const searchStatus = requireElement<HTMLElement>("#search-status");
const outlineToggle = requireElement<HTMLButtonElement>("#outline-toggle");
const outlinePanel = requireElement<HTMLElement>("#outline-panel");
const outlineClose = requireElement<HTMLButtonElement>("#outline-close");
const outlineList = requireElement<HTMLElement>("#outline-list");

let assetMap: Record<string, string> = {};
let remoteImagesAllowed = true;
let renderGeneration = 0;
let outlineInitialized = false;
let outlineOpen = false;
let outlineObserver: IntersectionObserver | undefined;
const outlineButtons = new Map<string, HTMLButtonElement>();
const outlineNodes = new Map<string, HTMLElement>();
const outlineCollapseButtons = new Map<string, HTMLButtonElement>();
const collapsedOutlineIds = new Set<string>();
let searchOpen = false;
let searchMatches: HTMLElement[] = [];
let currentSearchIndex = -1;

const markdown = createRenderer();
initializeSearchControls();
initializeOutlineControls();
vscode.postMessage({ type: "ready" });

window.addEventListener("message", (event: MessageEvent<RenderMessage>) => {
  if (event.data.type !== "render") return;
  void renderDocument(event.data);
});

preview.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const copyButton = target.closest<HTMLButtonElement>("[data-inkglow-copy]");
  if (copyButton) {
    void copyCodeBlock(copyButton);
    return;
  }

  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (!link) return;
  const href = link.getAttribute("href") ?? "";
  if (!href || href.startsWith("#")) return;

  event.preventDefault();
  if (/^(?:https?:|mailto:)/i.test(href)) {
    vscode.postMessage({ type: "openExternal", href });
  } else {
    vscode.postMessage({ type: "openLocal", href });
  }
});

function createRenderer(): MarkdownIt {
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

  const originalImage = renderer.renderer.rules.image ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
  renderer.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const source = token?.attrGet("src") ?? "";

    if (/^https?:/i.test(source) && !remoteImagesAllowed) {
      const label = escapeHtml(token?.content || "Remote image");
      return `<span class="inkglow-blocked-image">Remote image blocked: ${label}</span>`;
    }

    if (assetMap[source]) token?.attrSet("src", assetMap[source]);
    token?.attrSet("loading", "lazy");
    return originalImage(tokens, index, options, env, self);
  };

  return renderer;
}

async function renderDocument(message: RenderMessage): Promise<void> {
  const generation = ++renderGeneration;
  assetMap = message.assets;
  remoteImagesAllowed = message.allowRemoteImages;

  const content = stripFrontmatter(message.markdown);
  const rawHtml = markdown.render(content);
  preview.innerHTML = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["loading", "dir"],
  });

  addDirectionHints();
  buildOutline();
  addCodeCopyButtons();
  await renderMermaidDiagrams(generation);
  if (generation === renderGeneration && searchInput.value) updateSearchResults(false);
}

async function renderMermaidDiagrams(generation: number): Promise<void> {
  const dark = document.body.classList.contains("vscode-dark") || document.body.classList.contains("vscode-high-contrast");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
    fontFamily: "var(--vscode-editor-font-family)",
  });

  const blocks = [...preview.querySelectorAll<HTMLElement>("pre > code.language-mermaid")];
  for (const [index, code] of blocks.entries()) {
    if (generation !== renderGeneration) return;
    const source = code.textContent ?? "";
    const pre = code.parentElement;
    if (!pre || !source.trim()) continue;

    try {
      const id = `inkglow-mermaid-${generation}-${index}`;
      const { svg } = await mermaid.render(id, source);
      if (generation !== renderGeneration) return;

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
}

function initializeSearchControls(): void {
  searchToggle.addEventListener("click", () => setSearchOpen(!searchOpen));
  searchClose.addEventListener("click", () => setSearchOpen(false));
  searchInput.addEventListener("input", () => updateSearchResults(true));
  searchNext.addEventListener("click", () => moveSearchResult(1));
  searchPrevious.addEventListener("click", () => moveSearchResult(-1));

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      moveSearchResult(event.shiftKey ? -1 : 1);
    }
    if (event.key === "Escape") setSearchOpen(false);
  });

  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      setSearchOpen(true);
    }
  });
}

function initializeOutlineControls(): void {
  outlineToggle.addEventListener("click", () => setOutlineOpen(!outlineOpen));
  outlineClose.addEventListener("click", closeOutline);

  outlineList.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const collapseButton = target.closest<HTMLButtonElement>("[data-outline-collapse]");
    if (collapseButton) {
      const id = collapseButton.dataset.outlineCollapse;
      if (id) setOutlineNodeCollapsed(id, !collapsedOutlineIds.has(id));
      return;
    }

    const item = target.closest<HTMLButtonElement>("[data-outline-target]");
    const id = item?.dataset.outlineTarget;
    if (!id) return;

    const heading = document.getElementById(id);
    if (!heading) return;
    heading.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    setActiveOutlineItem(id);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (searchOpen) setSearchOpen(false);
    else if (outlineOpen) closeOutline();
  });
}

function buildOutline(): void {
  outlineObserver?.disconnect();
  outlineButtons.clear();
  outlineNodes.clear();
  outlineCollapseButtons.clear();
  outlineList.replaceChildren();

  const headings = [...preview.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6")]
    .filter((heading) => Boolean(heading.textContent?.trim()));

  const hasOutline = headings.length > 0;
  outlineToggle.hidden = !hasOutline;
  outlinePanel.hidden = !hasOutline;
  if (!hasOutline) {
    setOutlineOpen(false, false);
    return;
  }

  headings.forEach((heading, index) => {
    if (!heading.id) heading.id = `inkglow-section-${index + 1}`;
  });

  const availableIds = new Set(headings.map((heading) => heading.id));
  for (const id of collapsedOutlineIds) {
    if (!availableIds.has(id)) collapsedOutlineIds.delete(id);
  }

  renderOutlineEntries(createOutlineTree(headings), outlineList);

  if (!outlineInitialized) {
    outlineInitialized = true;
    setOutlineOpen(window.matchMedia("(min-width: 960px)").matches);
  } else {
    setOutlineOpen(outlineOpen, false);
  }

  outlineObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    const active = visible[0]?.target as HTMLHeadingElement | undefined;
    if (active) setActiveOutlineItem(active.id);
  }, {
    rootMargin: "-12% 0px -72% 0px",
    threshold: [0, 1],
  });

  headings.forEach((heading) => outlineObserver?.observe(heading));
  setActiveOutlineItem(headings[0]?.id ?? "");
}

function createOutlineTree(headings: HTMLHeadingElement[]): OutlineEntry[] {
  const roots: OutlineEntry[] = [];
  const stack: OutlineEntry[] = [];

  for (const heading of headings) {
    const entry: OutlineEntry = {
      heading,
      level: Number(heading.tagName.slice(1)),
      children: [],
    };

    while (stack.length) {
      const previous = stack[stack.length - 1];
      if (!previous || previous.level < entry.level) break;
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(entry);
    else roots.push(entry);
    stack.push(entry);
  }

  return roots;
}

function renderOutlineEntries(entries: OutlineEntry[], container: HTMLElement): void {
  for (const entry of entries) {
    const { heading, children } = entry;
    const node = document.createElement("div");
    node.className = "outline-node";
    node.dataset.outlineNode = heading.id;

    const row = document.createElement("div");
    row.className = "outline-row";
    if (children.length) {
      const collapseButton = document.createElement("button");
      collapseButton.type = "button";
      collapseButton.className = "outline-disclosure";
      collapseButton.dataset.outlineCollapse = heading.id;
      collapseButton.setAttribute("aria-label", `Toggle subsections for ${heading.textContent?.trim() ?? "section"}`);
      row.append(collapseButton);
      outlineCollapseButtons.set(heading.id, collapseButton);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "outline-disclosure-spacer";
      spacer.setAttribute("aria-hidden", "true");
      row.append(spacer);
    }

    const item = document.createElement("button");
    item.type = "button";
    item.className = "outline-item";
    item.dataset.outlineTarget = heading.id;
    item.textContent = heading.textContent?.trim() ?? "Untitled section";
    item.title = item.textContent;
    row.append(item);
    node.append(row);
    container.append(node);

    outlineButtons.set(heading.id, item);
    outlineNodes.set(heading.id, node);
    if (children.length) {
      const childList = document.createElement("div");
      childList.className = "outline-children";
      node.append(childList);
      renderOutlineEntries(children, childList);
      setOutlineNodeCollapsed(heading.id, collapsedOutlineIds.has(heading.id));
    }
  }
}

function setOutlineNodeCollapsed(id: string, collapsed: boolean): void {
  const node = outlineNodes.get(id);
  const button = outlineCollapseButtons.get(id);
  if (!node || !button) return;

  node.classList.toggle("is-collapsed", collapsed);
  button.setAttribute("aria-expanded", String(!collapsed));
  if (collapsed) collapsedOutlineIds.add(id);
  else collapsedOutlineIds.delete(id);
}

function setOutlineOpen(nextOpen: boolean, closeSearch = true): void {
  if (nextOpen && closeSearch) setSearchOpen(false, false);
  outlineOpen = nextOpen && !outlinePanel.hidden;
  outlinePanel.classList.toggle("is-open", outlineOpen);
  outlinePanel.setAttribute("aria-hidden", String(!outlineOpen));
  outlineToggle.setAttribute("aria-expanded", String(outlineOpen));
}

function closeOutline(): void {
  setOutlineOpen(false, false);
}

function setSearchOpen(nextOpen: boolean, shouldCloseOutline = true): void {
  if (nextOpen && shouldCloseOutline) closeOutline();
  searchOpen = nextOpen;
  searchPanel.classList.toggle("is-open", searchOpen);
  searchPanel.setAttribute("aria-hidden", String(!searchOpen));
  searchToggle.setAttribute("aria-expanded", String(searchOpen));
  if (searchOpen) window.requestAnimationFrame(() => searchInput.focus());
}

function updateSearchResults(shouldSelectFirst: boolean): void {
  clearSearchHighlights();
  const query = searchInput.value.trim();
  if (!query) {
    currentSearchIndex = -1;
    updateSearchStatus();
    return;
  }

  const needle = query.toLocaleLowerCase();
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      if (parent.closest(".code-copy-button, .mermaid-diagram, .inkglow-search-match")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) textNodes.push(node as Text);
  for (const textNode of textNodes) highlightMatchesInTextNode(textNode, needle);

  searchMatches = [...preview.querySelectorAll<HTMLElement>("mark.inkglow-search-match")];
  currentSearchIndex = searchMatches.length ? (shouldSelectFirst ? 0 : Math.min(Math.max(currentSearchIndex, 0), searchMatches.length - 1)) : -1;
  updateSearchStatus();
  if (shouldSelectFirst && currentSearchIndex >= 0) revealCurrentSearchResult();
}

function highlightMatchesInTextNode(textNode: Text, needle: string): void {
  const text = textNode.data;
  const haystack = text.toLocaleLowerCase();
  let start = 0;
  let index = haystack.indexOf(needle, start);
  if (index < 0) return;

  const fragment = document.createDocumentFragment();
  while (index >= 0) {
    if (index > start) fragment.append(text.slice(start, index));
    const match = document.createElement("mark");
    match.className = "inkglow-search-match";
    match.textContent = text.slice(index, index + needle.length);
    fragment.append(match);
    start = index + needle.length;
    index = haystack.indexOf(needle, start);
  }
  if (start < text.length) fragment.append(text.slice(start));
  textNode.replaceWith(fragment);
}

function clearSearchHighlights(): void {
  for (const match of preview.querySelectorAll<HTMLElement>("mark.inkglow-search-match")) {
    match.replaceWith(document.createTextNode(match.textContent ?? ""));
  }
  searchMatches = [];
}

function moveSearchResult(direction: 1 | -1): void {
  if (!searchMatches.length) return;
  currentSearchIndex = (currentSearchIndex + direction + searchMatches.length) % searchMatches.length;
  updateSearchStatus();
  revealCurrentSearchResult();
}

function revealCurrentSearchResult(): void {
  const match = searchMatches[currentSearchIndex];
  if (!match) return;
  for (const item of searchMatches) item.classList.remove("is-current");
  match.classList.add("is-current");
  match.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "center",
  });
}

function updateSearchStatus(): void {
  const query = searchInput.value.trim();
  if (!query) {
    searchStatus.textContent = "输入关键词开始搜索";
  } else if (!searchMatches.length) {
    searchStatus.textContent = "未找到匹配项";
  } else {
    searchStatus.textContent = `${currentSearchIndex + 1} / ${searchMatches.length}`;
  }
  searchPrevious.disabled = searchMatches.length < 2;
  searchNext.disabled = searchMatches.length < 2;
}

function setActiveOutlineItem(id: string): void {
  for (const [headingId, button] of outlineButtons) {
    const active = headingId === id;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "location");
    else button.removeAttribute("aria-current");
  }

  // Keep the current section visible when it belongs to a collapsed parent.
  let ancestor = outlineButtons.get(id)?.closest<HTMLElement>(".outline-node")?.parentElement?.closest<HTMLElement>(".outline-node");
  while (ancestor) {
    const ancestorId = ancestor.dataset.outlineNode;
    if (ancestorId) setOutlineNodeCollapsed(ancestorId, false);
    ancestor = ancestor.parentElement?.closest<HTMLElement>(".outline-node");
  }
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Inkglow UI element is missing: ${selector}`);
  return element;
}

function addDirectionHints(): void {
  for (const element of preview.querySelectorAll("p, h1, h2, h3, h4, h5, h6, blockquote, li, td, th")) {
    element.setAttribute("dir", "auto");
  }
}

function addCodeCopyButtons(): void {
  for (const pre of preview.querySelectorAll<HTMLElement>("pre")) {
    if (pre.querySelector("[data-inkglow-copy]")) continue;
    const code = pre.querySelector("code");
    if (!code || code.classList.contains("language-mermaid")) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-copy-button";
    button.dataset.inkglowCopy = "true";
    button.setAttribute("aria-label", "Copy code block");
    button.textContent = "Copy";
    pre.append(button);
  }
}

async function copyCodeBlock(button: HTMLButtonElement): Promise<void> {
  const code = button.parentElement?.querySelector("code")?.textContent ?? "";
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  }

  window.setTimeout(() => {
    button.textContent = "Copy";
  }, 1400);
}

function stripFrontmatter(markdownSource: string): string {
  return markdownSource.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;",
  })[character] ?? character);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Mermaid error";
}
