---
title: Quick Start
description: A hands-on introduction to Effect SQL with a practical example.
---

# Quick Start

Let's build a simple application that demonstrates the key features of Effect SQL. We'll create a basic user management system with SQLite.

## Setting Up

First, create a new project and install the dependencies:

```bash
mkdir effect-sql-demo && cd effect-sql-demo
npm init -y
npm install effect @effect/sql @effect/sql-sqlite-node
npm install -D typescript tsx
```

Create a `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

## Creating the Database Client

Create a file `src/db.ts`:

```typescript
import { SqliteClient } from "@effect/sql-sqlite-node"
import { Layer } from "effect"

// Create a Layer that provides the database client
export const DatabaseLive = SqliteClient.layer({
  filename: "app.db"
})
```

The `layer` function creates an Effect Layer that:
- Opens a connection to the database (creating it if it doesn't exist)
- Enables WAL mode for better concurrent performance
- Provides the client to any Effect that needs it
- Closes the connection when the program exits

## Writing Your First Query

Create `src/index.ts`:

```typescript
import { Effect } from "effect"
import { SqlClient } from "@effect/sql"
import { DatabaseLive } from "./db.js"

const program = Effect.gen(function* () {
  // Get the SQL client from the context
  const sql = yield* SqlClient.SqlClient

  // Create a table
  yield* sql`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `
  console.log("✓ Created users table")

  // Insert some data
  yield* sql`
    INSERT INTO users (name, email) VALUES
      ('Alice', 'alice@example.com'),
      ('Bob', 'bob@example.com')
  `
  console.log("✓ Inserted users")

  // Query the data
  const users = yield* sql<{
    id: number
    name: string
    email: string
    created_at: string
  }>`SELECT * FROM users`
  
  console.log("✓ Found users:", users)

  return users
})

// Run the program with the database layer
Effect.runPromise(
  program.pipe(Effect.provide(DatabaseLive))
).then(
  () => console.log("\nDone!"),
  (error) => console.error("Error:", error)
)
```

Run it:

```bash
npx tsx src/index.ts
```

## Using Parameters

Values interpolated into queries are automatically converted to parameters, preventing SQL injection:

```typescript
const findUserByEmail = (email: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    // The ${email} becomes a parameterized value
    const users = yield* sql<{ id: number; name: string }>`
      SELECT id, name FROM users WHERE email = ${email}
    `
    
    return users[0] // undefined if not found
  })

// Usage
const user = yield* findUserByEmail("alice@example.com")
```

## Insert and Update Helpers

Effect SQL provides helpers for common operations:

```typescript
const sql = yield* SqlClient.SqlClient

// Insert a single record
yield* sql`
  INSERT INTO users ${sql.insert({ name: "Charlie", email: "charlie@example.com" })}
`

// Insert multiple records
yield* sql`
  INSERT INTO users ${sql.insert([
    { name: "David", email: "david@example.com" },
    { name: "Eve", email: "eve@example.com" }
  ])}
`

// Update a record
yield* sql`
  UPDATE users SET ${sql.update({ name: "Alice Smith" })} WHERE id = ${1}
`
```

## Transactions

Wrap any Effect in a transaction:

```typescript
import { SqlClient } from "@effect/sql"

const transferFunds = (fromId: number, toId: number, amount: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    yield* sql`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${fromId}`
    yield* sql`UPDATE accounts SET balance = balance + ${amount} WHERE id = ${toId}`
  })

// Wrap in a transaction - if any query fails, all changes are rolled back
const safeTransfer = (fromId: number, toId: number, amount: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    return yield* sql.withTransaction(
      transferFunds(fromId, toId, amount)
    )
  })
```

## Schema Validation

Use Effect Schema to validate and transform query results:

```typescript
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "@effect/sql"

// Define a schema for your data
class User extends Schema.Class<User>("User")({
  id: Schema.Number,
  name: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  createdAt: Schema.DateFromString
}) {}

// Create a type-safe query function
const findUser = SqlSchema.findOne({
  Request: Schema.Number, // input type
  Result: User,           // output type
  execute: (id) => 
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT * FROM users WHERE id = ${id}`
    })
})

// Usage - returns Effect<Option<User>, ParseError | SqlError>
const user = yield* findUser(1)
```

## Complete Example

Here's a complete example putting it all together:

```typescript
import { Effect, Schema, Option, Console } from "effect"
import { SqlClient, SqlSchema } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-node"

// Define our domain model
class User extends Schema.Class<User>("User")({
  id: Schema.Number,
  name: Schema.NonEmptyString,
  email: Schema.NonEmptyString
}) {}

// Database setup
const setupDatabase = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE
    )
  `
})

// Query functions
const createUser = (name: string, email: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [user] = yield* sql<{ id: number; name: string; email: string }>`
      INSERT INTO users (name, email) 
      VALUES (${name}, ${email}) 
      RETURNING *
    `
    return user
  })

const findUserById = SqlSchema.findOne({
  Request: Schema.Number,
  Result: User,
  execute: (id) => 
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT * FROM users WHERE id = ${id}`
    })
})

const getAllUsers = SqlSchema.findAll({
  Request: Schema.Void,
  Result: User,
  execute: () => 
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT * FROM users`
    })
})

// Main program
const program = Effect.gen(function* () {
  yield* setupDatabase
  yield* Console.log("Database ready!")

  // Create some users
  const alice = yield* createUser("Alice", "alice@example.com")
  yield* Console.log("Created user:", alice)

  const bob = yield* createUser("Bob", "bob@example.com")
  yield* Console.log("Created user:", bob)

  // Find a user
  const foundUser = yield* findUserById(1)
  yield* Option.match(foundUser, {
    onNone: () => Console.log("User not found"),
    onSome: (user) => Console.log("Found user:", user)
  })

  // Get all users
  const allUsers = yield* getAllUsers(undefined)
  yield* Console.log("All users:", allUsers)
})

// Run with a fresh in-memory database
const DatabaseLive = SqliteClient.layer({ filename: ":memory:" })

Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)))
```

## Next Steps

You've learned the basics! Here's where to go next:

- [Why Effect SQL?](/docs/getting-started/why-effect-sql) - Understand the design decisions
- [SqlClient](/docs/core-concepts/sql-client) - Deep dive into the client API
- [Transactions](/docs/advanced/transactions) - Learn about transaction handling
- [Migrations](/docs/advanced/migrations) - Manage your database schema
