---
title: Error Handling
description: Understanding and handling SQL errors in Effect SQL.
---

# Error Handling

Effect SQL provides structured error handling through Effect's error system. All SQL operations can fail with well-typed errors that you can handle explicitly.

## The SqlError Type

All database errors are represented as `SqlError`:

```typescript
import { SqlError } from "@effect/sql"

class SqlError {
  readonly _tag: "SqlError"
  readonly message: string
  readonly cause?: unknown  // The original driver error
}
```

The `cause` property contains the original error from the underlying database driver, which includes database-specific error codes and details.

## Handling Errors

### Basic Error Handling

```typescript
import { Effect } from "effect"
import { SqlClient, SqlError } from "@effect/sql"

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql`SELECT * FROM users`
})

// Handle all SQL errors
const handled = program.pipe(
  Effect.catchTag("SqlError", (error) => {
    console.error("Database error:", error.message)
    return Effect.succeed([]) // Return empty array as fallback
  })
)
```

### Accessing the Original Error

The database driver's original error is in the `cause` property:

```typescript
Effect.catchTag("SqlError", (error) => {
  // PostgreSQL example
  const pgError = error.cause as { code?: string; detail?: string }
  
  if (pgError.code === "23505") {
    // Unique constraint violation
    return Effect.fail(new DuplicateEntryError())
  }
  
  return Effect.fail(error)
})
```

### Database-Specific Error Codes

Different databases have different error codes:

```typescript
const handleConstraintViolation = Effect.catchTag("SqlError", (error) => {
  const cause = error.cause as any
  
  // PostgreSQL
  if (cause?.code === "23505") {
    return Effect.fail(new UniqueViolationError())
  }
  
  // MySQL
  if (cause?.errno === 1062) {
    return Effect.fail(new UniqueViolationError())
  }
  
  // SQLite
  if (cause?.code === "SQLITE_CONSTRAINT_UNIQUE") {
    return Effect.fail(new UniqueViolationError())
  }
  
  return Effect.fail(error)
})
```

## Common Error Patterns

### Connection Errors

```typescript
const withConnectionRetry = <A, E, R>(
  effect: Effect.Effect<A, E | SqlError, R>
) =>
  effect.pipe(
    Effect.retry({
      times: 3,
      schedule: Schedule.exponential("100 millis"),
      while: (error) =>
        error._tag === "SqlError" &&
        error.message.includes("connection")
    })
  )
```

### Constraint Violations

```typescript
class UniqueViolationError {
  readonly _tag = "UniqueViolationError"
  constructor(readonly field: string) {}
}

const createUser = (user: NewUser) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql`INSERT INTO users ${sql.insert(user)} RETURNING *`
  }).pipe(
    Effect.catchTag("SqlError", (error) => {
      const cause = error.cause as any
      
      // Check for unique constraint (PostgreSQL)
      if (cause?.code === "23505") {
        const match = cause.detail?.match(/Key \((\w+)\)/)
        const field = match?.[1] ?? "unknown"
        return Effect.fail(new UniqueViolationError(field))
      }
      
      return Effect.fail(error)
    })
  )
```

### Foreign Key Violations

```typescript
class ForeignKeyError {
  readonly _tag = "ForeignKeyError"
  constructor(readonly constraint: string) {}
}

const deleteUser = (userId: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`DELETE FROM users WHERE id = ${userId}`
  }).pipe(
    Effect.catchTag("SqlError", (error) => {
      const cause = error.cause as any
      
      // PostgreSQL foreign key violation
      if (cause?.code === "23503") {
        return Effect.fail(new ForeignKeyError(cause.constraint))
      }
      
      return Effect.fail(error)
    })
  )
```

### Not Found Handling

Effect SQL returns empty arrays for queries with no results. Handle this explicitly:

```typescript
import { Option } from "effect"

const findUserById = (id: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const users = yield* sql<User>`SELECT * FROM users WHERE id = ${id}`
    return Option.fromNullable(users[0])
  })

// Usage
const user = yield* findUserById(999)
Option.match(user, {
  onNone: () => console.log("User not found"),
  onSome: (u) => console.log("Found:", u.name)
})
```

For operations that expect exactly one result:

```typescript
import { Cause } from "effect"

const requireUserById = (id: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const users = yield* sql<User>`SELECT * FROM users WHERE id = ${id}`
    
    if (users.length === 0) {
      return yield* Effect.fail(new Cause.NoSuchElementException())
    }
    
    return users[0]
  })
```

## Migration Errors

Migrations have their own error type:

