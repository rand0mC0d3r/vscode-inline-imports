import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { ALIASES, EXTENSIONS, SKIPPED_PACKAGES } from './constants';
import { minimatch } from 'minimatch';

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

/**
 * Check if a file should be ignored based on the ignoredFiles configuration
 * @param filePath Absolute file path
 * @param config VS Code workspace configuration
 * @returns true if the file should be ignored
 */
export function isFileIgnored(
  filePath: string,
  config: vscode.WorkspaceConfiguration
): boolean {
  const ignoredFiles: string[] = config.ignoredFiles || [];
  const fileName = path.basename(filePath);
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const relativePath = workspaceFolder ? path.relative(workspaceFolder, filePath) : filePath;

  for (const pattern of ignoredFiles) {
    // Check against filename
    if (minimatch(fileName, pattern)) {
      return true;
    }
    // Check against relative path
    if (minimatch(relativePath, pattern)) {
      return true;
    }
  }

  return false;
}
