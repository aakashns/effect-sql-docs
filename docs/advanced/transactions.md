---
title: Transactions
description: Managing database transactions with Effect SQL.
---

# Transactions

Transactions ensure that a series of database operations either all succeed or all fail together. Effect SQL makes transactions composable and safe.

## Why Transactions?

Transactions provide ACID guarantees:

- **Atomicity** - All operations succeed or none do
- **Consistency** - Database moves from one valid state to another
- **Isolation** - Concurrent transactions don't interfere
- **Durability** - Committed changes survive crashes

Without transactions:

```typescript
// ❌ Dangerous: If the second query fails, money vanishes!
yield* sql`UPDATE accounts SET balance = balance - ${100} WHERE id = ${fromId}`
yield* sql`UPDATE accounts SET balance = balance + ${100} WHERE id = ${toId}`
```

With transactions:

```typescript
// ✅ Safe: Both succeed or both fail
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`UPDATE accounts SET balance = balance - ${100} WHERE id = ${fromId}`
    yield* sql`UPDATE accounts SET balance = balance + ${100} WHERE id = ${toId}`
  })
)
```

## Basic Usage

### `withTransaction`

Wrap any Effect in a transaction:

```typescript
import { Effect } from "effect"
import { SqlClient } from "@effect/sql"

const transfer = (fromId: number, toId: number, amount: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    yield* sql.withTransaction(
      Effect.gen(function* () {
        // Deduct from sender
        yield* sql`
          UPDATE accounts 
          SET balance = balance - ${amount} 
          WHERE id = ${fromId}
        `
        
        // Add to receiver
        yield* sql`
          UPDATE accounts 
          SET balance = balance + ${amount} 
          WHERE id = ${toId}
        `
      })
    )
  })
```

### Automatic Rollback

If any operation fails, the entire transaction rolls back:

```typescript
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT INTO orders ${sql.insert(order)}`
    yield* sql`UPDATE inventory SET quantity = quantity - ${quantity} WHERE product_id = ${productId}`
    
    // If this check fails, both INSERT and UPDATE are rolled back
    const [{ quantity: remaining }] = yield* sql`SELECT quantity FROM inventory WHERE product_id = ${productId}`
    if (remaining < 0) {
      yield* Effect.fail(new InsufficientInventoryError())
    }
  })
)
```

### Return Values

Transactions return the value of the wrapped Effect:

```typescript
const newOrder = yield* sql.withTransaction(
  Effect.gen(function* () {
    const [order] = yield* sql`
      INSERT INTO orders ${sql.insert({ userId, total })} RETURNING *
    `
    
    yield* sql`INSERT INTO order_items ${sql.insert(items.map(i => ({ ...i, orderId: order.id })))}`
    
    return order // This is returned from withTransaction
  })
)
```

## Nested Transactions (Savepoints)

When you nest `withTransaction` calls, Effect SQL automatically uses savepoints:

```typescript
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT INTO users ${sql.insert({ name: "Alice" })}`
    
    // This creates a savepoint, not a new transaction
    const profileResult = yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO profiles ${sql.insert({ userId: 1 })}`
        yield* sql`INSERT INTO settings ${sql.insert({ userId: 1 })}`
        return "success"
      })
    ).pipe(
      Effect.catchAll(() => Effect.succeed("failed"))
    )
    
    // If the inner transaction fails, we continue here
    // Only the inner operations are rolled back
    yield* sql`INSERT INTO audit_log ${sql.insert({ event: "user_created" })}`
  })
)
```

How it works:
1. Outer `withTransaction` starts a transaction with `BEGIN`
2. Inner `withTransaction` creates a savepoint: `SAVEPOINT sp_1`
3. If inner fails, it rolls back to savepoint: `ROLLBACK TO SAVEPOINT sp_1`
4. If inner succeeds, it releases savepoint: `RELEASE SAVEPOINT sp_1`
5. Outer transaction commits or rolls back normally

## Error Handling in Transactions

### Catching Specific Errors

```typescript
const result = yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT INTO users ${sql.insert(user)}`
    return "created"
  })
).pipe(
  Effect.catchTag("SqlError", (error) => {
    const cause = error.cause as any
    if (cause?.code === "23505") { // Unique violation
      return Effect.succeed("already_exists")
    }
    return Effect.fail(error)
  })
)
```

