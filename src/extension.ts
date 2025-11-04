import * as vscode from 'vscode';
import { createDecorationProvider, scanWorkspace } from './utils';

// ──────────────────────────────────────────────────────────────
// 🚀 Entry points
// ──────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('vs-inline-imports is alive 🧠');

  const emitter = new vscode.EventEmitter<vscode.Uri[]>();
  const referenceMap = new Map<string, number>();

  const provider = createDecorationProvider(referenceMap, emitter);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(provider));

  // initial scan
  scanWorkspace(emitter, referenceMap);

  // rescan on save (debounced)
  let timeout: NodeJS.Timeout;
  vscode.workspace.onDidSaveTextDocument(() => {
    clearTimeout(timeout);
    timeout = setTimeout(() => scanWorkspace(emitter, referenceMap), 1500);
  });
}

export function deactivate() {}
