import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ALIASES, BADGES, EXTENSIONS, SKIPPED_PACKAGES } from './constants';
import { getAllSourceFiles } from './scanner';

async function tryResolve(base: string, config: vscode.WorkspaceConfiguration): Promise<string | null> {
  // console.log(`🔗 Trying to resolve: ${base}`);
  for (const ext of [...config.fileExtensions, ...EXTENSIONS]) {
    const full = base.endsWith(ext) ? base : base + ext;
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(full));
      return full;
    } catch {}
  }
  return null;
}

function loadTsconfig(workspaceRoot: string) {
  const tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {return null;}
  try {
    return JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  } catch {
    return null;
  }
}

async function resolveTsconfigAlias(spec: string, baseUrl: string, pathsMap: Record<string, string[]>, config: vscode.WorkspaceConfiguration) {
  for (const [alias, targets] of Object.entries(pathsMap)) {
    const aliasPrefix = alias.replace(/\*$/, '');
    if (!spec.startsWith(aliasPrefix)) {continue;}

    for (const target of targets) {
      const targetPrefix = target.replace(/\*$/, '');
      const remainder = spec.slice(aliasPrefix.length);
      const candidate = path.resolve(baseUrl, targetPrefix + remainder);
      const resolved = await tryResolve(candidate, config) || await tryResolve(path.join(candidate, 'index'), config);
      if (resolved) {return resolved;}
    }
  }
  return null;
}

async function resolveAliasMap(spec: string, workspaceRoot: string, config: vscode.WorkspaceConfiguration) {
  for (const [prefix, folder] of Object.entries(ALIASES)) {
    if (!spec.startsWith(prefix)) {continue;}
    const aliasTarget = path.resolve(workspaceRoot, 'src', folder, spec.replace(new RegExp(`^${prefix}`), ''));
    const resolved = await tryResolve(aliasTarget, config) || await tryResolve(path.join(aliasTarget, 'index'), config);
    if (resolved) {return resolved;}
  }
  return null;
}

async function resolveAtAlias(spec: string, workspaceRoot: string, baseUrl: string, config: vscode.WorkspaceConfiguration) {
  const targets = [
    path.resolve(workspaceRoot, 'src', spec.replace(/^@\//, '')),
    path.resolve(baseUrl, spec.replace(/^@\//, ''))
  ];
  for (const t of targets) {
    const resolved = await tryResolve(t, config) || await tryResolve(path.join(t, 'index'), config);
    if (resolved) {return resolved;}
  }
  return null;
}

async function resolveRelative(spec: string, fromFsPath: string, config: vscode.WorkspaceConfiguration) {
  if (!spec.startsWith('.')) {return null;}
  const candidate = path.resolve(path.dirname(fromFsPath), spec);
  return (await tryResolve(candidate, config)) || (await tryResolve(path.join(candidate, 'index'), config));
}

export async function resolveImportAbsolute(fromFsPath: string, spec: string, config: vscode.WorkspaceConfiguration): Promise<string | null> {
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
    await resolveTsconfigAlias(spec, baseUrl, pathsMap, config) ||
    await resolveAtAlias(spec, workspaceRoot, baseUrl, config) ||
    await resolveAliasMap(spec, workspaceRoot, config) ||
    await resolveRelative(spec, fromFsPath, config) ||
    (console.warn(`⚠️ Could not resolve import: ${spec} ${baseUrl} ${pathsMap} ${workspaceRoot} ${fromFsPath}`), null)
  );
}

export function createDecorationProvider(referenceMap: Map<string, number>, emitter: vscode.EventEmitter<vscode.Uri[]>, config: vscode.WorkspaceConfiguration): vscode.FileDecorationProvider {
  const validExt = config.fileExtensions;

  const provider: vscode.FileDecorationProvider = {
    onDidChangeFileDecorations: emitter.event,
    provideFileDecoration(uri) {
      if (referenceMap.size === 0 || !validExt.some((ext: any) => uri.fsPath.endsWith(ext))) {return;}

      console.log(`🔍 Providing decoration for: ${uri.fsPath}`, referenceMap);

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

      console.log(`🗑️ Marking for deletion: ${uri.fsPath}`);

      return {
        badge: config.deleteIcon,
        tooltip: 'No files import this module',
        color: new vscode.ThemeColor('charts.red'),
      };
    },
  };

  return provider;
}

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

  // --- Create a visual separator every 10 entries for large lists ---
  const items: (vscode.QuickPickItem & { uri?: vscode.Uri })[] = [];
  const firstBatch = unused.slice(0, 30); // Limit initial view to 30 for sanity

  for (let i = 0; i < firstBatch.length; i++) {
    if (i % 10 === 0 && i > 0) {
      items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
    }
    const uri = firstBatch[i];
    items.push({
      label: path.basename(uri.fsPath),
      description: uri.fsPath.replace(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', ''),
      uri,
    });
  }

  if (unused.length > 30) {
    items.push({
      label: `...and ${unused.length - 30} more`,
      description: 'Select to view the full list',
    });
  }

  // --- Show the Quick Pick menu ---
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `🗑️ ${unused.length} unused files — select one to open`,
    matchOnDescription: true,
    ignoreFocusOut: true,
  });

  // --- Handle user selection ---
  if (!pick) {return;}

  if (pick.label.startsWith('...and')) {
    // User clicked the "more" item → show full list
    const allItems = unused.map(uri => ({
      label: path.basename(uri.fsPath),
      description: uri.fsPath.replace(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', ''),
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
    // Open directly
    const doc = await vscode.workspace.openTextDocument(pick.uri);
    vscode.window.showTextDocument(doc, { preview: false });
  }
}
