// svelte-replay — REUSABLE GENERATOR (v2.9.4)
// Point it at any SvelteKit app or plain Svelte SPA; it does Phase A (static
// scan) + Phase B (emit plan/replay/replay-all.mjs) with no hand-written
// per-app generator. SKILL.md §1–§7 is the spec; this script implements it.
//
// Usage (run from the TARGET app's root):
//   node <skill>/scripts/generate.mjs --base-url http://localhost:5173 \
//        [--user u --pass p] [--no-login] [--db-path data/app.db] \
//        [--routes /a,/b/:id] [--param name=value]...
// Unknown flags and positional args are hard errors (exit 2) — a stale
// --project or a typo must not silently fall through to defaults.
// Then run the three gates the script prints.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = join(HERE, '..', 'SKILL.md');
const CWD = process.cwd();

// ---------------- CLI ----------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes('--' + f);
const val = (f, d = null) => {
  const i = argv.indexOf('--' + f);
  if (i === -1) return d;
  const v = argv[i + 1];
  if (v == null || v.startsWith('--')) throw new Error(`--${f} needs a value`);
  return v;
};
const list = (f) => {
  const out = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--' + f) out.push(argv[i + 1]);
  return out.filter(Boolean);
};
// v2.9.3 STRICT CLI + --help: unknown flags / stray positionals were silently
// ignored (a stale --project ran the DEFAULT scan with the wrong intent, no
// warning). Validate argv against the fixed table BEFORE any flag takes effect
// and print usage when --help is anywhere on the line (help wins, same as the
// emitted replay script). Arity 0 = boolean; 1 = takes exactly one value token
// (repeatables like --routes/--param take one token per occurrence). Keep this
// in sync with printUsage() and SKILL.md §3.
const GEN_FLAG_ARITY = {
  'help': 0, 'no-login': 0, 'hash-routes': 0,
  'base-url': 1, 'user': 1, 'pass': 1, 'db-path': 1, 'after-login': 1,
  'company-hub': 1, 'app-name': 1, 'routes': 1, 'param': 1,
};
function printUsage() {
  console.log(`svelte-replay generator — run from the TARGET app's root
  node ${process.argv[1]} --base-url http://localhost:5173 [options]
Options:
  --help                print this usage and exit 0 (wins over other flags)
  --base-url URL        dev server URL (default http://localhost:5173; baked into the emitted script)
  --hash-routes         app is a hash-routed SPA — bake '#/route' navigation (also overridable at run time)
  --user U --pass P     login credentials (baked as hints; real creds are passed at run time)
  --no-login            skip the login phase entirely (public surface only; baked)
  --db-path PATH        SQLite DB file for snapshot/restore (omit: no DB roll-back; also overridable at run time)
  --after-login PATH    route reached after login (default /home; baked)
  --company-hub PATH    entity-hub route for resolveParam (default /companies; '' = none; baked)
  --routes /a,/b/:id    SPA mode: explicit route list (merged with the source scan; baked)
  --param name=value    seed resolveParam overrides (repeatable; also overridable at run time)
  --app-name NAME       label for the manifest (default: folder name)
Unknown flags and positional args are rejected with exit code 2 —
--project (removed: run from the app root, no project path exists) and
--nav-tree-legacy (removed: never implemented) are called out by name.`);
}
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--help') { printUsage(); process.exit(0); }   // help wins
  const t = argv[i];
  if (!t.startsWith('--')) {
    const prev = argv[i - 1];
    if (!(prev && prev.startsWith('--') && GEN_FLAG_ARITY[prev.slice(2)] === 1)) {
      console.error(`✗ unexpected positional argument "${t}" — this generator takes flags only (run with --help)`);
      process.exit(2);
    }
    continue;
  }
  const name = t.slice(2);
  if (!(name in GEN_FLAG_ARITY)) {
    console.error(name === 'project'
      ? '✗ --project was REMOVED: this generator is run FROM the target app\'s root (cd <app> && node <skill>/scripts/generate.mjs) — there is no project-path flag'
      : name === 'nav-tree-legacy'
        ? '✗ --nav-tree-legacy was REMOVED: it was documented but never implemented (NAV_TREE scanning always runs) — see --help for the accepted flags'
        : `✗ unknown flag --${name} — stale or typo'd flags are NOT silently ignored (exit code 2). See --help.`);
    process.exit(2);
  }
  if (GEN_FLAG_ARITY[name] === 1 && (argv[i + 1] == null || argv[i + 1].startsWith('--'))) {
    console.error(`✗ --${name} needs a value (next argument missing or looks like a flag)`);
    process.exit(2);
  }
}

