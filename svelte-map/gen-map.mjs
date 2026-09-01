// Regenerates plan/map.html from plan/spec.json.
// The <style>, <script> and inspector <aside> blocks are reused from the existing
// plan/map.html when present; otherwise they are bootstrapped from the HTML template
// inside the sibling SKILL.md (so this script is self-contained when shipped in the
// svelte-app-map skill folder).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const s = JSON.parse(fs.readFileSync('plan/spec.json', 'utf8'));

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillMd = path.join(scriptDir, 'SKILL.md');
const skillHtml = fs.existsSync(skillMd)
  ? (fs.readFileSync(skillMd, 'utf8').match(/```html\n([\s\S]*?)```/) || [])[1] || null
  : null;

let src;
if (fs.existsSync('plan/map.html')) {
  src = fs.readFileSync('plan/map.html', 'utf8');
} else if (skillHtml) {
  src = skillHtml;
} else {
  console.error('plan/map.html not found and no SKILL.md template beside this script — seed map.html from the SKILL.md template first.');
  process.exit(1);
}

const head = src.match(/<head>[\s\S]*?<\/head>/)[0];
const aside = src.match(/<aside class="insp"[\s\S]*?<\/aside>/)[0];
const js0 = src.match(/<script>[\s\S]*?<\/script>/)[0];

const esc = (v) =>
  String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const terse = (r) => r.terse || r.description.split(/\s+/).slice(0, 6).join(' ');
const dot = (r) =>
  r.dotColor
    ? ` style="background:var(--${r.dotColor});box-shadow:0 0 7px var(--${r.dotColor})"`
    : '';
const accCls = (r) => (r.accent === 'ext' ? 'ext' : 'acc-' + r.accent);
const tagCls = (t) =>
  ({ ADMIN: 'tag-admin', PROTECTED: 'tag-protected', PUBLIC: 'tag-public', AUTH: 'tag-auth', API: 'tag-api', DEV: 'tag-dev' }[t] || '');

function rcard(r) {
  const path = esc(r.path);
  const file = esc(r.file);
  const d = esc(terse(r));
  const meth = esc(r.methods || '');
  const tags = (r.tags || []).map((x) => `<span class="tag ${tagCls(x)}">${esc(x)}</span>`).join('');
  return `<div class="rcard ${accCls(r)}" id="${r.id}" data-route="${path}" data-method="${meth}" data-file="${file}" data-desc="${d}" data-tags="${esc((r.tags || []).join(','))}">
<div class="top"><span class="route">${path}</span><span class="meth">${meth}<i class="dot"${dot(r)}></i></span></div>
<div class="file">${file}</div>
<p class="desc">${d}</p>
<div class="tags">${tags}</div>
</div>`;
}

/* ---- Section 01 ---- */
const byId = Object.fromEntries(s.routes.map((r) => [r.id, r]));
let pageRow = '<div class="topo-row">';
for (const z of s.topology.zones) {
  if (z.kind === 'gate') {
    pageRow += `<div class="gate"><span>${esc(z.label)}</span></div>`;
    continue;
  }
  const hi = z.emphasis ? ' hi' : '';
  if (z.layout === 'stack') {
    pageRow += `<div class="zone${hi}"><span class="zlabel">${esc(z.label)}</span>`;
    (z.columns || []).flat().forEach((id) => { if (byId[id]) pageRow += rcard(byId[id]); });
    pageRow += '</div>';
  } else {
    pageRow += `<div class="zone dash"><span class="zlabel">${esc(z.label)}</span>`;
    (z.columns || []).forEach((col) => {
      pageRow += '<div class="col">';
      col.forEach((id) => { if (byId[id]) pageRow += rcard(byId[id]); });
      pageRow += '</div>';
    });
    pageRow += '</div>';
  }
}
pageRow += '</div>';

const apis = s.routes.filter((r) => r.kind === 'api');
let apiRow = '<div class="topo-row"><div class="zone dash"><span class="zlabel">api rails</span>';
for (let i = 0; i < apis.length; i += 10) {
  apiRow += '<div class="col">';
  apis.slice(i, i + 10).forEach((r) => (apiRow += rcard(r)));
  apiRow += '</div>';
}
apiRow += '</div></div>';

/* ---- Section 02 ---- */
const comps = s.components
  .map((c) => {
    const dorm = c.status !== 'live';
    return `<div class="ccard${dorm ? ' dorm' : ''}"><span class="pill">${dorm ? 'DORMANT' : 'LIVE'}</span><div class="cid">${esc(c.id)}</div><div class="cname">${esc(c.name)}</div><div class="cpath">${esc(c.file)}</div><div class="cdesc">${esc(c.description || '')}</div></div>`;
  })
  .join('');

/* ---- Section 03 ---- */
const stores = s.stores
  .map((st) => {
    const chips = (st.exports || []).map((e) => `<span class="chip">${esc(e)}</span>`).join('');
    return `<div class="scard"><div class="sid">${esc(st.file.split('/').pop())}</div><div class="sname">${esc(st.name)}</div><div class="sdesc">${esc(st.description || '')}</div><div class="chips">${chips}</div></div>`;
  })
  .join('');
