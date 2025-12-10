---
title: SQLite
description: Using Effect SQL with SQLite databases across different runtimes.
---

# SQLite

Effect SQL provides multiple SQLite adapters for different runtimes:

| Package | Runtime | Underlying Library |
|---------|---------|-------------------|
| `@effect/sql-sqlite-node` | Node.js | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| `@effect/sql-sqlite-bun` | Bun | [bun:sqlite](https://bun.sh/docs/api/sqlite) |
| `@effect/sql-sqlite-wasm` | Browser/WASM | [sql.js](https://sql.js.org/) |
| `@effect/sql-sqlite-react-native` | React Native | [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) |

## Installation

Choose the package for your runtime:

::: code-group

```bash [Node.js]
npm install @effect/sql @effect/sql-sqlite-node
```

```bash [Bun]
npm install @effect/sql @effect/sql-sqlite-bun
```

```bash [Browser/WASM]
npm install @effect/sql @effect/sql-sqlite-wasm
```

```bash [React Native]
npm install @effect/sql @effect/sql-sqlite-react-native expo-sqlite
```

:::

## Node.js Setup

```typescript
import { Effect } from "effect"
import { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-node"

// Create the database layer
const DatabaseLive = SqliteClient.layer({
  filename: "./app.db"
})

// Use in your program
const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const users = yield* sql`SELECT * FROM users`
  return users
})

Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)))
```

### In-Memory Databases

Perfect for testing:

```typescript
const DatabaseLive = SqliteClient.layer({
  filename: ":memory:"
})
```

### Configuration Options

```typescript
import { Duration } from "effect"

const DatabaseLive = SqliteClient.layer({
  // Database file path
  filename: "./app.db",
  
  // Open as read-only
  readonly: false,
  
  // Disable WAL mode (enabled by default)
  disableWAL: false,
  
  // Prepared statement cache
  prepareCacheSize: 200,
  prepareCacheTTL: Duration.minutes(10),
  
  // Name transformations
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel,
  
  // Custom span attributes
  spanAttributes: {
    "db.name": "myapp"
  }
})
```

## Bun Setup

```typescript
import { Effect } from "effect"
import { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-bun"

const DatabaseLive = SqliteClient.layer({
  filename: "./app.db"
})

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql`SELECT * FROM users`
})

// Bun runtime
await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)))
```

## Browser/WASM Setup

```typescript
import { Effect, Layer } from "effect"
import { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-wasm"
import initSqlJs from "sql.js"

// Initialize SQL.js
const SqlJsLive = Layer.effect(
  SqliteClient.SqliteClient,
  Effect.promise(async () => {
    const SQL = await initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`
    })
    return new SQL.Database()
  })
)

