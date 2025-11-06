import * as assert from 'assert';
import * as vscode from 'vscode';
import { isFileIgnored } from '../utils';

suite('Utils Test Suite', () => {
  test('isFileIgnored - should match exact filename', () => {
    const mockConfig = {
      ignoredFiles: ['main.ts', 'extension.ts'],
      get: (key: string) => mockConfig[key as keyof typeof mockConfig],
    } as unknown as vscode.WorkspaceConfiguration;

    assert.strictEqual(
      isFileIgnored('/some/path/main.ts', mockConfig),
      true,
      'main.ts should be ignored'
    );
    
    assert.strictEqual(
      isFileIgnored('/some/path/extension.ts', mockConfig),
      true,
      'extension.ts should be ignored'
    );
    
    assert.strictEqual(
      isFileIgnored('/some/path/other.ts', mockConfig),
      false,
      'other.ts should not be ignored'
    );
  });

  test('isFileIgnored - should match glob patterns', () => {
    const mockConfig = {
      ignoredFiles: ['**/*.d.ts'],
      get: (key: string) => mockConfig[key as keyof typeof mockConfig],
    } as unknown as vscode.WorkspaceConfiguration;

    assert.strictEqual(
      isFileIgnored('/some/path/types.d.ts', mockConfig),
      true,
      'types.d.ts should be ignored'
    );
    
    assert.strictEqual(
      isFileIgnored('/some/path/nested/global.d.ts', mockConfig),
      true,
      'nested d.ts file should be ignored'
    );
    
    assert.strictEqual(
      isFileIgnored('/some/path/regular.ts', mockConfig),
      false,
      'regular.ts should not be ignored'
    );
  });

  test('isFileIgnored - should return false for empty ignoredFiles', () => {
    const mockConfig = {
      ignoredFiles: [],
      get: (key: string) => mockConfig[key as keyof typeof mockConfig],
    } as unknown as vscode.WorkspaceConfiguration;

    assert.strictEqual(
      isFileIgnored('/some/path/main.ts', mockConfig),
      false,
      'main.ts should not be ignored when ignoredFiles is empty'
    );
  });
});
