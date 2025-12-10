---
title: Connection Pooling
description: Optimizing database connection pooling for production.
---

# Connection Pooling

Connection pooling is critical for production applications. Effect SQL leverages the connection pooling capabilities of the underlying database drivers.

## Why Connection Pooling?

Creating database connections is expensive:
- TCP handshake
- SSL negotiation
- Authentication
- Database session setup

Connection pools:
- Reuse existing connections
- Limit maximum connections
- Handle connection lifecycle
- Provide backpressure when overloaded

## Pool Configuration

### PostgreSQL

```typescript
import { PgClient } from "@effect/sql-pg"
import { Duration } from "effect"

const DatabaseLive = PgClient.layer({
  host: "localhost",
  database: "myapp",
  
  // Pool size
  minConnections: 5,        // Minimum idle connections
  maxConnections: 20,       // Maximum pool size
  
  // Connection lifecycle
  idleTimeout: Duration.minutes(10),    // Close idle connections after 10 min
  connectionTTL: Duration.minutes(30),  // Recycle connections after 30 min
  connectTimeout: Duration.seconds(10)  // Fail if can't connect in 10s
})
```

### MySQL

```typescript
import { MysqlClient } from "@effect/sql-mysql2"

const DatabaseLive = MysqlClient.layer({
  host: "localhost",
  database: "myapp",
  
  minConnections: 5,
  maxConnections: 20,
  connectTimeout: Duration.seconds(10)
})
```

### SQLite

SQLite uses a single connection with a semaphore for concurrency control:

```typescript
import { SqliteClient } from "@effect/sql-sqlite-node"

const DatabaseLive = SqliteClient.layer({
  filename: "./app.db"
  // SQLite doesn't use traditional pooling
  // Effect SQL serializes writes automatically
})
```

## Sizing Guidelines

### General Formula

```
Connections = (CPU cores * 2) + number of disks
```

For cloud databases without direct disk access, start with:
- **Small**: 5-10 connections
- **Medium**: 10-20 connections
- **Large**: 20-50 connections

### Factors to Consider

1. **Available connections on database server**
   - PostgreSQL default: 100
   - MySQL default: 151
   - Each app instance needs its share

2. **Application concurrency**
   - How many concurrent requests?
   - Are queries long-running?

3. **Transaction duration**
   - Long transactions hold connections

4. **Multiple services**
   - Total connections across all services must fit limit

## Monitoring

### Check Current Pool Status

```typescript
// PostgreSQL: Check active connections
const stats = yield* sql`
  SELECT 
    count(*) as total,
    count(*) FILTER (WHERE state = 'active') as active,
    count(*) FILTER (WHERE state = 'idle') as idle
  FROM pg_stat_activity 
  WHERE datname = current_database()
`
```

### Connection Wait Time

If queries are slow but the database is fast, you might be waiting for connections:

```typescript
// Add timing around operations
const startTime = Date.now()
const result = yield* sql`SELECT 1`
const duration = Date.now() - startTime
// If duration >> query time, you're waiting for connections
```

## Production Patterns

### Graceful Shutdown

```typescript
import { Effect, Runtime, Layer } from "effect"

// Layer handles cleanup automatically
const program = Effect.gen(function* () {
  yield* startServer
  yield* Effect.never  // Keep running
})

// Cleanup happens when the runtime exits
Effect.runPromise(program.pipe(
  Effect.provide(DatabaseLive),
  Effect.scoped
))
```

### Health Checks

```typescript
const healthCheck = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  // Simple connectivity check
  const result = yield* sql`SELECT 1 as ok`.pipe(
    Effect.timeout("5 seconds"),
    Effect.either
  )
  
  return Either.isRight(result)
})
```

### Connection Validation

Some pools validate connections before use:

```typescript
const DatabaseLive = PgClient.layer({
  // ... other options
  
  // The pg driver validates connections automatically
  // Stale connections are replaced
})
```

## Common Issues

### Connection Exhaustion

**Symptom**: Queries hang, timeouts increase

**Causes**:
- Pool too small
- Long-running transactions
- Connection leaks (not using Effect properly)

**Solutions**:
```typescript
// Increase pool size
maxConnections: 30

// Add query timeouts
yield* sql`SELECT ...`.pipe(
  Effect.timeout("10 seconds")
)

// Always use Effect.scoped for reserved connections
yield* Effect.scoped(
  Effect.gen(function* () {
    const conn = yield* sql.reserve
    // Connection released when scope exits
  })
)
```

### Connection Thrashing

**Symptom**: High connection churn, performance degradation

**Causes**:
- Min connections too low
- Idle timeout too short

**Solutions**:
```typescript
minConnections: 5,           // Keep some connections warm
idleTimeout: Duration.minutes(10)  // Don't kill idle connections too fast
```

### Stale Connections

**Symptom**: Intermittent query failures

**Causes**:
- Network issues
- Database restarts
- Firewall timeouts

**Solutions**:
```typescript
connectionTTL: Duration.minutes(30),  // Recycle connections periodically
// Retry transient errors
yield* sql`SELECT ...`.pipe(
  Effect.retry({ times: 3, delay: "100 millis" })
)
```

## Database-Specific Notes

### PostgreSQL

- Uses [pg-pool](https://node-postgres.com/features/pooling)
- Supports prepared statement caching per connection
- LISTEN/NOTIFY requires dedicated connection

### MySQL

- Uses mysql2 pool
- Binary protocol for better performance
- Connection-level charset settings

### SQLite

- Single connection, no pooling
- WAL mode enables concurrent reads
- Writes are serialized by Effect SQL

## Cloud Databases

### PgBouncer / Connection Proxies

When using a connection pooler like PgBouncer:

```typescript
const DatabaseLive = PgClient.layer({
  host: "pgbouncer.example.com",
  
  // Use session mode for transactions
  // Transaction pooling breaks named prepared statements
  
  // Smaller pool - the pooler manages connections
  maxConnections: 10
})
```

### Serverless (Neon, PlanetScale)

```typescript
// Serverless databases handle pooling
// Use minimal local pool
const DatabaseLive = PgClient.layer({
  host: "your-db.neon.tech",
  maxConnections: 5,
  ssl: true
})
```

## Next Steps

- [PostgreSQL](/docs/databases/postgresql) - PostgreSQL-specific settings
- [Configuration](/docs/core-concepts/configuration) - All configuration options
- [Error Handling](/docs/core-concepts/error-handling) - Connection error patterns
