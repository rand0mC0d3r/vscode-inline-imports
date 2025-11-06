import * as vscode from 'vscode';
import { PACKAGE_JSON_NAME, PACKAGE_NAME } from './constants';
import { createDecorationProvider } from './decorator';
import { createActionsMenu, createStatusBarItem } from './interfaceElements';
import { scanWorkspace } from './scanner';

export async function activate(context: vscode.ExtensionContext) {
  const emitter = new vscode.EventEmitter<vscode.Uri[]>();
  const referenceMap = new Map<string, number>();
  let config = vscode.workspace.getConfiguration(PACKAGE_NAME);

  // 🧠 Status bar and actions
  const status = createStatusBarItem(context);
  createActionsMenu(vscode, context, emitter, referenceMap, config, status);

  // 🎨 Decorations
  const provider = createDecorationProvider(referenceMap, emitter, config);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(provider));

  // ⚡ Unified debounced re-scan function
  let scanTimeout: NodeJS.Timeout | undefined;
  const triggerScan = (reason: string) => {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(async () => {
      console.log(`🔁 Re-scan triggered (${reason})`);
      await scanWorkspace(emitter, referenceMap, config, status);
    }, 800);
  };

  // 🏁 Initial scan (slightly deferred to not block VS startup)
  setTimeout(() => triggerScan('initial startup'), 500);

  // 📝 Re-scan on file save or create/delete
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => triggerScan('file save')),
    vscode.workspace.onDidCreateFiles(() => triggerScan('file create')),
    vscode.workspace.onDidDeleteFiles(() => triggerScan('file delete'))
  );

  // ⚙️ Config change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(PACKAGE_NAME)) {
        vscode.window.showInformationMessage('⚙️ Import Scanner settings updated.');
        config = vscode.workspace.getConfiguration(PACKAGE_NAME);
        triggerScan('config change');
      }
    })
  );

  // 🔁 Manual re-index command
  context.subscriptions.push(
    vscode.commands.registerCommand(`${PACKAGE_JSON_NAME}.reIndex`, () => triggerScan('manual command'))
  );
}

export function deactivate() {}
