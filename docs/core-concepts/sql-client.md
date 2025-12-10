---
title: SqlClient
description: The central interface for database operations in Effect SQL.
---

# SqlClient

The `SqlClient` is the primary interface for interacting with your database. It's provided as an Effect service, meaning you access it through the Effect context system.

## Accessing the Client

The client is accessed using `SqlClient.SqlClient`:

```typescript
import { Effect } from "effect"
import { SqlClient } from "@effect/sql"

const program = Effect.gen(function* () {
  // Yield the client from context
  const sql = yield* SqlClient.SqlClient
  
  // Now use it to run queries
  const users = yield* sql`SELECT * FROM users`
})
```

The actual implementation comes from a database-specific Layer:

```typescript
import { PgClient } from "@effect/sql-pg"

const program = /* ... */

// Provide the PostgreSQL implementation
Effect.runPromise(
  program.pipe(Effect.provide(PgClient.layer({ /* config */ })))
)
```

This design has several benefits:
- **Testability** - Easily swap implementations for testing
- **Flexibility** - Change databases without changing business logic
- **Composability** - The client is available anywhere in your Effect code

## The Tagged Template Interface

The client is callable as a tagged template literal:

```typescript
const sql = yield* SqlClient.SqlClient

// Basic query
const users = yield* sql`SELECT * FROM users`

// With parameters
const name = "Alice"
const filteredUsers = yield* sql`SELECT * FROM users WHERE name = ${name}`
```

### How Parameters Work

When you interpolate values with `${}`, they become parameterized query values:

```typescript
const id = 5
const name = "Alice"

const users = yield* sql`
  SELECT * FROM users 
  WHERE id = ${id} AND name = ${name}
`

// Compiles to:
// PostgreSQL: SELECT * FROM users WHERE id = $1 AND name = $2
// MySQL:      SELECT * FROM users WHERE id = ? AND name = ?
// SQLite:     SELECT * FROM users WHERE id = ? AND name = ?
// Parameters: [5, "Alice"]
```

This prevents SQL injection because values are never interpolated into the SQL string—they're passed separately to the database driver.

### Type Annotations

Specify the expected result type using a generic:

```typescript
interface User {
  id: number
  name: string
  email: string
}

// Results are typed as User[]
const users = yield* sql<User>`SELECT id, name, email FROM users`
```

Note that this is a *declaration*, not a runtime check. The database might return different data. For runtime validation, use [Schema integration](/docs/advanced/models).

## Client Methods

Beyond the template literal interface, the client provides several methods:

### `sql.unsafe`

Execute raw SQL strings (use with caution):

```typescript
// When you need to construct SQL dynamically
const tableName = "users" // Must be trusted!
const users = yield* sql.unsafe(`SELECT * FROM ${tableName}`)
```

::: warning
Only use `unsafe` with trusted input. Never interpolate user input directly.
:::

### `sql.insert`

Generate INSERT clause values:

```typescript
// Single row
yield* sql`INSERT INTO users ${sql.insert({ name: "Alice", email: "alice@example.com" })}`
// → INSERT INTO users ("name","email") VALUES ($1,$2)

// Multiple rows
yield* sql`INSERT INTO users ${sql.insert([
  { name: "Alice", email: "alice@example.com" },
  { name: "Bob", email: "bob@example.com" }
])}`
// → INSERT INTO users ("name","email") VALUES ($1,$2),($3,$4)
```

With RETURNING clause:

```typescript
const [newUser] = yield* sql`
  INSERT INTO users ${sql.insert({ name: "Alice" }).returning("*")}
`
```

### `sql.update`

Generate SET clause for UPDATE statements:

```typescript
// Update a single record
yield* sql`
  UPDATE users 
  SET ${sql.update({ name: "Alice Smith", email: "alice.smith@example.com" })}
  WHERE id = ${1}
`
// → UPDATE users SET "name" = $1, "email" = $2 WHERE id = $3

// Omit specific fields from the update
yield* sql`
  UPDATE users 
  SET ${sql.update({ id: 1, name: "Alice" }, ["id"])}
  WHERE id = ${1}
`
// → UPDATE users SET "name" = $1 WHERE id = $2
// (id is omitted from the SET clause)
```

### `sql.updateValues` (Batch Updates)

Update multiple rows efficiently (PostgreSQL, MySQL, MSSQL):

```typescript
yield* sql`
  UPDATE users 
  SET name = data.name 
  FROM ${sql.updateValues([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }], "data")}
  WHERE users.id = data.id
`
```

::: info
`updateValues` is not supported in SQLite. Use a transaction with individual updates instead.
:::

### `sql.in`

Generate IN clause:

```typescript
const ids = [1, 2, 3]

// Just the values
yield* sql`SELECT * FROM users WHERE id IN ${sql.in(ids)}`
// → SELECT * FROM users WHERE id IN ($1,$2,$3)

// With column name (handles empty arrays)
yield* sql`SELECT * FROM users WHERE ${sql.in("id", ids)}`
// → SELECT * FROM users WHERE "id" IN ($1,$2,$3)

// Empty array produces a false condition
yield* sql`SELECT * FROM users WHERE ${sql.in("id", [])}`
// → SELECT * FROM users WHERE 1=0
```

