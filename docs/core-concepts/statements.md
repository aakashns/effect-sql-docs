---
title: Statements & Queries
description: Understanding how Effect SQL builds and executes SQL statements.
---

# Statements & Queries

Every query in Effect SQL is represented as a `Statement`. Understanding how statements work helps you write more efficient and flexible database code.

## What is a Statement?

A `Statement<A>` is both:
1. A description of a SQL query (the SQL text and parameters)
2. An `Effect<ReadonlyArray<A>, SqlError>` that executes the query

```typescript
const sql = yield* SqlClient.SqlClient

// This creates a Statement<{ id: number; name: string }>
const query = sql<{ id: number; name: string }>`SELECT id, name FROM users`

// A Statement IS an Effect, so you can yield it
const results = yield* query // ReadonlyArray<{ id: number; name: string }>
```

## Statement Composition

Because statements are Effects, you can compose them using all Effect combinators:

```typescript
// Sequence operations
const createAndFetch = Effect.gen(function* () {
  yield* sql`INSERT INTO users ${sql.insert({ name: "Alice" })}`
  const users = yield* sql`SELECT * FROM users`
  return users
})

// Parallel queries
const [users, posts, comments] = yield* Effect.all([
  sql`SELECT * FROM users`,
  sql`SELECT * FROM posts`,
  sql`SELECT * FROM comments`
], { concurrency: "unbounded" })

// With error recovery
const usersOrEmpty = sql`SELECT * FROM users`.pipe(
  Effect.catchAll(() => Effect.succeed([]))
)
```

## Inspecting Statements

### Compiling to SQL

Use `.compile()` to see the generated SQL:

```typescript
const statement = sql`SELECT * FROM users WHERE id = ${5}`

const [sqlText, params] = statement.compile()
// sqlText: "SELECT * FROM users WHERE id = $1"
// params: [5]
```

This is useful for:
- Debugging queries
- Logging
- Understanding parameter binding

### Transform Modes

The `compile` method accepts an optional `withoutTransform` flag:

```typescript
// With name transformations (default)
const [sql1] = sql`SELECT ${sql("userName")} FROM users`.compile(false)
// "SELECT \"user_name\" FROM users" (if camelToSnake transform is set)

// Without transformations
const [sql2] = sql`SELECT ${sql("userName")} FROM users`.compile(true)
// "SELECT \"userName\" FROM users"
```

## Execution Modes

Statements provide several ways to execute queries:

### Default Execution

Executes the query and returns transformed results:

```typescript
const users = yield* sql`SELECT * FROM users`
// Results are transformed according to client configuration
```

### Raw Execution

Get raw results without transformation:

```typescript
const users = yield* sql`SELECT * FROM users`.raw
// Returns the raw result from the database driver
```

### Without Transform

Execute but skip result name transformation:

```typescript
const users = yield* sql`SELECT * FROM users`.withoutTransform
// Column names are not transformed (snake_case stays snake_case)
```

### Values Only

Get results as arrays instead of objects:

```typescript
const rows = yield* sql`SELECT id, name FROM users`.values
// [[1, "Alice"], [2, "Bob"]]
```

### Unprepared Execution

Execute without using prepared statements:

```typescript
const users = yield* sql`SELECT * FROM users`.unprepared
// Query is sent as-is without preparation
```

This can be useful for:
- DDL statements that can't be prepared
- Queries that change structure dynamically
- Working around driver limitations

### Streaming Results

For large result sets, stream rows instead of loading all into memory:

```typescript
import { Stream } from "effect"

const userStream = sql`SELECT * FROM users`.stream

const processed = yield* userStream.pipe(
  Stream.tap(user => Console.log("Processing:", user.name)),
  Stream.runCollect
)
```

See [Streaming](/docs/advanced/streaming) for details.

## Fragments

Fragments are pieces of SQL that can be composed into statements:

```typescript
import { Statement } from "@effect/sql"

// Create a fragment
const whereClause = sql`WHERE active = ${true}`

// Use it in a query
const users = yield* sql`SELECT * FROM users ${whereClause}`
```