const BASE_URL = val('base-url', 'http://localhost:5173').replace(/\/$/, '');
const USER = val('user');
const PASS = val('pass');
const NO_LOGIN = has('no-login');
const DB_PATH = val('db-path');
const AFTER_LOGIN = val('after-login', '/home');
// Windows Git Bash (MSYS2) rewrites leading-slash args into Windows paths:
// `--after-login /` silently arrives as `C:/Program Files/Git/` and the
// login wait can never match it (reproduced: login succeeded every attempt
// while the target was a filesystem path). Route values must look like
// routes — fail loudly at generation, not confusingly at sweep time.
const assertRoute = (flag, value, allowEmpty = false) => {
  if (allowEmpty && value === '') return value;
  if (!/^[#/~.]/.test(value) || /[A-Za-z]:\//.test(value))
    throw new Error(`--${flag} must be an app route (start with / or #), got: "${value}". On Git Bash, MSYS2 rewrites leading-slash args into Windows paths (even after a '#') — prefix the command with MSYS_NO_PATHCONV=1.`);
  return value;
};
assertRoute('after-login', AFTER_LOGIN, true);
const HASH_ROUTES = has('hash-routes');   // app is a hash-routed SPA (svelte-spa-router etc.)
const COMPANY_HUB = val('company-hub', '/companies');
assertRoute('company-hub', COMPANY_HUB, true);
for (const r of list('routes')) for (const part of r.split(',')) if (part.trim()) assertRoute('routes', part.trim());
// v2.9.4: --param seeds resolveParam (baked into manifest.params below) — a
// token without '=' is a typo, not an empty override.
for (const t of list('param')) if (!t.includes('=')) { console.error(`✗ invalid --param "${t}" (expected name=value)`); process.exit(2); }
const PARAMS = list('param').map((s) => { const [k, ...v] = s.split('='); return [k, v.join('=')]; });
const APP_NAME = val('app-name', CWD.split(sep).pop());

if (!CWD || !existsSync(join(CWD, 'package.json'))) { printUsage(); process.exit(1); }

// ---------------- walkers (needed by mode detection itself) ----------------
const walk = (dir, exts, acc = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.svelte-kit' || e.name === 'plan' || e.name.startsWith('.')) continue;
      walk(p, exts, acc);
    } else if (exts.some((x) => e.name.endsWith(x))) acc.push(p);
  }
  return acc;
};
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

// ---------------- MODE DETECTION (§1) ----------------
// A plain Svelte SPA may organize pages under src/routes/ too (just without
// +page.svelte conventions), so "src/routes exists" alone is NOT proof of
// SvelteKit. SvelteKit is decided by +page.svelte files (or a svelte.config
// with kit.fields); everything else with a src/main.* entry is SPA mode.
const hasKitPages = (() => {
  if (!existsSync(join(CWD, 'src', 'routes'))) return false;
  return walk(join(CWD, 'src', 'routes'), ['+page.svelte', '+page.ts', '+page.js', '+layout.svelte']).length > 0;
})();
const isKit = hasKitPages || existsSync(join(CWD, 'svelte.config.js'));
const isSpa = !isKit && (existsSync(join(CWD, 'src', 'main.js')) || existsSync(join(CWD, 'src', 'main.ts')));
if (!isKit && !isSpa) {
  console.error('✗ Neither src/routes/**/+page.svelte (SvelteKit) nor src/app.html + src/main.* (Svelte SPA) found — not a Svelte/SvelteKit app root?');
  process.exit(1);
}
const MODE = isKit ? 'sveltekit' : 'spa';
console.log(`▶ scan mode: ${MODE}`);

// ---------------- A1: SvelteKit routes ----------------
// v2.9.2 URL CONVERSION (shared by kitRoutes + kitActions): turns a
// src/routes-relative path into the URL SvelteKit actually serves. Syntax
// that never appears in the URL is stripped BEFORE param conversion:
//  (a) route-group folders — any segment starting with '(' (e.g. '(app)',
//      '(app)@en') scopes +layout.svelte only: '/(app)/dashboard/+page.svelte'
//      is URL '/dashboard'. The old code left literal '(app)' in the URL and
//      404'd on every route behind an auth layout — i.e. almost any app with
//      the login flow this skill targets;
//  (b) param matcher suffixes — '[id=integer]' → '[id]': matchers validate
//      at compile time, they are not part of the param name;
//  then [p] → :p, [...p] → *p, [[p]] → :p. Optional [[p]] additionally
//  registers the param-less twin so BOTH forms get swept.
const fileRouteUrls = (r) => {
  const segs = r.split('/').filter(Boolean);
  const optional = [];
  const conv = (s) => {
    if (s.startsWith('(')) return null;                       // (a) route group — never in the URL
    const m = s.match(/^(\[+)([^=\]]+)(=[^\]]*)?(\]+)$/);
    if (!m) return s;
    const inner = m[2];                                       // (b) =matcherName already excluded
    if (m[4] === ']]') optional.push(':' + inner);            //     optional [[p]] — twin route below
    if (m[1] === '[' && inner.startsWith('...')) return '*' + inner.slice(3);
    return ':' + inner;
  };
  const main = segs.map(conv).filter(Boolean);
  const urls = new Set(['/' + main.join('/')]);
  for (const p of optional) {                                 // '/x/[[p]]' is ALSO '/x' — sweep both
    urls.add('/' + main.filter((s) => s !== p).join('/'));
  }
  return [...urls];
};
const kitRoutes = () => {
  const routesDir = join(CWD, 'src', 'routes');
  const acc = [];
  walk(routesDir, ['+page.svelte'], acc);
  const routes = [];
  for (const f of acc) {
    const r = '/' + relative(routesDir, f).split(sep).join('/').replace(/\/\+page\.svelte$/, '');
    for (const u of fileRouteUrls(r)) routes.push(u);
  }
  return [...new Set(routes)];
};

