import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import { Node, Project, SourceFile, SyntaxKind } from 'ts-morph';
import * as vscode from 'vscode';
import { SKIPPED_PACKAGES } from './constants';
import { updateStatusBar } from './interfaceElements';
import { isFileIgnored, resolveImportAbsolute } from './utils';

// 🧠 persistent caches
const fileHashCache = new Map<string, string>();
const resolveCache = new Map<string, string | null>(); // key = filePath::spec
const fileImportCache = new Map<string, string[]>();   // last known imports
let previousReferenceMap = new Map<string, number>();

// 🔗 Reverse import map: targetFile → [files that import it]
const reverseImportMap = new Map<string, Set<string>>();

export function getReverseImportMap(): Map<string, Set<string>> {
  return reverseImportMap;
}

const project = new Project({
  compilerOptions: {
    allowJs: true,
    checkJs: false,
    jsx: 1,
    moduleResolution: 2,
  },
  skipFileDependencyResolution: true,
  skipAddingFilesFromTsConfig: true,
});

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
async function analyzeFileFast(
  uri: vscode.Uri,
  referenceMap: Map<string, number>,
  config: vscode.WorkspaceConfiguration
) {
  const filePath = uri.fsPath;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

  let sourceFile: SourceFile;
  try {
    const content = await fs.readFile(filePath, 'utf8');
    // reuse or create the SourceFile
    sourceFile = project.getSourceFile(filePath)
      ?? project.createSourceFile(filePath, content, { overwrite: true });
    // update content if it already existed
    if (sourceFile.getFullText() !== content) {
      sourceFile.replaceWithText(content);
    }
  } catch {
    return;
  }

  const imports = new Set<string>();

  // 1) Static imports (default, named, namespace, side-effect, type-only)
  for (const decl of sourceFile.getImportDeclarations()) {
    const spec = decl.getModuleSpecifierValue();
    if (spec) {imports.add(spec);}
  }

  // 2) Re-exports: export * from 'x', export { a } from 'x'
  for (const decl of sourceFile.getExportDeclarations()) {
    const spec = decl.getModuleSpecifierValue();
    if (spec) {imports.add(spec);}
  }

  // 3) Dynamic imports: import('x')
  sourceFile.forEachDescendant(n => {
    if (Node.isCallExpression(n)) {
      const expr = n.getExpression();
      // In the AST, dynamic import’s expression kind is ImportKeyword
      const isDynamicImport =
        expr.getKind() === SyntaxKind.ImportKeyword || expr.getText() === 'import';
      if (isDynamicImport) {
        const arg = n.getArguments()[0];
        if (arg && Node.isStringLiteral(arg)) {imports.add(arg.getLiteralText());}
      }
    }
  });

  // 4) CommonJS require('x')
  sourceFile.forEachDescendant(n => {
    if (Node.isCallExpression(n)) {
      const expr = n.getExpression();
      if (expr.getText() === 'require') {
        const arg = n.getArguments()[0];
        if (arg && Node.isStringLiteral(arg)) {imports.add(arg.getLiteralText());}
      }
    }
  });

  // 5) Import-equals: import x = require('x')
  // (safe across ts-morph versions)
  for (const decl of sourceFile.getDescendantsOfKind(SyntaxKind.ImportEqualsDeclaration)) {
    const ref = decl.getModuleReference();
    if (ref && ref.getKind() === SyntaxKind.ExternalModuleReference) {
      // @ts-expect-error: .getExpression() returns a Node; older typings vary
      const expr = ref.getExpression?.();
      if (expr && Node.isStringLiteral(expr)) {imports.add(expr.getLiteralText());}
    }
  }

  // ---- apply to your map/caches ----
  referenceMap.set(filePath, referenceMap.get(filePath) ?? 0);

  for (const spec of imports) {
    if (!spec || SKIPPED_PACKAGES.includes(spec) || spec.startsWith('http')) {continue;}

    const cacheKey = `${filePath}::${spec}`;
    let resolved = resolveCache.get(cacheKey);

    if (resolved === undefined) {
      resolved = await resolveImportAbsolute(filePath, spec, config);
      resolveCache.set(cacheKey, resolved);
    }

    if (resolved && resolved.startsWith(workspaceFolder)) {
      referenceMap.set(resolved, (referenceMap.get(resolved) ?? 0) + 1);

      // Update reverse import map
      if (!reverseImportMap.has(resolved)) {
        reverseImportMap.set(resolved, new Set());
      }
      reverseImportMap.get(resolved)!.add(filePath);
    }
  }

  fileImportCache.set(filePath, Array.from(imports));
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
      reverseImportMap.clear();

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
              if (resolved) {
                referenceMap.set(resolved, (referenceMap.get(resolved) ?? 0) + 1);
                // Update reverse import map from cache
                if (!reverseImportMap.has(resolved)) {
                  reverseImportMap.set(resolved, new Set());
                }
                reverseImportMap.get(resolved)!.add(uri.fsPath);
              }
            }
          } else {
            await analyzeFileFast(uri, referenceMap, config);
            fileHashCache.set(uri.fsPath, newHash);
            changedUris.push(uri);
          }
        }));

        processed += batch.length;

        // Throttled progress + status updates
        if (i % (batchSize * 2) === 0 || processed === total) {
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

  // Apply artificial count of 1 to ignored files that have count of 0
  for (const [filePath, count] of referenceMap.entries()) {
    if (count === 0 && isFileIgnored(filePath, config)) {
      referenceMap.set(filePath, 1);
    }
  }

  const changedUrisFinal =
    changedUris.length > 0 ? changedUris : [...referenceMap.keys()].map(f => vscode.Uri.file(f));

  emitter.fire(changedUrisFinal);
  previousReferenceMap = new Map(referenceMap);
}
