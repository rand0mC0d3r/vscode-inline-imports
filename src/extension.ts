import * as vscode from 'vscode';
import { PACKAGE_JSON_NAME, PACKAGE_NAME } from './constants';
import { createDecorationProvider, scanWorkspace } from './utils';

export function activate(context: vscode.ExtensionContext) {
  const emitter = new vscode.EventEmitter<vscode.Uri[]>();
  const referenceMap = new Map<string, number>();
  const config = vscode.workspace.getConfiguration(PACKAGE_NAME);

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.text = "📦 Imports: 0 used / 0 unused";
  status.tooltip = "Click to rescan project imports 🔄";
  status.command = `${PACKAGE_JSON_NAME}.reIndex`;
  status.show();
  context.subscriptions.push(status);

  const provider = createDecorationProvider(referenceMap, emitter, config);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(provider));

  scanWorkspace(emitter, referenceMap, config, status);

  let timeout: NodeJS.Timeout;
  vscode.workspace.onDidSaveTextDocument(() => {
    clearTimeout(timeout);
    timeout = setTimeout(() => scanWorkspace(emitter, referenceMap, config, status), 1500);
  });

  const reIndexCommand = vscode.commands.registerCommand(`${PACKAGE_JSON_NAME}.reIndex`, () => {
    scanWorkspace(emitter, referenceMap, config, status);
  });

  context.subscriptions.push(reIndexCommand);

  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration(PACKAGE_NAME)) {
      vscode.window.showInformationMessage('⚙️ Import Scanner settings updated.');

      const newConfig = vscode.workspace.getConfiguration(PACKAGE_NAME);

      const newProvider = createDecorationProvider(referenceMap, emitter, newConfig);
      context.subscriptions.push(vscode.window.registerFileDecorationProvider(newProvider));

      scanWorkspace(emitter, referenceMap, newConfig, status);
    }
  });


}

export function deactivate() {}
