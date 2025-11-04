import { Project } from 'ts-morph';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('vs-inline-imports is alive 🧠');

  const emitter = new vscode.EventEmitter<vscode.Uri[]>();
  const referenceMap = new Map<string, number>();

  const provider: vscode.FileDecorationProvider = {
    onDidChangeFileDecorations: emitter.event,
    provideFileDecoration(uri) {
      const count = referenceMap.get(uri.fsPath);
      // if (!count) {return;}
      return {
        badge: 'dd',
        // tooltip: `${count} imports reference this file`,
        // color: new vscode.ThemeColor('charts.blue')
      };
    }
  };

  context.subscriptions.push(vscode.window.registerFileDecorationProvider(provider));

  async function scanWorkspace() {
    console.log('🔍 Scanning workspace for imports...');
    referenceMap.clear();

    // Create a lightweight project; don't resolve node_modules
    const project = new Project({
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        jsx: 1, // React JSX
        moduleResolution: 2 // Node
      },
      skipFileDependencyResolution: true,
      skipAddingFilesFromTsConfig: true
    });

    // Find files (you can limit to "src" if you want)
    const files = await vscode.workspace.findFiles('**/*.ts', '**/node_modules/**');
    const jsxFiles = await vscode.workspace.findFiles('**/*.tsx', '**/node_modules/**');
    files.push(...jsxFiles);

    console.log(`Found ${files.length} files`);

    // Only process a few at once to avoid overloading
    for (const uri of files) {
      const file = project.addSourceFileAtPathIfExists(uri.fsPath);
      if (!file) {continue;}

      for (const imp of file.getImportDeclarations()) {
        const spec = imp.getModuleSpecifierValue();
        if (!spec.startsWith('.')) {continue;} // skip external imports
        const dir = vscode.Uri.file(uri.fsPath).with({ path: uri.fsPath.replace(/[^/]+$/, '') });
        const target = vscode.Uri.joinPath(dir, spec + (spec.endsWith('.js') ? '' : '.js'));
        const path = target.fsPath;
        console.log(`Found import from ${uri.fsPath} to ${path}`);
        referenceMap.set(path, (referenceMap.get(path) ?? 0) + 1);
      }
    }

    console.log('✅ Scan complete.');
    emitter.fire([...referenceMap.keys()].map(f => vscode.Uri.file(f)));
  }

  // Kick off the first scan
  scanWorkspace();

  // Re-scan on save, but throttle
  let scanTimeout: NodeJS.Timeout | undefined;
  vscode.workspace.onDidSaveTextDocument(() => {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanWorkspace, 1500);
  });
}

export function deactivate() {}
