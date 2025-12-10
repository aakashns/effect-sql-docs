---
title: PostgreSQL
description: Using Effect SQL with PostgreSQL databases.
---

# PostgreSQL

The `@effect/sql-pg` package provides PostgreSQL support for Effect SQL, using the [pg](https://node-postgres.com/) library under the hood.

## Installation

```bash
npm install @effect/sql @effect/sql-pg
```

## Basic Setup

```typescript
import { Effect, Layer } from "effect"
import { SqlClient } from "@effect/sql"
import { PgClient } from "@effect/sql-pg"

// Create the database layer
const DatabaseLive = PgClient.layer({
  host: "localhost",
  port: 5432,
  database: "myapp",
  username: "postgres",
  password: Redacted.make("secret")
})

// Use in your program
const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const users = yield* sql`SELECT * FROM users`
  return users
})

// Run
Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)))
```

## Configuration Options

### Connection

```typescript
import { Redacted, Duration } from "effect"

const DatabaseLive = PgClient.layer({
  // Basic connection
  host: "localhost",
  port: 5432,
  database: "myapp",
  username: "postgres",
  password: Redacted.make("secret"),
  
  // Or use a connection URL
  url: Redacted.make("postgresql://user:pass@localhost:5432/myapp"),
  
  // SSL configuration
  ssl: true, // Enable SSL
  // Or for custom SSL options:
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync("ca.pem").toString()
  },
  
  // Application name (visible in pg_stat_activity)
  applicationName: "myapp-api"
})
```

### Connection Pool

```typescript
const DatabaseLive = PgClient.layer({
  // ... connection options
  
  // Pool size
  maxConnections: 20,      // Maximum pool size
  minConnections: 5,       // Minimum pool size
  
  // Timeouts
  connectTimeout: Duration.seconds(10),  // Connection timeout
  idleTimeout: Duration.minutes(10),     // Idle connection timeout
  connectionTTL: Duration.minutes(30)    // Max connection lifetime
})
```

### Name Transformations

```typescript
import { String } from "effect"

const DatabaseLive = PgClient.layer({
  // ... connection options
  
  // Transform camelCase to snake_case in queries
  transformQueryNames: String.camelToSnake,
  
  // Transform snake_case to camelCase in results
  transformResultNames: String.snakeToCamel,
  
  // Also transform keys in JSON columns
  transformJson: true
})
```

### Environment Configuration

```typescript
import { Config, Redacted } from "effect"

const DatabaseConfig = Config.all({
  host: Config.string("PG_HOST").pipe(Config.withDefault("localhost")),
  port: Config.integer("PG_PORT").pipe(Config.withDefault(5432)),
  database: Config.string("PG_DATABASE"),
  username: Config.string("PG_USER"),
  password: Config.redacted("PG_PASSWORD"),
  ssl: Config.boolean("PG_SSL").pipe(Config.withDefault(false))
})

const DatabaseLive = PgClient.layerConfig(DatabaseConfig)
```

## PostgreSQL-Specific Features

### JSON Helper

Use the `json` helper for JSON/JSONB columns:

```typescript
const pg = yield* PgClient.PgClient

// Insert JSON data
yield* pg`
  INSERT INTO settings ${pg.insert({
    userId: 1,
    preferences: pg.json({ theme: "dark", language: "en" })
  })}
`

// JSON is properly serialized and transformed
yield* pg`
  UPDATE settings 
  SET preferences = ${pg.json({ theme: "light" })}
  WHERE user_id = ${1}
`
```

### LISTEN/NOTIFY

PostgreSQL's pub/sub mechanism for real-time events:

```typescript
import { Stream, Console } from "effect"

const pg = yield* PgClient.PgClient

// Listen for notifications
const notifications = pg.listen("user_changes")

yield* notifications.pipe(
  Stream.tap((payload) => Console.log("Received:", payload)),
  Stream.take(10),
  Stream.runDrain
)

// Send a notification
yield* pg.notify("user_changes", JSON.stringify({ userId: 1, action: "updated" }))
```

Use cases:
- Real-time updates
- Cache invalidation
- Event-driven architectures
- WebSocket notifications

### RETURNING Clause

PostgreSQL supports RETURNING for INSERT/UPDATE/DELETE:

```typescript
const sql = yield* SqlClient.SqlClient

// Insert and get the new row
const [newUser] = yield* sql`
  INSERT INTO users ${sql.insert({ name: "Alice", email: "alice@example.com" })}
  RETURNING *
`

// Or with the helper
const [newUser] = yield* sql`
  INSERT INTO users ${sql.insert({ name: "Alice" }).returning("*")}
`

// Update and return affected rows
const updated = yield* sql`
  UPDATE users 
  SET ${sql.update({ name: "Alice Smith" })} 
  WHERE id = ${1}
  RETURNING id, name
`
```

### Batch Updates

Update multiple rows efficiently:

```typescript
const sql = yield* SqlClient.SqlClient

yield* sql`
  UPDATE users 
  SET name = data.name, email = data.email
  FROM ${sql.updateValues([
    { id: 1, name: "Alice", email: "alice@example.com" },
    { id: 2, name: "Bob", email: "bob@example.com" }
  ], "data")}
  WHERE users.id = data.id
`
```

### Array Types

PostgreSQL supports native arrays:

```typescript
// Query with array parameter
const tags = ["typescript", "effect"]
const posts = yield* sql`
  SELECT * FROM posts WHERE tags && ${tags}::text[]
`

// Insert array values
yield* sql`
  INSERT INTO posts ${sql.insert({
    title: "Hello",
    tags: ["typescript", "effect"]
  })}
`
```

### Multi-Statement Queries

Execute multiple statements in a single query:

```typescript
const results = yield* sql`
  INSERT INTO users (name) VALUES ('Alice') RETURNING *;
  INSERT INTO users (name) VALUES ('Bob') RETURNING *;
`
// results is an array of result arrays
// results[0] = [{ id: 1, name: 'Alice' }]
// results[1] = [{ id: 2, name: 'Bob' }]
```

## Streaming Large Results

For queries that return many rows:

```typescript
import { Stream, Chunk } from "effect"

const sql = yield* SqlClient.SqlClient

// Stream results in batches
const allUsers = yield* sql`SELECT * FROM users`.stream.pipe(
  Stream.tap((user) => Console.log("Processing:", user.name)),
  Stream.runCollect
)

// Process in chunks
yield* sql`SELECT * FROM large_table`.stream.pipe(
  Stream.grouped(100),
  Stream.mapEffect((batch) => processBatch(batch)),
  Stream.runDrain
)
```

## Transactions

### Basic Transaction

```typescript
const sql = yield* SqlClient.SqlClient

yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT INTO users ${sql.insert({ name: "Alice" })}`
    yield* sql`INSERT INTO profiles ${sql.insert({ userId: 1 })}`
  })
)
```

### Savepoints (Nested Transactions)

Effect SQL automatically uses savepoints for nested transactions:

```typescript
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT INTO users ${sql.insert({ name: "Alice" })}`
    
    // This creates a savepoint
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO profiles ${sql.insert({ userId: 1 })}`
        // If this fails, only the inner transaction rolls back
      })
    ).pipe(Effect.catchAll(() => Effect.void))
    
    // Outer transaction continues
    yield* sql`UPDATE user_counts SET count = count + 1`
  })
)
```

### Transaction Isolation

Set transaction isolation level via raw SQL:

```typescript
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`
    // ... your queries
  })
)
```

