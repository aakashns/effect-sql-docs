---
title: MySQL
description: Using Effect SQL with MySQL databases.
---

# MySQL

The `@effect/sql-mysql2` package provides MySQL support for Effect SQL, using the [mysql2](https://sidorares.github.io/node-mysql2/docs) library under the hood.

## Installation

```bash
npm install @effect/sql @effect/sql-mysql2
```

## Basic Setup

```typescript
import { Effect } from "effect"
import { SqlClient } from "@effect/sql"
import { MysqlClient } from "@effect/sql-mysql2"

// Create the database layer
const DatabaseLive = MysqlClient.layer({
  host: "localhost",
  port: 3306,
  database: "myapp",
  username: "root",
  password: Redacted.make("secret")
})

// Use in your program
const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const users = yield* sql`SELECT * FROM users`
  return users
})

Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)))
```

## Configuration Options

```typescript
import { Redacted, Duration } from "effect"

const DatabaseLive = MysqlClient.layer({
  // Connection settings
  host: "localhost",
  port: 3306,
  database: "myapp",
  username: "root",
  password: Redacted.make("secret"),
  
  // Or use a URL
  url: Redacted.make("mysql://root:secret@localhost:3306/myapp"),
  
  // Connection pool
  maxConnections: 10,
  minConnections: 2,
  connectTimeout: Duration.seconds(10),
  
  // Name transformations
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel,
  
  // Custom span attributes
  spanAttributes: {
    "db.name": "myapp"
  }
})
```

### Environment Configuration

```typescript
import { Config, Redacted } from "effect"

const DatabaseConfig = Config.all({
  host: Config.string("MYSQL_HOST").pipe(Config.withDefault("localhost")),
  port: Config.integer("MYSQL_PORT").pipe(Config.withDefault(3306)),
  database: Config.string("MYSQL_DATABASE"),
  username: Config.string("MYSQL_USER"),
  password: Config.redacted("MYSQL_PASSWORD")
})

const DatabaseLive = MysqlClient.layerConfig(DatabaseConfig)
```

## MySQL-Specific SQL

### Auto-Increment

MySQL uses `AUTO_INCREMENT`:

```typescript
yield* sql`
  CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE
  )
`
```

### Getting Last Insert ID

MySQL doesn't support `RETURNING`. Use `LAST_INSERT_ID()`:

```typescript
// Insert
yield* sql`INSERT INTO users ${sql.insert({ name: "Alice", email: "alice@example.com" })}`

// Get the inserted ID
const [{ id }] = yield* sql`SELECT LAST_INSERT_ID() as id`
```

### ON DUPLICATE KEY UPDATE

MySQL's upsert syntax:

```typescript
yield* sql`
  INSERT INTO users (email, name) 
  VALUES (${"alice@example.com"}, ${"Alice"})
  ON DUPLICATE KEY UPDATE name = VALUES(name)
`
```

### REPLACE INTO

Replace existing rows:

```typescript
yield* sql`
  REPLACE INTO settings (user_id, key, value)
  VALUES (${1}, ${"theme"}, ${"dark"})
`
```

## Working with MySQL Types

### JSON Columns

```typescript
// Insert JSON
yield* sql`
  INSERT INTO configs ${sql.insert({
    name: "app",
    settings: JSON.stringify({ theme: "dark" })
  })}
`

// Query JSON
const configs = yield* sql`
  SELECT 
    name,
    JSON_EXTRACT(settings, '$.theme') as theme
  FROM configs
`
```

### DATETIME and TIMESTAMP

```typescript
// Insert with current timestamp
yield* sql`
  INSERT INTO events ${sql.insert({
    name: "login",
    createdAt: new Date()
  })}
`

// Query with date comparison
const recentEvents = yield* sql`
  SELECT * FROM events 
  WHERE created_at > ${new Date(Date.now() - 86400000)}
`
```

### ENUM Types

```typescript
yield* sql`
  CREATE TABLE posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    status ENUM('draft', 'published', 'archived') DEFAULT 'draft'
  )
`

yield* sql`INSERT INTO posts ${sql.insert({ status: "published" })}`
```

## Transactions

### Basic Transaction

