---
title: Parameters & Interpolation
description: How Effect SQL handles query parameters safely and efficiently.
---

# Parameters & Interpolation

Proper parameter handling is crucial for both security (preventing SQL injection) and performance (prepared statement caching). Effect SQL makes it easy to do the right thing.

## How Interpolation Works

When you use `${}` in a query template, Effect SQL analyzes the value and handles it appropriately:

### Primitive Values

Primitive values become parameterized:

```typescript
const name = "Alice"
const age = 30

const users = yield* sql`
  SELECT * FROM users 
  WHERE name = ${name} AND age = ${age}
`
// Query: SELECT * FROM users WHERE name = $1 AND age = $2
// Params: ["Alice", 30]
```

Supported types:
- Strings
- Numbers (including bigint)
- Booleans
- Dates
- `null`
- `Uint8Array` (for binary data)

### Arrays

Arrays are converted to a comma-separated list of parameters:

```typescript
const ids = [1, 2, 3]

const users = yield* sql`SELECT * FROM users WHERE id IN ${sql.in(ids)}`
// Query: SELECT * FROM users WHERE id IN ($1,$2,$3)
// Params: [1, 2, 3]
```

::: tip
Always use `sql.in()` for array values. Don't try to interpolate arrays directly.
:::

### Objects

Objects are converted to column-value pairs for INSERT/UPDATE:

```typescript
const data = { name: "Alice", email: "alice@example.com" }

yield* sql`INSERT INTO users ${sql.insert(data)}`
// Query: INSERT INTO users ("name","email") VALUES ($1,$2)
// Params: ["Alice", "alice@example.com"]

yield* sql`UPDATE users SET ${sql.update(data)} WHERE id = ${1}`
// Query: UPDATE users SET "name" = $1, "email" = $2 WHERE id = $3
// Params: ["Alice", "alice@example.com", 1]
```

### Fragments

SQL fragments are embedded directly:

```typescript
const condition = sql`active = ${true}`
const orderBy = sql.literal("ORDER BY created_at DESC")

const users = yield* sql`SELECT * FROM users WHERE ${condition} ${orderBy}`
// Query: SELECT * FROM users WHERE active = $1 ORDER BY created_at DESC
// Params: [true]
```

## Parameter Placeholders

Different databases use different placeholder styles. Effect SQL handles this automatically:

| Database   | Placeholder Style |
|------------|-------------------|
| PostgreSQL | `$1`, `$2`, `$3` |
| MySQL      | `?`, `?`, `?`    |
| SQLite     | `?`, `?`, `?`    |
| SQL Server | `@p1`, `@p2`, `@p3` |

You write the same code; Effect SQL generates the correct SQL for your database.

## Dynamic Queries

### Conditional Clauses

Build queries dynamically based on conditions:

```typescript
interface QueryOptions {
  name?: string
  minAge?: number
  maxAge?: number
  active?: boolean
}

const findUsers = (options: QueryOptions) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    const conditions: Array<Statement.Fragment> = []
    
    if (options.name) {
      conditions.push(sql`name ILIKE ${`%${options.name}%`}`)
    }
    if (options.minAge !== undefined) {
      conditions.push(sql`age >= ${options.minAge}`)
    }
    if (options.maxAge !== undefined) {
      conditions.push(sql`age <= ${options.maxAge}`)
    }
    if (options.active !== undefined) {
      conditions.push(sql`active = ${options.active}`)
    }
    
    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.and(conditions)}`
      : sql``
    
    return yield* sql<User>`SELECT * FROM users ${whereClause}`
  })
```

### Dynamic Column Selection

```typescript
const selectColumns = (columns: string[]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    // Escape column names for safety
    const columnList = sql.csv(columns.map(c => sql(c)))
    
    return yield* sql`SELECT ${columnList} FROM users`
  })
```

### Dynamic Table Names

```typescript
const queryTable = (tableName: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    // sql() escapes the identifier
    return yield* sql`SELECT * FROM ${sql(tableName)}`
  })
```

::: warning
Only use trusted table names. Even with escaping, allowing arbitrary user input for table names is risky.
:::

## Identifier Escaping

Use `sql()` (calling the client as a function with a string) to create escaped identifiers:

```typescript
const tableName = "user's table"  // Has special characters
const columnName = "select"       // Reserved word

yield* sql`SELECT ${sql(columnName)} FROM ${sql(tableName)}`
// PostgreSQL: SELECT "select" FROM "user's table"
// MySQL: SELECT `select` FROM `user's table`
```

## Name Transformations

Configure automatic name transformations in the client:

```typescript
import { String } from "effect"

