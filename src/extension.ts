import * as vscode from "vscode";
import { PreviewManager } from "./preview/previewManager";

const MARKDOWN_LANGUAGE_ID = "markdown";

export function activate(context: vscode.ExtensionContext): void {
  const previewManager = new PreviewManager(context.extensionUri);

  const openPreview = async (toSide: boolean): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== MARKDOWN_LANGUAGE_ID) {
      void vscode.window.showInformationMessage("Inkglow Preview opens Markdown documents. Focus a .md editor first.");
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