// Create the client layer
const DatabaseLive = SqliteClient.layer.pipe(
  Layer.provide(SqlJsLive)
)
```

## React Native Setup

```typescript
import { Effect } from "effect"
import { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-react-native"

const DatabaseLive = SqliteClient.layer({
  filename: "app.db"
})

// Use in your React Native app
const loadUsers = async () => {
  return Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT * FROM users`
    }).pipe(Effect.provide(DatabaseLive))
  )
}
```

## SQLite-Specific Features

### WAL Mode

Write-Ahead Logging (WAL) mode is enabled by default for better concurrent performance:

```typescript
// WAL is enabled by default
const DatabaseLive = SqliteClient.layer({
  filename: "./app.db"
})

// Disable if needed (e.g., for network file systems)
const DatabaseLive = SqliteClient.layer({
  filename: "./app.db",
  disableWAL: true
})
```

### Export Database

Export the entire database to bytes (Node.js):

```typescript
const sqlite = yield* SqliteClient.SqliteClient

const bytes = yield* sqlite.export
// bytes is Uint8Array

// Save to file
fs.writeFileSync("backup.db", bytes)
```

### Backup

Create a backup to a file (Node.js):

```typescript
const sqlite = yield* SqliteClient.SqliteClient

const metadata = yield* sqlite.backup("./backup.db")
console.log(`Backed up ${metadata.totalPages} pages`)
```

### Load Extensions

Load SQLite extensions (Node.js):

```typescript
const sqlite = yield* SqliteClient.SqliteClient

yield* sqlite.loadExtension("./libspatialite.so")

// Now use SpatiaLite functions
const result = yield* sql`SELECT ST_Distance(...)`
```

### Safe Integer Mode

Handle large integers safely:

```typescript
import { SqlClient } from "@effect/sql"

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  // Enable safe integer mode for this fiber
  return yield* sql`SELECT large_number FROM data`.pipe(
    Effect.provide(
      Layer.succeed(SqlClient.SafeIntegers, true)
    )
  )
})
```

## SQLite Limitations

SQLite has some limitations compared to other databases:

### No `updateValues`

Batch updates with `sql.updateValues` are not supported:

```typescript
// ❌ Not supported in SQLite
yield* sql`UPDATE users SET name = data.name FROM ${sql.updateValues([...], "data")}`

// ✅ Use individual updates in a transaction instead
yield* sql.withTransaction(
  Effect.forEach(updates, (update) =>
    sql`UPDATE users SET name = ${update.name} WHERE id = ${update.id}`
  )
)
```

### No RETURNING (older versions)

SQLite 3.35+ supports RETURNING, but older versions don't:

```typescript
// Works in SQLite 3.35+
const [user] = yield* sql`INSERT INTO users ${sql.insert({ name: "Alice" })} RETURNING *`

// For older SQLite, get the last inserted ID separately
yield* sql`INSERT INTO users ${sql.insert({ name: "Alice" })}`
const [{ id }] = yield* sql`SELECT last_insert_rowid() as id`
```

### Single Writer

SQLite allows only one writer at a time. Effect SQL uses a semaphore to serialize writes:

```typescript
// These run sequentially, not concurrently
yield* Effect.all([
  sql`INSERT INTO users ${sql.insert({ name: "Alice" })}`,
  sql`INSERT INTO users ${sql.insert({ name: "Bob" })}`
], { concurrency: "unbounded" })
```

## Performance Tips

### Use WAL Mode

WAL mode (enabled by default) significantly improves concurrent read performance:

```typescript
// Verify WAL is enabled
const [{ journal_mode }] = yield* sql`PRAGMA journal_mode`
console.log(journal_mode) // Should be "wal"
```

### Index Your Queries

```typescript
yield* sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`
yield* sql`CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id)`
```

### Use Prepared Statement Cache

The statement cache is on by default. Tune the size if needed:

```typescript
const DatabaseLive = SqliteClient.layer({
  filename: "./app.db",
  prepareCacheSize: 500, // Increase for many unique queries
  prepareCacheTTL: Duration.minutes(30)
})
```

### Batch Inserts

For bulk inserts, use transactions and multi-row inserts:

```typescript
yield* sql.withTransaction(
  Effect.gen(function* () {
    // Insert in batches
    for (const batch of chunks(users, 100)) {
      yield* sql`INSERT INTO users ${sql.insert(batch)}`
    }
  })
)
```

### VACUUM Regularly

For databases with lots of deletes:

```typescript
yield* sql`VACUUM`
```

## Testing with In-Memory SQLite

SQLite's in-memory mode is perfect for tests:

```typescript
import { it, describe } from "@effect/vitest"
import { SqliteClient } from "@effect/sql-sqlite-node"

const TestDatabase = SqliteClient.layer({
  filename: ":memory:"
})

describe("User Repository", () => {
  it.effect("creates users", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      
      yield* sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`
      yield* sql`INSERT INTO users ${sql.insert({ name: "Alice" })}`
      
      const users = yield* sql`SELECT * FROM users`
      expect(users).toHaveLength(1)
    }).pipe(Effect.provide(TestDatabase))
  )
})
```

## Migrations

SQLite migrations work the same as other databases:

```typescript
import { SqliteMigrator } from "@effect/sql-sqlite-node"
import { Migrator } from "@effect/sql"

const MigratorLive = SqliteMigrator.layer({
  loader: Migrator.fromGlob(import.meta.glob("./migrations/*.ts"))
})
```

Example migration:

```typescript
// migrations/001_initial.ts
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  yield* sql`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `
})
```

## Next Steps

- [Migrations](/docs/advanced/migrations) - Database schema management
- [Testing](/docs/advanced/testing) - Testing strategies with SQLite
- [LibSQL](/docs/databases/libsql) - SQLite with replication