// ---------------- A1b: SPA routes (source scan) ----------------
const spaRoutes = () => {
  const files = walk(join(CWD, 'src'), ['.svelte', '.js', '.ts']);
  const found = new Set();
  const ROUTE_RE = /['"`](\/[a-zA-Z0-9_\-/:.[\]]*)['"`]/g;   // /-leading, no spaces, no ${}
  for (const f of files) {
    const src = read(f);
    const isRouterFile = /svelte-spa-router|svelte-routing/.test(src);
    for (const m of src.matchAll(ROUTE_RE)) {
      const s = m[1];
      if (/\s|\$\{/.test(s)) continue;                        // interpolation/space → not a route literal
      const idx = m.index ?? 0;
      const before = src.slice(Math.max(0, idx - 80), idx);
      const after = src.slice(idx + s.length + 2, idx + s.length + 10);
      const ctxRe = /(href|to|navigate|goto|pushState|replaceState|route|path)\s*[:=(,]?\s*$/;
      // (a) router route-table entries: '/x': Component  (quote, colon, identifier)
      // (b) router API/navigation calls: navigate('/x') / replace('/x') / href="#/x"
      const routeTableEntry = /^\s*:\s*(?:[A-Za-z_$][\w$]*|import\()/.test(after);
      const apiCall = ctxRe.test(before);
      const hashHref = isRouterFile && /href="?\s*$/.test(before);
      if (!routeTableEntry && !apiCall && !hashHref) continue;
      if (/\.(css|js|ts|png|svg|ico|json|webmanifest|map|woff2?)$/.test(s)) continue;   // asset paths
      if (s.startsWith('/api/')) continue;                     // backend endpoints, not SPA routes
      found.add(s);
    }
  }
  for (const r of list('routes')) for (const part of r.split(',')) if (part.trim()) found.add(part.trim());
  // collapse: keep the most specific form of each prefix path
  const arr = [...found].filter((r) => r.startsWith('/') && !r.includes(' '));
  return [...new Set(arr)].sort();
};

// ---------------- A2/A3: SvelteKit actions/endpoints ----------------
const kitActions = () => {
  const out = {};
  if (!isKit) return out;
  const acc = [];
  walk(join(CWD, 'src', 'routes'), ['+page.server.ts', '+page.server.js'], acc);
  for (const f of acc) {
    const m = read(f).match(/export const actions\s*=\s*\{([\s\S]*?)\n\};/);
    if (!m) continue;
    const names = [...m[1].matchAll(/(?:^|[\s,{])(\w+)\s*:\s*async|([\s\S]*?)default/g)]
      .map((x) => x[1]).filter(Boolean);
    const named = [...m[1].matchAll(/^\s{2,}(\w+)\s*:/gm)].map((x) => x[1]);
    const all = [...new Set([...names, ...named])].slice(0, 20);
    if (all.length) {
      const r = '/' + relative(join(CWD, 'src', 'routes'), dirname(f)).split(sep).join('/');
      out[fileRouteUrls(r)[0]] = all;      // actions key = main URL form (groups/matchers stripped)
    }
  }
  return out;
};

// ---------------- A4: login ----------------
const scanLogin = () => {
  if (NO_LOGIN) return null;
  // v2.9.1: scan order matters — some OTHER page mentioning "login" (e.g. a
  // register/profile page with real type=email inputs) must not shadow the
  // actual login page (whose email input may be type=text with id=login-email).
  // Prefer files whose PATH is login-shaped, then fall back to any file whose
  // CONTENT mentions login/sign-in (found live on saftbg: wrong page won and
  // the generated selectors never matched).
  const files = walk(join(CWD, 'src'), ['.svelte']);
  const loginShaped = files.filter((f) => /log-?in|sign-?in/i.test(f));
  const srcs = (loginShaped.length ? loginShaped : files).map(read);
  for (const src of srcs) {
    const isLogin = /log\s?in|sign\s?in/i.test(src);
    if (!isLogin) continue;
    const ids = [...src.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const types = [...src.matchAll(/type="([^"]+)"/g)].map((m) => m[1]);
    // v2.9.1: the type-fallback is a full ATTRIBUTE selector — it must NOT
    // get a '#' prefix (emitted '#input[type=email]' before; found live on
    // saftbg whose login email input is type="text", so only the fallback
    // existed and every login type() timed out). Prefer the id; fall back
    // to the bare attribute selector, then a name-attribute selector.
    const emailSel = (ids.find((id) => /mail|user/i.test(id)) ? '#' + ids.find((id) => /mail|user/i.test(id)) : null)
      ?? (types.includes('email') ? 'input[type=email]' : null)
      ?? (src.match(/name="([^"]*(?:mail|user)[^"]*)"/i) ? `[name="${src.match(/name="([^"]*(?:mail|user)[^"]*)"/i)[1]}"]` : null);
    const passSel = (ids.find((id) => /pass/i.test(id)) ? '#' + ids.find((id) => /pass/i.test(id)) : null)
      ?? (types.includes('password') ? 'input[type=password]' : null)
      ?? (src.match(/name="([^"]*pass[^"]*)"/i) ? `[name="${src.match(/name="([^"]*pass[^"]*)"/i)[1]}"]` : null);
    if (emailSel && passSel) {
      const routeM = src.match(/['"`](\/[\w-]*log[\w-]*)['"`]/i);
      return {
        route: routeM?.[1] ?? '/login',
        user: emailSel, pass: passSel,
        submit: 'button[type=submit]',
      };
    }
  }
  return null;   // no login flow → generated main() skips it (§1 A4)
};

// ---------------- A5: NAV_TREE (header/nav/menu/sidebar scan) ----------------
// v2.9.4 PARENT GROUPS: the old scan only filled tree[''], so sweepRoute()'s
// dropdown loop and nav()'s parent-hover never ran on generated output.
// Parent groups come from three GENERIC patterns (best-effort regex — Svelte
// is not parsed; anything else yields top-level links only, hand-extend
// NAV_TREE for exotic menus): (a) native <details><summary> groups,
// (b) dropdown menus (a role="button"/tabindex label preceding a
// .dropdown-content link list), (c) nested <li>Label<ul> lists.
const scanNav = () => {
  const tree = { '': [] };
  const navFiles = walk(join(CWD, 'src'), ['.svelte']).filter((f) => /nav|header|menu|sidebar/i.test(f));
  const linksIn = (html) => [...html.matchAll(/<a[^>]+href="(\/[^"]*)"[^>]*>([^<]{1,40})</g)]
    .map((m) => ({ label: m[2].trim().slice(0, 30) || m[1], href: m[1] }));
  const addParent = (label, html) => {
    const name = String(label ?? '').replace(/\{[^}]*\}/g, '').trim().slice(0, 30);
    const links = linksIn(html);
    if (!name || !links.length) return;
    if (!tree[name] && Object.keys(tree).length > 25) return;   // bounded: scan, not parse
    tree[name] = [...(tree[name] ?? []), ...links].slice(0, 30);
  };
  for (const f of navFiles) {
    const src = read(f);
    for (const m of src.matchAll(/<details[^>]*>\s*<summary[^>]*>([^<]{1,40}?)<\/summary>([\s\S]*?)<\/details>/gi))
      addParent(m[1], m[2]);
    for (const m of src.matchAll(/<(ul|div)[^>]*class="[^"]*dropdown-content[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const before = src.slice(Math.max(0, m.index - 800), m.index);
      const lm = [...before.matchAll(/<(div|span|label|button)[^>]*(role="button"|tabindex="0")[^>]*>([^<>{}]{1,40}?)<\/\1>/gi)].pop();
      if (lm) addParent(lm[3], m[2]);
    }
    for (const m of src.matchAll(/<li[^>]*>\s*([^<>{}]{1,40}?)\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi))
      addParent(m[1], m[2]);
    for (const l of linksIn(src)) tree[''].push(l);
  }
  return tree;
};

// ---------------- A6: DB (v2.9.2: dbKind tagging) ----------------
const scanDb = () => {
  const acc = [
    ...walk(join(CWD, 'src'), ['.ts', '.js']),
    // A6 also scans root-level server/entry files (common place for the sqlite
    // handle in SPA setups: server.mjs, db.mjs, …) — skipping build output.
    ...walk(CWD, ['.mjs', '.cjs']).concat(walk(CWD, ['.js', '.ts']).filter((f) => {
      const rel = f.slice(CWD.length + 1);
      return !rel.includes('node_modules') && !rel.startsWith('plan/') && !rel.startsWith('dist/');
    })),
  ];
  // guess: a local SQLite file path (CLI --db-path wins; else mined from source).
  let guess = DB_PATH ? DB_PATH.replace(/\\/g, '/') : null;
  if (!guess) {
    for (const f of acc) {
      const src = read(f);
      for (const m of src.matchAll(/['"`]([\w./-]+\.(?:db|sqlite))['"`]/g)) {
        if (!m[1].includes('node_modules')) { guess = m[1]; break; }
      }
      if (guess) break;
    }
  }
  // kind: local file beats remote detection beats unknown. A remote/non-file
  // DB (Turso/libSQL, Postgres, MySQL, Mongo) means there IS no file to
  // snapshot — the emitted script's no-rollback gate (§7) must say so
  // specifically instead of the generic '--db-path file missing' warning.
  let kind = guess ? 'sqlite-file' : 'unknown';
  if (!guess) {
    const REMOTE_RE = /@libsql\/client|libsql:|TURSO_DATABASE_URL|TURSO_AUTH_TOKEN|\bpostgres\b|\bpg\b|postgres:\/\/|postgresql:\/\/|mysql2|\bmongodb\b|\bmongoose\b/;
    for (const f of acc) if (REMOTE_RE.test(read(f))) { kind = 'remote'; break; }
  }
  return { guess, kind };
};

// ---------------- assemble MANIFEST ----------------
const routes = isKit ? kitRoutes() : spaRoutes();
if (!routes.length) { console.error('✗ no routes discovered (SPA apps: pass --routes /a,/b)'); process.exit(1); }
const login = scanLogin();
const nav = scanNav();
const dbScan = scanDb();
const dbGuess = dbScan.guess;   // kept as a bare path for CLI prints/baking
const actions = kitActions();

const manifestObj = {
  app: APP_NAME + ` — ${MODE === 'sveltekit' ? 'SvelteKit' : 'Svelte SPA'} (scanned by svelte-replay v2.9.4 generator)`,
  generated: new Date().toISOString().slice(0, 10),
  baseURL: BASE_URL,
  mode: MODE,
  login,
  noLogin: NO_LOGIN || !login,
  afterLogin: login ? AFTER_LOGIN : null,
  companyHub: COMPANY_HUB || null,
  navbar: Object.keys(nav['']).length ? 'header/nav links found' : 'none found — route-level sweep carries coverage',
  db: { guess: dbGuess, kind: dbScan.kind, wal: !!dbGuess },   // kind: sqlite-file | remote | unknown
  routes,
  actions,
  params: Object.fromEntries(PARAMS),   // v2.9.4: scan-time --param seeds PARAM_OVERRIDES (run-time wins)
  advisory: { note: 'advisory only — the sweep discovers interactive density at runtime' },
};
mkdirSync(join(CWD, 'plan', 'replay'), { recursive: true });
writeFileSync(join(CWD, 'plan', 'replay', 'manifest.json'), JSON.stringify(manifestObj, null, 2));

// ---------------- Phase B: emit replay-all.mjs ----------------
const skill = readFileSync(SKILL_PATH, 'utf8');
const lines = skill.split('\n');
const find = (needle) => {
  const i = lines.findIndex((l) => l.includes(needle));
  if (i === -1) throw new Error('SKILL.md marker not found: ' + needle + ' — section layout drifted, update scripts/generate.mjs');
  return i;
};
const a = find('// §4.1 — imports + CLI') + 1;
const sweep = find('5. SWEEP (v2.1: batched census');
const b = sweep - 2, c = sweep + 2;
const d = find('6. PARAM RESOLUTION + WARM-UP') - 2;
const e = find('// §6.1 — resolveParam (embedded') + 1;
const f = find('concreteRoutes = every static (param-less) manifest route');

const manifestSrc = `
\
const MANIFEST = ${JSON.stringify(manifestObj, null, 2)};
const NAV_TREE = ${JSON.stringify(nav)};
const PARTS = [];
`;const mainSrc = `
\
// ============================== §7 main() ==============================
if (UNTIL_ARG != null && !Number.isFinite(parseInt(UNTIL_ARG, 10))) { console.error('✗ invalid --until "' + UNTIL_ARG + '" (expected a number)'); process.exit(2); }
const UNTIL = UNTIL_ARG != null ? parseInt(UNTIL_ARG, 10) : PARTS.length;
const EXCLUDE_ROUTES = ['', '/login', '/register', '/forgot-password', '/pay/:token'];

function selfTest() {
  const missing = [];
  for (const fn of [glide, click, type, fill, pickSelect, pickSelectContains, toast, census, probe,
    sweepRoute, nav, backupDatabase, restoreDatabaseBackup, resetViaForm, fingerprint, center,
    settleHydration, waitToastClear, openModalCancel, shot, writeCoverage, resolveParam,
    startDevServer, stopDevServer, wirePageGuards, navHoverLoc, closeModal, resolveFresh])
    if (typeof fn !== 'function') missing.push(fn.name || String(fn));
  if (!CURSOR_JS.includes('replay-cursor')) missing.push('CURSOR_JS:replay-cursor');
  if (!CURSOR_JS.includes('rc-pulse')) missing.push('CURSOR_JS:rc-pulse');
  if (!CURSOR_JS.includes('adoptedStyleSheets')) missing.push('CURSOR_JS:adoptedStyleSheets');
  if (CLICKABLE.length < 10) missing.push('CLICKABLE.length>=10');
  for (const h of [click, type, fill, pickSelect, pickSelectContains])
    if (!h.toString().includes('glide(')) missing.push('glide-guarantee:' + h.name);
  if (!census.toString().includes('data-replay-cid')) missing.push('census:data-replay-cid');
  if (!census.toString().includes('cidBase')) missing.push('census:cidBase (cross-pass ids)');
  if (!census.toString().includes('scope')) missing.push('census:scope (modal/dropdown/page)');
  if (!restoreDatabaseBackup.toString().includes('REFUSING TO RESTORE')) missing.push('restore:verify-guard');
  if (!backupDatabase.toString().includes('slice(0, 14)')) missing.push('backup:stamp-precision');
  if (!backupDatabase.toString().includes('dbKind')) missing.push('backup:dbKind-aware-warning');
  if (!main.toString().includes('i-accept-no-db-rollback')) missing.push('main:no-rollback-gate');
  if (!main.toString().includes('runIsInert')) missing.push('main:scripted-inert-exemption');
  if (!teardown.toString().includes('Promise.race')) missing.push('teardown:watchdog-race');
  if (DESTRUCTIVE.test('Cancel')) missing.push('destructive:bare-cancel-must-stay-sweepable');
  console.log(missing.length ? '✗ SELFTEST FAIL — missing: ' + missing.join(', ') : '✓ SELFTEST PASS');
  process.exitCode = missing.length ? 1 : 0;
}

async function main() {
  if (SELFTEST) { selfTest(); return; }
  const report = [];
  // §7 v2.8.4 BACKUP BRACKET + v2.9.3 QUIESCE GATE: first startDevServer()
  // IS the port preflight (aborts if a foreign server owns BASE_URL); then
  // quiesce → copy → start. stopDevServer() returns true ONLY when the
  // child's exit was CONFIRMED — if it survived force-kill there is no safe
  // snapshot, and sweeping with no way back is what the gate below forbids.
  await startDevServer();
  const quiesced = await stopDevServer();
  if (!quiesced) {
    console.error('✗ cannot quiesce the dev server — ABORTING before any sweep mutation (no safe snapshot is possible)');
    process.exit(1);
  }
  // v2.9.3: dbKind is hoisted BEFORE the backup so backupDatabase() can print
  // the dbKind-aware no-file warning (remote DB ≠ misleading 'file missing').
  const dbKind = MANIFEST.db?.kind ?? 'unknown';
  const stamp = backupDatabase(dbKind);
  await startDevServer();
  // §7 v2.9.2 NO-ROLLBACK GATE: backupDatabase() null means this run has no
  // way back (remote/non-file DB, --skip-backup, --no-manage-dev-server, or
  // a missing file). Refuse to launch the exhaustive click/submit sweep
  // unless the operator supplied a --reset-url or acknowledged with
  // --i-accept-no-db-rollback — the dev server stays up either way.
  // v2.9.3 GATE SCOPE: runIsInert = an authored --mode scripted run, which
  // (see the MODE gate below) NEVER drains the route queue — it fires only
  // the hand-written PARTS (+ login), so the exhaustive-sweep rationale
  // doesn't apply. sweep/both always drain the queue; a logged-out SPA
  // public-surface sweep is deliberately NOT exempt (public forms mutate
  // remote data with no file to snapshot).
  const runIsInert = MODE_RUN === 'scripted';
  if (!runIsInert && !stamp && !RESET_URL && !NO_ROLLBACK_ACK) {
    console.error('✗ ABORT: no DB snapshot could be taken (' +
      (dbKind === 'remote' ? "the app's database is remote/non-file (Turso/libSQL, Postgres, MySQL, Mongo…) — there is no local file to snapshot"
        : dbKind === 'sqlite-file' ? 'the local SQLite file backup failed, was skipped, or the file is missing'
        : 'no local SQLite file was found (--db-path)') +
      ') and no --reset-url was given. The sweep is about to submit forms ' +
      'and fire every +page.server.ts action it finds, with no automatic ' +
      'way to undo it. Either point --db-path at the local SQLite file the ' +
      'dev server actually uses, pass --reset-url to a route that restores ' +
      'known-good data, run this against a disposable copy/branch of the ' +
      'database instead of one you care about, or pass ' +
      '--i-accept-no-db-rollback to proceed anyway.');
    process.exitCode = 1; process.exit(1);
  }
  console.log('DB snapshot stamp:', stamp);
  process.on('SIGINT', () => {
    (async () => {
      try {
        const quiesced = await stopDevServer();
        if (quiesced) restoreDatabaseBackup(stamp);   // never restore over a live DB handle
        await startDevServer();
      } catch (e) { console.error('SIGINT rollback failed:', e?.message ?? e); }
      finally { process.exit(130); }
    })();
  });

  let browser, page;
  try {
    browser = await chromium.launch({ headless: HEADLESS });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(CURSOR_JS);
    page = await context.newPage();
    wirePageGuards(page);
    page.on('response', async (r) => {
      if (r.request().method() !== 'POST') return;
      try { const body = await r.json(); if (body && body.type === 'failure') console.log('      ⚠ action failure:', JSON.stringify(body).slice(0, 200)); } catch {}
    });
    page.on('console', (m) => { if (m.text().startsWith('[debug-')) console.log('      [console]', m.text()); });

    // ---- LOGIN (skipped entirely when the app has none / --no-login) ----
    const afterLoginPath = ${JSON.stringify(manifestObj.afterLogin)};
    if (${JSON.stringify(manifestObj.noLogin)} || !MANIFEST.login) {
      console.log('      ℹ no login flow (MANIFEST.login null / --no-login) — sweeping the public surface');
    } else {
      PHASE = 'login';
      const loginUrl = toAppUrl(MANIFEST.login.route ?? '/login');
      await page.goto(BASE_URL + loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await settleHydration(page);
      let logged = false;
      for (let attempt = 1; attempt <= 3 && !logged; attempt++) {
        try {
          await type(page, page.locator(MANIFEST.login.user), USER, 'email');
          await type(page, page.locator(MANIFEST.login.pass), PASS, 'password');
          await click(page, page.locator(MANIFEST.login.submit).first(), 'submit');
          // v2.9 login-wait: waitForURL is the wrong tool for hash SPAs —
          // the redirect may land during click()'s trailing sleeps (a future-
          // navigation-only wait then times out despite success), and hash-
          // only transitions don't reliably fire its navigation predicate.
          // Compare ROUTE KEYS (fragment for hash apps, pathname+search for
          // path apps — 'host#/' vs 'host/#/' are one location) in a plain
          // polling loop instead. Handles the already-landed case for free.
          const wantRoute = String(afterLoginPath).replace(/^#/, '');
          const routeKey = (u) => { const x = new URL(u); return HASH_ROUTES ? (x.hash || '#/').replace(/^#/, '') : (x.pathname + x.search); };
          for (let waited = 0; waited < 10000 && routeKey(page.url()) !== wantRoute; waited += 250) await sleep(250);
          if (routeKey(page.url()) !== wantRoute) throw new Error('login redirect never landed (still ' + page.url() + ')');
          logged = true;
        } catch (e) {
          // Always include the failure reason + current URL: "login failed"
          // alone is undebuggable (bad creds? validation-blocked submit?
          // redirect wait?). These three cover the real-world causes.
          console.log(\`      ⚠ login attempt \${attempt} failed — retrying: \${String(e?.message ?? e).split('\\n')[0].slice(0, 140)} [url=\${page.url()}]\`);
          await page.goto(BASE_URL + loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        }
      }
      if (!logged) throw new Error('login failed after 3 attempts');
      console.log('      ✓ logged in as', USER);
    }

    // v2.9.3 MODE GATE: '--mode scripted' is an AUTHORED-PARTS-ONLY run — the
    // exhaustive warm-up + route-queue drain below belongs to sweep/both. The
    // old emitted main() drained the queue in EVERY mode, firing the whole
    // app behind the operator's back and forcing the no-rollback gate onto
    // recordings that never sweep; runIsInert (above) keys off this gate.
    if (MODE_RUN === 'scripted') {
      console.log('      ℹ --mode scripted: authored PARTS only — the exhaustive route sweep is skipped');
    } else {
      // ---- SEED ROUTE QUEUE ----
      routeQueue.clear();
      for (const r of MANIFEST.routes) {
        if (EXCLUDE_ROUTES.includes(r)) continue;
        if (!r.includes(':')) { routeQueue.add(r); continue; }
        const filled = await resolveParam(page, r);
        console.log(filled ? \`      [resolve] \${r} → \${filled}\` : \`      [resolve] skipped-unresolvable: \${r}\`);
        if (filled) routeQueue.add(filled);
      }
      const cap = 60;
      const queue = [...routeQueue].slice(0, cap);
      console.log(\`route queue: \${queue.length} route(s) (cap \${cap})\`);

      // ---- WARM-UP (§6, v2.9.3 re-added: SKILL.md §6/§7 specify a warm-up
      // pass BEFORE the crawl to pre-trigger cold SSR compiles, but the
      // re-gated main() had dropped it — the sweep below then paid the
      // compile stall on its first visit to every route. Same queue, same
      // MODE gate: scripted never warms (it never drains). Goto failures are
      // swallowed here; sweepRoute still verifies each route for real.) ----
      PHASE = 'warm-up';
      for (const url of queue) {
        PHASE = 'warm ' + url;
        await page.goto(BASE_URL + toAppUrl(url), { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
        console.log(\`      [warm] \${url}\`);
      }

      // ---- SWEEP ----
      const failHome = afterLoginPath ?? MANIFEST.routes.find((r) => r && r !== '/login') ?? '/';
      for (const url of queue) {
        if (C.clicks >= MAX_CLICKS) { console.log('click budget reached'); break; }
        try {
          PHASE = 'sweep ' + url;
          await sweepRoute(page, url, report);
        } catch (e) {
          console.log(\`      ⚠ sweepRoute(\${url}) failed: \${(e?.message ?? e).split('\\n')[0]}\`);
          report.push({ route: url, sel: '-', text: '-', result: 'route-failed: ' + (e?.message ?? e).split('\\n')[0] });
          await page.goto(BASE_URL + toAppUrl(failHome), { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        }
      }
    }

    if (MODE_RUN !== 'sweep') for (const part of PARTS.slice(FROM, UNTIL)) await part(page, report);
  } catch (e) {
    console.error('FATAL:', e?.stack ?? e);
    process.exitCode = 1;
    try { writeCoverage(report); } catch {}
    let stopped = false;
    try { stopped = await stopDevServer(); } catch {}
    if (stopped) { try { restoreDatabaseBackup(stamp); } catch {} }   // restore only on a CONFIRMED stop
    try { await startDevServer(); } catch {}
    try { await teardown(browser); } catch {}
    return;
  }

  writeCoverage(report);
  const stopped = await stopDevServer();
  const restored = stopped && restoreDatabaseBackup(stamp);   // restore only on a CONFIRMED stop
  await startDevServer();
  const rollback = restored || (await resetViaForm(page)) || 'MANUAL: restore plan/replay/db-backups manually';
  console.log('rollback:', restored ? 'snapshot restored' : rollback);
  await teardown(browser);
}

await main();
`;

const embedded = [
  ...lines.slice(a, b + 1),
  ...lines.slice(c, d + 1),
  ...lines.slice(e, f),
].join('\n')
  .replace(/^if \(!\['sweep', 'scripted', 'both'\]\.includes\(MODE\)\).*\n/m, '')
  .replace(/^const SELFTEST = has\('selftest'\);\s*$/m, '')
  .replace(/^const DEV_READY_PATH/m, "const SELFTEST = has('selftest');\nconst MODE_RUN = MODE;\nconst DEV_READY_PATH")
  // Bake app facts (scan-time --base-url / detected DB path) in as the emitted
  // script's DEFAULTS — run-time flags still win, but a plain `node replay-all.mjs`
  // must not point at some other app on :5173 (the port-preflight would abort,
  // or worse, validate against a foreign server).
  .replace(/val\('base-url', '[^']*'\)/, JSON.stringify(BASE_URL))
  .replace(/process\.env\.DB_PATH \?\? null/, 'process.env.DB_PATH ?? ' + JSON.stringify(dbGuess))
  // Bake hash-routing as an app fact too — forgetting the run-time flag
  // silently disables toAppUrl() and every navigation targets a 404 path.
  .replace(/const HASH_ROUTES = has\('hash-routes'\);/, 'const HASH_ROUTES = ' + JSON.stringify(HASH_ROUTES) + ' || has(\'hash-routes\');');

// v2.9.3: the A6 dbKind is printed prominently at generation time AND baked
// into the emitted header, so a remote/unknown-DB app is flagged BEFORE the
// first run — not when the no-rollback gate fires mid-sweep.
const DB_HEAD = dbScan.kind === 'sqlite-file'
  ? `DB: sqlite-file → ${dbGuess} (snapshot/restore bracketed)`
  : dbScan.kind === 'remote'
    ? '⚠ DB: REMOTE — non-file store (Turso/libSQL/Postgres/MySQL/Mongo…): NO file snapshot exists; sweep runs need --reset-url or --i-accept-no-db-rollback'
    : '⚠ DB: UNKNOWN — no SQLite file found: pass --db-path <file> at runtime for snapshot/restore rollback';
const DB_LINE = dbScan.kind === 'sqlite-file' ? `db: sqlite-file → ${dbGuess}`
  : dbScan.kind === 'remote' ? '⚠ db: REMOTE — non-file store (Turso/libSQL/Postgres/MySQL/Mongo…); no snapshot possible; every run needs --reset-url or --i-accept-no-db-rollback'
  : '⚠ db: UNKNOWN — no SQLite file found; pass --db-path <file> for snapshot/restore rollback';
const script = `\
// plan/replay/replay-all.mjs — generated ${manifestObj.generated} by svelte-replay v2.9.3 scripts/generate.mjs
// Target: ${manifestObj.app}
// Mode: ${MODE}${manifestObj.noLogin ? ' (no login flow — public sweep)' : ' (login: ' + (manifestObj.login?.route ?? '/') + ')'}
// ${DB_HEAD}
// Runbook: node --check → --selftest → 20-click headless smoke → full run.

${manifestSrc}
${embedded}
${mainSrc}
`;

const out = join(CWD, 'plan', 'replay', 'replay-all.mjs');
writeFileSync(out, script);
console.log('✓ manifest  → plan/replay/manifest.json');
console.log('✓ generated → plan/replay/replay-all.mjs (' + script.split('\n').length + ' lines)');
console.log('  mode: ' + MODE + ' | routes: ' + routes.length + (login ? ' | login: ' + login.route : ' | login: none (public sweep)'));
console.log('  ' + DB_LINE);
console.log('\nGates (run from ' + CWD + '):');
console.log('  1. node --check plan/replay/replay-all.mjs');
console.log('  2. node plan/replay/replay-all.mjs --selftest');
console.log('  3. node plan/replay/replay-all.mjs --headless --mode sweep --max-clicks 20' + (dbGuess ? ' --db-path ' + dbGuess : '') + (login ? ' --user <email> --pass <secret>' : '') + (HASH_ROUTES ? '   # hash-routes/base-url/db are baked in already' : ''));
