import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { ALIASES, EXTENSIONS, SKIPPED_PACKAGES } from './constants';
import { getAllSourceFiles } from './scanner';

// 🧠 internal cache for resolved paths + tsconfig
const resolveMemo = new Map<string, string | null>();
let cachedTsconfig: any = null;

// --- Fast resolver for file existence ---
async function tryResolve(base: string, config: vscode.WorkspaceConfiguration): Promise<string | null> {
  const candidates = [...config.fileExtensions, ...EXTENSIONS].map(ext =>
    base.endsWith(ext) ? base : base + ext
  );

  // check all in parallel
  const results = await Promise.allSettled(candidates.map(f => fs.stat(f)));
  const found = results.findIndex(r => r.status === 'fulfilled');
  if (found !== -1) {return candidates[found];}

  // try “index” variants in parallel
  const indexCandidates = candidates.map(f => path.join(f, 'index'));
  const indexResults = await Promise.allSettled(indexCandidates.map(f => fs.stat(f)));
  const indexFound = indexResults.findIndex(r => r.status === 'fulfilled');
  return indexFound !== -1 ? indexCandidates[indexFound] : null;
}

// --- Load tsconfig once per session ---
function loadTsconfig(workspaceRoot: string) {
  if (cachedTsconfig) {return cachedTsconfig;}
  const tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
  try {
    const data = fsSync.readFileSync(tsconfigPath, 'utf8');
    cachedTsconfig = JSON.parse(data);
    return cachedTsconfig;
  } catch {
    cachedTsconfig = null;
    return null;
  }
}

async function resolveTsconfigAlias(
  spec: string,
  baseUrl: string,
  pathsMap: Record<string, string[]>,
  config: vscode.WorkspaceConfiguration
) {
  for (const [alias, targets] of Object.entries(pathsMap)) {
    const aliasPrefix = alias.replace(/\*$/, '');
    if (!spec.startsWith(aliasPrefix)) {continue;}

    for (const target of targets) {
      const targetPrefix = target.replace(/\*$/, '');
      const remainder = spec.slice(aliasPrefix.length);
      const candidate = path.resolve(baseUrl, targetPrefix + remainder);
      const resolved = await tryResolve(candidate, config);
      if (resolved) {return resolved;}
    }
  }
  return null;
}

async function resolveAliasMap(
  spec: string,
  workspaceRoot: string,
  config: vscode.WorkspaceConfiguration
) {
  for (const [prefix, folder] of Object.entries(ALIASES)) {
    if (!spec.startsWith(prefix)) {continue;}
    const aliasTarget = path.resolve(
      workspaceRoot,
      'src',
      folder,
      spec.replace(new RegExp(`^${prefix}`), '')
    );
    const resolved = await tryResolve(aliasTarget, config);
    if (resolved) {return resolved;}
  }
  return null;
}

async function resolveAtAlias(
  spec: string,
  workspaceRoot: string,
  baseUrl: string,
  config: vscode.WorkspaceConfiguration
) {
  const targets = [
    path.resolve(workspaceRoot, 'src', spec.replace(/^@\//, '')),
    path.resolve(baseUrl, spec.replace(/^@\//, '')),
  ];
  const results = await Promise.allSettled(targets.map(t => tryResolve(t, config)));
  const found = results.find(r => r.status === 'fulfilled' && r.value);
  return found && found.status === 'fulfilled' ? found.value : null;
}

async function resolveRelative(
  spec: string,
  fromFsPath: string,
  config: vscode.WorkspaceConfiguration
) {
  if (!spec.startsWith('.')) {return null;}
  const candidate = path.resolve(path.dirname(fromFsPath), spec);
  return await tryResolve(candidate, config);
}

export async function resolveImportAbsolute(
  fromFsPath: string,
  spec: string,
  config: vscode.WorkspaceConfiguration
): Promise<string | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {return null;}

  // check cache first
  const cacheKey = `${fromFsPath}::${spec}`;
  if (resolveMemo.has(cacheKey)) {return resolveMemo.get(cacheKey)!;}

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const tsconfig = loadTsconfig(workspaceRoot);
  const baseUrl = tsconfig?.compilerOptions?.baseUrl
    ? path.resolve(workspaceRoot, tsconfig.compilerOptions.baseUrl)
    : workspaceRoot;

  const pathsMap = tsconfig?.compilerOptions?.paths ?? {};

  if (SKIPPED_PACKAGES.includes(spec)) {
    resolveMemo.set(cacheKey, null);
    return null;
  }

  const resolved =
    (await resolveTsconfigAlias(spec, baseUrl, pathsMap, config)) ||
    (await resolveAtAlias(spec, workspaceRoot, baseUrl, config)) ||
    (await resolveAliasMap(spec, workspaceRoot, config)) ||
    (await resolveRelative(spec, fromFsPath, config)) ||
    null;

  if (!resolved) {
    // throttle noisy warnings by only showing unknown paths occasionally
    if (Math.random() < 0.02)
      {console.warn(`⚠️ Could not resolve import: ${spec} from ${fromFsPath}`);}
  }

  resolveMemo.set(cacheKey, resolved);
  return resolved;
}

// --- Unused file listing unchanged ---
export async function showUnusedFiles(
  referenceMap: Map<string, number>,
  config: vscode.WorkspaceConfiguration
) {
  const allFiles = await getAllSourceFiles(config);

  const unused = allFiles
    .filter(uri => {
      if (!uri.fsPath.includes(path.sep + 'src' + path.sep)) {return false;}
      if (!config.fileExtensions.some((ext: string) => uri.fsPath.endsWith(ext))) {return false;}
      return referenceMap.get(uri.fsPath) === 0;
    })
    .sort((a, b) => a.fsPath.localeCompare(b.fsPath));

  if (unused.length === 0) {
    vscode.window.showInformationMessage('🎉 No unused files detected!');
    return;
  }

  console.log(`🧹 Found ${unused.length} unused files`);

  const items: (vscode.QuickPickItem & { uri?: vscode.Uri })[] = [];
  const firstBatch = unused.slice(0, 30);

  for (let i = 0; i < firstBatch.length; i++) {
    if (i % 10 === 0 && i > 0) {items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });}
    const uri = firstBatch[i];
    items.push({
      label: path.basename(uri.fsPath),
      description: uri.fsPath.replace(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        ''
      ),
      uri,
    });
  }

  if (unused.length > 30) {
    items.push({
      label: `...and ${unused.length - 30} more`,
      description: 'Select to view the full list',
    });
  }

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `🗑️ ${unused.length} unused files — select one to open`,
    matchOnDescription: true,
    ignoreFocusOut: true,
  });

  if (!pick) {return;}

  if (pick.label.startsWith('...and')) {
    const allItems = unused.map(uri => ({
      label: path.basename(uri.fsPath),
      description: uri.fsPath.replace(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        ''
      ),
      uri,
    }));
    const fullPick = await vscode.window.showQuickPick(allItems, {
      placeHolder: 'Full unused files list — select one to open',
      matchOnDescription: true,
    });
    if (fullPick?.uri) {
      const doc = await vscode.workspace.openTextDocument(fullPick.uri);
      vscode.window.showTextDocument(doc, { preview: false });
    }
  } else if (pick.uri) {
    const doc = await vscode.workspace.openTextDocument(pick.uri);
    vscode.window.showTextDocument(doc, { preview: false });
  }
}
