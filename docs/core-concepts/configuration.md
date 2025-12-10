---
title: Configuration
description: Configuring Effect SQL clients and adapters.
---

# Configuration

Effect SQL clients can be configured using direct options or Effect's Config system for environment-based configuration.

## Direct Configuration

Pass configuration options directly when creating a Layer:

```typescript
import { PgClient } from "@effect/sql-pg"

const DatabaseLive = PgClient.layer({
  host: "localhost",
  port: 5432,
  database: "myapp",
  username: "postgres",
  password: Redacted.make("secret")
})
```

## Environment-Based Configuration

Use Effect's Config system for production deployments:

```typescript
import { Config, Redacted } from "effect"
import { PgClient } from "@effect/sql-pg"

const DatabaseConfig = Config.all({
  host: Config.string("DATABASE_HOST").pipe(Config.withDefault("localhost")),
  port: Config.integer("DATABASE_PORT").pipe(Config.withDefault(5432)),
  database: Config.string("DATABASE_NAME"),
  username: Config.string("DATABASE_USER"),
  password: Config.redacted("DATABASE_PASSWORD")
})

const DatabaseLive = PgClient.layerConfig(DatabaseConfig)
```

Now your app reads from environment variables:

```bash
DATABASE_HOST=db.example.com \
DATABASE_PORT=5432 \
DATABASE_NAME=myapp \
DATABASE_USER=admin \
DATABASE_PASSWORD=secret \
node dist/index.js
```

## Common Configuration Options

These options are available across all database adapters:

### Connection Settings

| Option | Type | Description |
|--------|------|-------------|
| `host` | `string` | Database server hostname |
| `port` | `number` | Database server port |
| `database` | `string` | Database name |
| `username` | `string` | Authentication username |
| `password` | `Redacted` | Authentication password |
| `url` | `Redacted` | Connection URL (alternative to individual settings) |

### Connection Pool

| Option | Type | Description |
|--------|------|-------------|
| `minConnections` | `number` | Minimum pool connections |
| `maxConnections` | `number` | Maximum pool connections |
| `connectionTTL` | `DurationInput` | Max connection lifetime |
| `idleTimeout` | `DurationInput` | Idle connection timeout |
| `connectTimeout` | `DurationInput` | Connection attempt timeout |

### Transformations

| Option | Type | Description |
|--------|------|-------------|
| `transformQueryNames` | `(s: string) => string` | Transform identifiers in queries |
| `transformResultNames` | `(s: string) => string` | Transform column names in results |

### Observability

| Option | Type | Description |
|--------|------|-------------|
| `spanAttributes` | `Record<string, unknown>` | Custom span attributes |

## Database-Specific Configuration

### PostgreSQL

```typescript
import { PgClient } from "@effect/sql-pg"

const DatabaseLive = PgClient.layer({
  // Connection
  host: "localhost",
  port: 5432,
  database: "myapp",
  username: "postgres",
  password: Redacted.make("secret"),
  
  // Or use a connection URL
  // url: Redacted.make("postgresql://user:pass@localhost:5432/myapp"),
  
  // SSL
  ssl: true, // or { rejectUnauthorized: false }
  
  // Pool settings
  maxConnections: 20,
  minConnections: 5,
  connectionTTL: Duration.minutes(30),
  idleTimeout: Duration.minutes(10),
  connectTimeout: Duration.seconds(10),
  
  // Name transformations
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel,
  transformJson: true, // Also transform JSON fields
  
  // Application name (visible in pg_stat_activity)
  applicationName: "myapp-api",
  
  // Custom type parsing
  types: {
    // Custom type configuration for node-postgres
  }
})
```

### SQLite (Node.js)

```typescript
import { SqliteClient } from "@effect/sql-sqlite-node"

const DatabaseLive = SqliteClient.layer({
  // Database file path (":memory:" for in-memory)
  filename: "./data.db",
  
  // Open as read-only
  readonly: false,
  
  // Disable WAL mode (enabled by default)
  disableWAL: false,
  
  // Prepared statement cache
  prepareCacheSize: 200,
  prepareCacheTTL: Duration.minutes(10),
  
  // Name transformations
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel
})
```

### MySQL

```typescript
import { MysqlClient } from "@effect/sql-mysql2"

const DatabaseLive = MysqlClient.layer({
  host: "localhost",
  port: 3306,
  database: "myapp",
  username: "root",
  password: Redacted.make("secret"),
  
  // Pool settings
  maxConnections: 10,
  minConnections: 2,
  
  // Name transformations
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel
})
```

### SQL Server

