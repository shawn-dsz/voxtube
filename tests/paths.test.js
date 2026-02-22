/**
 * Path validation tests
 * Ensures no absolute paths are used (required for nginx subpath proxy)
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const PUBLIC_DIR = join(import.meta.dir, '..', 'public');

// Files to scan for absolute path violations
const FILES_TO_SCAN = ['app.js', 'index.html'];

// Patterns that indicate absolute paths (which break nginx subpath proxy)
const ABSOLUTE_PATH_PATTERNS = [
  // API calls with leading slash
  { pattern: /fetch\s*\(\s*['"]\/api\//, desc: "fetch('/api/...) - use API_BASE instead" },
  { pattern: /href\s*=\s*['"]\/['"]/, desc: "href='/' - use './' instead" },
  { pattern: /href\s*=\s*['"]\/[^/]/, desc: "href='/...' - use relative path instead" },
  { pattern: /src\s*=\s*['"]\/[^/]/, desc: "src='/...' - use relative path instead" },
  // CSS/JS links with leading slash
  { pattern: /<link[^>]+href\s*=\s*['"]\/(?!\/)['"]/, desc: "link href='/...' - use relative path instead" },
  { pattern: /<script[^>]+src\s*=\s*['"]\/[^/]/, desc: "script src='/...' - use relative path instead" },
];

describe('Path Validation', () => {
  for (const filename of FILES_TO_SCAN) {
    describe(filename, () => {
      const content = readFileSync(join(PUBLIC_DIR, filename), 'utf-8');

      for (const { pattern, desc } of ABSOLUTE_PATH_PATTERNS) {
        test(`should not contain absolute paths: ${desc}`, () => {
          const match = content.match(pattern);
          if (match) {
            // Find line number for better error message
            const lines = content.substring(0, match.index).split('\n');
            const lineNum = lines.length;
            const line = content.split('\n')[lineNum - 1]?.trim();
            
            expect.fail(
              `Found absolute path at ${filename}:${lineNum}\n` +
              `Line: ${line}\n` +
              `Issue: ${desc}\n` +
              `Hint: Use relative paths for nginx subpath proxy compatibility`
            );
          }
          expect(match).toBeNull();
        });
      }
    });
  }
});

// Verify API_BASE constant exists and is used correctly
describe('API_BASE Pattern', () => {
  test('app.js should define API_BASE constant', () => {
    const content = readFileSync(join(PUBLIC_DIR, 'app.js'), 'utf-8');
    expect(content).toMatch(/const\s+API_BASE\s*=\s*['"]api['"]/);
  });

  test('app.js should use API_BASE for all API calls', () => {
    const content = readFileSync(join(PUBLIC_DIR, 'app.js'), 'utf-8');
    
    // Find all fetch calls
    const fetchCalls = content.match(/fetch\s*\([^)]+\)/g) || [];
    
    for (const call of fetchCalls) {
      // Skip non-API calls (like blob URLs)
      if (call.includes('blob:') || call.includes('http')) continue;
      
      // API calls should use API_BASE
      if (call.includes('/api/') || call.includes("'api/")) {
        expect(call).toMatch(/\$\{API_BASE\}/);
      }
    }
  });

  test('API_BASE should NOT have leading slash', () => {
    const content = readFileSync(join(PUBLIC_DIR, 'app.js'), 'utf-8');
    const match = content.match(/const\s+API_BASE\s*=\s*['"]([^'"]+)['"]/);
    expect(match).not.toBeNull();
    if (match) {
      expect(match[1]).not.toStartWith('/');
    }
  });
});
