---
title: Migrations
description: Managing database schema changes with Effect SQL migrations.
---

# Migrations

Database migrations are versioned changes to your database schema. Effect SQL provides a built-in migration system that integrates with Effect's dependency injection and error handling.

## How Migrations Work

1. Each migration is a numbered file (e.g., `001_create_users.ts`)
2. The migrator tracks which migrations have run in a database table
3. On startup, it runs any pending migrations in order
4. Migrations run inside transactions (when supported by the database)

## Setting Up Migrations

### Directory Structure

```
src/
  migrations/
    001_create_users.ts
    002_add_email_to_users.ts
    003_create_posts.ts
  db.ts
  index.ts
```

### Migration Files

Each migration exports a default Effect:

```typescript
// src/migrations/001_create_users.ts
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  yield* sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
})
```

```typescript
// src/migrations/002_add_email_to_users.ts
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  yield* sql`ALTER TABLE users ADD COLUMN email TEXT`
  yield* sql`CREATE UNIQUE INDEX idx_users_email ON users(email)`
})
```

### Configuring the Migrator

```typescript
// src/db.ts
import { Effect, Layer } from "effect"
import { PgClient, PgMigrator } from "@effect/sql-pg"
import { Migrator } from "@effect/sql"

// Database client
export const DatabaseLive = PgClient.layer({
  host: "localhost",
  database: "myapp"
})

// Migration loader using Vite's glob import
export const MigratorLive = PgMigrator.layer({
  loader: Migrator.fromGlob(import.meta.glob("./migrations/*.ts")),
  // Optional: dump schema after migrations
  schemaDirectory: "./migrations"
})
```

### Running Migrations

```typescript
// src/index.ts
import { Effect, Console } from "effect"
import { Migrator } from "@effect/sql"
import { DatabaseLive, MigratorLive } from "./db.js"

const runMigrations = Effect.gen(function* () {
  const completed = yield* Migrator.Migrator
  
  if (completed.length > 0) {
    yield* Console.log(`Ran ${completed.length} migrations:`)
    for (const [id, name] of completed) {
      yield* Console.log(`  - ${id}_${name}`)
    }
  } else {
    yield* Console.log("No pending migrations")
  }
})

Effect.runPromise(
  runMigrations.pipe(
    Effect.provide(MigratorLive),
    Effect.provide(DatabaseLive)
  )
)
```

## Migration Loaders

### Vite/Webpack Glob Import

```typescript
// Vite
const loader = Migrator.fromGlob(import.meta.glob("./migrations/*.ts"))

// Webpack (with babel-plugin-macros)
const loader = Migrator.fromBabelGlob(require("./migrations"))
```

### File System Loader

For Node.js without bundler:

```typescript
import { FileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { Migrator } from "@effect/sql/Migrator/FileSystem"

const loader = Migrator.fromFileSystem("./src/migrations")

// Provide the file system
const MigratorLive = PgMigrator.layer({
  loader
}).pipe(Layer.provide(NodeFileSystem.layer))
```

### Manual Loader

Define migrations inline:

```typescript
const loader = Migrator.fromRecord({
  "001_create_users": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE users ...`
  }),
  "002_add_email": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`ALTER TABLE users ADD COLUMN email TEXT`
  })
})
```

## Migration Table

The migrator tracks completed migrations in a database table:

```sql
-- Created automatically
CREATE TABLE effect_sql_migrations (
  migration_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
)
```

Customize the table name:

```typescript
const MigratorLive = PgMigrator.layer({
  loader,
  table: "schema_migrations"  // Custom table name
})
```

## Writing Migrations

### Schema Changes

```typescript
// Add a column
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE users ADD COLUMN avatar_url TEXT`
})

// Create an index
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE INDEX CONCURRENTLY idx_posts_created ON posts(created_at)`
  // Note: CONCURRENTLY requires .unprepared in PostgreSQL
})

// Rename a column
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE users RENAME COLUMN name TO full_name`
})
```

### Data Migrations

```typescript
// Backfill data
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  // Add column
  yield* sql`ALTER TABLE users ADD COLUMN email_lower TEXT`
  
  // Backfill existing data
  yield* sql`UPDATE users SET email_lower = LOWER(email)`
  
  // Add constraint
  yield* sql`ALTER TABLE users ADD CONSTRAINT users_email_lower_unique UNIQUE (email_lower)`
})
```

### Multi-Database Support

