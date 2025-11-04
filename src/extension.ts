import { Project, SyntaxKind } from 'ts-morph';
import * as vscode from 'vscode';
import { resolveImportAbsolute } from './utils';

const inputFilePatterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
const inputRootFolder = 'src/';


export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('vs-inline-imports is alive 🧠');

  const emitter = new vscode.EventEmitter<vscode.Uri[]>();
  const referenceMap = new Map<string, number>();

  const provider: vscode.FileDecorationProvider = {
    onDidChangeFileDecorations: emitter.event,
    provideFileDecoration(uri) {
      const count = referenceMap.get(uri.fsPath);

      if (referenceMap.size === 0) {
        return;
      }

      if (!['.ts', '.tsx', '.js', '.jsx'].some(ext => uri.fsPath.endsWith(ext))) {
        return;
      }

      return {
        badge: !!count ?  `${count || 0}👀` : '🗑️',
        tooltip: `${count} ${uri.fsPath} imports reference this file`,
        color: !!count ? undefined : new vscode.ThemeColor('charts.red')
      };
    }
  };

  context.subscriptions.push(vscode.window.registerFileDecorationProvider(provider));

  async function scanWorkspace() {
    console.log('🔍 Scanning workspace for imports...');
    referenceMap.clear();

    const project = new Project({
      compilerOptions: { allowJs: true, checkJs: false, jsx: 1, moduleResolution: 2 },
      skipFileDependencyResolution: true,
      skipAddingFilesFromTsConfig: true
    });

    let files: vscode.Uri[] = [];
    for (const pattern of inputFilePatterns) {
      const found = await vscode.workspace.findFiles(inputRootFolder + pattern, '**/node_modules/**');
      files.push(...found);
    }

    console.log(`📂 Found ${files.length} files! Ready to sniff imports... 🕵️‍♂️`);

    for (const uri of files) {
      const file = project.addSourceFileAtPathIfExists(uri.fsPath);
      if (!file) {continue;}

      try {
        // Static imports and import type
        const imports = file.getImportDeclarations();
        for (const imp of imports) {
          const spec = imp.getModuleSpecifierValue();
          const resolved = await resolveImportAbsolute(uri.fsPath, spec);
          if (resolved) {
            console.log(`   ✅ Static import: ${spec} -> ${resolved} in ${uri.fsPath}`);
            referenceMap.set(resolved, (referenceMap.get(resolved) ?? 0) + 1);
          } else {
            console.log(`   ❌ Failed static import: ${spec} in ${uri.fsPath}`);
          }
        }

        // Dynamic imports: import('...')
        const dynamicImports = file.getDescendantsOfKind(SyntaxKind.CallExpression)
          .filter(node => node.getExpression().getText() === 'import');
        for (const dyn of dynamicImports) {
          const arg = dyn.getArguments()[0]?.getText().replace(/['"`]/g, '');
          if (!arg) {continue;}
          const resolved = await resolveImportAbsolute(uri.fsPath, arg);
          if (resolved) {
            console.log(`   ⚡ Dynamic import: ${arg} -> ${resolved} in ${uri.fsPath}`);
            referenceMap.set(resolved, (referenceMap.get(resolved) ?? 0) + 1);
          } else {
            console.log(`   ❌ Failed dynamic import: ${arg} in ${uri.fsPath}`);
          }
        }
      } catch (err) {
        console.error('Error scanning file', uri.fsPath, err);
      }
    }

    console.log('🎉 Scan complete! All imports mapped. 🚀');
    emitter.fire([...referenceMap.keys()].map(f => vscode.Uri.file(f)));
  }

  // Initial scan
  scanWorkspace();

  // Rescan on save (debounced)
  let scanTimeout: NodeJS.Timeout | undefined;
  vscode.workspace.onDidSaveTextDocument(() => {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanWorkspace, 1500);
  });
}

export function deactivate() {}
