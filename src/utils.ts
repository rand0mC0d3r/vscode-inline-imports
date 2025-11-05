import * as fs from 'fs';
import * as path from 'path';
import { Project, SourceFile, SyntaxKind } from 'ts-morph';
import * as vscode from 'vscode';
import { ALIASES, BADGES, EXTENSIONS, INPUT_ROOT_FOLDER, SKIPPED_PACKAGES } from './constants';

// ---- helper: resolve candidate file ----
export async function tryResolve(base: string): Promise<string | null> {
  for (const ext of EXTENSIONS) {
    const full = base.endsWith(ext) ? base : base + ext;
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(full));
      return full;
    } catch {}
  }
  return null;
}

// ---- helper: load tsconfig paths ----
function loadTsconfig(workspaceRoot: string) {
  const tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {return null;}
  try {
    return JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  } catch {
    return null;
  }
}

// ---- resolver helpers ----
async function resolveTsconfigAlias(spec: string, baseUrl: string, pathsMap: Record<string, string[]>) {
  for (const [alias, targets] of Object.entries(pathsMap)) {
    const aliasPrefix = alias.replace(/\*$/, '');
    if (!spec.startsWith(aliasPrefix)) {continue;}

    for (const target of targets) {
      const targetPrefix = target.replace(/\*$/, '');
      const remainder = spec.slice(aliasPrefix.length);
      const candidate = path.resolve(baseUrl, targetPrefix + remainder);
      const resolved = await tryResolve(candidate) || await tryResolve(path.join(candidate, 'index'));
      if (resolved) {return resolved;}
    }
  }
  return null;
}

async function resolveAliasMap(spec: string, workspaceRoot: string) {
  for (const [prefix, folder] of Object.entries(ALIASES)) {
    if (!spec.startsWith(prefix)) {continue;}
    const aliasTarget = path.resolve(workspaceRoot, 'src', folder, spec.replace(new RegExp(`^${prefix}`), ''));
    const resolved = await tryResolve(aliasTarget) || await tryResolve(path.join(aliasTarget, 'index'));
    if (resolved) {return resolved;}
  }
  return null;
}

