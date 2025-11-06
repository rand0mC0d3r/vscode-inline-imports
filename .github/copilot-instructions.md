# GitHub Copilot Instructions for VS Inline Imports

## Purpose

This repository is a Visual Studio Code extension that visualizes inline import references for TypeScript and JavaScript files. The extension scans a workspace, tracks which files import other files, and displays import counts directly in the VS Code file explorer using decorations.

Key features:
- Real-time import tracking and visualization
- Support for both static (`import x from`) and dynamic (`import()`) imports
- Unused file detection
- Incremental scanning with file hash caching for performance
- Interactive status bar with statistics and actions

## Project Structure

- `/src` - Main extension source code
  - `extension.ts` - Extension activation and lifecycle management
  - `scanner.ts` - Core import scanning logic with ts-morph
  - `decorator.ts` - File decoration provider for displaying import counts
  - `interfaceElements.ts` - Status bar and UI components
  - `fileUsages.ts` - Display and navigate file usage references
  - `unusedFiles.ts` - Find and list files with no imports
  - `constants.ts` - Shared constants and package name
  - `utils.ts` - Utility functions including import path resolution
  - `/test` - Test files
- `/.github/workflows` - GitHub Actions CI/CD workflows
- `/images` - Extension documentation images
- `package.json` - Extension manifest and configuration
- `tsconfig.json` - TypeScript compiler configuration
- `eslint.config.mjs` - ESLint configuration

## Build and Test Commands

**Install dependencies:**
```bash
npm install
```

**Type checking (no build):**
```bash
npm run check-types
```

**Lint code:**
```bash
npm run lint
```

**Build the extension:**
```bash
npm run compile
```

**Watch mode for development:**
```bash
npm run watch
```

**Package extension:**
```bash
npm run package      # Production build with minification
npm run vsix         # Create .vsix package file
```

**Run tests:**
```bash
npm run test
```

## Technical Principles

### TypeScript Standards
- **Strict mode enabled** - All code must satisfy TypeScript strict type checking (`"strict": true` in tsconfig.json)
- **No implicit any** - Always provide explicit types
- **Target ES2022** - Use modern JavaScript features
- **Module system: Node16** - Follow Node.js module resolution

### Code Style and Linting
- ESLint configuration is defined in `eslint.config.mjs`
- **Required rules:**
  - Import names must use `camelCase` or `PascalCase`
  - Use curly braces for control structures
  - Use strict equality (`===`, `!==`)
  - No throw literals - throw Error objects
  - Semicolons required
- **Run linting before commits** - All code must pass `npm run lint`

### VS Code Extension Patterns
- Use `vscode.ExtensionContext` subscriptions for proper cleanup
- Dispose of resources (event listeners, providers) via `context.subscriptions.push()`
- Use debouncing for file system watchers to avoid excessive rescans
- Prefer VS Code API types over Node.js equivalents where available
- Use emojis consistently in logging and UI for visual clarity (established pattern in codebase)

### Performance Considerations
- **Cache file hashes** - Skip unchanged files during rescans (see `fileHashCache` in scanner.ts)
- **Batch processing** - Process files in configurable batches (default: 25 files)
- **Persistent ts-morph Project** - Reuse the same Project instance across scans
- **Incremental updates** - Only reprocess changed files
- **Fast partial hashing** - Read only first 1KB for file change detection

### Import Scanning
- Support both static imports: `import { x } from 'y'`
- Support dynamic imports: `import('z')`
- Handle relative imports (`./file`, `../file`)
- Handle absolute imports via path resolution
- Skip `node_modules` and packages listed in `SKIPPED_PACKAGES`
- Resolve TypeScript path aliases and extensions

## Configuration

The extension exposes these settings (prefix: `inlineImports.`):
- `sourceFolder` - Source folder to scan (default: "src")
- `fileExtensions` - Extensions to include (default: [".ts", ".tsx", ".js", ".jsx"])
- `batchSize` - Files per batch (default: 25)
- `deleteIcon` - Icon for files proposed for deletion (default: "🗑️")

## Testing Guidelines

- Tests are located in `src/test/`
- Use VS Code's test framework (`@vscode/test-cli`, `@vscode/test-electron`)
- Run tests with `npm run test`
- Pretest script automatically compiles and lints code
- Tests should validate extension activation and core functionality

## Contributing Guidelines

When making changes:
1. **Run type checking first**: `npm run check-types`
2. **Lint your code**: `npm run lint`
3. **Test locally**: Open extension in VS Code extension development host
4. **Verify performance**: Test with workspaces of varying sizes
5. **Update documentation**: If adding configuration options or commands, update README.md
6. **Follow emoji conventions**: Use consistent emoji prefixes in logs and comments (🧠 logic, ⚡ performance, 🎨 UI, 📦 imports, etc.)

## Dependencies

**Production:**
- `ts-morph` - TypeScript compiler API wrapper for parsing and analyzing code

**Development:**
- TypeScript 5.9+ with strict mode
- ESLint with TypeScript plugin
- VS Code Extension Testing tools
- esbuild for bundling
- semantic-release for automated releases

## Common Tasks

### Adding a new configuration option
1. Add to `contributes.configuration.properties` in package.json
2. Update type definitions if needed
3. Access via `vscode.workspace.getConfiguration('inlineImports')`
4. Document in README.md

### Modifying import scanning logic
1. Edit `scanner.ts` - main scanning logic
2. Consider cache invalidation if changing hash or import detection
3. Test with various import patterns (relative, absolute, dynamic)
4. Verify performance impact with large workspaces

### Adding new commands
1. Register in `contributes.commands` in package.json
2. Implement handler in `extension.ts` or appropriate module
3. Add to `interfaceElements.ts` if UI integration needed
4. Update README.md with command documentation

## CI/CD

- **Release workflow** (`.github/workflows/release.yml`):
  - Triggered on version tags (`v*.*.*`)
  - Runs on Node.js 20
  - Builds and packages extension
  - Creates GitHub release with .vsix artifact

## License

MIT License - See LICENSE.md
