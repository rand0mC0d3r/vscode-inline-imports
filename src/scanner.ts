import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import { Project } from 'ts-morph';
import * as vscode from 'vscode';
import { SKIPPED_PACKAGES } from './constants';
import { updateStatusBar } from './interfaceElements';
import { resolveImportAbsolute } from './utils';

// 🧠 persistent caches
const fileHashCache = new Map<string, string>();
const resolveCache = new Map<string, string | null>(); // key = filePath::spec
const fileImportCache = new Map<string, string[]>();   // last known imports
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

// ⚡️ Fast partial hash (reads only first 1KB)
async function getFileHash(uri: vscode.Uri): Promise<string> {
  try {
    const handle = await fs.open(uri.fsPath, 'r');
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    await handle.close();
    return createHash('md5').update(buffer.subarray(0, bytesRead)).digest('hex');
  } catch {
    return '';
  }
}

// ⚡️ Single regex for static + dynamic imports
function extractImportsFast(source: string): string[] {
  const regex = /import(?:\s+.*?from\s+|\()?\s*['"](.+?)['"]/g;
  return [...source.matchAll(regex)].map(m => m[1]).filter(Boolean);
}

async function analyzeFileFast(
  uri: vscode.Uri,
  referenceMap: Map<string, number>,
  config: vscode.WorkspaceConfiguration
) {
  const filePath = uri.fsPath;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  const data = await fs.readFile(filePath, 'utf8');
  const imports = extractImportsFast(data);

  referenceMap.set(filePath, referenceMap.get(filePath) ?? 0);

  for (const spec of imports) {
    if (!spec || SKIPPED_PACKAGES.includes(spec) || spec.startsWith('http')) {continue;}

    // Scoped cache key per file
    const cacheKey = `${filePath}::${spec}`;
    let resolved = resolveCache.get(cacheKey);

    if (resolved === undefined) {
      resolved = await resolveImportAbsolute(filePath, spec, config);
      resolveCache.set(cacheKey, resolved);
    }

    if (resolved && resolved.startsWith(workspaceFolder)) {
      referenceMap.set(resolved, (referenceMap.get(resolved) ?? 0) + 1);
    }
  }

  fileImportCache.set(filePath, imports);
}

export async function getAllSourceFiles(config: vscode.WorkspaceConfiguration): Promise<vscode.Uri[]> {
  const t0 = performance.now();
  const uris = await vscode.workspace.findFiles(
    `${config.sourceFolder}/**/*.{ts,tsx,js,jsx}`,
    '**/node_modules/**'
  );
  console.log(`⏱️ Found ${uris.length} source files in ${(performance.now() - t0).toFixed(1)} ms`);
  return uris;
}

export async function scanWorkspace(
  emitter: vscode.EventEmitter<vscode.Uri[]>,
  referenceMap: Map<string, number>,
  config: vscode.WorkspaceConfiguration,
  status: vscode.StatusBarItem
) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {return;}

  const uris = await getAllSourceFiles(config);
  const batchSize = config.batchSize || 40;
  const total = uris.length;

  const changedUris: vscode.Uri[] = [];
  const start = performance.now();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: '🔍 Scanning workspace for imports...',
      cancellable: false,
    },
    async progress => {
      let processed = 0;
      referenceMap.clear();

      for (let i = 0; i < total; i += batchSize) {
        const batch = uris.slice(i, i + batchSize);

        await Promise.all(batch.map(async uri => {
          const newHash = await getFileHash(uri);
          const oldHash = fileHashCache.get(uri.fsPath);

          if (oldHash && oldHash === newHash && fileImportCache.has(uri.fsPath)) {
            const cachedImports = fileImportCache.get(uri.fsPath) || [];
            referenceMap.set(uri.fsPath, referenceMap.get(uri.fsPath) ?? 0);
            for (const spec of cachedImports) {
              const resolved = resolveCache.get(`${uri.fsPath}::${spec}`);
              if (resolved) {referenceMap.set(resolved, (referenceMap.get(resolved) ?? 0) + 1);}
            }
          } else {
            await analyzeFileFast(uri, referenceMap, config);
            fileHashCache.set(uri.fsPath, newHash);
            changedUris.push(uri);
          }
        }));

        processed += batch.length;

        // Throttled progress + status updates
        if (i % (batchSize * 5) === 0 || processed === total) {
          const percent = Math.min((processed / total) * 100, 100);
          progress.report({
            increment: (batch.length / total) * 100,
            message: `📂 ${processed}/${total} files (${percent.toFixed(1)}%)`,
          });
          updateStatusBar(referenceMap, status, total);
        }
      }

      const duration = (performance.now() - start).toFixed(1);
      vscode.window.showInformationMessage(`🎉 Scan complete! ${total} files analyzed in ${duration} ms`);
    }
  );

  // const duration = (performance.now() - start).toFixed(1);
  // status.text = `📊 ${total} files scanned in ${duration} ms`;

  const changedUrisFinal =
    changedUris.length > 0 ? changedUris : [...referenceMap.keys()].map(f => vscode.Uri.file(f));

  emitter.fire(changedUrisFinal);
  previousReferenceMap = new Map(referenceMap);
}