```typescript
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  yield* sql.onDialect({
    pg: () => sql`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `,
    sqlite: () => sql`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `,
    mysql: () => sql`
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    mssql: () => sql`
      CREATE TABLE users (
        id INT IDENTITY PRIMARY KEY,
        created_at DATETIME DEFAULT GETDATE()
      )
    `,
    clickhouse: () => sql`
      CREATE TABLE users (
        id UInt64,
        created_at DateTime DEFAULT now()
      ) ENGINE = MergeTree() ORDER BY id
    `
  })
})
```

## Error Handling

### Migration Errors

```typescript
import { Migrator } from "@effect/sql"

runMigrations.pipe(
  Effect.catchTag("MigrationError", (error) => {
    switch (error.reason) {
      case "failed":
        return Console.error(`Migration failed: ${error.message}`)
      case "locked":
        return Console.log("Migrations already running")
      case "duplicates":
        return Console.error("Duplicate migration IDs found")
      case "import-error":
        return Console.error(`Failed to import migration: ${error.message}`)
      case "bad-state":
        return Console.error(`Invalid migration state: ${error.message}`)
    }
  })
)
```

### Locking

When migrations are already running, the migrator won't start another run:

```typescript
runMigrations.pipe(
  Effect.catchTag("MigrationError", (error) => {
    if (error.reason === "locked") {
      return Effect.succeed([]) // Another process is running migrations
    }
    return Effect.fail(error)
  })
)
```

## Schema Dumping

Optionally dump the schema after migrations (PostgreSQL):

```typescript
const MigratorLive = PgMigrator.layer({
  loader,
  schemaDirectory: "./migrations"  // Creates _schema.sql
})
```

This creates a `_schema.sql` file with the current database schema, useful for:
- Code review of schema changes
- Quick reference for developers
- Recreating databases for testing

## Best Practices

### 1. Never Modify Existing Migrations

Once a migration has run in any environment, treat it as immutable. Create new migrations for changes.

```typescript
// ❌ Don't edit existing migrations
// 001_create_users.ts - already deployed

// ✅ Create a new migration
// 002_fix_users_table.ts
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE users ...`
})
```

### 2. Make Migrations Reversible (When Possible)

```typescript
// migration includes rollback info in comments
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  // Forward
  yield* sql`ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP`
  
  // Reverse (for reference):
  // ALTER TABLE users DROP COLUMN deleted_at
})
```

### 3. Keep Migrations Small

```typescript
// ✅ Good: Focused migrations
// 003_add_email_to_users.ts
// 004_create_email_index.ts
// 005_add_email_unique_constraint.ts

// ❌ Bad: Giant migration
// 003_update_users_schema.ts (does everything)
```

### 4. Use Transactions Wisely

Most migrations run in transactions, but some operations don't work in transactions:

```typescript
// PostgreSQL: CREATE INDEX CONCURRENTLY can't be in a transaction
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE INDEX CONCURRENTLY idx_users_email ON users(email)`.unprepared
})
```

### 5. Test Migrations

```typescript
import { it } from "@effect/vitest"
import { SqliteClient } from "@effect/sql-sqlite-node"

it.effect("migration 001 creates users table", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    // Run migration
    yield* migration001
    
    // Verify
    const tables = yield* sql`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`
    expect(tables).toHaveLength(1)
  }).pipe(
    Effect.provide(SqliteClient.layer({ filename: ":memory:" }))
  )
)
```

## Running Migrations in Production

### At Application Startup

```typescript
const startApp = Effect.gen(function* () {
  yield* Console.log("Running migrations...")
  yield* Migrator.Migrator
  yield* Console.log("Starting server...")
  yield* startServer
})
```

### As a Separate Process

```typescript
// scripts/migrate.ts
import { Effect, Console } from "effect"
import { Migrator } from "@effect/sql"
import { DatabaseLive, MigratorLive } from "../src/db.js"

const migrate = Effect.gen(function* () {
  const completed = yield* Migrator.Migrator
  yield* Console.log(`Completed ${completed.length} migrations`)
}).pipe(
  Effect.provide(MigratorLive),
  Effect.provide(DatabaseLive)
)

Effect.runPromise(migrate)
```

```bash
# Run before deploying
npm run migrate
```

## Next Steps

- [Models](/docs/advanced/models) - Type-safe schema definitions
- [Transactions](/docs/advanced/transactions) - Understanding migration transactions
- [Testing](/docs/advanced/testing) - Testing with migrations