const srv = s.serverLibs
  .map((x) => {
    const dir = x.path.split('/').slice(0, -1).join('/') + '/';
    return `<div class="scard"><div class="sid">${esc(x.id)}</div><div class="sname">${esc(x.name)}</div><div class="spath">${esc(dir)}</div><div class="sdesc">${esc(x.description || '')}</div></div>`;
  })
  .join('');

/* ---- Section 04 ---- */
const catOrder = [];
const byCat = {};
s.database.tables.forEach((t) => {
  (byCat[t.category] = byCat[t.category] || []).push(t);
  if (!catOrder.includes(t.category)) catOrder.push(t.category);
});
let dbBoard = '';
catOrder.forEach((cat, idx) => {
  const cls = idx < 7 ? ' cat-' + (idx + 1) : '';
  const cards = byCat[cat]
    .map((t) => {
      const cols = t.columns
        .map((c) => (c.mode === 'json' ? `<span class="j">${esc(c.name)} (json)</span>` : `<span class="k">${esc(c.name)}</span>`))
        .join(' ');
      return `<div class="tcard"><div class="tname">${esc(t.name)}</div><div class="cols">${cols}</div></div>`;
    })
    .join('');
  dbBoard += `<div class="db-col${cls}"><span class="cat">${esc(cat)}</span>${cards}</div>`;
});
const rels = s.database.relationships
  .map((r) => `<div class="r"><div class="a">${esc(r.from)} <span class="ar">─▸</span> ${esc(r.to)}</div><div class="b">${esc(r.description || '')}</div></div>`)
  .join('');

/* ---- Section 05 ---- */
const stk = s.stackItems
  .map((x) => `<div class="stk">${esc(x.name)} <span class="v">${esc(x.version || '')}</span><span class="t">${esc(x.tag || '')}</span></div>`)
  .join('');
const cmdBlock = (label, arr) =>
  `<div class="cmdblock"><h4>${label}</h4>${arr.map((c) => `<div class="cmdline"><span class="c">${esc(c.cmd)}</span><span class="d">${esc(c.description || '')}</span></div>`).join('')}</div>`;
const envGroup = (arr, cls, badge) => {
  const topics = [...new Set(arr.map((e) => e.topic))];
  const rows = arr
    .map((e) => `<div class="envrow"><span class="vn">${esc(e.name)}</span><span class="vb ${cls}">${badge}</span><span class="vd">${esc(e.description || '')}</span></div>`)
    .join('');
  return `<div class="envgroup"><div class="gh"><span class="${cls}">${badge}</span> ${esc(topics.join(' · '))}</div><div class="envgrid">${rows}</div></div>`;
};
const reqEnv = s.environmentVariables.filter((e) => e.required);
const optEnv = s.environmentVariables.filter((e) => !e.required);

/* ---- counts ---- */
const nRoutes = s.routes.length;
const nPublic = s.routes.filter((r) => r.accent === 'public').length;
const nProtected = s.routes.filter((r) => r.accent === 'protected').length;
const nApi = apis.length;
const nLive = s.components.filter((c) => c.status === 'live').length;
const nDorm = s.components.length - nLive;
const stackName = (tag) => {
  const item = s.stackItems.find((x) => x.tag === tag);
  return item ? `${item.name} ${item.version}` : '';
};
const hl = `${stackName('framework')} · ${stackName('runtime')}`;
const dbName = stackName('database') || s.database.provider;
const ormName = stackName('orm') || s.database.orm;

const legend = `<div class="legend" id="legend">
<span class="li" data-type="flow"><span class="ln flow"></span> page flow / data feed</span>
<span class="li" data-type="admin"><span class="ln admin"></span> admin manages / assigns</span>
<span class="li" data-type="api"><span class="ln api"></span> api · cron rails</span>
<span class="li" data-type="util"><span class="ln util"></span> utility / dev</span>
<span class="li" data-type="auth"><span class="ln auth"></span> auth redirect</span>
<span class="hint"><b>hover</b> = trace connections · <i>click</i> = inspect route →</span>
</div>`;

