---
title: Using Drizzle with Effect
description: Get the best of both worlds by using Drizzle's query builder with Effect SQL.
---

# Using Drizzle with Effect

The `@effect/sql-drizzle` package lets you use Drizzle's type-safe query builder while benefiting from Effect's error handling, resource management, and observability.

## Why Use Both?

Drizzle provides:
- Schema-driven type generation
- Type-safe query builder
- Relational queries with automatic joins
- Familiar API for Drizzle users

Effect SQL provides:
- Proper error handling with typed errors
- Automatic resource management
- Built-in observability (tracing, spans)
- Integration with Effect services

Together, you get the best of both worlds.

## Installation

```bash
npm install @effect/sql @effect/sql-drizzle drizzle-orm
# Plus your database adapter
npm install @effect/sql-pg  # for PostgreSQL
```

## Setup

### Define Your Drizzle Schema

```typescript
// src/schema.ts
import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow()
})

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content"),
  authorId: integer("author_id").references(() => users.id),
  published: boolean("published").default(false)
})
```

### Create the Drizzle Layer

```typescript
// src/db.ts
import { Effect, Layer } from "effect"
import { PgClient } from "@effect/sql-pg"
import * as Drizzle from "@effect/sql-drizzle/Pg"
import * as schema from "./schema.js"

// Database connection
export const DatabaseLive = PgClient.layer({
  host: "localhost",
  database: "myapp"
})

// Drizzle layer with schema
export const DrizzleLive = Drizzle.layer.pipe(
  Layer.provide(DatabaseLive)
)

// Or with schema for relational queries
export const DrizzleWithSchemaLive = Layer.effect(
  Drizzle.PgDrizzle,
  Drizzle.make({ schema })
).pipe(Layer.provide(DatabaseLive))
```

## Basic Usage

### Queries Return Effects

Drizzle queries are automatically converted to Effects:

```typescript
import { Effect } from "effect"
import * as Drizzle from "@effect/sql-drizzle/Pg"
import { users, posts } from "./schema.js"
import { eq, gt, and } from "drizzle-orm"

const program = Effect.gen(function* () {
  const db = yield* Drizzle.PgDrizzle
  
  // Select all users
  const allUsers = yield* db.select().from(users)
  
  // Select with conditions
  const activeUsers = yield* db
    .select()
    .from(users)
    .where(eq(users.active, true))
  
  // Insert
  const [newUser] = yield* db
    .insert(users)
    .values({ name: "Alice", email: "alice@example.com" })
    .returning()
  
  // Update
  yield* db
    .update(users)
    .set({ name: "Alice Smith" })
    .where(eq(users.id, newUser.id))
  
  // Delete
  yield* db
    .delete(posts)
    .where(eq(posts.authorId, newUser.id))
  
  return newUser
})
```

### Transactions

Transactions work seamlessly:

```typescript
import { SqlClient } from "@effect/sql"

const transferFunds = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const db = yield* Drizzle.PgDrizzle
  
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* db
        .update(accounts)
        .set({ balance: sql`balance - ${100}` })
        .where(eq(accounts.id, fromId))
      
      yield* db
        .update(accounts)
        .set({ balance: sql`balance + ${100}` })
        .where(eq(accounts.id, toId))
    })
  )
})
```

### Error Handling

Drizzle errors are converted to SqlError:

```typescript
const createUser = (email: string) =>
  Effect.gen(function* () {
    const db = yield* Drizzle.PgDrizzle
    
    return yield* db
      .insert(users)
      .values({ name: "User", email })
      .returning()
  }).pipe(
    Effect.catchTag("SqlError", (error) => {
      const cause = error.cause as any
      if (cause?.code === "23505") {
        return Effect.fail(new DuplicateEmailError({ email }))
      }
      return Effect.fail(error)
    })
  )
```

## Relational Queries

With schema, you can use Drizzle's relational queries:

```typescript
const program = Effect.gen(function* () {
  const db = yield* Drizzle.PgDrizzle
  
  // Relational query
  const usersWithPosts = yield* db.query.users.findMany({
    with: {
      posts: true
    },
    where: eq(users.active, true)
  })
  
  // Find one with relations
  const user = yield* db.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      posts: {
        where: eq(posts.published, true)
      }
    }
  })
})
```

## Combining with Effect SQL

Use Drizzle for some queries and raw SQL for others:

```typescript
const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const db = yield* Drizzle.PgDrizzle
  
  // Use Drizzle for type-safe queries
  const users = yield* db.select().from(usersTable)
  
  // Use raw SQL for complex queries
  const stats = yield* sql`
    WITH monthly_data AS (
      SELECT 
        date_trunc('month', created_at) as month,
        COUNT(*) as count
      FROM orders
      GROUP BY 1
    )
    SELECT * FROM monthly_data ORDER BY month DESC
  `
})
```

## Database Adapters

### PostgreSQL

```typescript
import * as Drizzle from "@effect/sql-drizzle/Pg"
import { PgClient } from "@effect/sql-pg"

const DrizzleLive = Drizzle.layer.pipe(
  Layer.provide(PgClient.layer({ database: "myapp" }))
)
```

### MySQL

```typescript
import * as Drizzle from "@effect/sql-drizzle/Mysql"
import { MysqlClient } from "@effect/sql-mysql2"

const DrizzleLive = Drizzle.layer.pipe(
  Layer.provide(MysqlClient.layer({ database: "myapp" }))
)
```

### SQLite

```typescript
import * as Drizzle from "@effect/sql-drizzle/Sqlite"
import { SqliteClient } from "@effect/sql-sqlite-node"

const DrizzleLive = Drizzle.layer.pipe(
  Layer.provide(SqliteClient.layer({ filename: "./app.db" }))
)
```

## Service Pattern

Create a service that uses Drizzle:

```typescript
import * as Drizzle from "@effect/sql-drizzle/Pg"
import { users, posts } from "./schema.js"

export class UserService extends Effect.Service<UserService>()("UserService", {
  effect: Effect.gen(function* () {
    const db = yield* Drizzle.PgDrizzle
    
    return {
      findById: (id: number) =>
        db.select().from(users).where(eq(users.id, id)).then(r => r[0]),
      
      create: (data: { name: string; email: string }) =>
        db.insert(users).values(data).returning().then(r => r[0]),
      
      findWithPosts: (id: number) =>
        db.query.users.findFirst({
          where: eq(users.id, id),
          with: { posts: true }
        })
    }
  })
}) {}

// Use in your application
const program = Effect.gen(function* () {
  const userService = yield* UserService
  const user = yield* userService.findById(1)
})
```

## Testing

```typescript
import { it, describe } from "@effect/vitest"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Drizzle from "@effect/sql-drizzle/Sqlite"

const TestLayer = Drizzle.layer.pipe(
  Layer.provide(SqliteClient.layer({ filename: ":memory:" }))
)

describe("UserService", () => {
  it.effect("creates users", () =>
    Effect.gen(function* () {
      const db = yield* Drizzle.SqliteDrizzle
      
      // Setup schema
      yield* Effect.promise(() =>
        db.run(sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`)
      )
      
      // Test
      yield* db.insert(users).values({ name: "Alice" })
      const result = yield* db.select().from(users)
      
      expect(result).toHaveLength(1)
    }).pipe(Effect.provide(TestLayer))
  )
})
```

## Next Steps

- [Effect SQL vs Drizzle](/docs/comparison/drizzle) - Full comparison
- [Migration from Drizzle](/docs/comparison/migration-from-drizzle) - Drop Drizzle entirely
- [Repository Pattern](/docs/guides/repository-pattern) - Organizing data access
