import * as path from "node:path";
import * as vscode from "vscode";
import { createAssetMap, getParentUri, resolveDocumentRelativeUri } from "./resourceResolver";
import type { RenderMessage, WebviewMessage } from "./messages";

const VIEW_TYPE = "inkglowMarkdownPreview.preview";
const REFRESH_DELAY_MS = 180;

export class PreviewManager implements vscode.Disposable {
  private readonly panels = new Map<string, PreviewPanel>();
  private readonly disposables: vscode.Disposable[];

  public constructor(private readonly extensionUri: vscode.Uri) {
    this.disposables = [
      vscode.workspace.onDidChangeTextDocument((event) => {
        const panel = this.panels.get(event.document.uri.toString());
        if (panel) panel.scheduleRender();
      }),
    ];
  }

  public async open(document: vscode.TextDocument, toSide: boolean): Promise<void> {
    const key = document.uri.toString();
    const current = this.panels.get(key);
    if (current) {
      current.reveal(toSide);
      current.scheduleRender();
      return;
    }

    const panel = new PreviewPanel(this.extensionUri, document, toSide, () => {
      this.panels.delete(key);
    });
    this.panels.set(key, panel);
    await panel.render();
  }

  public dispose(): void {
    for (const panel of this.panels.values()) panel.dispose();
    for (const disposable of this.disposables) disposable.dispose();
    this.panels.clear();
  }
}

class PreviewPanel implements vscode.Disposable {
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private webviewReady = false;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly document: vscode.TextDocument,
    toSide: boolean,
    private readonly onDispose: () => void,
  ) {
    const localResourceRoots = uniqueUris([
      extensionUri,
      getParentUri(document.uri),
      ...(vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? []),
    ]);

    this.panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      `${path.basename(document.fileName)} — 墨光 Markdown 预览`,
      toSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots,
      },
    );

    this.panel.webview.html = getWebviewHtml(this.panel.webview, extensionUri);
    this.disposables.push(
      this.panel.onDidDispose(() => this.cleanup()),
      this.panel.webview.onDidReceiveMessage((message: WebviewMessage) => this.handleMessage(message)),
    );
  }

  public reveal(toSide: boolean): void {
    // The standard command returns the preview to the active editor group. Keeping
    // existing source tabs is intentional: closing editors automatically is destructive.
    this.panel.reveal(toSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active, false);
  }

  public scheduleRender(): void {
    if (this.disposed) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.render();
    }, REFRESH_DELAY_MS);
  }

  public async render(): Promise<void> {
    if (this.disposed || !this.webviewReady) return;

    const config = vscode.workspace.getConfiguration("inkglowMarkdownPreview", this.document.uri);
    const message: RenderMessage = {
      type: "render",
      markdown: this.document.getText(),
      assets: createAssetMap(this.document, this.panel.webview),
      allowRemoteImages: config.get<boolean>("allowRemoteImages", true),
    };

    await this.panel.webview.postMessage(message);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.panel.dispose();
    this.cleanup();
  }

  private cleanup(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    for (const disposable of this.disposables) disposable.dispose();
    this.onDispose();
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (message.type === "ready") {
      this.webviewReady = true;
      await this.render();
      return;
    }

    if (message.type === "openExternal") {
      const uri = safelyParseExternalUri(message.href);
      if (uri) await vscode.env.openExternal(uri);
      return;
    }

    if (message.type === "openLocal") {
      const target = resolveDocumentRelativeUri(this.document.uri, message.href);
      if (!target) return;
      try {
        const targetDocument = await vscode.workspace.openTextDocument(target);
        await vscode.window.showTextDocument(targetDocument, { preview: false });
      } catch {
        void vscode.window.showWarningMessage(`Inkglow could not open linked file: ${message.href}`);
      }
    }
  }
}

function uniqueUris(uris: vscode.Uri[]): vscode.Uri[] {
  const seen = new Set<string>();
  return uris.filter((uri) => {
    const key = uri.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safelyParseExternalUri(value: string): vscode.Uri | undefined {
  try {
    const uri = vscode.Uri.parse(value, true);
    return /^(https?|mailto)$/i.test(uri.scheme) ? uri : undefined;
  } catch {
    return undefined;
  }
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.css"));
  const nonce = createNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}'; worker-src blob:;" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>墨光 Markdown 预览</title>
</head>
<body>
  <button id="search-toggle" class="search-toggle" type="button" aria-controls="search-panel" aria-expanded="false" aria-label="Search this document">
    <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.7" cy="6.7" r="4.25" /><path d="m10 10 3.55 3.55" /></svg>
    <span>搜索</span>
  </button>
  <section id="search-panel" class="search-panel" aria-label="Document search" aria-hidden="true">
    <div class="search-header"><strong>文档搜索</strong><button id="search-close" type="button" aria-label="Close document search">×</button></div>
    <div class="search-controls">
      <input id="search-input" type="search" placeholder="搜索当前文档" autocomplete="off" spellcheck="false" aria-label="Search current document" />
      <button id="search-previous" type="button" aria-label="Previous result">‹</button>
      <button id="search-next" type="button" aria-label="Next result">›</button>
    </div>
    <div id="search-status" class="search-status" aria-live="polite">输入关键词开始搜索</div>
  </section>
  <button id="outline-toggle" class="outline-toggle" type="button" aria-controls="outline-panel" aria-expanded="false" aria-label="Toggle document outline">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.25h12M2 8h12M2 12.75h12M2 2.25v2M2 7v2M2 11.75v2" /></svg>
    <span>目录</span>
  </button>
  <aside id="outline-panel" class="outline-panel" aria-label="Document outline" aria-hidden="true">
    <div class="outline-header">
      <strong>文档目录</strong>
      <div class="outline-header-actions">
        <button id="outline-collapse-all" class="outline-collapse-all" type="button" aria-label="折叠全部目录" title="折叠全部目录" hidden>折叠全部</button>
        <button id="outline-close" type="button" aria-label="Close document outline" title="关闭目录">×</button>
      </div>
    </div>
    <nav id="outline-list" class="outline-list" aria-label="Headings"></nav>
  </aside>
  <main id="preview" class="preview" aria-live="polite"></main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function createNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
