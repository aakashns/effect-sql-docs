---
title: Streaming Results
description: Stream large result sets without loading everything into memory.
---

# Streaming Results

When queries return many rows, loading everything into memory at once can be problematic. Effect SQL supports streaming results row-by-row using Effect's `Stream` type.

## Why Streaming?

Consider fetching a million rows:

```typescript
// ❌ Loads everything into memory
const allUsers = yield* sql`SELECT * FROM users`  // 1M rows in memory!

// ✅ Stream processes rows incrementally
yield* sql`SELECT * FROM users`.stream.pipe(
  Stream.tap(processUser),
  Stream.runDrain
)
```

Streaming is useful when:
- Result sets are large (thousands+ rows)
- Processing can happen incrementally
- Memory is constrained
- You're exporting or transforming data

## Basic Streaming

Every statement has a `.stream` property:

```typescript
import { Stream, Effect, Console } from "effect"

const sql = yield* SqlClient.SqlClient

// Stream all users
const userStream = sql<User>`SELECT * FROM users`.stream

// Process each row
yield* userStream.pipe(
  Stream.tap((user) => Console.log(`Processing: ${user.name}`)),
  Stream.runDrain
)
```

## Collecting Results

### To Array

```typescript
import { Chunk } from "effect"

const users = yield* sql`SELECT * FROM users`.stream.pipe(
  Stream.runCollect,
  Effect.map(Chunk.toReadonlyArray)
)
```

### First N Items

```typescript
const firstTen = yield* sql`SELECT * FROM users`.stream.pipe(
  Stream.take(10),
  Stream.runCollect
)
```

### Fold/Reduce

```typescript
const totalAge = yield* sql<{ age: number }>`SELECT age FROM users`.stream.pipe(
  Stream.runFold(0, (sum, user) => sum + user.age)
)
```

## Transformations

### Map

```typescript
const names = sql`SELECT name FROM users`.stream.pipe(
  Stream.map((row) => row.name)
)
```

### Filter

```typescript
const adults = sql<User>`SELECT * FROM users`.stream.pipe(
  Stream.filter((user) => user.age >= 18)
)
```

### Batch Processing

Process in chunks:

```typescript
yield* sql`SELECT * FROM users`.stream.pipe(
  Stream.grouped(100),  // Groups of 100
  Stream.mapEffect((batch) => processBatch(batch)),
  Stream.runDrain
)
```

## Database Cursors

### PostgreSQL

PostgreSQL streaming uses cursors:

```typescript
// Results are fetched in batches from the server
yield* sql`SELECT * FROM users`.stream.pipe(
  Stream.runForEach(processUser)
)
```

The cursor fetches rows in chunks (typically 128 at a time), so memory usage stays constant regardless of total result size.

### SQLite

SQLite doesn't have true cursors—it loads results into memory. For large datasets, use LIMIT/OFFSET:

```typescript
const streamLargeSqlite = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  let offset = 0
  const limit = 1000
  
  while (true) {
    const batch = yield* sql`
      SELECT * FROM users 
      ORDER BY id 
      LIMIT ${limit} OFFSET ${offset}
    `
    
    if (batch.length === 0) break
    
    for (const user of batch) {
      yield* processUser(user)
    }
    
    offset += limit
  }
})
```

## Error Handling

Handle errors in streams:

```typescript
yield* sql`SELECT * FROM users`.stream.pipe(
  Stream.mapEffect(processUser),
  Stream.catchAll((error) => {
    console.error("Stream error:", error)
    return Stream.empty
  }),
  Stream.runDrain
)
```

Or let errors propagate:

```typescript
const result = yield* sql`SELECT * FROM users`.stream.pipe(
  Stream.mapEffect(processUser),
  Stream.runDrain
).pipe(
  Effect.catchTag("SqlError", handleSqlError)
)
```

## Resource Management

Streams are properly scoped—database resources are released when the stream completes:

```typescript
// Connection is held while streaming
yield* sql`SELECT * FROM large_table`.stream.pipe(
  Stream.take(100),  // Early termination
  Stream.runDrain
)
// Connection released after stream completes (even if early termination)
```

## Practical Examples

### CSV Export

```typescript
import { NodeStream } from "@effect/platform-node"

const exportToCsv = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  const csvStream = sql<User>`SELECT * FROM users`.stream.pipe(
    Stream.map((user) => `${user.id},${user.name},${user.email}\n`)
  )
  
  yield* NodeStream.pipeTo(
    Stream.concat(
      Stream.succeed("id,name,email\n"),
      csvStream
    ),
    fs.createWriteStream("users.csv")
  )
})
```

### Batch Updates

```typescript
yield* sql`SELECT * FROM users WHERE needs_update = true`.stream.pipe(
  Stream.grouped(100),
  Stream.mapEffect((batch) =>
    sql.withTransaction(
      Effect.forEach(batch, (user) =>
        sql`UPDATE users SET processed = true WHERE id = ${user.id}`
      )
    )
  ),
  Stream.runDrain
)
```

### Real-time Processing

```typescript
const processNewOrders = sql`
  SELECT * FROM orders 
  WHERE status = 'pending' 
  ORDER BY created_at
`.stream.pipe(
  Stream.tap((order) => 
    Effect.all([
      sendNotification(order),
      updateInventory(order),
      sql`UPDATE orders SET status = 'processing' WHERE id = ${order.id}`
    ])
  ),
  Stream.runDrain
)
```

### Parallel Processing

```typescript
yield* sql`SELECT * FROM items`.stream.pipe(
  Stream.mapEffect(
    (item) => processItem(item),
    { concurrency: 10 }  // Process 10 items concurrently
  ),
  Stream.runDrain
)
```

## Performance Considerations

### Memory

Streaming keeps memory usage constant regardless of result size. However, transformations that collect (like `grouped`) temporarily hold items in memory.

### Connections

Streaming holds a database connection for the duration of the stream. For long-running streams, consider:

- Using a dedicated connection pool
- Processing in smaller batches
- Adding timeouts

```typescript
yield* sql`SELECT * FROM huge_table`.stream.pipe(
  Stream.timeout("5 minutes"),
  Stream.runDrain
)
```

### Backpressure

Effect streams have built-in backpressure—the database won't fetch more rows until the previous batch is processed.

## When Not to Stream

Don't use streaming when:
- Result set is small (< 1000 rows typically)
- You need all results in memory anyway
- Operations require multiple passes over data
- Using SQLite (limited streaming support)

```typescript
// Small result sets - just fetch normally
const users = yield* sql`SELECT * FROM users WHERE role = 'admin'`
```

## Next Steps

- [Data Loaders](/docs/advanced/data-loaders) - Batch related queries
- [Transactions](/docs/advanced/transactions) - Stream within transactions
- [PostgreSQL](/docs/databases/postgresql) - PostgreSQL cursor details
