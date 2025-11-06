import * as path from 'path';
import * as vscode from 'vscode';
import { BADGES } from './constants';

export function createDecorationProvider(
  referenceMap: Map<string, number>,
  emitter: vscode.EventEmitter<vscode.Uri[]>,
  config: vscode.WorkspaceConfiguration
): vscode.FileDecorationProvider {
  return {
    onDidChangeFileDecorations: emitter.event,
    provideFileDecoration(uri) {
      const file = uri.fsPath;
      if (
        referenceMap.size === 0 ||
        !config.fileExtensions.some((ext: string) => file.endsWith(ext)) ||
        !file.includes(`${path.sep}src${path.sep}`)
      ) {return;}

      const count = referenceMap.get(file);
      const hasRefs = !!count;

      return {
        badge: hasRefs
          ? BADGES[count as keyof typeof BADGES] || `${count}👀`
          : config.deleteIcon,
        tooltip: hasRefs
          ? `${count} files import this module`
          : 'No files import this module',
        color: hasRefs ? undefined : new vscode.ThemeColor('charts.red'),
      };
    },
  };
}
