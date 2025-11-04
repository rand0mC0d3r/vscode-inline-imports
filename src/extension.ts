import { Project } from 'ts-morph';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('vs-inline-imports.helloWorld', () => {
		vscode.window.showInformationMessage('Hello Wosdsdsdsrld from vs-inline-imports!');
	});

	context.subscriptions.push(disposable);

  const emitter = new vscode.EventEmitter<vscode.Uri[]>();
  const referenceMap = new Map<string, number>();

  const provider: vscode.FileDecorationProvider = {
    onDidChangeFileDecorations: emitter.event,
    provideFileDecoration(uri) {
      const count = referenceMap.get(uri.fsPath);
      console.log(`Providing decoration for ${uri.fsPath}: ${count}`);
      if (!count) {return;}
      return {
        badge: String(count),
        tooltip: `${count} references in project`,
        color: new vscode.ThemeColor('charts.blue')
      };
    }
  };

  context.subscriptions.push(vscode.window.registerFileDecorationProvider(provider));

  async function scanWorkspace() {
    referenceMap.clear();
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    project.addSourceFilesAtPaths('src/**/*.{js,jsx,ts,tsx}');
    const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx}');
    files.forEach(uri => project.addSourceFileAtPathIfExists(uri.fsPath));

    for (const file of project.getSourceFiles()) {
      try {
        for (const imp of file.getImportDeclarations()) {
          const spec = imp.getModuleSpecifierValue();
          const resolved = imp.getModuleSpecifierSourceFile();
          console.log(`  Import: ${spec} = ${resolved} -> ${resolved ? resolved.getFilePath() : 'unresolved'}`);
          if (resolved) {
            const path = resolved.getFilePath();
            referenceMap.set(path, (referenceMap.get(path) ?? 0) + 1);
          }
        }
      } catch (error) {
        console.error(`Error scanning imports in ${file.getFilePath()}:`, error);
      }
    }

    emitter.fire([...referenceMap.keys()].map(f => vscode.Uri.file(f)));
  }

  console.log('Scanning workspace for imports...');

  scanWorkspace();

  vscode.workspace.onDidSaveTextDocument(() => {
    // Debounce a bit in production; here we rescan on every save
    scanWorkspace();
  });
}

export function deactivate() {}
