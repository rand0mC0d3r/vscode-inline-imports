import * as fs from 'fs';
import * as path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import * as vscode from 'vscode';

// Try adding extensions and index fallbacks
async function tryResolve(base: string): Promise<string | null> {
  const exts = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  for (const ext of exts) {
    const full = base.endsWith(ext) ? base : base + ext;
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(full));
      return full;
    } catch { /* keep trying */ }
  }
  console.log(`File not found: ${base} (tried with extensions: ${exts.join(', ')})`);
  return null;
}

// Resolve static and dynamic imports
async function resolveImportAbsolute(fromFsPath: string, spec: string): Promise<string | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {return null;}
  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Load tsconfig.json for baseUrl and paths
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

  for (const [alias, targets] of Object.entries(pathsMap)) {
    const aliasPrefix = alias.replace(/\*$/, '');
    if (spec.startsWith(aliasPrefix)) {
      for (const target of targets) {
        const targetPrefix = target.replace(/\*$/, '');
        const remainder = spec.slice(aliasPrefix.length);
        const candidate = path.resolve(baseUrl, targetPrefix + remainder);
        let resolved = await tryResolve(candidate);
        if (!resolved) {resolved = await tryResolve(path.join(candidate, 'index'));}
        if (resolved) {
          return resolved;
        }
      }
    }
  }

  if (spec.startsWith('@/')) {
    const srcTarget = path.resolve(workspaceRoot, 'src', spec.replace(/^@\//, ''));
    const baseTarget = path.resolve(baseUrl, spec.replace(/^@\//, ''));

    let resolved = await tryResolve(srcTarget);
    if (!resolved) {resolved = await tryResolve(path.join(srcTarget, 'index'));}
    if (resolved) {
      return resolved;
    }

    resolved = await tryResolve(baseTarget);
    if (!resolved) {resolved = await tryResolve(path.join(baseTarget, 'index'));}
    if (resolved) {
      return resolved;
    }
  }

  if (spec.startsWith('@store/')) {
    const aliasTarget = path.resolve(workspaceRoot, 'src', 'store', spec.replace(/^@store\//, ''));
    let resolved = await tryResolve(aliasTarget);
    if (!resolved) {resolved = await tryResolve(path.join(aliasTarget, 'index'));}
    if (resolved) {
      return resolved;
    }
  }

  if (spec.startsWith('@components/')) {
    const aliasTarget = path.resolve(workspaceRoot, 'src', 'components', spec.replace(/^@components\//, ''));
    let resolved = await tryResolve(aliasTarget);
    if (!resolved) {resolved = await tryResolve(path.join(aliasTarget, 'index'));}
    if (resolved) {
      return resolved;
    }
  }

  if (spec.startsWith('@views/')) {
    const aliasTarget = path.resolve(workspaceRoot, 'src', 'views', spec.replace(/^@views\//, ''));
    let resolved = await tryResolve(aliasTarget);
    if (!resolved) {resolved = await tryResolve(path.join(aliasTarget, 'index'));}
    if (resolved) {
      return resolved;
    }
  }

  if (spec.startsWith('@modules/')) {
    const aliasTarget = path.resolve(workspaceRoot, 'src', 'modules', spec.replace(/^@modules\//, ''));
    let resolved = await tryResolve(aliasTarget);
    if (!resolved) {resolved = await tryResolve(path.join(aliasTarget, 'index'));}
    if (resolved) {
      return resolved;
    }
  }

  if (spec.startsWith('.')) {
    const candidate = path.resolve(path.dirname(fromFsPath), spec);
    let resolved = await tryResolve(candidate);
    if (!resolved) {resolved = await tryResolve(path.join(candidate, 'index'));}
    if (resolved) {
      return resolved;
    }
  }

  console.log(`Could not resolve: ${spec}`);
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

      // return if folder
      if (!['.ts', '.tsx', '.js', '.jsx'].some(ext => uri.fsPath.endsWith(ext))) {
        return;
      }
      return {
        badge: `${count || 0}i`,
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
        // Static imports and import type
        const imports = file.getImportDeclarations();
        for (const imp of imports) {
          const spec = imp.getModuleSpecifierValue();
          const resolved = await resolveImportAbsolute(uri.fsPath, spec);
          if (resolved) {referenceMap.set(resolved, (referenceMap.get(resolved) ?? 0) + 1);} else {
            console.log(`Failed to resolve static import: ${spec} in ${uri.fsPath}`);
          }
        }

        // Dynamic imports: import('...')
        const dynamicImports = file.getDescendantsOfKind(SyntaxKind.CallExpression)
          .filter(node => node.getExpression().getText() === 'import');
        for (const dyn of dynamicImports) {
          const arg = dyn.getArguments()[0]?.getText().replace(/['"`]/g, '');
          if (!arg) {continue;}
          const resolved = await resolveImportAbsolute(uri.fsPath, arg);
          if (resolved) {referenceMap.set(resolved, (referenceMap.get(resolved) ?? 0) + 1);} else {
            console.log(`Failed to resolve dynamic import: ${arg} in ${uri.fsPath}`);
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
