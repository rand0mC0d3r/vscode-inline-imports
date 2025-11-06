import * as vscode from 'vscode';
import { PACKAGE_JSON_NAME } from './constants';
import { scanWorkspace, showUnusedFiles } from './utils';

export function createActionsMenu(vscode: typeof import('vscode'), context: vscode.ExtensionContext, emitter: vscode.EventEmitter<vscode.Uri[]>, referenceMap: Map<string, number>, config: vscode.WorkspaceConfiguration, status: vscode.StatusBarItem) {
  const showActions = vscode.commands.registerCommand("vs-inline-imports.showActions", async () => {
    const choice = await vscode.window.showQuickPick([
      "🔍 Re-scan workspace",
      "📜 Show unused files",
      "🚫 Clear decorations"
    ], { placeHolder: "What do you want to do?" });

    if (choice?.includes("Re-scan")) {await scanWorkspace(emitter, referenceMap, config, status);}
    else if (choice?.includes("Show unused")) {showUnusedFiles(referenceMap, config);}
    else if (choice?.includes("Clear")) {referenceMap.clear();}
  });
  context.subscriptions.push(showActions);
}

export function createStatusBarItem(context: vscode.ExtensionContext) {
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    status.text = "$(file-code) Imports: 0 used / 0 unused";
    status.tooltip = "Click to open Inline Imports actions menu";
    status.command = `${PACKAGE_JSON_NAME}.showActions`;
    status.show();
    context.subscriptions.push(status);

    return status;
}

export function updateStatusBar(referenceMap: Map<string, number>, status: vscode.StatusBarItem, totalFilesCount?: number) {
  const used = Array.from(referenceMap.values()).filter(count => count > 0).length;
  const allFiles = totalFilesCount || 0;
  const unused = allFiles - used;
  status.text = `$(file-code) ${used} used / ${unused} unused`;
  status.tooltip = `Scanned ${allFiles} total files.\nClick to show Inline Imports actions menu`;
}
