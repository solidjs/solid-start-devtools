import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function resolvePackage(...conditions: string[]): string {
  return execFileSync(
    process.execPath,
    [
      ...conditions.map((condition) => `--conditions=${condition}`),
      '--input-type=module',
      '--eval',
      `console.log(import.meta.resolve('@solidjs/start-devtools'))`,
    ],
    { encoding: 'utf-8' },
  ).trim();
}

describe('package exports', () => {
  it('uses the no-op build by default', () => {
    expect(resolvePackage()).toMatch(/\/dist\/noop\.js$/);
  });

  it('uses the server build for development in Node', () => {
    expect(resolvePackage('development')).toMatch(/\/dist\/server\.js$/);
  });
});