```typescript
import { Migrator } from "@effect/sql"

class MigrationError {
  readonly _tag: "MigrationError"
  readonly reason: "bad-state" | "import-error" | "failed" | "duplicates" | "locked"
  readonly message: string
  readonly cause?: unknown
}
```

Handle migration errors appropriately:

```typescript
const runMigrations = migrator({
  loader: Migrator.fromGlob(import.meta.glob("./migrations/*.ts"))
}).pipe(
  Effect.catchTag("MigrationError", (error) => {
    switch (error.reason) {
      case "locked":
        console.log("Migrations already running")
        return Effect.succeed([])
      case "failed":
        console.error("Migration failed:", error.message)
        return Effect.fail(error)
      default:
        return Effect.fail(error)
    }
  })
)
```

## ResultLengthMismatch

When using `SqlResolver.ordered`, results must match request count:

```typescript
import { ResultLengthMismatch } from "@effect/sql"

program.pipe(
  Effect.catchTag("ResultLengthMismatch", (error) => {
    console.error(`Expected ${error.expected} results, got ${error.actual}`)
    return Effect.fail(error)
  })
)
```

## Schema Parse Errors

When using `SqlSchema`, parse errors can occur:

```typescript
import { ParseResult } from "effect"

const findUser = SqlSchema.findOne({
  Request: Schema.Number,
  Result: UserSchema,
  execute: (id) => sql`SELECT * FROM users WHERE id = ${id}`
})

findUser(1).pipe(
  Effect.catchTag("ParseError", (error) => {
    console.error("Invalid data from database:", ParseResult.TreeFormatter.format(error))
    return Effect.fail(new DataCorruptionError())
  })
)
```

## Transaction Error Handling

Errors in transactions automatically trigger rollback:

```typescript
const transfer = (fromId: number, toId: number, amount: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${fromId}`
        yield* sql`UPDATE accounts SET balance = balance + ${amount} WHERE id = ${toId}`
        
        // If any of these fails, the entire transaction is rolled back
      })
    )
  })
```

Handle transaction-specific errors:

```typescript
const safeTransfer = transfer(1, 2, 100).pipe(
  Effect.catchTag("SqlError", (error) => {
    const cause = error.cause as any
    
    // Check for serialization failure (PostgreSQL)
    if (cause?.code === "40001") {
      return Effect.fail(new TransactionConflictError())
    }
    
    return Effect.fail(error)
  })
)
```

## Error Logging

Use Effect's logging for SQL errors:

```typescript
import { Effect, Console } from "effect"

const withErrorLogging = <A, R>(
  effect: Effect.Effect<A, SqlError, R>
) =>
  effect.pipe(
    Effect.tapError((error) =>
      Console.error("SQL Error:", error.message, error.cause)
    )
  )
```

Or with structured logging:

```typescript
const withErrorLogging = <A, R>(
  effect: Effect.Effect<A, SqlError, R>
) =>
  effect.pipe(
    Effect.tapError((error) =>
      Effect.logError("SQL operation failed", error.message).pipe(
        Effect.annotateLogs("sql.error.cause", String(error.cause))
      )
    )
  )
```

## Best Practices

### 1. Be Specific with Error Handling

```typescript
// ✅ Good: Handle specific cases
Effect.catchTag("SqlError", (error) => {
  if (isUniqueViolation(error)) {
    return Effect.fail(new DuplicateUserError())
  }
  return Effect.fail(error) // Re-throw unknown errors
})

// ❌ Bad: Swallow all errors
Effect.catchAll(() => Effect.succeed(null))
```

### 2. Preserve Error Information

```typescript
// ✅ Good: Wrap with context
class UserCreationError extends Data.TaggedError("UserCreationError")<{
  userId: number
  cause: SqlError
}> {}

Effect.catchTag("SqlError", (error) =>
  Effect.fail(new UserCreationError({ userId, cause: error }))
)
```

### 3. Use Type-Safe Error Handling

```typescript
// Define your domain errors
class UserNotFoundError extends Data.TaggedError("UserNotFoundError")<{
  userId: number
}> {}

class DuplicateEmailError extends Data.TaggedError("DuplicateEmailError")<{
  email: string
}> {}

// Your function signature is explicit
const createUser: (
  data: NewUser
) => Effect.Effect<User, SqlError | DuplicateEmailError>
```

## Next Steps

- [Configuration](/docs/core-concepts/configuration) - Configure client options
- [Transactions](/docs/advanced/transactions) - Transaction error handling
- [Testing](/docs/advanced/testing) - Test error scenarios
