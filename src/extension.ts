import * as vscode from "vscode";
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

  context.subscriptions.push(
    vscode.commands.registerCommand("inkglowMarkdownPreview.open", () => openPreview(false)),
    vscode.commands.registerCommand("inkglowMarkdownPreview.openToSide", () => openPreview(true)),
    previewManager,
  );
}

export function deactivate(): void {
  // Panels and subscriptions are disposed by VS Code through the extension context.
}