async function resolveAtAlias(spec: string, workspaceRoot: string, baseUrl: string) {
  const targets = [
    path.resolve(workspaceRoot, 'src', spec.replace(/^@\//, '')),
    path.resolve(baseUrl, spec.replace(/^@\//, ''))
  ];
  for (const t of targets) {
    const resolved = await tryResolve(t) || await tryResolve(path.join(t, 'index'));
    if (resolved) {return resolved;}
  }
  return null;
}

async function resolveRelative(spec: string, fromFsPath: string) {
  if (!spec.startsWith('.')) {return null;}
  const candidate = path.resolve(path.dirname(fromFsPath), spec);
  return (await tryResolve(candidate)) || (await tryResolve(path.join(candidate, 'index')));
}

// ---- main resolver ----
export async function resolveImportAbsolute(fromFsPath: string, spec: string): Promise<string | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {return null;}

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const tsconfig = loadTsconfig(workspaceRoot);
  const baseUrl = tsconfig?.compilerOptions?.baseUrl
    ? path.resolve(workspaceRoot, tsconfig.compilerOptions.baseUrl)
    : workspaceRoot;

  const pathsMap = tsconfig?.compilerOptions?.paths ?? {};

  if(SKIPPED_PACKAGES.includes(spec)) {
    return null;
  }

  return (
    await resolveTsconfigAlias(spec, baseUrl, pathsMap) ||
    await resolveAtAlias(spec, workspaceRoot, baseUrl) ||
    await resolveAliasMap(spec, workspaceRoot) ||
    await resolveRelative(spec, fromFsPath) ||
    (console.warn(`⚠️ Could not resolve import: ${spec} ${baseUrl} ${pathsMap} ${workspaceRoot} ${fromFsPath}`), null)
  );
}

async function getAllSourceFiles(): Promise<vscode.Uri[]> {
  const t0 = performance.now();
  const uris = await vscode.workspace.findFiles(`${INPUT_ROOT_FOLDER}**/*.{ts,tsx,js,jsx}`, '**/node_modules/**');
  const t1 = performance.now();
  console.log(`⏱️ Found ${uris.length} source files in ${(t1 - t0).toFixed(2)} ms`);
  return uris;
}

async function analyzeFile(file: SourceFile, referenceMap: Map<string, number>) {

  const record = (resolved: string | null, type: string, spec: string) => {
    if (resolved) {
      referenceMap.set(resolved, (referenceMap.get(resolved) ?? 0) + 1);
      // console.log(`✅ ${type}: ${spec} -> ${resolved.split('/src').pop()}`);
    } else {
      console.log(`❌ ${type} failed: ${spec}`);
    }
  };

  // Static imports
  for (const imp of file.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();

    if(SKIPPED_PACKAGES.includes(spec)) {
      continue;
    }

    record(await resolveImportAbsolute(file.getFilePath(), spec), 'static import', spec);
  }

  // Dynamic imports
  const dynamicImports = file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(n => n.getExpression().getText() === 'import');

  for (const dyn of dynamicImports) {
    const arg = dyn.getArguments()[0]?.getText().replace(/['"`]/g, '');

    if(SKIPPED_PACKAGES.includes(arg)) {
      continue;
    }

    if (arg) {record(await resolveImportAbsolute(file.getFilePath(), arg), 'dynamic import', arg);}
  }
}

export async function scanWorkspace(emitter: vscode.EventEmitter<vscode.Uri[]>, referenceMap: Map<string, number>) {
  console.log('🔍 Scanning workspace for imports...');
  referenceMap.clear();

  const project = new Project({
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      jsx: 1,
      moduleResolution: 2
   },
    skipFileDependencyResolution: true,
    skipAddingFilesFromTsConfig: true,
  });

  const uris = await getAllSourceFiles();
  const files = uris.map(uri => project.addSourceFileAtPathIfExists(uri.fsPath)).filter(Boolean) as SourceFile[];
  const batchSize = 20;
  const total = files.length;

  // const t0 = performance.now();
  // for (const uri of files) {
  //   try {
  //     await analyzeFile(uri, project, referenceMap);
  //   } catch (err) {
  //     console.error('💥 Error scanning file', uri.fsPath, err);
  //   }
  // }

  // const t1 = performance.now();
  // console.log(`⏱️ Scanned ${files.length} files in ${(t1 - t0).toFixed(2)} ms`);
  // console.log('🎉 Scan complete! All imports mapped.');

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: '🔍 Scanning workspace for imports...',
      cancellable: false,
    },
    async (progress) => {
      const start = performance.now();
      let processed = 0;

      for (let i = 0; i < total; i += batchSize) {
        const batch = files.slice(i, i + batchSize);

        await Promise.all(
          batch.map(f => analyzeFile(f, referenceMap).catch(err =>
            console.error(`💥 Error scanning file: ${f.getFilePath()}`, err)
          ))
        );

        processed += batch.length;
        const percent = Math.min((processed / total) * 100, 100);
        progress.report({
          increment: (batch.length / total) * 100,
          message: `📂 ${processed}/${total} files (${percent.toFixed(1)}%)`,
        });
      }

      const duration = (performance.now() - start).toFixed(1);
      vscode.window.showInformationMessage(`🎉 Scan complete! ${total} files analyzed in ${duration} ms`);
    }
  );

  emitter.fire([...referenceMap.keys()].map(f => vscode.Uri.file(f)));
}

export function createDecorationProvider(referenceMap: Map<string, number>, emitter: vscode.EventEmitter<vscode.Uri[]>) {
  const validExt = ['.ts', '.tsx', '.js', '.jsx'];

  const provider: vscode.FileDecorationProvider = {
    onDidChangeFileDecorations: emitter.event,
    provideFileDecoration(uri) {
      if (referenceMap.size === 0 || !validExt.some(ext => uri.fsPath.endsWith(ext))) {return;}

      // if outside /src/, skip
      if (!uri.fsPath.includes(path.sep + 'src' + path.sep)) {return;}

      const count = referenceMap.get(uri.fsPath);

      if (!!count) {
        const badge = BADGES[count as keyof typeof BADGES] || `${count}👀`;
        const tooltip = `${count} files import this module`;
        return {
          badge,
          tooltip,
          color: undefined,
        };
      }

      return {
        badge: '🗑️',
        tooltip: 'No files import this module',
        color: new vscode.ThemeColor('charts.red'),
      };
    },
  };

  return provider;
}
