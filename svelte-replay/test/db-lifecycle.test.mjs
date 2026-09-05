// v2.9.3 dev-server lifecycle + restore-gate regressions. The guarantee being
// pinned: restoreDatabaseBackup() may only run when stopDevServer() CONFIRMED
// the child exited — a server that survived force-kill still holds the DB
// open, and copying snapshot files over it is exactly the -shm corruption
// §4.6/§4.7 exist to prevent. stopDevServer() escalates (SIGKILL / second
// taskkill /F) and returns false only when the exit is still unconfirmed;
// every call site (backup bracket, END, catch, SIGINT) gates on that return.
// stopDevServer is not exported from the extractor build, so like db.test we
// assert against its extracted source and against the §7/generator plumbing
// that CALLS it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const embeddedSrc = () => readFileSync(join(HERE, '.build', 'embedded.mjs'), 'utf8');
const skillSrc = () => readFileSync(join(REPO, 'SKILL.md'), 'utf8');
const genSrc = () => readFileSync(join(REPO, 'scripts', 'generate.mjs'), 'utf8');

test('v2.9.3: stopDevServer escalates and returns a confirmed-exit boolean', () => {
  const src = embeddedSrc();
  const stop = src.match(/async function stopDevServer\(\) \{[\s\S]*?\n\}/)[0];
  assert.ok(stop.includes('SIGKILL'), 'posix escalation to SIGKILL after SIGTERM fails to stop');
  assert.ok(stop.includes('taskkill'), 'windows escalation path present');
  assert.ok(stop.includes('return false'), 'unconfirmed exit must be a DISTINCT false outcome (old code logged a warning and continued)');
  assert.ok(stop.includes('return true'), 'confirmed exit / nothing to stop returns true');
  assert.ok(!stop.includes('restore may fail'), 'the old "warn and restore anyway" timeout path is gone');
});

test('v2.9.3: §7 backup bracket is quiesce-gated and restore call sites are gated', () => {
  // Prose wraps across lines; collapse whitespace before asserting code-ish
  // fragments so an editor reflow cannot silently break the gate contract.
  const region = skillSrc().slice(skillSrc().indexOf('7. main() PLUMBING'), skillSrc().indexOf('8. ROBUSTNESS')).replace(/\s+/g, ' ');
  const stop = region.indexOf('await stopDevServer();');
  const backup = region.indexOf('const stamp = backupDatabase(dbKind);');
  const start = region.indexOf('await startDevServer();', backup);
  assert.ok(stop !== -1 && backup !== -1 && start !== -1, 'bracket literals present in §7');
  assert.ok(stop < backup && backup < start, 'backup still runs between stop and start');
  assert.ok(region.includes('const dbKind = MANIFEST.db?.kind ?? \'unknown\''), 'dbKind is hoisted BEFORE the backup so the warning can use it');
  assert.ok(region.includes('const quiesced = await stopDevServer();'), 'bracket captures the stop result');
  assert.ok(region.includes('if (!quiesced)'), 'unconfirmed quiesce aborts the run before the sweep');
  assert.ok(region.includes('const stopped = await stopDevServer();') && region.includes('const restored = stopped && restoreDatabaseBackup(stamp);'), 'END restores only on a confirmed stop');
  assert.ok(region.includes('if (quiesced) restoreDatabaseBackup(stamp);'), 'SIGINT restores only on a confirmed stop');
});

test('v2.9.3: generated main() implements the same gates (doc and generator cannot drift)', () => {
  const g = genSrc();
  // mainSrc bracket + no-rollback gate (the §7 snapshot gate the v2.9.2
  // draft only described in prose).
  assert.ok(g.includes('const quiesced = await stopDevServer();'), 'main() captures the stop result (bracket)');
  assert.ok(g.includes('ABORTING before any sweep mutation'), 'main() aborts pre-sweep when quiesce fails');
  assert.ok(g.includes('const stopped = await stopDevServer();') && g.includes('const restored = stopped && restoreDatabaseBackup(stamp);'), 'main() END restore is gated');
  assert.ok(g.includes('if (stopped) { try { restoreDatabaseBackup(stamp); } catch {} }'), 'main() catch restore is gated');
  assert.ok(g.includes('if (quiesced) restoreDatabaseBackup(stamp);'), 'main() SIGINT restore is gated');
  assert.ok(g.includes('i-accept-no-db-rollback'), 'no-rollback ack flag is wired into main()');
  assert.ok(g.includes('MANIFEST.db?.kind'), 'no-rollback gate reads the manifest dbKind');
  assert.ok(g.includes('const dbKind = MANIFEST.db?.kind ?? \'unknown\''), 'dbKind hoisted before the backup call');
  assert.ok(g.includes('const stamp = backupDatabase(dbKind);'), 'backupDatabase receives the kind for its warning');
  assert.ok(g.includes('const runIsInert = MODE_RUN === \'scripted\''), 'scripted-mode inert exemption declared');
  assert.ok(g.includes('!runIsInert && !stamp && !RESET_URL && !NO_ROLLBACK_ACK'), 'gate condition includes the exemption');
  assert.ok(g.includes('MODE_RUN === \'scripted\'') && g.includes('routeQueue.clear()'), 'scripted mode gates OUT the exhaustive queue drain');
  assert.ok(g.includes("main:no-rollback-gate"), 'selftest asserts the gate lives in main()');
  assert.ok(g.includes('main:scripted-inert-exemption'), 'selftest asserts the exemption lives in main()');
  assert.ok(g.includes('backup:dbKind-aware-warning'), 'selftest asserts backupDatabase carries the kind-aware warning');
});

test('v2.9.3: no-rollback gate covers the v2.9.2 CRITICAL claim in §3', () => {
  const s = skillSrc();
  const critical = s.slice(s.indexOf('CRITICAL: `backupDatabase()` returning `null`'), s.indexOf('CRITICAL: const FAST'));
  assert.ok(critical.includes('runIsInert'), 'runIsInert exemption documented');
  assert.ok(critical.includes('!stamp && !RESET_URL &&\n!NO_ROLLBACK_ACK') || critical.includes('!NO_ROLLBACK_ACK'), 'gate condition documented');
  assert.ok(critical.includes('--i-accept-no-db-rollback'), 'escape hatch documented');
  assert.ok(critical.includes('chromium.launch()'), 'abort happens before the browser/sweep');
  assert.ok(critical.includes('sweep/both runs always drain the queue and are never exempt'), 'sweep/both NOT exempt');
  assert.ok(critical.includes('public-surface sweep is NOT exempt'), 'SPA public-surface sweeps deliberately NOT exempt');
});
