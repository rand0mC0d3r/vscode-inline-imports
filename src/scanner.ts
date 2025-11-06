import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Project, SourceFile, SyntaxKind } from 'ts-morph';
import * as vscode from 'vscode';
import { updateStatusBar } from './interfaceElements';
import { resolveImportAbsolute } from './utils';

// 🧠 persistent caches
const fileHashCache = new Map<string, string>();
const resolveCache = new Map<string, string | null>();
let project: Project | null = null;
let previousReferenceMap = new Map<string, number>();

function getProject(): Project {
  if (!project) {
    project = new Project({
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        jsx: 1,
        moduleResolution: 2,
      },
      skipFileDependencyResolution: true,
      skipAddingFilesFromTsConfig: true,
    });
  }
  return project;
}

async function getFileHash(uri: vscode.Uri): Promise<string> {
  try {
    const data = await fs.readFile(uri.fsPath);
    return createHash('md5').update(data).digest('hex');
  } catch {
    return '';
  }
}

async function analyzeFileCached(
  file: SourceFile,
  referenceMap: Map<string, number>,
  config: vscode.WorkspaceConfiguration
) {
  const record = (resolved: string | null) => {
    if (resolved) {
      referenceMap.set(resolved, (referenceMap.get(resolved) ?? 0) + 1);
    }
  };

  for (const imp of file.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (!spec || spec.startsWith('http')) {continue;}

    const key = `${path.dirname(file.getFilePath())}::${spec}`;
    if (resolveCache.has(key)) {
      record(resolveCache.get(key)!);
      continue;
    }

    const resolved = await resolveImportAbsolute(file.getFilePath(), spec, config);
    resolveCache.set(key, resolved);
    record(resolved);
  }

  const dynamicImports = file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(n => n.getExpression().getText() === 'import');

  for (const dyn of dynamicImports) {
    const arg = dyn.getArguments()[0]?.getText().replace(/['"`]/g, '');
    if (!arg) {continue;}

    const key = `${path.dirname(file.getFilePath())}::${arg}`;
    if (resolveCache.has(key)) {
      record(resolveCache.get(key)!);
      continue;
    }

    const resolved = await resolveImportAbsolute(file.getFilePath(), arg, config);
    resolveCache.set(key, resolved);
    record(resolved);
  }
}

export async function smartScanWorkspace(
  emitter: vscode.EventEmitter<vscode.Uri[]>,
  referenceMap: Map<string, number>,
  config: vscode.WorkspaceConfiguration,
  status: vscode.StatusBarItem
) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {return;}

  const proj = getProject();
  const uris = await vscode.workspace.findFiles(`${config.sourceFolder}/**/*.{ts,tsx,js,jsx}`, '**/node_modules/**');
  const total = uris.length;
  const changedUris: vscode.Uri[] = [];

  status.text = "$(sync~spin) Scanning...";
  status.tooltip = "Indexing changed files...";

  const start = performance.now();

  for (const uri of uris) {
    const hash = await getFileHash(uri);
    if (fileHashCache.get(uri.fsPath) === hash) {continue;} // unchanged
    fileHashCache.set(uri.fsPath, hash);
    changedUris.push(uri);
  }

  // ⚡ only parse changed files
  const changedFiles = changedUris.map(uri => {
    const f = proj.getSourceFile(uri.fsPath) || proj.addSourceFileAtPath(uri.fsPath);
    f.refreshFromFileSystemSync();
    return f;
  });

  console.log(`📁 ${changedFiles.length}/${total} files changed, re-analyzing...`);

  referenceMap.clear();

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: "🔍 Updating import index..." },
    async progress => {
      let processed = 0;
      for (const file of changedFiles) {
        await analyzeFileCached(file, referenceMap, config);
        processed++;
        progress.report({ increment: (processed / changedFiles.length) * 100 });
      }
    }
  );

  // 🧮 compute diff for decoration updates
  const changedDecorations: vscode.Uri[] = [];
  for (const [pathKey, count] of referenceMap) {
    if (previousReferenceMap.get(pathKey) !== count) {
      changedDecorations.push(vscode.Uri.file(pathKey));
    }
  }
  previousReferenceMap = new Map(referenceMap);

  emitter.fire(changedDecorations);
  updateStatusBar(referenceMap, status, total);

  const duration = (performance.now() - start).toFixed(0);
  console.log(`✅ Scan complete in ${duration}ms — ${changedFiles.length} updated.`);
  status.text = "$(check) Imports up to date";
  status.tooltip = `Scanned ${changedFiles.length} changed files in ${duration} ms`;
}
