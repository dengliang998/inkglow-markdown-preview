import * as vscode from "vscode";
import { exportDocumentToPdf } from "./export/pdfExporter";
import { PreviewManager } from "./preview/previewManager";

const MARKDOWN_LANGUAGE_ID = "markdown";

export function activate(context: vscode.ExtensionContext): void {
  const previewManager = new PreviewManager(context.extensionUri);

  const openPreview = async (toSide: boolean): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== MARKDOWN_LANGUAGE_ID) {
      void vscode.window.showInformationMessage("墨光 Markdown 预览仅支持 Markdown 文档。请先聚焦一个 .md 编辑器。");
      return;
    }

    await previewManager.open(editor.document, toSide);
  };

  const exportPdf = async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== MARKDOWN_LANGUAGE_ID) {
      void vscode.window.showInformationMessage("墨光 Markdown 导出仅支持 Markdown 文档。请先聚焦一个 .md 编辑器。");
      return;
    }

    const config = vscode.workspace.getConfiguration("inkglowMarkdownPreview", editor.document.uri);
    await exportDocumentToPdf(
      editor.document,
      context.extensionUri,
      config.get<boolean>("allowRemoteImages", true),
      config.get<string>("chromePath", ""),
      {
        paperSize: config.get<"A4" | "A3" | "Letter">("export.paperSize", "A4"),
        orientation: config.get<"portrait" | "landscape">("export.orientation", "portrait"),
        margin: config.get<"narrow" | "normal" | "wide">("export.margin", "normal"),
        theme: config.get<"light" | "dark">("export.theme", "light"),
        includeOutline: config.get<boolean>("export.includeOutline", false),
        headerText: config.get<string>("export.headerText", ""),
        footerText: config.get<string>("export.footerText", ""),
        customCss: config.get<string>("export.customCss", ""),
      },
    );
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("inkglowMarkdownPreview.open", () => openPreview(false)),
    vscode.commands.registerCommand("inkglowMarkdownPreview.openToSide", () => openPreview(true)),
    vscode.commands.registerCommand("inkglowMarkdownPreview.exportPdf", exportPdf),
    previewManager,
  );
}

export function deactivate(): void {
  // Panels and subscriptions are disposed by VS Code through the extension context.
}
