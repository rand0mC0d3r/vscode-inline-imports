import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const inputFilePatterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
const inputRootFolder = 'src/';

const EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx'
];

const ALIASES = {
  '@store/': 'store',
  '@components/': 'components',
  '@views/': 'views',
  '@modules/': 'modules',
};

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

  return (
    await resolveTsconfigAlias(spec, baseUrl, pathsMap) ||
    await resolveAtAlias(spec, workspaceRoot, baseUrl) ||
    await resolveAliasMap(spec, workspaceRoot) ||
    await resolveRelative(spec, fromFsPath) ||
    (console.warn(`⚠️ Could not resolve import: ${spec}`), null)
  );
}
