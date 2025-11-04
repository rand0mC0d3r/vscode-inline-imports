import { Project, SyntaxKind } from 'ts-morph';
import * as vscode from 'vscode';
import { INPUT_FILE_PATTERNS, INPUT_ROOT_FOLDER } from './constants';
import { resolveImportAbsolute } from './utils';

// ──────────────────────────────────────────────────────────────
// 🧩 Helpers
// ──────────────────────────────────────────────────────────────

async function getAllSourceFiles(): Promise<vscode.Uri[]> {
  const files: vscode.Uri[] = [];
  for (const pattern of INPUT_FILE_PATTERNS) {
    const found = await vscode.workspace.findFiles(
      INPUT_ROOT_FOLDER + pattern,
      '**/node_modules/**'
    );
    files.push(...found);
  }
  return files;
}

async function analyzeFile(uri: vscode.Uri, project: Project, referenceMap: Map<string, number>) {
  const file = project.addSourceFileAtPathIfExists(uri.fsPath);
  if (!file) {return;}

  const record = (resolved: string | null, type: string, spec: string) => {
    if (resolved) {
      referenceMap.set(resolved, (referenceMap.get(resolved) ?? 0) + 1);
      console.log(`✅ ${type}: ${spec} -> ${resolved}`);
    } else {
      console.log(`❌ ${type} failed: ${spec}`);
    }
  };

  // Static imports
  for (const imp of file.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    record(await resolveImportAbsolute(uri.fsPath, spec), 'static import', spec);
  }

  // Dynamic imports
  const dynamicImports = file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(n => n.getExpression().getText() === 'import');

  for (const dyn of dynamicImports) {
    const arg = dyn.getArguments()[0]?.getText().replace(/['"`]/g, '');
    if (arg) {record(await resolveImportAbsolute(uri.fsPath, arg), 'dynamic import', arg);}
  }
}

async function scanWorkspace(emitter: vscode.EventEmitter<vscode.Uri[]>, referenceMap: Map<string, number>) {
  console.log('🔍 Scanning workspace for imports...');
  referenceMap.clear();

  const project = new Project({
    compilerOptions: { allowJs: true, checkJs: false, jsx: 1, moduleResolution: 2 },
    skipFileDependencyResolution: true,
    skipAddingFilesFromTsConfig: true,
  });

  const files = await getAllSourceFiles();
  console.log(`📂 Found ${files.length} files. Starting import sniff...`);

  for (const uri of files) {
    try {
      await analyzeFile(uri, project, referenceMap);
    } catch (err) {
      console.error('💥 Error scanning file', uri.fsPath, err);
    }
  }

  console.log('🎉 Scan complete! All imports mapped.');
  emitter.fire([...referenceMap.keys()].map(f => vscode.Uri.file(f)));
}

function createDecorationProvider(referenceMap: Map<string, number>, emitter: vscode.EventEmitter<vscode.Uri[]>) {
  const validExt = ['.ts', '.tsx', '.js', '.jsx'];

  const provider: vscode.FileDecorationProvider = {
    onDidChangeFileDecorations: emitter.event,
    provideFileDecoration(uri) {
      if (referenceMap.size === 0 || !validExt.some(ext => uri.fsPath.endsWith(ext))) {return;}
      const count = referenceMap.get(uri.fsPath);
      return {
        badge: count ? `${count}👀` : '🗑️',
        tooltip: `${count ?? 0} files import this module`,
        color: count ? undefined : new vscode.ThemeColor('charts.red'),
      };
    },
  };

  return provider;
}

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