## Advanced Usage

### Reserved Connections

For operations requiring a dedicated connection:

```typescript
import { Effect, Scope } from "effect"

yield* Effect.scoped(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const conn = yield* sql.reserve
    
    // conn is a dedicated connection
    // It's released when the scope closes
  })
)
```

### Custom Types

Configure custom type parsers:

```typescript
import Pg from "pg"

// Custom type parsing
const types = {
  getTypeParser: (oid: number) => {
    if (oid === 1184) { // timestamp with timezone
      return (value: string) => new Date(value)
    }
    return Pg.types.getTypeParser(oid)
  }
}

const DatabaseLive = PgClient.layer({
  // ... connection options
  types
})
```

### Query Interruption

Queries can be interrupted (cancelled on the database):

```typescript
import { TestServices } from "effect"

const result = yield* sql`SELECT pg_sleep(10)`.pipe(
  Effect.timeout("1 second"),
  TestServices.provideLive
)
// Query is cancelled on the PostgreSQL server
```

## Error Handling

Handle PostgreSQL-specific errors:

```typescript
import { SqlError } from "@effect/sql"

program.pipe(
  Effect.catchTag("SqlError", (error) => {
    const pgError = error.cause as { code?: string; detail?: string }
    
    switch (pgError.code) {
      case "23505": // unique_violation
        return Effect.fail(new DuplicateKeyError(pgError.detail))
      case "23503": // foreign_key_violation
        return Effect.fail(new ForeignKeyError())
      case "23502": // not_null_violation
        return Effect.fail(new RequiredFieldError())
      case "40001": // serialization_failure
        return Effect.fail(new TransactionConflictError())
      default:
        return Effect.fail(error)
    }
  })
)
```

Common PostgreSQL error codes:
- `23505` - Unique constraint violation
- `23503` - Foreign key violation
- `23502` - Not null violation
- `23514` - Check constraint violation
- `42P01` - Table does not exist
- `40001` - Serialization failure
- `57014` - Query cancelled

## Migrations

Use the migrator with PostgreSQL:

```typescript
import { PgMigrator } from "@effect/sql-pg"
import { Migrator } from "@effect/sql"

const MigratorLive = PgMigrator.layer({
  loader: Migrator.fromGlob(import.meta.glob("./migrations/*.ts")),
  schemaDirectory: "./migrations"
})

const program = Effect.gen(function* () {
  const migrations = yield* Migrator.Migrator
  yield* migrations
})
```

## Performance Tips

### Connection Pool Sizing

```typescript
// For web applications:
// (CPU cores * 2) + 1 is a good starting point
const DatabaseLive = PgClient.layer({
  maxConnections: 10,  // Adjust based on load
  minConnections: 2,   // Keep some connections warm
})
```

### Prepared Statements

Effect SQL uses parameterized queries, which PostgreSQL can cache:

```typescript
// These use the same prepared statement:
yield* sql`SELECT * FROM users WHERE id = ${1}`
yield* sql`SELECT * FROM users WHERE id = ${2}`
yield* sql`SELECT * FROM users WHERE id = ${3}`
```

### EXPLAIN ANALYZE

Debug query performance:

```typescript
const explain = yield* sql`EXPLAIN ANALYZE SELECT * FROM users WHERE age > ${18}`
console.log(explain)
```

## Next Steps

- [Migrations](/docs/advanced/migrations) - Database schema management
- [Transactions](/docs/advanced/transactions) - Advanced transaction patterns
- [Connection Pooling](/docs/guides/connection-pooling) - Pool optimization
