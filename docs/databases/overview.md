---
title: Database Overview
description: Overview of supported databases in Effect SQL.
---

# Database Overview

Effect SQL supports a wide variety of databases through adapter packages. Each adapter provides the same core `SqlClient` interface while exposing database-specific features.

## Supported Databases

| Database | Package | Runtime |
|----------|---------|---------|
| PostgreSQL | `@effect/sql-pg` | Node.js |
| SQLite | `@effect/sql-sqlite-node` | Node.js |
| SQLite | `@effect/sql-sqlite-bun` | Bun |
| SQLite | `@effect/sql-sqlite-wasm` | Browser/WASM |
| SQLite | `@effect/sql-sqlite-react-native` | React Native |
| MySQL | `@effect/sql-mysql2` | Node.js |
| SQL Server | `@effect/sql-mssql` | Node.js |
| ClickHouse | `@effect/sql-clickhouse` | Node.js |
| Cloudflare D1 | `@effect/sql-d1` | Cloudflare Workers |
| LibSQL/Turso | `@effect/sql-libsql` | Node.js, Edge |

## Choosing a Database

### PostgreSQL

Best for:
- Complex queries with CTEs, window functions, JSON operations
- Full-text search
- Geographic data (PostGIS)
- Applications requiring ACID compliance
- Horizontal scaling with read replicas

```typescript
import { PgClient } from "@effect/sql-pg"

const DatabaseLive = PgClient.layer({
  host: "localhost",
  database: "myapp"
})
```

[PostgreSQL Guide →](/docs/databases/postgresql)

### SQLite

Best for:
- Embedded databases
- Local-first applications
- Mobile apps (React Native)
- CLI tools
- Development and testing
- Low-latency reads (no network)

```typescript
import { SqliteClient } from "@effect/sql-sqlite-node"

const DatabaseLive = SqliteClient.layer({
  filename: "./app.db"
})
```

[SQLite Guide →](/docs/databases/sqlite)

### MySQL

Best for:
- Traditional web applications
- WordPress/Drupal backends
- Legacy system integration
- High-throughput read-heavy workloads

```typescript
import { MysqlClient } from "@effect/sql-mysql2"

const DatabaseLive = MysqlClient.layer({
  host: "localhost",
  database: "myapp"
})
```

[MySQL Guide →](/docs/databases/mysql)

### SQL Server

Best for:
- Enterprise applications
- .NET ecosystem integration
- Business intelligence workloads
- Windows-based infrastructure

```typescript
import { MssqlClient } from "@effect/sql-mssql"

const DatabaseLive = MssqlClient.layer({
  server: "localhost",
  database: "myapp"
})
```

[SQL Server Guide →](/docs/databases/mssql)

### ClickHouse

Best for:
- Analytics and OLAP workloads
- Real-time data warehousing
- Log and event data
- Time-series data
- High-volume inserts with fast aggregations

```typescript
import { ClickhouseClient } from "@effect/sql-clickhouse"

const DatabaseLive = ClickhouseClient.layer({
  host: "localhost",
  database: "analytics"
})
```

[ClickHouse Guide →](/docs/databases/clickhouse)

### Cloudflare D1

Best for:
- Edge computing with Cloudflare Workers
- Globally distributed read-heavy workloads
- Serverless applications

```typescript
import { D1Client } from "@effect/sql-d1"

const DatabaseLive = D1Client.layer({
  binding: env.DB
})
```

[Cloudflare D1 Guide →](/docs/databases/d1)

### LibSQL / Turso

Best for:
- Edge computing
- SQLite with replication
- Multi-region deployments
- Local-first with sync

```typescript
import { LibsqlClient } from "@effect/sql-libsql"

const DatabaseLive = LibsqlClient.layer({
  url: "libsql://your-db.turso.io"
})
```

[LibSQL Guide →](/docs/databases/libsql)

## Common Interface

All adapters implement the `SqlClient` interface, providing:

```typescript
import { SqlClient } from "@effect/sql"

// Available with any adapter
const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  // Execute queries
  const users = yield* sql<User>`SELECT * FROM users`
  
  // Use helpers
  yield* sql`INSERT INTO users ${sql.insert({ name: "Alice" })}`
  
  // Transactions
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`UPDATE accounts SET balance = balance - ${100}`
      yield* sql`UPDATE accounts SET balance = balance + ${100}`
    })
  )
})
```

## Database-Specific Features

While the core interface is the same, each adapter exposes database-specific features:

### PostgreSQL
- `pg.json()` - JSON parameter helper
- `pg.listen()` - LISTEN/NOTIFY streams
- `pg.notify()` - Send notifications

### SQLite
- `sqlite.export` - Export database to bytes
- `sqlite.backup()` - Backup to file
- `sqlite.loadExtension()` - Load SQLite extensions

### MySQL
- Additional connection options
- MySQL-specific error handling

See each database's documentation for details.

## SQL Dialect Differences

Effect SQL handles most dialect differences automatically:

| Feature | PostgreSQL | MySQL | SQLite | SQL Server |
|---------|------------|-------|--------|------------|
| Parameter placeholder | `$1, $2` | `?, ?` | `?, ?` | `@p1, @p2` |
| Identifier quote | `"name"` | `` `name` `` | `"name"` | `[name]` |
| Boolean type | `boolean` | `TINYINT(1)` | `INTEGER` | `BIT` |
| Auto-increment | `SERIAL` | `AUTO_INCREMENT` | `AUTOINCREMENT` | `IDENTITY` |
| Upsert | `ON CONFLICT` | `ON DUPLICATE KEY` | `ON CONFLICT` | `MERGE` |

Use `sql.onDialect` for database-specific SQL:

```typescript
const now = yield* sql.onDialect({
  pg: () => sql`SELECT NOW()`,
  mysql: () => sql`SELECT NOW()`,
  sqlite: () => sql`SELECT datetime('now')`,
  mssql: () => sql`SELECT GETDATE()`,
  clickhouse: () => sql`SELECT now()`
})
```

## Migration Between Databases

Moving between databases is straightforward since the core API is identical:

1. **Change the adapter import**:
```typescript
// Before: SQLite
import { SqliteClient } from "@effect/sql-sqlite-node"

// After: PostgreSQL  
import { PgClient } from "@effect/sql-pg"
```

2. **Update the Layer configuration**:
```typescript
// Before
const DatabaseLive = SqliteClient.layer({ filename: "./app.db" })

// After
const DatabaseLive = PgClient.layer({ host: "localhost", database: "myapp" })
```

3. **Adjust database-specific SQL** (if any):
```typescript
// Use onDialect for portable code
sql.onDialectOrElse({
  sqlite: () => sql`...sqlite specific...`,
  orElse: () => sql`...default...`
})
```

Your business logic remains unchanged because it depends on the generic `SqlClient.SqlClient` interface.

## Next Steps

Choose your database and dive into the specific guide:

- [PostgreSQL](/docs/databases/postgresql)
- [SQLite](/docs/databases/sqlite)
- [MySQL](/docs/databases/mysql)
- [SQL Server](/docs/databases/mssql)
- [ClickHouse](/docs/databases/clickhouse)
- [Cloudflare D1](/docs/databases/d1)
- [LibSQL / Turso](/docs/databases/libsql)