Fragments can contain parameters and other fragments:

```typescript
const condition1 = sql`age > ${18}`
const condition2 = sql`verified = ${true}`

const combined = sql.and([condition1, condition2])
// (age > $1 AND verified = $2)

const users = yield* sql`SELECT * FROM users WHERE ${combined}`
```

### Creating Fragments

Use `sql.literal` for raw SQL fragments:

```typescript
const orderBy = sql.literal("ORDER BY created_at DESC")
const users = yield* sql`SELECT * FROM users ${orderBy}`
```

Use `Statement.unsafeFragment` for fragments with parameters:

```typescript
import { Statement } from "@effect/sql"

const fragment = Statement.unsafeFragment(
  "WHERE id = ? AND name = ?",
  [1, "Alice"]
)
```

## Custom Helpers

You can create reusable query builders:

```typescript
const paginate = (page: number, perPage: number) => {
  const offset = (page - 1) * perPage
  return sql.literal(`LIMIT ${perPage} OFFSET ${offset}`)
}

const users = yield* sql`
  SELECT * FROM users 
  ORDER BY created_at DESC 
  ${paginate(2, 20)}
`
```

For type-safe dynamic queries, consider using fragments:

```typescript
const buildUserQuery = (options: {
  name?: string
  minAge?: number
  active?: boolean
}) => {
  const conditions: Array<Statement.Fragment> = []
  
  if (options.name) {
    conditions.push(sql`name LIKE ${`%${options.name}%`}`)
  }
  if (options.minAge) {
    conditions.push(sql`age >= ${options.minAge}`)
  }
  if (options.active !== undefined) {
    conditions.push(sql`active = ${options.active}`)
  }
  
  const where = conditions.length > 0
    ? sql`WHERE ${sql.and(conditions)}`
    : sql``
  
  return sql<User>`SELECT * FROM users ${where}`
}

// Usage
const activeAdults = yield* buildUserQuery({ minAge: 18, active: true })
```

## Statement Transformers

You can intercept and transform statements before they execute using `Statement.withTransformer`:

```typescript
import { Statement } from "@effect/sql"

// Log all queries
const withLogging = Statement.withTransformer((statement, sql, context, span) => {
  const [query, params] = statement.compile()
  console.log("Executing:", query, params)
  return Effect.succeed(statement)
})

// Apply to an effect
yield* withLogging(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT * FROM users`
  })
)
```

Or set a transformer globally:

```typescript
const LoggingLayer = Statement.setTransformer((statement, sql, context, span) => {
  // Transform or log the statement
  return Effect.succeed(statement)
})
```

## Best Practices

### 1. Keep Queries Close to Usage

```typescript
// ✅ Good: Query is defined where it's used
const getUser = (id: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql<User>`SELECT * FROM users WHERE id = ${id}`
  })

// ❌ Avoid: Queries defined far from usage
const USER_QUERY = "SELECT * FROM users WHERE id = ?"
```

### 2. Use Type Annotations

```typescript
// ✅ Good: Explicit result type
const users = yield* sql<{ id: number; name: string }>`SELECT id, name FROM users`

// ⚠️ Risky: No type annotation, results are unknown
const users = yield* sql`SELECT id, name FROM users`
```

### 3. Prefer Helpers Over String Concatenation

```typescript
// ✅ Good: Using helpers
yield* sql`INSERT INTO users ${sql.insert({ name, email })}`

// ❌ Bad: String manipulation
yield* sql.unsafe(`INSERT INTO users (name, email) VALUES ('${name}', '${email}')`)
```

### 4. Use Fragments for Reusable Conditions

```typescript
// ✅ Good: Reusable, composable
const activeUsers = sql`active = ${true}`
const admins = sql`role = ${"admin"}`

yield* sql`SELECT * FROM users WHERE ${sql.and([activeUsers, admins])}`
```

## Next Steps

- [Parameters & Interpolation](/docs/core-concepts/parameters) - Deep dive into parameter handling
- [Error Handling](/docs/core-concepts/error-handling) - Handling query errors
- [Models](/docs/advanced/models) - Type-safe query results with Schema
