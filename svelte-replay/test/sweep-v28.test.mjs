// v2.8 sweep regressions: dropdown-scoped census + 'dropdown-opened' record;
// §7 backup bracketing (backupDatabase must be sandwiched between
// stopDevServer and startDevServer — never while the server is live).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, '..', 'SKILL.md'), 'utf8');

test('v2.8: sweepRoute dropdown loop censuses with DROPDOWN_SEL scope and emits dropdown-opened', async () => {
  const sweep = src.match(/async function sweepRoute\(page, url, report\) \{[\s\S]*?\n\}/)[0];
  assert.ok(sweep.includes('census(page, DROPDOWN_SEL)'), 'dropdown loop must census SCOPED to the dropdown (old code censused the whole page mid-hover)');
  assert.ok(sweep.includes("dropdown-opened"), "sweepRoute must emit the 'dropdown-opened' record writeCoverage already classified");
  assert.ok(sweep.includes('if (!dropdownEls.length)'), 'no dropdown open → skip probing (main loop covers page elements)');
});

test('v2.8: §7 backup is bracketed by stopDevServer → backupDatabase → startDevServer', async () => {
  // Pull the §7 main-plumbing region and verify the ordering there.
  const region = src.slice(src.indexOf('7. main() PLUMBING'), src.indexOf('8. ROBUSTNESS'));
  const stop = region.indexOf('await stopDevServer();');
  const backup = region.indexOf('const stamp = backupDatabase();');
  const start = region.indexOf('await startDevServer();', backup);
  assert.ok(stop !== -1 && backup !== -1 && start !== -1, 'all three calls present in §7');
  assert.ok(stop < backup && backup < start, `backup must run between stop and start (stop@${stop} < backup@${backup} < start@${start})`);
});

test('v2.8: backupDatabase/restoreDatabaseBackup skip in --no-manage-dev-server mode', () => {
  const backup = src.match(/function backupDatabase\(\) \{[\s\S]*?\n\}/)[0];
  const restore = src.match(/function restoreDatabaseBackup\(stamp\) \{[\s\S]*?\n\}/)[0];
  for (const [name, fn] of [['backupDatabase', backup], ['restoreDatabaseBackup', restore]]) {
    assert.ok(fn.includes('MANAGE_DEV_SERVER'), `${name} must check MANAGE_DEV_SERVER — it cannot quiesce an externally-owned server`);
    assert.ok(fn.includes('--no-manage-dev-server'), `${name} must say so loudly`);
  }
});
