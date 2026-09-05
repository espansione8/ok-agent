// DB snapshot/restore behavioral tests, run against REAL temp files.
// Regression being pinned: v2.5's restoreDatabaseBackup deleted the live main
// DB when only the WAL had been backed up — and returned true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, '.build', 'embedded.mjs'), 'utf8');

const buildRestore = (dbPath, backupDir) => {
  const fnSrc = src.match(/function restoreDatabaseBackup\(stamp\) \{[\s\S]*?\n\}/)[0];
  // MANAGE_DEV_SERVER=true mirrors the default run: restore must proceed
  // (the v2.8 --no-manage skip is exercised separately below).
  const fn = new Function('DB_PATH', 'BACKUP_DIR', 'MANAGE_DEV_SERVER', 'existsSync', 'copyFileSync', 'rmSync', 'path', 'console', fnSrc + '; return restoreDatabaseBackup;');
  // The factory's parameters ARE the closure's DB_PATH/BACKUP_DIR — real
  // values must be bound here, not placeholders.
  return fn(dbPath, backupDir, true, existsSync, copyFileSync, rmSync, path, console);
};

test('restore REFUSES when main DB backup is missing (live files untouched)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sr-restore-guard-'));
  const backupDir = join(tmp, 'backups');
  const dbPath = join(tmp, 'app.db');
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(dbPath, 'LIVE-DB');
  writeFileSync(dbPath + '-wal', 'LIVE-WAL');
  writeFileSync(dbPath + '-shm', 'LIVE-SHM');
  writeFileSync(join(backupDir, 'S.app.db-wal'), 'OLD-WAL'); // WAL backed up, MAIN missing

  const result = buildRestore(dbPath, backupDir)('S');
  assert.equal(result, false, 'must refuse instead of "succeeding"');
  assert.equal(readFileSync(dbPath, 'utf8'), 'LIVE-DB', 'live main DB must be untouched');
  assert.equal(readFileSync(dbPath + '-wal', 'utf8'), 'LIVE-WAL', 'live WAL must be untouched');
  assert.ok(existsSync(dbPath + '-shm'), 'live SHM must be untouched');
  rmSync(tmp, { recursive: true, force: true });
});

test('restore succeeds with a complete backup', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sr-restore-ok-'));
  const backupDir = join(tmp, 'backups');
  const dbPath = join(tmp, 'app.db');
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(dbPath, 'LIVE-DB');
  writeFileSync(dbPath + '-wal', 'LIVE-WAL');
  writeFileSync(join(backupDir, 'S.app.db'), 'SNAP-DB');
  writeFileSync(join(backupDir, 'S.app.db-wal'), 'SNAP-WAL');

  const result = buildRestore(dbPath, backupDir)('S');
  assert.equal(result, true);
  assert.equal(readFileSync(dbPath, 'utf8'), 'SNAP-DB', 'main DB restored');
  assert.equal(readFileSync(dbPath + '-wal', 'utf8'), 'SNAP-WAL', 'WAL restored');
  rmSync(tmp, { recursive: true, force: true });
});

test('backupDatabase stamp has seconds+random precision and self-verifies', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sr-backup-'));
  const backupDir = join(tmp, 'backups');
  const dbPath = join(tmp, 'app.db');
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(dbPath, 'DB1');
  const fnSrc = src.match(/function backupDatabase\((dbKind)?\) \{[\s\S]*?\n\}/)[0];
  const fn = new Function('SKIP_BACKUP', 'DB_PATH', 'BACKUP_DIR', 'MANAGE_DEV_SERVER', 'existsSync', 'mkdirSync', 'copyFileSync', 'path', 'console', 'Math', 'Date', fnSrc + '; return backupDatabase();');
  const stamp = fn(false, dbPath, backupDir, true, existsSync, mkdirSync, copyFileSync, path, console, Math, Date);
  assert.ok(stamp && stamp.length > 14 && stamp.includes('-'), 'stamp must carry sub-minute precision, got: ' + stamp);
  const files = readdirSync(backupDir);
  assert.equal(files.length, 1);
  assert.ok(files[0].startsWith(stamp), 'snapshot written under the stamp');
  rmSync(tmp, { recursive: true, force: true });
});

test('v2.9.3: backupDatabase warns dbKind-aware — remote ≠ misleading "file missing (null)"', () => {
  const fnSrc = src.match(/function backupDatabase\((dbKind)?\) \{[\s\S]*?\n\}/)[0];
  const logs = [];
  const con = { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) };
  const fn = new Function('SKIP_BACKUP', 'DB_PATH', 'BACKUP_DIR', 'MANAGE_DEV_SERVER', 'existsSync', 'mkdirSync', 'copyFileSync', 'path', 'console', 'Math', 'Date', fnSrc + '; return backupDatabase;');
  // remote + no file: the A6 'remote' kind must get the specific warning,
  // NOT the old 'file missing (null)' line that blamed the operator's flag.
  const res = fn(false, null, 'plan/replay/db-backups', true, () => false, mkdirSync, copyFileSync, path, con, Math, Date)('remote');
  assert.equal(res, null);
  assert.ok(logs.some((l) => l.includes('remote/non-file') && !l.includes('file missing (null)')),
    'remote DB must get the kind-aware warning, got: ' + JSON.stringify(logs));
  // sqlite-file keeps the honest path error (an actual misconfiguration).
  logs.length = 0;
  const res2 = fn(false, '/nope/app.db', 'plan/replay/db-backups', true, () => false, mkdirSync, copyFileSync, path, con, Math, Date)('sqlite-file');
  assert.equal(res2, null);
  assert.ok(logs.some((l) => l.includes('file missing (/nope/app.db)')),
    'sqlite-file must keep the honest --db-path error, got: ' + JSON.stringify(logs));
});