const DatabaseLive = PgClient.layer({
  // Transform identifiers in queries: camelCase → snake_case
  transformQueryNames: String.camelToSnake,
  // Transform column names in results: snake_case → camelCase
  transformResultNames: String.snakeToCamel
})
```

With this configuration:

```typescript
// Your TypeScript code uses camelCase
yield* sql`SELECT * FROM users WHERE ${sql("createdAt")} > ${date}`
// Becomes: SELECT * FROM users WHERE "created_at" > $1

// Results come back as camelCase
const user = yield* sql<{ createdAt: Date }>`SELECT created_at FROM users`
// user.createdAt (not user.created_at)

// Inserts also transform
yield* sql`INSERT INTO users ${sql.insert({ firstName: "Alice" })}`
// Becomes: INSERT INTO users ("first_name") VALUES ($1)
```

## JSON Values

For JSON columns, use the database-specific JSON helper:

```typescript
// PostgreSQL
import { PgClient } from "@effect/sql-pg"

const pg = yield* PgClient.PgClient

yield* pg`INSERT INTO data ${pg.insert({ 
  config: pg.json({ theme: "dark", language: "en" })
})}`
// The JSON is properly serialized and typed
```

## Binary Data

Binary data is passed as `Uint8Array`:

```typescript
const imageData = new Uint8Array([...])

yield* sql`INSERT INTO files ${sql.insert({ 
  name: "image.png",
  data: imageData 
})}`
```

## NULL Handling

`null` is handled correctly:

```typescript
const middleName: string | null = null

yield* sql`INSERT INTO users ${sql.insert({ 
  name: "Alice",
  middleName  // Will be NULL in the database
})}`

// Querying for NULL
yield* sql`SELECT * FROM users WHERE middle_name IS NULL`
```

::: tip
Use `IS NULL` / `IS NOT NULL` in SQL, not `= NULL`. Effect SQL doesn't transform equality checks with null automatically.
:::

## Empty Arrays

Empty arrays need special handling to avoid invalid SQL:

```typescript
const ids: number[] = []

// BAD: This would generate invalid SQL
// yield* sql`SELECT * FROM users WHERE id IN ${sql.in(ids)}`
// Would be: SELECT * FROM users WHERE id IN ()

// GOOD: sql.in with column name handles empty arrays
yield* sql`SELECT * FROM users WHERE ${sql.in("id", ids)}`
// Generates: SELECT * FROM users WHERE 1=0 (always false)
```

Alternatively, check before querying:

```typescript
const users = ids.length === 0
  ? Effect.succeed([])
  : sql<User>`SELECT * FROM users WHERE id IN ${sql.in(ids)}`
```

## Prepared Statement Caching

Effect SQL uses parameterized queries, which enables prepared statement caching in most databases. This means:

1. The query text is parsed and planned once
2. Subsequent executions reuse the plan
3. Different parameters don't create new plans

```typescript
// These use the same prepared statement:
yield* sql`SELECT * FROM users WHERE id = ${1}`
yield* sql`SELECT * FROM users WHERE id = ${2}`
yield* sql`SELECT * FROM users WHERE id = ${3}`
```

The statement cache is managed by the database driver and typically limited by connection.

## Best Practices

### 1. Never Concatenate User Input

```typescript
// ❌ DANGEROUS: SQL injection vulnerability
const name = req.query.name
yield* sql.unsafe(`SELECT * FROM users WHERE name = '${name}'`)

// ✅ SAFE: Parameterized query
const name = req.query.name
yield* sql`SELECT * FROM users WHERE name = ${name}`
```

### 2. Use Helpers for Complex Values

```typescript
// ✅ GOOD: Use sql.insert for objects
yield* sql`INSERT INTO users ${sql.insert(userData)}`

// ✅ GOOD: Use sql.in for arrays
yield* sql`SELECT * FROM users WHERE ${sql.in("id", userIds)}`

// ✅ GOOD: Use sql.and/sql.or for conditions
yield* sql`SELECT * FROM users WHERE ${sql.and(conditions)}`
```

### 3. Escape Identifiers Properly

```typescript
// ✅ GOOD: sql() escapes identifiers
yield* sql`SELECT * FROM ${sql(tableName)}`

// ❌ BAD: Direct string interpolation
yield* sql.unsafe(`SELECT * FROM ${tableName}`)
```

### 4. Handle Empty Collections

```typescript
// ✅ GOOD: Check for empty arrays
if (ids.length > 0) {
  yield* sql`SELECT * FROM users WHERE ${sql.in("id", ids)}`
}

// ✅ GOOD: Use sql.in with column name (handles empty arrays)
yield* sql`SELECT * FROM users WHERE ${sql.in("id", ids)}`
```

## Next Steps

- [Error Handling](/docs/core-concepts/error-handling) - Handle query errors properly
- [Configuration](/docs/core-concepts/configuration) - Configure name transformations
- [Transactions](/docs/advanced/transactions) - Group queries in transactions
