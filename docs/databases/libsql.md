---
title: LibSQL / Turso
description: Using Effect SQL with LibSQL and Turso for edge-distributed SQLite.
---

# LibSQL / Turso

The `@effect/sql-libsql` package provides LibSQL support for Effect SQL. LibSQL is an open-source fork of SQLite, and Turso is a hosted LibSQL service that provides edge replication.

## Why LibSQL?

LibSQL extends SQLite with:
- **Edge replication** - Deploy SQLite replicas globally
- **HTTP/WebSocket access** - Connect from serverless environments
- **Embedded replicas** - Local SQLite with automatic sync
- **Extensions** - Vector search, full-text search, and more

## Installation

```bash
npm install @effect/sql @effect/sql-libsql
```

## Basic Setup

### Local LibSQL

```typescript
import { Effect } from "effect"
import { SqlClient } from "@effect/sql"
import { LibsqlClient } from "@effect/sql-libsql"

// Local file database
const DatabaseLive = LibsqlClient.layer({
  url: "file:local.db"
})

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const users = yield* sql`SELECT * FROM users`
  return users
})

Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)))
```

### Turso (Hosted)

```typescript
import { Redacted } from "effect"

const DatabaseLive = LibsqlClient.layer({
  url: "libsql://your-database-yourorg.turso.io",
  authToken: Redacted.make("your-auth-token")
})
```

### Embedded Replica

Combine local SQLite with remote sync:

```typescript
const DatabaseLive = LibsqlClient.layer({
  url: "file:local-replica.db",
  syncUrl: "libsql://your-database-yourorg.turso.io",
  authToken: Redacted.make("your-auth-token"),
  syncInterval: Duration.seconds(60) // Sync every minute
})
```

## Configuration Options

```typescript
import { Redacted, Duration } from "effect"

const DatabaseLive = LibsqlClient.layer({
  // Connection
  url: "libsql://your-database.turso.io",
  authToken: Redacted.make("your-token"),
  
  // For embedded replicas
  syncUrl: "libsql://your-database.turso.io",
  syncInterval: Duration.seconds(60),
  
  // Name transformations
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel
})
```

### Environment Configuration

```typescript
import { Config, Redacted } from "effect"

const DatabaseConfig = Config.all({
  url: Config.string("TURSO_DATABASE_URL"),
  authToken: Config.redacted("TURSO_AUTH_TOKEN")
})

const DatabaseLive = LibsqlClient.layerConfig(DatabaseConfig)
```

## Use Cases

### Edge Computing

LibSQL with Turso is perfect for edge deployments:

```typescript
// Cloudflare Workers, Vercel Edge, etc.
const DatabaseLive = LibsqlClient.layer({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: Redacted.make(process.env.TURSO_AUTH_TOKEN!)
})

export default async function handler(request: Request) {
  const program = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const data = yield* sql`SELECT * FROM products WHERE id = ${productId}`
    return Response.json(data)
  })

  return Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)))
}
```

### Local-First Applications

Embedded replicas enable local-first architecture:

```typescript
// Desktop/mobile app with local SQLite and cloud sync
const DatabaseLive = LibsqlClient.layer({
  url: "file:app-data.db",              // Local database
  syncUrl: "libsql://app.turso.io",     // Cloud sync
  authToken: Redacted.make(token),
  syncInterval: Duration.seconds(30)     // Sync every 30s
})

// Reads are always local (fast!)
const products = yield* sql`SELECT * FROM products`

// Writes go to local, then sync to cloud
yield* sql`INSERT INTO orders ${sql.insert(order)}`
```

### Per-User Databases

Turso supports database-per-user architecture:

```typescript
const getUserDatabase = (userId: string) =>
  LibsqlClient.layer({
    url: `libsql://user-${userId}-myorg.turso.io`,
    authToken: Redacted.make(process.env.TURSO_AUTH_TOKEN!)
  })
```

## SQLite Compatibility

LibSQL is SQLite-compatible, so standard SQLite syntax works:

```typescript
yield* sql`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  )
`
```

### Extensions

LibSQL supports extensions like vector search:

```typescript
// Vector similarity search (with libsql-vector extension)
yield* sql`
  SELECT * FROM documents
  ORDER BY vector_distance_cos(embedding, ${queryEmbedding})
  LIMIT 10
`
```

## Transactions

```typescript
const sql = yield* SqlClient.SqlClient

yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT INTO orders ${sql.insert(order)}`
    yield* sql`UPDATE inventory SET quantity = quantity - ${quantity}`
  })
)
```

## Migrations

```typescript
import { LibsqlMigrator } from "@effect/sql-libsql"
import { Migrator } from "@effect/sql"

const MigratorLive = LibsqlMigrator.layer({
  loader: Migrator.fromGlob(import.meta.glob("./migrations/*.ts"))
})
```

## Syncing Replicas

For embedded replicas, trigger sync manually:

```typescript
// Manual sync (if not using syncInterval)
yield* libsqlClient.sync()
```

## Error Handling

```typescript
import { SqlError } from "@effect/sql"

program.pipe(
  Effect.catchTag("SqlError", (error) => {
    const libsqlError = error.cause as { code?: string }
    
    if (libsqlError.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return Effect.fail(new DuplicateEntryError())
    }
    
    return Effect.fail(error)
  })
)
```

## Performance Tips

### Use Embedded Replicas

For read-heavy workloads, embedded replicas give you local SQLite performance:

```typescript
// Reads are local, writes sync to primary
const DatabaseLive = LibsqlClient.layer({
  url: "file:replica.db",
  syncUrl: "libsql://primary.turso.io",
  authToken: Redacted.make(token)
})
```

### Batch Writes

```typescript
yield* sql.withTransaction(
  Effect.gen(function* () {
    for (const batch of chunks(records, 100)) {
      yield* sql`INSERT INTO data ${sql.insert(batch)}`
    }
  })
)
```

## Next Steps

- [SQLite](/docs/databases/sqlite) - SQLite fundamentals
- [Cloudflare D1](/docs/databases/d1) - Alternative edge database
- [Migrations](/docs/advanced/migrations) - Schema management
