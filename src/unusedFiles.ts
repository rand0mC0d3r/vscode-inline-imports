import * as path from 'path';
import * as vscode from 'vscode';
import { getAllSourceFiles } from './scanner';

// 📦 Helper to get list of unused files
export async function getUnusedFiles(
  referenceMap: Map<string, number>,
  config: vscode.WorkspaceConfiguration
): Promise<vscode.Uri[]> {
  const allFiles = await getAllSourceFiles(config);

  return allFiles
    .filter(uri => {
      if (!uri.fsPath.includes(path.sep + 'src' + path.sep)) {return false;}
      if (!config.fileExtensions.some((ext: string) => uri.fsPath.endsWith(ext))) {return false;}
      return referenceMap.get(uri.fsPath) === 0;
    })
    .sort((a, b) => a.fsPath.localeCompare(b.fsPath));
}

// --- Unused file listing unchanged ---
export async function showUnusedFiles(
  referenceMap: Map<string, number>,
  config: vscode.WorkspaceConfiguration
) {
  const unused = await getUnusedFiles(referenceMap, config);

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

// 🗑️ Delete all unused files with confirmation
export async function deleteAllUnusedFiles(
  referenceMap: Map<string, number>,
  config: vscode.WorkspaceConfiguration
) {
  const unused = await getUnusedFiles(referenceMap, config);

  if (unused.length === 0) {
    vscode.window.showInformationMessage('🎉 No unused files to delete!');
    return;
  }

  console.log(`🗑️ Found ${unused.length} unused files for deletion`);

  // Show confirmation dialog
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const fileList = unused
    .slice(0, 10)
    .map(uri => '  • ' + uri.fsPath.replace(workspaceFolder, ''))
    .join('\n');
  
  const moreFiles = unused.length > 10 ? `\n  ...and ${unused.length - 10} more files` : '';
  
  const confirmMessage = `Are you sure you want to delete ${unused.length} unused file${unused.length === 1 ? '' : 's'}?\n\n${fileList}${moreFiles}\n\nThis action cannot be undone.`;

  const choice = await vscode.window.showWarningMessage(
    confirmMessage,
    { modal: true },
    'Delete All',
    'Cancel'
  );

  if (choice !== 'Delete All') {
    vscode.window.showInformationMessage('🚫 Deletion cancelled');
    return;
  }

  // Delete files with progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: '🗑️ Deleting unused files...',
      cancellable: false,
    },
    async progress => {
      let deleted = 0;
      let failed = 0;

      for (const uri of unused) {
        try {
          await vscode.workspace.fs.delete(uri, { useTrash: true });
          deleted++;
          console.log(`✅ Deleted: ${uri.fsPath}`);
        } catch (error) {
          failed++;
          console.error(`❌ Failed to delete: ${uri.fsPath}`, error);
        }

        progress.report({
          increment: (1 / unused.length) * 100,
          message: `${deleted}/${unused.length} files deleted`,
        });
      }

      if (failed > 0) {
        vscode.window.showWarningMessage(
          `⚠️ Deleted ${deleted} file${deleted === 1 ? '' : 's'}, but ${failed} file${failed === 1 ? '' : 's'} failed to delete.`
        );
      } else {
        vscode.window.showInformationMessage(
          `✅ Successfully deleted ${deleted} unused file${deleted === 1 ? '' : 's'}!`
        );
      }
    }
  );
}
