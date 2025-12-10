---
title: ClickHouse
description: Using Effect SQL with ClickHouse for analytics and OLAP workloads.
---

# ClickHouse

The `@effect/sql-clickhouse` package provides ClickHouse support for Effect SQL. ClickHouse is a column-oriented database optimized for analytics and OLAP (Online Analytical Processing) workloads.

## Installation

```bash
npm install @effect/sql @effect/sql-clickhouse
```

## Basic Setup

```typescript
import { Effect } from "effect"
import { SqlClient } from "@effect/sql"
import { ClickhouseClient } from "@effect/sql-clickhouse"

const DatabaseLive = ClickhouseClient.layer({
  host: "localhost",
  port: 8123,
  database: "analytics",
  username: "default",
  password: Redacted.make("")
})

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const events = yield* sql`SELECT * FROM events LIMIT 100`
  return events
})

Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)))
```

## Configuration Options

```typescript
import { Redacted, Duration } from "effect"

const DatabaseLive = ClickhouseClient.layer({
  // Connection
  host: "localhost",
  port: 8123,        // HTTP interface
  database: "analytics",
  username: "default",
  password: Redacted.make("secret"),
  
  // Or use URL
  url: Redacted.make("http://default:secret@localhost:8123/analytics"),
  
  // Request settings
  requestTimeout: Duration.seconds(60),
  
  // Name transformations
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel
})
```

## ClickHouse-Specific SQL

### Table Engines

ClickHouse uses table engines for different use cases:

```typescript
// MergeTree - most common engine
yield* sql`
  CREATE TABLE events (
    event_date Date,
    event_time DateTime,
    user_id UInt64,
    event_type String,
    properties String
  )
  ENGINE = MergeTree()
  PARTITION BY toYYYYMM(event_date)
  ORDER BY (event_date, user_id, event_time)
`

// ReplacingMergeTree - for deduplication
yield* sql`
  CREATE TABLE users (
    id UInt64,
    name String,
    updated_at DateTime
  )
  ENGINE = ReplacingMergeTree(updated_at)
  ORDER BY id
`

// SummingMergeTree - for aggregations
yield* sql`
  CREATE TABLE daily_stats (
    date Date,
    page_views UInt64,
    unique_users UInt64
  )
  ENGINE = SummingMergeTree()
  ORDER BY date
`
```

### Data Types

ClickHouse has rich type support:

```typescript
yield* sql`
  CREATE TABLE example (
    -- Integers
    small_int Int8,
    medium_int Int32,
    big_int Int64,
    unsigned_int UInt64,
    
    -- Floating point
    float_val Float32,
    double_val Float64,
    
    -- Decimal for money
    price Decimal(18, 2),
    
    -- Strings
    name String,
    fixed_str FixedString(16),
    
    -- Date/Time
    date_val Date,
    datetime_val DateTime,
    datetime64_val DateTime64(3),  -- milliseconds
    
    -- Other
    uuid_val UUID,
    ipv4 IPv4,
    json_val JSON,
    
    -- Arrays and Nested
    tags Array(String),
    nested Nested(
      key String,
      value String
    )
  )
  ENGINE = MergeTree()
  ORDER BY date_val
`
```

### Inserting Data

ClickHouse is optimized for batch inserts:

```typescript
// Insert single row
yield* sql`
  INSERT INTO events ${sql.insert({
    eventDate: "2024-01-15",
    eventTime: "2024-01-15 10:30:00",
    userId: 123n,
    eventType: "page_view",
    properties: JSON.stringify({ page: "/home" })
  })}
`

// Batch insert (recommended)
yield* sql`
  INSERT INTO events ${sql.insert([
    { eventDate: "2024-01-15", eventTime: "2024-01-15 10:30:00", userId: 123n, eventType: "page_view" },
    { eventDate: "2024-01-15", eventTime: "2024-01-15 10:31:00", userId: 124n, eventType: "click" },
    { eventDate: "2024-01-15", eventTime: "2024-01-15 10:32:00", userId: 123n, eventType: "page_view" }
  ])}
`
```

### Aggregations

ClickHouse excels at aggregations:

