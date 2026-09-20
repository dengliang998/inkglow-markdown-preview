import * as path from "node:path";
import * as vscode from "vscode";
import MarkdownIt from "markdown-it";

interface MarkdownToken {
  type: string;
  children?: MarkdownToken[];
  attrGet(name: string): string | null;
}

const imageParser = new MarkdownIt({ html: false });
const EXTERNAL_SCHEME = /^(?:https?:|data:|blob:|mailto:|file:|javascript:|vbscript:|vscode-webview-resource:)/i;
const WINDOWS_ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]/;

export function createAssetMap(
  document: vscode.TextDocument,
  webview: vscode.Webview,
): Record<string, string> {
  const assets: Record<string, string> = {};
  const tokens = imageParser.parse(document.getText(), {}) as unknown as MarkdownToken[];

  for (const source of collectImageSources(tokens)) {
    if (EXTERNAL_SCHEME.test(source) || source.startsWith("#")) {
      continue;
    }

    const resource = resolveDocumentRelativeUri(document.uri, source);
    if (resource) {
      assets[source] = webview.asWebviewUri(resource).toString();
    }
  }

  return assets;
}

export function resolveDocumentRelativeUri(documentUri: vscode.Uri, href: string): vscode.Uri | undefined {
  const pathOnly = href.split(/[?#]/, 1)[0];
  if (!pathOnly || EXTERNAL_SCHEME.test(pathOnly)) {
    return undefined;
  }

  const decodedPath = safelyDecode(pathOnly);
  if (documentUri.scheme === "file") {
    const resolved = path.isAbsolute(decodedPath) || WINDOWS_ABSOLUTE_PATH.test(decodedPath)
      ? decodedPath
      : path.resolve(path.dirname(documentUri.fsPath), decodedPath);
    return vscode.Uri.file(resolved);
  }

  if (decodedPath.startsWith("/")) {
    return undefined;
  }

  const segments = decodedPath.replaceAll("\\", "/").split("/").filter(Boolean);
  return vscode.Uri.joinPath(getParentUri(documentUri), ...segments);
}

export function getParentUri(uri: vscode.Uri): vscode.Uri {
  return uri.with({ path: path.posix.dirname(uri.path) });
}

function collectImageSources(tokens: MarkdownToken[]): Set<string> {
  const sources = new Set<string>();
  const visit = (items: MarkdownToken[]): void => {
    for (const token of items) {
      if (token.type === "image") {
        const src = token.attrGet("src");
        if (src) sources.add(src);
      }
      if (token.children) visit(token.children);
    }
  };

  visit(tokens);
  return sources;
}

function safelyDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
