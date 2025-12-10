---
title: Microsoft SQL Server
description: Using Effect SQL with Microsoft SQL Server databases.
---

# Microsoft SQL Server

The `@effect/sql-mssql` package provides Microsoft SQL Server support for Effect SQL.

## Installation

```bash
npm install @effect/sql @effect/sql-mssql
```

## Basic Setup

```typescript
import { Effect } from "effect"
import { SqlClient } from "@effect/sql"
import { MssqlClient } from "@effect/sql-mssql"

const DatabaseLive = MssqlClient.layer({
  server: "localhost",
  port: 1433,
  database: "myapp",
  username: "sa",
  password: Redacted.make("secret"),
  trustServerCertificate: true // For development
})

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

const DatabaseLive = MssqlClient.layer({
  // Connection
  server: "localhost",
  port: 1433,
  database: "myapp",
  username: "sa",
  password: Redacted.make("secret"),
  
  // Or instance name instead of port
  instanceName: "SQLEXPRESS",
  
  // SSL/TLS
  trustServerCertificate: true,
  encrypt: true,
  
  // Pool settings
  maxConnections: 10,
  minConnections: 2,
  connectTimeout: Duration.seconds(15),
  requestTimeout: Duration.seconds(30),
  
  // Name transformations
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel
})
```

## SQL Server-Specific SQL

### Identity Columns

```typescript
yield* sql`
  CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    email NVARCHAR(255) NOT NULL UNIQUE
  )
`
```

### OUTPUT Clause (RETURNING equivalent)

```typescript
// Get inserted row
const [user] = yield* sql`
  INSERT INTO users (name, email)
  OUTPUT INSERTED.*
  VALUES (${"Alice"}, ${"alice@example.com"})
`

// Get updated rows
const updated = yield* sql`
  UPDATE users
  SET name = ${"Alice Smith"}
  OUTPUT INSERTED.*
  WHERE id = ${1}
`

// Get deleted rows
const deleted = yield* sql`
  DELETE FROM users
  OUTPUT DELETED.*
  WHERE id = ${1}
`
```

### MERGE (Upsert)

```typescript
yield* sql`
  MERGE users AS target
  USING (SELECT ${"alice@example.com"} AS email, ${"Alice"} AS name) AS source
  ON target.email = source.email
  WHEN MATCHED THEN
    UPDATE SET name = source.name
  WHEN NOT MATCHED THEN
    INSERT (email, name) VALUES (source.email, source.name);
`
```

### Pagination with OFFSET-FETCH

```typescript
const page = 2
const pageSize = 20

const users = yield* sql`
  SELECT * FROM users
  ORDER BY id
  OFFSET ${(page - 1) * pageSize} ROWS
  FETCH NEXT ${pageSize} ROWS ONLY
`
```

### Common Table Expressions (CTEs)

```typescript
const hierarchyResults = yield* sql`
  WITH EmployeeHierarchy AS (
    SELECT id, name, manager_id, 0 AS level
    FROM employees
    WHERE manager_id IS NULL
    
    UNION ALL
    
    SELECT e.id, e.name, e.manager_id, eh.level + 1
    FROM employees e
    INNER JOIN EmployeeHierarchy eh ON e.manager_id = eh.id
  )
  SELECT * FROM EmployeeHierarchy
`
```

## Working with SQL Server Types

### NVARCHAR for Unicode

```typescript
yield* sql`
  CREATE TABLE posts (
    id INT IDENTITY PRIMARY KEY,
    title NVARCHAR(255) NOT NULL,  -- Unicode support
    content NVARCHAR(MAX)          -- Unlimited length
  )
`
```

### DATETIME2

```typescript
yield* sql`
  CREATE TABLE events (
    id INT IDENTITY PRIMARY KEY,
    name NVARCHAR(100),
    created_at DATETIME2 DEFAULT GETDATE()
  )
`

yield* sql`INSERT INTO events ${sql.insert({ name: "login", createdAt: new Date() })}`
```

### BIT (Boolean)

```typescript
yield* sql`
  CREATE TABLE settings (
    id INT IDENTITY PRIMARY KEY,
    is_active BIT DEFAULT 1
  )
`

// Insert boolean value
yield* sql`INSERT INTO settings ${sql.insert({ isActive: true })}`
```

### UNIQUEIDENTIFIER (UUID)

```typescript
yield* sql`
  CREATE TABLE sessions (
    id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    user_id INT NOT NULL
  )
`
```

## Transactions

### Basic Transaction

```typescript
const sql = yield* SqlClient.SqlClient

yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT INTO orders (user_id, total) VALUES (${1}, ${100})`
    yield* sql`UPDATE accounts SET balance = balance - ${100} WHERE user_id = ${1}`
  })
)
```

### Transaction Isolation Levels

```typescript
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`
    // Your queries
  })
)
```

## Error Handling

```typescript
import { SqlError } from "@effect/sql"

program.pipe(
  Effect.catchTag("SqlError", (error) => {
    const mssqlError = error.cause as { number?: number }
    
    switch (mssqlError.number) {
      case 2627: // Unique constraint violation
        return Effect.fail(new DuplicateKeyError())
      case 547:  // Foreign key violation
        return Effect.fail(new ForeignKeyError())
      case 515:  // Cannot insert NULL
        return Effect.fail(new RequiredFieldError())
      default:
        return Effect.fail(error)
    }
  })
)
```

Common SQL Server error numbers:
- `2627` - Unique constraint violation
- `2601` - Duplicate key (unique index)
- `547` - Foreign key violation
- `515` - Cannot insert NULL
- `208` - Invalid object name
- `207` - Invalid column name

## Stored Procedures

```typescript
// Execute a stored procedure
const results = yield* sql`EXEC GetUserById @UserId = ${1}`

// With output parameter (using raw query)
const sql = yield* SqlClient.SqlClient
const result = yield* sql.unsafe(`
  DECLARE @TotalCount INT
  EXEC GetUsersWithCount @TotalCount = @TotalCount OUTPUT
  SELECT @TotalCount AS total_count
`)
```

## Migrations

```typescript
import { MssqlMigrator } from "@effect/sql-mssql"
import { Migrator } from "@effect/sql"

const MigratorLive = MssqlMigrator.layer({
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
      id INT IDENTITY(1,1) PRIMARY KEY,
      name NVARCHAR(255) NOT NULL,
      email NVARCHAR(255) NOT NULL UNIQUE,
      created_at DATETIME2 DEFAULT GETDATE()
    )
  `
})
```

## Dialect-Specific Code

```typescript
const result = yield* sql.onDialect({
  mssql: () => sql`SELECT GETDATE()`,
  pg: () => sql`SELECT NOW()`,
  mysql: () => sql`SELECT NOW()`,
  sqlite: () => sql`SELECT datetime('now')`,
  clickhouse: () => sql`SELECT now()`
})
```

## Next Steps

- [Migrations](/docs/advanced/migrations) - Database schema management
- [Transactions](/docs/advanced/transactions) - Advanced transaction patterns
