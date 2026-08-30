# MongoDB + Mongoose Patterns (Optional — for specific projects)

## Overview
**MongoDB + Mongoose ORM is NOT the default.** It is used in specific projects like dienchan. Only use these patterns when the project explicitly uses MongoDB. For all other projects, use Drizzle ORM + Turso/LibSQL.

## When to Load
- The project has `mongoose` in its `package.json`
- The project has `MONGO_URI` in its `.env`
- The project uses `$lib/server/mongo/schema/` instead of `$lib/server/libsql/schema/`
- The project has `/api/mongo/` routes instead of `/api/libsql/`

## MongoDB Connection Pattern
```typescript
import mongoose from 'mongoose';
import { MONGO_URI } from '$env/static/private';

let cachedConnection: Promise<typeof mongoose> | null = null;

export default async function dbConnect(): Promise<typeof mongoose> {
    if (cachedConnection && mongoose.connection.readyState === 1) {
        return cachedConnection;
    }
    if (mongoose.connection.readyState === 2) {
        await mongoose.disconnect();
    }
    cachedConnection = new Promise((resolve) => {
        mongoose.connection.once('connected', resolve);
    });
    if (!cachedConnection) {
        cachedConnection = await mongoose.connect(MONGO_URI, {
            // options
        });
    }
    return cachedConnection;
}
```

## Mongoose Model Pattern
```typescript
import mongoose, { Schema, Types } from 'mongoose';

const schema = new mongoose.Schema({
    field1: { type: String, required: true },
    field2: { type: Schema.Types.ObjectId, ref: 'OtherModel' },
    createdAt: { type: Date, default: Date.now }
}, {
    timestamps: true,
    _id: false // prevent MongoDB from adding _id to array elements
});

export const ModelName = mongoose.models.ModelName || mongoose.model('ModelName', schema);
```

## API Route Patterns for MongoDB
```
/api/mongo/find          — GET/POST: Find documents
/api/mongo/create        — POST: Create documents
/api/mongo/update        — PUT/PATCH: Update documents
/api/mongo/update-bulk   — POST: Bulk update documents
/api/mongo/remove        — DELETE: Remove documents
/api/mongo/count         — GET: Count documents
/api/mongo/aggregate     — GET/POST: Aggregate documents
```

## Common API Calls from Server Actions
```typescript
// Find
const res = await fetch(`${BASE_URL}/api/mongo/find`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection: 'CollectionName', query: {}, projection: {} })
});

// Create
const res = await fetch(`${BASE_URL}/api/mongo/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection: 'CollectionName', data: {} })
});

// Update
const res = await fetch(`${BASE_URL}/api/mongo/update`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection: 'CollectionName', id: '', data: {} })
});

// Remove
const res = await fetch(`${BASE_URL}/api/mongo/remove`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection: 'CollectionName', id: '' })
});
```

## Important Notes
- **NEVER** include MongoDB connection strings or credentials — write `[REDACTED]` instead.
- Mongoose models use `mongoose.models.ModelName || mongoose.model()` pattern to prevent overwriting errors.
- Array elements should have `_id: false` to prevent MongoDB from adding `_id` to array elements.
- The `MONGO_URI` is typically in `.env` (not committed to git).
