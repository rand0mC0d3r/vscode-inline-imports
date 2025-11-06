import * as path from 'path';
import * as vscode from 'vscode';
import { getAllSourceFiles } from './scanner';

// --- Unused file listing unchanged ---
export async function showUnusedFiles(
  referenceMap: Map<string, number>,
  config: vscode.WorkspaceConfiguration
) {
  const allFiles = await getAllSourceFiles(config);

  const unused = allFiles
    .filter(uri => {
      if (!uri.fsPath.includes(path.sep + 'src' + path.sep)) {return false;}
      if (!config.fileExtensions.some((ext: string) => uri.fsPath.endsWith(ext))) {return false;}
      return referenceMap.get(uri.fsPath) === 0;
    })
    .sort((a, b) => a.fsPath.localeCompare(b.fsPath));

  if (unused.length === 0) {
    vscode.window.showInformationMessage('🎉 No unused files detected!');
    return;
  }

  console.log(`🧹 Found ${unused.length} unused files`);

  const items: (vscode.QuickPickItem & { uri?: vscode.Uri })[] = [];
  const firstBatch = unused.slice(0, 30);

  for (let i = 0; i < firstBatch.length; i++) {
    if (i % 10 === 0 && i > 0) {items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });}
    const uri = firstBatch[i];
    items.push({
      label: path.basename(uri.fsPath),
      description: uri.fsPath.replace(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        ''
      ),
      uri,
    });
  }

  if (unused.length > 30) {
    items.push({
      label: `...and ${unused.length - 30} more`,
      description: 'Select to view the full list',
    });
  }

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `🗑️ ${unused.length} unused files — select one to open`,
    matchOnDescription: true,
    ignoreFocusOut: true,
  });

  if (!pick) {return;}

  if (pick.label.startsWith('...and')) {
    const allItems = unused.map(uri => ({
      label: path.basename(uri.fsPath),
      description: uri.fsPath.replace(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        ''
      ),
      uri,
    }));
    const fullPick = await vscode.window.showQuickPick(allItems, {
      placeHolder: 'Full unused files list — select one to open',
      matchOnDescription: true,
    });
    if (fullPick?.uri) {
      const doc = await vscode.workspace.openTextDocument(fullPick.uri);
      vscode.window.showTextDocument(doc, { preview: false });
    }
  } else if (pick.uri) {
    const doc = await vscode.workspace.openTextDocument(pick.uri);
    vscode.window.showTextDocument(doc, { preview: false });
  }
}
