import * as path from 'path';
import * as vscode from 'vscode';
import { getReverseImportMap } from './scanner';

/**
 * Get relative path from workspace root, or return absolute path if no workspace
 */
function getRelativePath(filePath: string, workspaceRoot: string): string {
  return workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath;
}

/**
 * Show file usages in a quick pick menu
 */
export async function showFileUsages(
  targetFile: vscode.Uri,
  config: vscode.WorkspaceConfiguration
) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(targetFile);
  const workspaceRoot = workspaceFolder?.uri.fsPath || '';
  const relativePath = getRelativePath(targetFile.fsPath, workspaceRoot);
  
  // Get the reverse import map
  const reverseMap = getReverseImportMap();
  const importers = reverseMap.get(targetFile.fsPath);

  if (!importers || importers.size === 0) {
    vscode.window.showInformationMessage(
      `📁 No usages found for ${path.basename(targetFile.fsPath)}`
    );
    return;
  }

  const usages = Array.from(importers)
    .map(filePath => vscode.Uri.file(filePath))
    .sort((a, b) => a.fsPath.localeCompare(b.fsPath));

  console.log(`🔍 Found ${usages.length} usages for ${relativePath}`);

  const items: (vscode.QuickPickItem & { uri?: vscode.Uri })[] = [];
  
  // Add header item
  items.push({
    label: `📊 ${usages.length} file${usages.length === 1 ? '' : 's'} import this module`,
    kind: vscode.QuickPickItemKind.Separator,
  });

  // Add usage items
  for (let i = 0; i < usages.length; i++) {
    // Add separators every 10 items for readability
    if (i > 0 && i % 10 === 0) {
      items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
    }
    
    const uri = usages[i];
    const relPath = getRelativePath(uri.fsPath, workspaceRoot);
    items.push({
      label: path.basename(uri.fsPath),
      description: relPath,
      uri,
    });
  }

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `📁 ${usages.length} file${usages.length === 1 ? '' : 's'} import ${path.basename(targetFile.fsPath)} — select one to open`,
    matchOnDescription: true,
    ignoreFocusOut: true,
  });

  if (pick?.uri) {
    const doc = await vscode.workspace.openTextDocument(pick.uri);
    vscode.window.showTextDocument(doc, { preview: false });
  }
}
