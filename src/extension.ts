import * as vscode from 'vscode';
import { createDecorationProvider, scanWorkspace } from './utils';

export function activate(context: vscode.ExtensionContext) {
  const emitter = new vscode.EventEmitter<vscode.Uri[]>();
  const referenceMap = new Map<string, number>();

  const provider = createDecorationProvider(referenceMap, emitter);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(provider));

  scanWorkspace(emitter, referenceMap);

  let timeout: NodeJS.Timeout;
  vscode.workspace.onDidSaveTextDocument(() => {
    clearTimeout(timeout);
    timeout = setTimeout(() => scanWorkspace(emitter, referenceMap), 1500);
  });

  const reIndexCommand = vscode.commands.registerCommand('vs-inline-imports.reIndex', () => {
    scanWorkspace(emitter, referenceMap);
  });

  context.subscriptions.push(reIndexCommand);
}

export function deactivate() {}
