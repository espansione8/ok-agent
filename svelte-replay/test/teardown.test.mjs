// v2.9.4 teardown watchdog-race tests. The v2.9.3 sequential await+flag could
// never fire on a hung close() (the await never settled, so the flag check
// was unreachable and the script hung forever — the exact failure the
// watchdog exists for) and misfired the kill path on a slow success. These
// drive teardown() directly with a fake browser and a short watchdog,
// asserting race semantics instead of timing luck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEmbedded } from './harness.mjs';

const withStubbedExit = async (fn) => {
  const realExit = process.exit;
  let code = null;
  process.exit = (c) => { code = c; };
  try { await fn(); } finally { process.exit = realExit; }
  return code;
};

test('v2.9.4: teardown resolves without exiting on a clean close', async () => {
  const { teardown } = await loadEmbedded();
  let closed = false;
  const code = await withStubbedExit(() => teardown({ close: async () => { closed = true; } }, 50));
  assert.equal(closed, true, 'close() must still be awaited');
  assert.equal(code, null, 'a clean close must not force-exit');
});

test('v2.9.4: teardown force-exits promptly on a HUNG close (the race)', async () => {
  const { teardown } = await loadEmbedded();
  const t0 = Date.now();
  const code = await withStubbedExit(() => teardown({ close: () => new Promise(() => {}) }, 60));
  const elapsed = Date.now() - t0;
  assert.notEqual(code, null, 'a hung close() must trigger the kill path + exit instead of hanging');
  assert.ok(elapsed < 5000, `the race must settle near the watchdog, took ${elapsed}ms`);
});

test('v2.9.4: teardown treats a rejecting close() as closed', async () => {
  const { teardown } = await loadEmbedded();
  const code = await withStubbedExit(() => teardown({ close: async () => { throw new Error('driver gone'); } }, 50));
  assert.equal(code, null, 'a rejecting close() means nothing live is left to kill — no force-exit');
});