```typescript
const sql = yield* SqlClient.SqlClient

yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT INTO orders ${sql.insert({ userId: 1, total: 100 })}`
    yield* sql`UPDATE accounts SET balance = balance - ${100} WHERE user_id = ${1}`
  })
)
```

### Nested Transactions (Savepoints)

```typescript
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT INTO orders ...`
    
    // Creates a savepoint
    const result = yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO order_items ...`
        // May fail and rollback to savepoint
      })
    ).pipe(Effect.option)
    
    // Continue with outer transaction
    yield* sql`UPDATE inventory ...`
  })
)
```

## Error Handling

Handle MySQL-specific errors:

```typescript
import { SqlError } from "@effect/sql"

program.pipe(
  Effect.catchTag("SqlError", (error) => {
    const mysqlError = error.cause as { errno?: number; code?: string }
    
    switch (mysqlError.errno) {
      case 1062: // Duplicate entry
        return Effect.fail(new DuplicateKeyError())
      case 1451: // Foreign key constraint (delete)
        return Effect.fail(new ReferencedByOtherRecordError())
      case 1452: // Foreign key constraint (insert/update)
        return Effect.fail(new InvalidReferenceError())
      case 1048: // Column cannot be null
        return Effect.fail(new RequiredFieldError())
      default:
        return Effect.fail(error)
    }
  })
)
```

Common MySQL error codes:
- `1062` - Duplicate entry (unique constraint)
- `1451` - Cannot delete - foreign key constraint
- `1452` - Cannot add - foreign key constraint
- `1048` - Column cannot be null
- `1054` - Unknown column
- `1146` - Table doesn't exist

## Batch Operations

### Batch Inserts

```typescript
// Insert multiple rows
yield* sql`
  INSERT INTO users ${sql.insert([
    { name: "Alice", email: "alice@example.com" },
    { name: "Bob", email: "bob@example.com" },
    { name: "Charlie", email: "charlie@example.com" }
  ])}
`
```

### Batch Updates

Use `sql.updateValues` for efficient batch updates:

```typescript
yield* sql`
  UPDATE users 
  SET name = data.name
  FROM ${sql.updateValues([
    { id: 1, name: "Alice Smith" },
    { id: 2, name: "Bob Jones" }
  ], "data")}
  WHERE users.id = data.id
`
```

## Character Sets and Collations

Ensure proper character set handling:

```typescript
// In your MySQL configuration
const DatabaseLive = MysqlClient.layer({
  // ... other options
  charset: "utf8mb4"
})

// Or in SQL
yield* sql`SET NAMES utf8mb4`
```

## Performance Tips

### Use Indexes

```typescript
yield* sql`CREATE INDEX idx_users_email ON users(email)`
yield* sql`CREATE INDEX idx_posts_user_created ON posts(user_id, created_at)`
```

### Optimize Connection Pool

```typescript
const DatabaseLive = MysqlClient.layer({
  maxConnections: 20,   // Based on your workload
  minConnections: 5,    // Keep connections warm
  waitForConnections: true
})
```

### Use EXPLAIN

Debug query performance:

```typescript
const explain = yield* sql`EXPLAIN SELECT * FROM users WHERE email = ${"alice@example.com"}`
console.log(explain)
```

## Migrations

```typescript
import { MysqlMigrator } from "@effect/sql-mysql2"
import { Migrator } from "@effect/sql"

const MigratorLive = MysqlMigrator.layer({
  loader: Migrator.fromGlob(import.meta.glob("./migrations/*.ts"))
})
```

Example migration:

```typescript
// migrations/001_initial.ts
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  yield* sql`
    CREATE TABLE users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `
})
```

## Dialect-Specific Code

Use `onDialect` for MySQL-specific SQL:

```typescript
const result = yield* sql.onDialect({
  mysql: () => sql`SELECT NOW()`,
  pg: () => sql`SELECT NOW()`,
  sqlite: () => sql`SELECT datetime('now')`,
  mssql: () => sql`SELECT GETDATE()`,
  clickhouse: () => sql`SELECT now()`
})
```

## Next Steps

- [Migrations](/docs/advanced/migrations) - Database schema management
- [Transactions](/docs/advanced/transactions) - Advanced transaction patterns
- [Connection Pooling](/docs/guides/connection-pooling) - Pool optimization