### Graceful Degradation

```typescript
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT INTO orders ${sql.insert(order)}`
    
    // Optional: Try to send notification, don't fail transaction if it errors
    yield* sendNotification(order).pipe(
      Effect.catchAll(() => Effect.void)
    )
  })
)
```

### Retry on Conflict

For serialization failures (concurrent transactions conflicting):

```typescript
import { Schedule } from "effect"

const transferWithRetry = transfer(fromId, toId, amount).pipe(
  Effect.retry({
    times: 3,
    schedule: Schedule.exponential("50 millis"),
    while: (error) =>
      error._tag === "SqlError" &&
      (error.cause as any)?.code === "40001" // Serialization failure
  })
)
```

## Transaction Isolation Levels

Control how transactions interact with concurrent operations:

```typescript
// PostgreSQL example
yield* sql.withTransaction(
  Effect.gen(function* () {
    // Set isolation level at start of transaction
    yield* sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`
    
    // Your queries...
  })
)
```

Isolation levels (from least to most strict):
- **READ UNCOMMITTED** - Can see uncommitted changes (not recommended)
- **READ COMMITTED** - Default for most databases, sees committed changes
- **REPEATABLE READ** - Queries see consistent snapshot
- **SERIALIZABLE** - Highest isolation, transactions appear sequential

## Connection Reservation

For manual control over connections:

```typescript
import { Effect, Scope } from "effect"

yield* Effect.scoped(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const connection = yield* sql.reserve
    
    // Use the dedicated connection
    // Useful for advisory locks, session variables, etc.
  })
)
```

## Best Practices

### Keep Transactions Short

Long-running transactions hold locks and can cause contention:

```typescript
// ❌ Bad: Long transaction
yield* sql.withTransaction(
  Effect.gen(function* () {
    const users = yield* sql`SELECT * FROM users`
    
    for (const user of users) {
      yield* sendEmail(user) // This could take seconds per user!
      yield* sql`UPDATE users SET notified = true WHERE id = ${user.id}`
    }
  })
)

// ✅ Good: Short transaction, async work outside
const users = yield* sql`SELECT * FROM users WHERE notified = false`

for (const user of users) {
  yield* sendEmail(user)
  yield* sql`UPDATE users SET notified = true WHERE id = ${user.id}` // Each is a separate transaction
}
```

### Use Transactions for Related Changes

```typescript
// ✅ Good: Order and items must be consistent
yield* sql.withTransaction(
  Effect.gen(function* () {
    const [order] = yield* sql`INSERT INTO orders ... RETURNING *`
    yield* sql`INSERT INTO order_items ${sql.insert(items.map(i => ({ ...i, orderId: order.id })))}`
    yield* sql`UPDATE inventory SET quantity = quantity - ...`
  })
)
```

### Don't Mix Transaction-Sensitive Operations

```typescript
// ❌ Bad: Sending email inside transaction - if rollback, email already sent
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`UPDATE orders SET status = 'confirmed'`
    yield* sendConfirmationEmail() // Can't "unsend" this!
  })
)

// ✅ Good: Side effects after transaction commits
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`UPDATE orders SET status = 'confirmed'`
  })
)
yield* sendConfirmationEmail() // Only called after commit
```

### Handle Deadlocks

```typescript
const safeTransaction = <A, E, R>(
  effect: Effect.Effect<A, E, R>
) => {
  const sql = yield* SqlClient.SqlClient
  
  return sql.withTransaction(effect).pipe(
    Effect.retry({
      times: 3,
      while: (error) =>
        error._tag === "SqlError" &&
        isDeadlockError(error.cause)
    })
  )
}
```

## Database-Specific Notes

### PostgreSQL

- Supports all isolation levels
- `SERIALIZABLE` uses predicate locking
- Advisory locks for application-level locking

### MySQL

- `SERIALIZABLE` uses gap locking
- Watch for lock wait timeouts

### SQLite

- Single-writer, readers don't block writers (WAL mode)
- Transactions are lightweight

### SQL Server

- `SNAPSHOT` isolation level available
- Row-level versioning for RCSI

## Next Steps

- [Migrations](/docs/advanced/migrations) - Schema changes as transactions
- [Data Loaders](/docs/advanced/data-loaders) - Batching within transactions
- [Error Handling](/docs/core-concepts/error-handling) - Transaction error patterns
