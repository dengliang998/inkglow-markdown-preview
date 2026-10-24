import { execFile } from "node:child_process";
import { constants, promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import * as vscode from "vscode";
import { collectImageSources, resolveDocumentRelativeUri } from "../preview/resourceResolver";

const execFileAsync = promisify(execFile);

export interface PdfExportOptions {
  paperSize: "A4" | "A3" | "Letter";
  orientation: "portrait" | "landscape";
  margin: "narrow" | "normal" | "wide";
  theme: "light" | "dark";
  includeOutline: boolean;
  headerText: string;
  footerText: string;
  customCss: string;
}

export async function exportDocumentToPdf(
  document: vscode.TextDocument,
  extensionUri: vscode.Uri,
  allowRemoteImages: boolean,
  chromePath: string,
  options: PdfExportOptions,
): Promise<void> {
  const destination = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(
      vscode.Uri.file(path.dirname(document.uri.fsPath)),
      `${path.basename(document.fileName, path.extname(document.fileName))}.pdf`,
    ),
    filters: { "PDF document": ["pdf"] },
    saveLabel: "导出 PDF",
  });
  if (!destination) return;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "inkglow-markdown-pdf-"));
  const htmlPath = path.join(tempDir, "document.html");
  const pdfPath = destination.fsPath;

  try {
    const assets = await createInlineAssetMap(document);
    const exportScript = pathToFileURL(path.join(extensionUri.fsPath, "dist", "export", "exportPage.js")).href;
    const exportStyle = pathToFileURL(path.join(extensionUri.fsPath, "dist", "export", "exportPage.css")).href;
    const html = createExportHtml(document, assets, allowRemoteImages, exportScript, exportStyle, options);
    await fs.writeFile(htmlPath, html, "utf8");

    const browser = await findChrome(chromePath);
    if (!browser) {
      const htmlDestination = `${pdfPath}.html`;
      await fs.copyFile(htmlPath, htmlDestination);
      void vscode.window.showWarningMessage(`未找到 Chrome 或 Chromium，已生成可打印的 HTML：${htmlDestination}`);
      return;
    }

    await execFileAsync(browser, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--allow-file-access-from-files",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=5000",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });

    const pdfStats = await fs.stat(pdfPath);
    if (pdfStats.size === 0) throw new Error("Chrome 未生成有效的 PDF 文件。");

    void vscode.window.showInformationMessage(`PDF 已导出：${path.basename(pdfPath)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`导出 PDF 失败：${message}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function createInlineAssetMap(document: vscode.TextDocument): Promise<Record<string, string>> {
  const assets: Record<string, string> = {};
  for (const source of collectImageSources(document.getText())) {
    if (/^(?:https?:|data:|blob:|mailto:|file:|javascript:|vbscript:)/i.test(source)) continue;
    const resource = resolveDocumentRelativeUri(document.uri, source);
    if (!resource) continue;

    try {
      const bytes = await vscode.workspace.fs.readFile(resource);
      assets[source] = `data:${mimeType(resource.fsPath)};base64,${Buffer.from(bytes).toString("base64")}`;
    } catch {
      // Keep the original source so the export page can show a normal broken image.
    }
  }
  return assets;
}

function createExportHtml(
  document: vscode.TextDocument,
  assets: Record<string, string>,
  allowRemoteImages: boolean,
  exportScript: string,
  exportStyle: string,
  options: PdfExportOptions,
): string {
  const data = JSON.stringify({
    markdown: document.getText(),
    assets,
    allowRemoteImages,
    title: path.basename(document.fileName),
    options,
  }).replace(/</g, "\\u003c");

  const pageSize = `${options.paperSize} ${options.orientation}`;
  const margin = { narrow: "12mm", normal: "18mm", wide: "25mm" }[options.margin];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="${exportStyle}">
  <style>@page { size: ${pageSize}; margin: ${margin}; }</style>
</head>
<body>
  <main id="preview" class="preview"></main>
  <script id="inkglow-export-data" type="application/json">${data}</script>
  <script src="${exportScript}"></script>
</body>
</html>`;
}

async function findChrome(configuredPath: string): Promise<string | undefined> {
  const candidates = [
    configuredPath,
    ...(process.platform === "darwin" ? [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ] : []),
    ...(process.platform === "win32" ? [
      path.join(process.env.ProgramFiles ?? "", "Google/Chrome/Application/chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
      path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
      path.join(process.env.ProgramFiles ?? "", "Microsoft/Edge/Application/msedge.exe"),
    ] : []),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue searching.
    }
  }
  return undefined;
}

function mimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".svg": return "image/svg+xml";
    case ".webp": return "image/webp";
    case ".avif": return "image/avif";
    default: return "application/octet-stream";
  }
}