```typescript
import { MssqlClient } from "@effect/sql-mssql"

const DatabaseLive = MssqlClient.layer({
  server: "localhost",
  port: 1433,
  database: "myapp",
  username: "sa",
  password: Redacted.make("secret"),
  
  // Trust server certificate
  trustServerCertificate: true,
  
  // Pool settings
  maxConnections: 10,
  minConnections: 2
})
```

## Name Transformations

Configure automatic name transformations between TypeScript (camelCase) and database (snake_case):

```typescript
import { String } from "effect"

const DatabaseLive = PgClient.layer({
  // ... connection options
  
  // TypeScript → Database (for queries)
  transformQueryNames: String.camelToSnake,
  // Database → TypeScript (for results)
  transformResultNames: String.snakeToCamel
})
```

Now your code can use camelCase while your database uses snake_case:

```typescript
// TypeScript code
const user = yield* sql<{ firstName: string }>`
  SELECT ${sql("firstName")} FROM users WHERE ${sql("userId")} = ${1}
`
// Generated SQL: SELECT "first_name" FROM users WHERE "user_id" = $1
// Result: { firstName: "Alice" } (not { first_name: "Alice" })
```

### Custom Transformations

Create custom transformation functions:

```typescript
const customTransform = (str: string) => {
  // Your transformation logic
  return str.toUpperCase()
}

const DatabaseLive = PgClient.layer({
  transformQueryNames: customTransform
})
```

### JSON Field Transformation

PostgreSQL adapter can also transform JSON fields:

```typescript
const DatabaseLive = PgClient.layer({
  transformResultNames: String.snakeToCamel,
  transformJson: true // Also transform keys in JSON columns
})
```

## Connection URLs

Most adapters support connection URLs as an alternative to individual settings:

```typescript
// PostgreSQL
const DatabaseLive = PgClient.layer({
  url: Redacted.make("postgresql://user:pass@localhost:5432/myapp?ssl=true")
})

// MySQL
const DatabaseLive = MysqlClient.layer({
  url: Redacted.make("mysql://user:pass@localhost:3306/myapp")
})
```

Using Config:

```typescript
const DatabaseConfig = Config.all({
  url: Config.redacted("DATABASE_URL")
})

const DatabaseLive = PgClient.layerConfig(DatabaseConfig)
```

## Multiple Databases

Use different tags for multiple database connections:

```typescript
import { Context, Layer } from "effect"
import { PgClient } from "@effect/sql-pg"

// Define custom tags
class MainDatabase extends Context.Tag("MainDatabase")<
  MainDatabase,
  PgClient.PgClient
>() {}

class AnalyticsDatabase extends Context.Tag("AnalyticsDatabase")<
  AnalyticsDatabase,
  PgClient.PgClient
>() {}

// Create layers for each database
const MainDbLive = Layer.effect(
  MainDatabase,
  PgClient.make({ database: "main" })
)

const AnalyticsDbLive = Layer.effect(
  AnalyticsDatabase,
  PgClient.make({ database: "analytics" })
)

// Use them in your program
const program = Effect.gen(function* () {
  const mainDb = yield* MainDatabase
  const analyticsDb = yield* AnalyticsDatabase
  
  const users = yield* mainDb`SELECT * FROM users`
  const metrics = yield* analyticsDb`SELECT * FROM page_views`
})
```

## Testing Configuration

For tests, use in-memory databases or test-specific configurations:

```typescript
// SQLite in-memory for testing
const TestDatabase = SqliteClient.layer({
  filename: ":memory:"
})

// Or a test-specific PostgreSQL database
const TestDatabase = PgClient.layer({
  database: "myapp_test"
})
```

## Production Recommendations

### Connection Pool Sizing

```typescript
// For a typical web application
const DatabaseLive = PgClient.layer({
  // (CPU cores * 2) + 1 is a common starting point
  minConnections: 5,
  maxConnections: 20,
  
  // Recycle connections periodically
  connectionTTL: Duration.minutes(30),
  
  // Don't hold idle connections too long
  idleTimeout: Duration.minutes(10)
})
```

### SSL in Production

```typescript
const DatabaseLive = PgClient.layer({
  ssl: process.env.NODE_ENV === "production"
    ? true  // Verify certificates in production
    : false // No SSL in development
})
```

### Connection Timeouts

```typescript
const DatabaseLive = PgClient.layer({
  // Don't wait too long for connections
  connectTimeout: Duration.seconds(10),
  
  // Query timeout (via statement_timeout in PostgreSQL)
  // Set in the database or per-query
})
```

## Next Steps

- [PostgreSQL](/docs/databases/postgresql) - PostgreSQL-specific configuration
- [SQLite](/docs/databases/sqlite) - SQLite-specific configuration
- [Connection Pooling](/docs/guides/connection-pooling) - Advanced pool tuning