```typescript
// Basic aggregation
const dailyStats = yield* sql`
  SELECT 
    toDate(event_time) AS date,
    count() AS total_events,
    uniqExact(user_id) AS unique_users
  FROM events
  WHERE event_date >= today() - 30
  GROUP BY date
  ORDER BY date
`

// Window functions
const runningTotal = yield* sql`
  SELECT
    date,
    page_views,
    sum(page_views) OVER (ORDER BY date) AS running_total
  FROM daily_stats
`

// Approximate aggregations (fast!)
const approxUsers = yield* sql`
  SELECT uniq(user_id) AS approx_unique_users
  FROM events
  WHERE event_date = today()
`
```

### Time Series Queries

```typescript
// Time bucketing
const hourlyMetrics = yield* sql`
  SELECT
    toStartOfHour(event_time) AS hour,
    count() AS events
  FROM events
  WHERE event_date = today()
  GROUP BY hour
  ORDER BY hour
`

// Fill gaps in time series
const filledSeries = yield* sql`
  SELECT
    toStartOfHour(event_time) AS hour,
    count() AS events
  FROM events
  WHERE event_date = today()
  GROUP BY hour
  WITH FILL FROM toStartOfHour(now()) TO now() STEP INTERVAL 1 HOUR
`
```

### Array Operations

```typescript
// Array functions
const tagAnalysis = yield* sql`
  SELECT
    arrayJoin(tags) AS tag,
    count() AS usage_count
  FROM posts
  GROUP BY tag
  ORDER BY usage_count DESC
  LIMIT 10
`

// Array contains
const postsWithTag = yield* sql`
  SELECT * FROM posts
  WHERE has(tags, ${"typescript"})
`
```

## Transactions

ClickHouse has limited transaction support. Use for batches:

```typescript
const sql = yield* SqlClient.SqlClient

// Mutations are atomic per table
yield* sql`
  ALTER TABLE events
  DELETE WHERE event_date < today() - 90
`

// Use withTransaction for grouping operations
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT INTO events ...`
    yield* sql`INSERT INTO event_metadata ...`
  })
)
```

## Materialized Views

ClickHouse's killer feature for real-time analytics:

```typescript
// Create a materialized view for real-time aggregation
yield* sql`
  CREATE MATERIALIZED VIEW daily_events_mv
  ENGINE = SummingMergeTree()
  ORDER BY (date, event_type)
  AS SELECT
    toDate(event_time) AS date,
    event_type,
    count() AS event_count,
    uniqExact(user_id) AS unique_users
  FROM events
  GROUP BY date, event_type
`

// Query the materialized view (fast!)
const stats = yield* sql`
  SELECT * FROM daily_events_mv
  WHERE date >= today() - 7
`
```

## Performance Tips

### Batch Your Inserts

```typescript
// ❌ Don't insert one row at a time
for (const event of events) {
  yield* sql`INSERT INTO events ${sql.insert(event)}`
}

// ✅ Batch inserts
yield* sql`INSERT INTO events ${sql.insert(events)}`
```

### Use Sampling

```typescript
const sampleResults = yield* sql`
  SELECT user_id, count() AS events
  FROM events
  SAMPLE 0.1  -- 10% sample
  GROUP BY user_id
`
```

### Partition Pruning

```typescript
// Ensure your query uses the partition key
const recentEvents = yield* sql`
  SELECT * FROM events
  WHERE event_date >= today() - 7  -- Uses partition
    AND user_id = ${userId}
`
```

### Pre-aggregate with Materialized Views

For frequently-run queries, create materialized views.

## Migrations

```typescript
import { ClickhouseMigrator } from "@effect/sql-clickhouse"
import { Migrator } from "@effect/sql"

const MigratorLive = ClickhouseMigrator.layer({
  loader: Migrator.fromGlob(import.meta.glob("./migrations/*.ts"))
})
```

## Dialect-Specific Code

```typescript
const now = yield* sql.onDialect({
  clickhouse: () => sql`SELECT now()`,
  pg: () => sql`SELECT NOW()`,
  mysql: () => sql`SELECT NOW()`,
  sqlite: () => sql`SELECT datetime('now')`,
  mssql: () => sql`SELECT GETDATE()`
})
```

## Next Steps

- [Migrations](/docs/advanced/migrations) - Database schema management
- [Streaming](/docs/advanced/streaming) - Stream large result sets