### `sql.and` / `sql.or`

Combine conditions:

```typescript
const conditions = [
  sql`name = ${"Alice"}`,
  sql`age > ${18}`,
  sql`active = ${true}`
]

yield* sql`SELECT * FROM users WHERE ${sql.and(conditions)}`
// → SELECT * FROM users WHERE (name = $1 AND age > $2 AND active = $3)

yield* sql`SELECT * FROM users WHERE ${sql.or(conditions)}`
// → SELECT * FROM users WHERE (name = $1 OR age > $2 OR active = $3)
```

### `sql.csv`

Generate comma-separated values:

```typescript
const columns = ["id", "name", "email"]

yield* sql`SELECT ${sql.csv(columns)} FROM users`
// → SELECT "id","name","email" FROM users

// With prefix (useful for ORDER BY)
yield* sql`SELECT * FROM users ORDER BY ${sql.csv("ORDER BY", ["name", "created_at"])}`
// → SELECT * FROM users ORDER BY "name","created_at"
```

### `sql.literal`

Insert raw SQL (no escaping):

```typescript
const orderBy = sql.literal("created_at DESC")
yield* sql`SELECT * FROM users ORDER BY ${orderBy}`
```

::: warning
Only use `literal` with trusted input.
:::

## Identifier Escaping

Pass a string directly to `sql()` to create an escaped identifier:

```typescript
const tableName = "users"
const columnName = "name"

yield* sql`SELECT ${sql(columnName)} FROM ${sql(tableName)}`
// → SELECT "name" FROM "users"
```

## Dialect-Specific Code

Use `onDialect` or `onDialectOrElse` for database-specific SQL:

```typescript
const result = sql.onDialect({
  pg: () => sql`SELECT NOW()`,
  mysql: () => sql`SELECT NOW()`,
  sqlite: () => sql`SELECT datetime('now')`,
  mssql: () => sql`SELECT GETDATE()`,
  clickhouse: () => sql`SELECT now()`
})

// Or with a fallback
const result = sql.onDialectOrElse({
  pg: () => sql`SELECT NOW()`,
  orElse: () => sql`SELECT CURRENT_TIMESTAMP`
})
```

## Database-Specific Clients

Each database adapter provides its own client type with additional methods:

```typescript
import { PgClient } from "@effect/sql-pg"

const program = Effect.gen(function* () {
  // Get the PostgreSQL-specific client
  const pg = yield* PgClient.PgClient
  
  // PostgreSQL-specific: LISTEN/NOTIFY
  const notifications = pg.listen("my_channel")
  
  // PostgreSQL-specific: JSON helper
  yield* pg`INSERT INTO data ${pg.insert({ config: pg.json({ key: "value" }) })}`
})
```

See the database-specific documentation for details:
- [PostgreSQL](/docs/databases/postgresql)
- [SQLite](/docs/databases/sqlite)
- [MySQL](/docs/databases/mysql)

## Client Options

### Transform Functions

Automatically transform column and parameter names:

```typescript
import { String } from "effect"
import { PgClient } from "@effect/sql-pg"

const DatabaseLive = PgClient.layer({
  database: "myapp",
  // Transform camelCase to snake_case for queries
  transformQueryNames: String.camelToSnake,
  // Transform snake_case to camelCase for results  
  transformResultNames: String.snakeToCamel
})
```

This allows you to use camelCase in TypeScript while your database uses snake_case:

```typescript
// TypeScript uses camelCase
yield* sql`SELECT * FROM users WHERE ${sql.in("createdAt", dates)}`
// Query uses snake_case: WHERE "created_at" IN (...)

// Results come back as camelCase
const users = yield* sql<{ createdAt: Date }>`SELECT created_at FROM users`
// users[0].createdAt (not users[0].created_at)
```

### `withoutTransforms`

Temporarily disable transformations:

```typescript
const sql = yield* SqlClient.SqlClient
const rawSql = sql.withoutTransforms()

// This query won't have transformations applied
const result = yield* rawSql`SELECT * FROM users`
```

## Connection Management

### Reserving Connections

For operations that need a dedicated connection:

```typescript
Effect.scoped(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const connection = yield* sql.reserve
    
    // Use the connection directly
    // Connection is released when the scope closes
  })
)
```

### Transactions

Wrap effects in transactions:

```typescript
const sql = yield* SqlClient.SqlClient

yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT INTO users ...`
    yield* sql`INSERT INTO profiles ...`
  })
)
```

See [Transactions](/docs/advanced/transactions) for details.

## Error Handling

SQL operations can fail with `SqlError`:

```typescript
import { SqlError } from "@effect/sql"

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const users = yield* sql`SELECT * FROM users`
  return users
})

// Handle SQL errors
program.pipe(
  Effect.catchTag("SqlError", (error) => {
    console.error("Database error:", error.message)
    console.error("Cause:", error.cause) // Original driver error
    return Effect.succeed([])
  })
)
```

See [Error Handling](/docs/core-concepts/error-handling) for more details.

## Next Steps

- [Statements & Queries](/docs/core-concepts/statements) - Deep dive into query construction
- [Parameters](/docs/core-concepts/parameters) - Learn about parameter handling
- [Transactions](/docs/advanced/transactions) - Transaction management
