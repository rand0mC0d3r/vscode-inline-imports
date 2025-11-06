import * as path from 'path';
import * as vscode from 'vscode';
import { getAllSourceFiles } from './scanner';
import { resolveImportAbsolute } from './utils';

/**
 * Find all files that import the given target file
 */
export async function findFileUsages(
  targetFile: vscode.Uri,
  config: vscode.WorkspaceConfiguration
): Promise<vscode.Uri[]> {
  const allFiles = await getAllSourceFiles(config);
  const targetPath = targetFile.fsPath;
  const usages: vscode.Uri[] = [];

  // Import scanner module to access the project
  const { Project, Node, SyntaxKind } = await import('ts-morph');
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      jsx: 1,
      moduleResolution: 2,
    },
    skipFileDependencyResolution: true,
    skipAddingFilesFromTsConfig: true,
  });

  // Check each file to see if it imports the target
  for (const fileUri of allFiles) {
    if (fileUri.fsPath === targetPath) {
      continue; // Skip the target file itself
    }

    try {
      const content = await vscode.workspace.fs.readFile(fileUri);
      const contentStr = Buffer.from(content).toString('utf8');
      
      // Create or get the source file
      const sourceFile = project.getSourceFile(fileUri.fsPath)
        ?? project.createSourceFile(fileUri.fsPath, contentStr, { overwrite: true });

      let importsTarget = false;

      // Check static imports
      for (const decl of sourceFile.getImportDeclarations()) {
        const spec = decl.getModuleSpecifierValue();
        if (spec) {
          const resolved = await resolveImportAbsolute(fileUri.fsPath, spec, config);
          if (resolved === targetPath) {
            importsTarget = true;
            break;
          }
        }
      }

      // Check re-exports
      if (!importsTarget) {
        for (const decl of sourceFile.getExportDeclarations()) {
          const spec = decl.getModuleSpecifierValue();
          if (spec) {
            const resolved = await resolveImportAbsolute(fileUri.fsPath, spec, config);
            if (resolved === targetPath) {
              importsTarget = true;
              break;
            }
          }
        }
      }

      // Check dynamic imports and require calls
      if (!importsTarget) {
        sourceFile.forEachDescendant((n: any) => {
          if (Node.isCallExpression(n)) {
            const expr = n.getExpression();
            const isDynamicImport =
              expr.getKind() === SyntaxKind.ImportKeyword || expr.getText() === 'import';
            const isRequire = expr.getText() === 'require';

            if (isDynamicImport || isRequire) {
              const arg = n.getArguments()[0];
              if (arg && Node.isStringLiteral(arg)) {
                const spec = arg.getLiteralText();
                resolveImportAbsolute(fileUri.fsPath, spec, config).then(resolved => {
                  if (resolved === targetPath) {
                    importsTarget = true;
                  }
                });
              }
            }
          }
        });
      }

      if (importsTarget) {
        usages.push(fileUri);
      }
    } catch (error) {
      // Skip files that can't be read or parsed
      console.warn(`Failed to analyze ${fileUri.fsPath}:`, error);
    }
  }

  return usages.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
}

/**
 * Show file usages in a quick pick menu
 */
export async function showFileUsages(
  targetFile: vscode.Uri,
  config: vscode.WorkspaceConfiguration
) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const relativePath = targetFile.fsPath.replace(workspaceRoot, '');

  // Show progress while finding usages
  const usages = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `🔍 Finding usages of ${path.basename(targetFile.fsPath)}...`,
      cancellable: false,
    },
    async () => {
      return await findFileUsages(targetFile, config);
    }
  );

  if (usages.length === 0) {
    vscode.window.showInformationMessage(
      `📁 No usages found for ${path.basename(targetFile.fsPath)}`
    );
    return;
  }

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
    items.push({
      label: path.basename(uri.fsPath),
      description: uri.fsPath.replace(workspaceRoot, ''),
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