const body = `<div class="ambient">
<div class="grid"></div>
<div class="glow g1"></div>
<div class="glow g2"></div>
<div class="glow g3"></div>
<div class="scan"></div>
</div>
<div class="wrap">
<header class="mast">
<div>
<div class="brand">
<span class="mark">${s.project.toUpperCase()}</span>
<span class="stack">structure<b>map</b></span>
</div>
<h1>App Structure <span class="thin">Map</span></h1>
<p class="lede">${esc(s.description)} <span class="hl">${esc(hl)}</span></p>
</div>
<div class="sheetmeta">
SHEET <b>A‑01</b> · ROUTE TOPOLOGY<br>
SCALE 1:NTS · REV ${s.generatedAt}<br>
${esc(hl)}<br>
${nRoutes} routes · ${s.database.tables.length} tables · ${esc(dbName)} / ${esc(ormName)}
</div>
</header>
<nav class="tabs">
<a href="#s01"><span class="n">01</span> Routes</a>
<a href="#s02"><span class="n">02</span> Components</a>
<a href="#s03"><span class="n">03</span> State + Server</a>
<a href="#s04"><span class="n">04</span> Database</a>
<a href="#s05"><span class="n">05</span> Stack + Cmds</a>
</nav>
<section id="s01">
<div class="sec-head">
<span class="num">SECTION 01</span>
<span class="crumb">src/routes/**</span>
<div class="statrow">
<div class="stat s1"><div class="v">${nRoutes}</div><div class="k">route files</div></div>
<div class="stat s2"><div class="v">${nPublic}</div><div class="k">public</div></div>
<div class="stat s3"><div class="v">${nProtected}</div><div class="k">protected</div></div>
<div class="stat s4"><div class="v">${nApi}</div><div class="k">api rails</div></div>
</div>
</div>
<h2 class="sec-title">Route Topology</h2>
<div class="sec-sub">page flow / data feed · admin manages / assigns · api · cron rails · utility / dev · auth redirect &nbsp;—&nbsp; <b>hover</b> = trace connections · <b>click</b> = inspect route</div>
${legend}
<div class="topo-scroll">
<div class="topo-canvas" id="canvas">
<svg class="topo-wires" id="wires"></svg>
${pageRow}
${apiRow}
</div>
</div>
</section>
<section id="s02" class="reveal">
<div class="sec-head"><span class="num">SECTION 02</span><span class="crumb">src/lib/components/ · src/lib/dashboardComponents/</span></div>
<h2 class="sec-title">Component Ledger</h2>
<div class="sec-sub"><b>${nLive}</b> live · <b>${nDorm}</b> dormant</div>
<div class="grid-c">
${comps}
</div>
</section>
<section id="s03" class="reveal">
<div class="sec-head"><span class="num">SECTION 03</span><span class="crumb">src/lib/treeState.svelte.ts · src/lib/server/</span></div>
<h2 class="sec-title">Registers &amp; Wiring</h2>
<div class="sec-sub"><b>${s.stores.length}</b> stores · <b>${s.serverLibs.length}</b> server libs</div>
<div class="grp-label">state registers <span class="src">src/lib/</span></div>
<div class="grid-s">
${stores}
</div>
<div class="grp-label">server libs <span class="src">src/lib/server/ · src/lib/remote/</span></div>
<div class="grid-s">
${srv}
</div>
</section>
<section id="s04" class="reveal">
<div class="sec-head"><span class="num">SECTION 04</span><span class="crumb">src/lib/server/libsql/schema · Turso (LibSQL) · Drizzle</span></div>
<h2 class="sec-title">Database Board</h2>
<div class="sec-sub"><b>${s.database.tables.length}</b> tables · ${esc(s.database.provider)} · ${esc(s.database.orm)}</div>
<div class="db-scroll">
<div class="db-board">
${dbBoard}
</div>
</div>
<div class="rel">
<h4>key relationships</h4>
${rels}
</div>
</section>
<section id="s05" class="reveal">
<div class="sec-head"><span class="num">SECTION 05</span><span class="crumb">tech stack &amp; commands</span></div>
<h2 class="sec-title">Stack &amp; Ops</h2>
<div class="sec-sub"><b>${s.stackItems.length}</b> stack items · <b>${s.environmentVariables.length}</b> env vars</div>
<div class="stackrow">
${stk}
</div>
<div class="cmdgrid">
${cmdBlock('development', s.scripts.development)}
${cmdBlock('database', s.scripts.database)}
${cmdBlock('build &amp; test', s.scripts.buildAndTest)}
</div>
<div class="envcard">
<div class="envhead">
<h3>Environment Variables</h3>
<span class="src">.env</span>
</div>
<div class="envnote">All values loaded at boot. <span style="color:var(--coral)">REQUIRED</span> keys must be present; <span style="color:var(--ink-faint)">OPTIONAL</span> keys enable secondary features.</div>
${envGroup(reqEnv, 'req', 'required')}
${envGroup(optEnv, 'opt', 'optional')}
</div>
</section>
</div>
${aside}`;

/* ---- EDGES ---- */
const edges = [];
s.routes.forEach((r) => (r.links || []).forEach((l) => edges.push([r.id, l.to, l.type, l.label || ''])));
const js = js0.replace(/var EDGES = \[[\s\S]*?\];/, 'var EDGES = ' + JSON.stringify(edges) + ';');

fs.writeFileSync('plan/map.html', '<!DOCTYPE html>\n<html lang="en">\n' + head + '\n<body>\n' + body + '\n' + js + '\n</body>\n</html>\n');
console.log('wrote plan/map.html | routes:', nRoutes, '| tables:', s.database.tables.length, '| edges:', edges.length);
