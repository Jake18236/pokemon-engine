import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('AAA rule cache preserves uncached states, legal actions, continuations, scores and immutable rules', () => {
  const script = fileURLToPath(new URL('../scripts/cache-regression-case.js', import.meta.url));
  const run = reference => JSON.parse(execFileSync(process.execPath, [script], {
    encoding: 'utf8', env: { ...process.env, AAA_REFERENCE_RULES: reference ? '1' : '0' }, maxBuffer: 8 * 1024 * 1024,
  }));
  const original = run(true);
  const cached = run(false);
  assert.deepEqual(cached, original);
  for (const row of cached) assert.equal(row.rules, row.rulesAfter);
});
