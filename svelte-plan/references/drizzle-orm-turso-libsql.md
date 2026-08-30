# Drizzle ORM + Turso/LibSQL Patterns (Default for Svelte Projects)

## Overview
**Drizzle ORM with Turso Local (LibSQL) is the DEFAULT standard** for all Svelte projects. This is the pattern used in saftbg and roomcal. Projects may occasionally use MongoDB + Mongoose (like dienchan) — load `mongodb-mongoose.md` if that's the case.

## Turso Settings
Both projects use the same Turso settings pattern. These must be preserved for easy switching to remote sync:

### Environment Variables
```
TURSO_TYPE = "sync"    # "local" / "remote" / "sync"
TURSO_DB_LOCAL = "file:./data/sqlite.db"
TURSO_DB_REMOTE = "libsql://saft-espansione8.aws-eu-west-1.turso.io"
TURSO_AUTH_TOKEN = "[REDACTED]"
TURSO_ENCRYPTION = "false"
TURSO_ENCRYPTION_KEY = "[REDACTED]"
```

### Database Connection Pattern (`$lib/server/libsql/database.ts`)
```typescript
import { TURSO_DB_LOCAL, TURSO_DB_REMOTE, TURSO_AUTH_TOKEN, TURSO_TYPE } from '$env/static/private';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient, type Client, type Config } from '@libsql/client';

// The single libSQL client instance
var __libsql_client: Client | undefined;
var __libsql_init_promise: Promise<void> | undefined;

function setPragmas(client: Client) {
    return client.execute('PRAGMA journal_mode=WAL;');
}

async function connect(): Promise<Client> {
    if (!globalThis.__libsql_client) {
        let param: Config;
        if (!TURSO_TYPE) {
            throw new Error('TURSO_TYPE not set');
        }
        if (TURSO_TYPE === 'remote' || TURSO_TYPE === 'sync') {
            if (!TURSO_DB_REMOTE || !TURSO_AUTH_TOKEN) {
                throw new Error(
                    `Missing value for ${TURSO_TYPE} mode: TURSO_DB_REMOTE and TURSO_AUTH_TOKEN`
                );
            }
            param = {
                url: TURSO_DB_REMOTE,
                authToken: TURSO_AUTH_TOKEN
            };
        } else if (TURSO_TYPE === 'local') {
            param = { url: TURSO_DB_LOCAL };
        } else if (TURSO_TYPE === 'sync') {
            param = {
                url: TURSO_DB_LOCAL,
                authToken: TURSO_AUTH_TOKEN,
                syncUrl: TURSO_DB_REMOTE
            };
        } else {
            throw new Error(`Invalid TURSO_TYPE: ${TURSO_TYPE}. Must be 'local', 'remote', or 'sync'`);
        }
        globalThis.__libsql_client = createClient(param);
    }
    return globalThis.__libsql_client;
}

export const client = globalThis.__libsql_client;

// Drizzle ORM instance
export const db = async () => {
    const client = await connect();
    if (!globalThis.__libsql_init_promise) {
        globalThis.__libsql_init_promise = setPragmas(globalThis.__libsql_client);
    }
    await globalThis.__libsql_init_promise;
    return drizzle(client);
};

export const dbConnect = async () => {
    return await db();
};
```

## syncTurso Pattern
Every `+page.server.ts` that performs mutations must include:

```typescript
const syncTurso = async () => {
    if (TURSO_TYPE === 'sync') {
        try {
            await client.sync();
        } catch (syncError) {
            console.error('Error syncing Turso:', syncError);
        }
    }
};
```

Called after every mutation: `await syncTurso();`

## Drizzle ORM Schema Pattern
```typescript
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const tableName = sqliteTable('table_name', {
    id: text('id').primaryKey().default(sql`randomblob(16)`),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    // ... fields
});
```

## Drizzle ORM Query Pattern
```typescript
import { eq } from 'drizzle-orm';

// Insert
await db.insert(tableName).values({ ...data }).onConflictDoNothing();

// Update
await db.update(tableName).set({ ...data }).where(eq(tableName.id, id));

// Delete
await db.delete(tableName).where(eq(tableName.id, id));

// Select
const rows = await db.select().from(tableName).where(eq(tableName.companyId, companyId));
```

## Common Gotchas
- Never use a caret range (`^`) on an rc/beta `drizzle-orm`/`drizzle-kit` version in `package.json` - different builds under the same rc/beta tag can resolve independently and be mutually incompatible (e.g. `SQLiteSyncDialect is not a constructor`). Pin the exact version for both packages together.
- `drizzle-kit push` can silently drop a column-level `.unique()` on a table recreate - declare 1:1 constraints as table-level `uniqueIndex(...)` instead, and verify survival with an actual duplicate-insert test after any push, not by introspecting the schema.
- Don't spread a table into `db.select({...tableName})` - it fails to typecheck (`TableTypeConfig` not assignable to `SelectedFields`). Use `getTableColumns(tableName)`.
- A unique-constraint violation embeds the COLUMN name(s), not the index name, and the detail text lives on `err.cause.message`, not `err.message` - don't branch error handling on index-name string matching; do a `SELECT` pre-check before the insert instead, and read `err.cause.message` for any friendly-error mapping.
- `.onConflictDoNothing()` never fires against a unique index that includes a nullable column - SQLite treats NULLs in a unique index as always distinct, so "duplicate" rows insert fine. Do a select-then-insert with the same nullable-aware predicate instead.
- JSON-mode columns (`{ mode: 'json' }`) already deserialize to native arrays/objects on read - don't `JSON.stringify()` them again before comparing, and use `inArray(column, ids)` rather than a manually built `sql.join(...)` IN-list (which can silently match nothing).
- Availability/duplicate pre-checks (stock level, "does this already exist") run as a `SELECT` *before* the transaction are a TOCTOU race under concurrent requests - re-run the check *inside* the same transaction as the write.
- A `SELECT counter → INSERT/UPDATE → UPDATE counter` sequence for an auto-incrementing value (invoice/entry numbers) is last-writer-wins under concurrent saves - use a single atomic `UPDATE ... SET n = n + 1 ... RETURNING n` instead.
- SQLite's `lower()` is ASCII-only and won't case-fold non-Latin scripts (Cyrillic, etc.) - do case-insensitive matching on non-Latin text in JS after fetching (`str.toLocaleLowerCase(locale)`), not in SQL.

## Important Notes
- **Mutation success verification differs by operation:** check `lastInsertRowid` for inserts; check `rowsAffected` for updates/deletes, since there's no `lastInsertRowid` to read on those. Either way, `@libsql/client.execute()` silently tolerates a placeholder/args-count mismatch - an unbound parameter becomes NULL with no error, so `WHERE id = ?` with a missing arg matches 0 rows while the call still reports success. Always match placeholder count to bound args, and verify `rowsAffected` on every update/delete.
- Turso settings must be preserved in the `.env` file for easy switching to remote sync.
- `TURSO_TYPE = "sync"` enables both local development and remote sync.
- `TURSO_TYPE = "local"` for pure local development.
- `TURSO_TYPE = "remote"` for pure remote (Turso) mode.
- The `@libsql/client` package must be in `package.json` dependencies.
- In `vite.config.ts`, add `external: ['@libsql/client']` to keep libsql externalized from the build bundle.
