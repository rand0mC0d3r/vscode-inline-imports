import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Project, SourceFile, SyntaxKind } from 'ts-morph';
import * as vscode from 'vscode';
import { SKIPPED_PACKAGES } from './constants';
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
        await analyzeFile(file, referenceMap, config);
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









export async function getAllSourceFiles(config: vscode.WorkspaceConfiguration): Promise<vscode.Uri[]> {
  const t0 = performance.now();
  const uris = await vscode.workspace.findFiles(`${config.sourceFolder}/**/*.{ts,tsx,js,jsx}`, '**/node_modules/**');
  const t1 = performance.now();
  console.log(`⏱️ Found ${uris.length} source files in ${(t1 - t0).toFixed(2)} ms`);
  return uris;
}

async function analyzeFile(file: SourceFile, referenceMap: Map<string, number>, config: vscode.WorkspaceConfiguration) {
  const filePath = file.getFilePath();
  referenceMap.set(filePath, referenceMap.get(filePath) ?? 0);

  const record = async (spec?: string) => {
    if (!spec || SKIPPED_PACKAGES.includes(spec) || spec.startsWith('http')) {return;}

    const key = `${path.dirname(filePath)}::${spec}`;
    const cached = resolveCache.get(key);

    const resolved = cached ?? (await resolveImportAbsolute(filePath, spec, config));
    if (!cached) {resolveCache.set(key, resolved);}

    if (resolved) {referenceMap.set(resolved, (referenceMap.get(resolved) ?? 0) + 1);}
  };

  await Promise.all([
    ...file
      .getImportDeclarations().map(i => record(i.getModuleSpecifierValue())),
    ...file
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(n => n.getExpression().getText() === 'import')
      .map(n => record(n.getArguments()[0]?.getText()?.replace(/['"`]/g, ''))),
  ]);
}

export async function scanWorkspace(emitter: vscode.EventEmitter<vscode.Uri[]>, referenceMap: Map<string, number>, config: vscode.WorkspaceConfiguration, status: vscode.StatusBarItem) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {return;}

  referenceMap.clear();

  const project = getProject();
  const uris = await getAllSourceFiles(config);
  const files = uris.map(uri => project.addSourceFileAtPathIfExists(uri.fsPath)).filter(Boolean) as SourceFile[];
  const batchSize = config.batchSize || 50;
  const total = files.length;

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
          batch.map(f => analyzeFile(f, referenceMap, config).catch(err =>
            console.error(`💥 Error scanning file: ${f.getFilePath()}`, err)
          ))
        );

        processed += batch.length;
        const percent = Math.min((processed / total) * 100, 100);

        updateStatusBar(referenceMap, status, total);

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
