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

## Important Notes
- **In libSQL check `lastInsertRowid` not `rowsAffected`** for mutation success verification.
- Turso settings must be preserved in the `.env` file for easy switching to remote sync.
- `TURSO_TYPE = "sync"` enables both local development and remote sync.
- `TURSO_TYPE = "local"` for pure local development.
- `TURSO_TYPE = "remote"` for pure remote (Turso) mode.
- The `@libsql/client` package must be in `package.json` dependencies.
- In `vite.config.ts`, add `external: ['@libsql/client']` to keep libsql externalized from the build bundle.
