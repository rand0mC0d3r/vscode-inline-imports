import * as vscode from 'vscode';
import { createDecorationProvider, scanWorkspace } from './utils';

export function activate(context: vscode.ExtensionContext) {
  const emitter = new vscode.EventEmitter<vscode.Uri[]>();
  const referenceMap = new Map<string, number>();
  const config = vscode.workspace.getConfiguration('importScanner');

  const provider = createDecorationProvider(referenceMap, emitter, config);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(provider));

  scanWorkspace(emitter, referenceMap, config);

  let timeout: NodeJS.Timeout;
  vscode.workspace.onDidSaveTextDocument(() => {
    clearTimeout(timeout);
    timeout = setTimeout(() => scanWorkspace(emitter, referenceMap, config), 1500);
  });

  const reIndexCommand = vscode.commands.registerCommand('vs-inline-imports.reIndex', () => {
    scanWorkspace(emitter, referenceMap, config);
  });

  context.subscriptions.push(reIndexCommand);

  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('importScanner')) {
      vscode.window.showInformationMessage('⚙️ Import Scanner settings updated.');

      const newConfig = vscode.workspace.getConfiguration('importScanner');

      const newProvider = createDecorationProvider(referenceMap, emitter, newConfig);
      context.subscriptions.push(vscode.window.registerFileDecorationProvider(newProvider));

      scanWorkspace(emitter, referenceMap, newConfig);
    }
  });
}

export function deactivate() {}
