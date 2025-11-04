import * as fs from 'fs';
import * as path from 'path';
import { Project } from 'ts-morph';
import * as vscode from 'vscode';

/**
 * Try all possible file extensions and index files
 */
async function tryResolve(base: string): Promise<string | null> {
  const exts = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  for (const ext of exts) {
    const full = base.endsWith(ext) ? base : base + ext;
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(full));
      return full;
    } catch { /* ignore */ }
  }
  return null;
}

/**
 * Resolve both relative and alias imports (@/…)
 */
async function resolveImportAbsolute(fromFsPath: string, spec: string): Promise<string | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {return null;}
  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Load tsconfig.json aliases
  let tsconfig: any = null;
  const tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    try { tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8')); }
    catch { /* ignore */ }
  }

  const baseUrl = tsconfig?.compilerOptions?.baseUrl
    ? path.resolve(workspaceRoot, tsconfig.compilerOptions.baseUrl)
    : workspaceRoot;

  const pathsMap: Record<string, string[]> = tsconfig?.compilerOptions?.paths ?? {};

  // Resolve "@/" prefix
  if (spec.startsWith('@/')) {
    const target = path.resolve(baseUrl, spec.replace(/^@\//, ''));
    const resolved = await tryResolve(target);
    if (resolved) {return resolved;}
  }

  // Resolve custom tsconfig paths
  for (const [alias, targets] of Object.entries(pathsMap)) {
    const aliasPrefix = alias.replace(/\*$/, '');
    if (spec.startsWith(aliasPrefix)) {
      for (const target of targets) {
        const targetPrefix = target.replace(/\*$/, '');
        const candidate = path.resolve(baseUrl, spec.replace(aliasPrefix, targetPrefix));
        const resolved = await tryResolve(candidate);
        if (resolved) {return resolved;}
      }
    }
  }

  // Relative imports
  if (spec.startsWith('.')) {
    const candidate = path.resolve(path.dirname(fromFsPath), spec);
    const resolved = await tryResolve(candidate);
    if (resolved) {return resolved;}
  }

  return null;
}

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('vs-inline-imports is alive 🧠');

  const emitter = new vscode.EventEmitter<vscode.Uri[]>();
  const referenceMap = new Map<string, number>();

  const provider: vscode.FileDecorationProvider = {
    onDidChangeFileDecorations: emitter.event,
    provideFileDecoration(uri) {
      const count = referenceMap.get(uri.fsPath);
      if (!count) {return;}
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

    const project = new Project({
      compilerOptions: { allowJs: true, checkJs: false, jsx: 1, moduleResolution: 2 },
      skipFileDependencyResolution: true,
      skipAddingFilesFromTsConfig: true
    });

    const filePatterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
    let files: vscode.Uri[] = [];
    for (const pattern of filePatterns) {
      const found = await vscode.workspace.findFiles('src/' + pattern, '**/node_modules/**');
      files.push(...found);
    }

    console.log(`Found ${files.length} files`);

    for (const uri of files) {
      const file = project.addSourceFileAtPathIfExists(uri.fsPath);
      if (!file) {continue;}

      try {
        for (const imp of file.getImportDeclarations()) {
          const spec = imp.getModuleSpecifierValue();
          const resolved = await resolveImportAbsolute(uri.fsPath, spec);
          console.log(`Import in ${uri.fsPath}: ${spec} -> ${resolved}`);
          if (resolved) {
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
