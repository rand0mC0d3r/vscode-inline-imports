import * as path from 'path';
import { Project } from 'ts-morph';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('vs-inline-imports is alive 🧠');

  const emitter = new vscode.EventEmitter<vscode.Uri[]>();
  const referenceMap = new Map<string, number>();

  // helper to check file existence
  async function fileExists(fsPath: string) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(fsPath));
      return true;
    } catch {
      return false;
    }
  }

  async function resolveImportAbsolute(fromFsPath: string, spec: string) {
    // only handle relative imports
    if (!spec.startsWith('.')) {return null;}

    const baseDir = path.dirname(fromFsPath);
    const candidateBase = path.resolve(baseDir, spec);

    const candidates = [
      candidateBase,
      `${candidateBase}.ts`,
      `${candidateBase}.tsx`,
      `${candidateBase}.js`,
      `${candidateBase}.jsx`,
      path.join(candidateBase, 'index.ts'),
      path.join(candidateBase, 'index.tsx'),
      path.join(candidateBase, 'index.js'),
      path.join(candidateBase, 'index.jsx'),
    ];

    for (const c of candidates) {
      if (await fileExists(c)) {return c;}
    }
    return null;
  }

  const provider: vscode.FileDecorationProvider = {
    onDidChangeFileDecorations: emitter.event,
    provideFileDecoration(uri) {
      const count = referenceMap.get(uri.fsPath);
      if (!count) {return;} // only show badge when we actually have a number
      return {
        badge: String(count),
        tooltip: `${count} imports reference this file`,
        color: new vscode.ThemeColor('charts.blue')
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

    // pick the file globs you want
    const tsFiles = await vscode.workspace.findFiles('**/*.ts', '**/node_modules/**');
    const tsxFiles = await vscode.workspace.findFiles('**/*.tsx', '**/node_modules/**');
    const jsFiles = await vscode.workspace.findFiles('**/*.js', '**/node_modules/**');
    const jsxFiles = await vscode.workspace.findFiles('**/*.jsx', '**/node_modules/**');

    const files = [...tsFiles, ...tsxFiles, ...jsFiles, ...jsxFiles];
    console.log(`Found ${files.length} files`);

    for (const uri of files) {
      // lightweight add - still benefits from ts-morph parsing imports
      const file = project.addSourceFileAtPathIfExists(uri.fsPath);
      if (!file) {continue;}
      try {
        for (const imp of file.getImportDeclarations()) {
          const spec = imp.getModuleSpecifierValue();
          if (!spec.startsWith('.')) {continue;} // skip externals
          const resolved = await resolveImportAbsolute(uri.fsPath, spec);
          if (resolved) {
            console.log(`  ${uri.fsPath} -> ${resolved}`);
            referenceMap.set(resolved, (referenceMap.get(resolved) ?? 0) + 1);
          }
        }
      } catch (err) {
        console.error('Error scanning file', uri.fsPath, err);
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
