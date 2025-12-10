---
title: Migration from Drizzle
description: A step-by-step guide to migrating from Drizzle ORM to Effect SQL.
---

# Migration from Drizzle

This guide walks through migrating a Drizzle ORM application to Effect SQL. The migration can be done gradually, allowing you to convert queries incrementally.

## Migration Strategies

### Strategy 1: Gradual Migration (Recommended)

1. Add Effect SQL alongside Drizzle using `@effect/sql-drizzle`
2. Wrap Drizzle queries with Effect
3. Convert queries to Effect SQL one at a time
4. Remove Drizzle when fully migrated

### Strategy 2: Big Bang

1. Set up Effect SQL
2. Convert all queries at once
3. Remove Drizzle

## Step 1: Add Effect SQL

Install the packages:

```bash
npm install effect @effect/sql @effect/sql-pg @effect/sql-drizzle
```

Create your Effect SQL setup alongside Drizzle:

```typescript
// src/db/effect.ts
import { PgClient } from "@effect/sql-pg"
import * as Drizzle from "@effect/sql-drizzle/Pg"

export const DatabaseLive = PgClient.layer({
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USER,
  password: Redacted.make(process.env.DATABASE_PASSWORD!)
})

// Drizzle integration layer
export const DrizzleLive = Drizzle.layer.pipe(
  Layer.provide(DatabaseLive)
)
```

## Step 2: Wrap Existing Queries

Start by wrapping existing Drizzle queries with Effect:

```typescript
// Before: Pure Drizzle
export async function findUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).then(r => r[0])
}

// After: Drizzle with Effect
export const findUserById = (id: number) =>
  Effect.gen(function* () {
    const db = yield* Drizzle.PgDrizzle
    const result = yield* db.select().from(users).where(eq(users.id, id))
    return result[0]
  })
```

## Step 3: Convert Queries to Effect SQL

Convert queries one at a time:

### Simple Queries

```typescript
// Drizzle
const users = await db.select().from(usersTable).where(eq(usersTable.active, true))

// Effect SQL
const users = yield* sql<User>`SELECT * FROM users WHERE active = true`
```

### Queries with Parameters

```typescript
// Drizzle
const user = await db
  .select()
  .from(usersTable)
  .where(eq(usersTable.id, userId))
  .then(r => r[0])

// Effect SQL
const [user] = yield* sql<User>`SELECT * FROM users WHERE id = ${userId}`
```

### Inserts

```typescript
// Drizzle
const [newUser] = await db
  .insert(usersTable)
  .values({ name, email })
  .returning()

// Effect SQL
const [newUser] = yield* sql<User>`
  INSERT INTO users ${sql.insert({ name, email })}
  RETURNING *
`
```

### Updates

```typescript
// Drizzle
await db
  .update(usersTable)
  .set({ name: newName, updatedAt: new Date() })
  .where(eq(usersTable.id, userId))

// Effect SQL
yield* sql`
  UPDATE users 
  SET ${sql.update({ name: newName, updatedAt: new Date() })}
  WHERE id = ${userId}
`
```

### Deletes

```typescript
// Drizzle
await db.delete(usersTable).where(eq(usersTable.id, userId))

// Effect SQL
yield* sql`DELETE FROM users WHERE id = ${userId}`
```

### Joins

```typescript
// Drizzle
const results = await db
  .select()
  .from(usersTable)
  .leftJoin(postsTable, eq(usersTable.id, postsTable.authorId))
  .where(eq(usersTable.active, true))

// Effect SQL
const results = yield* sql`
  SELECT u.*, p.*
  FROM users u
  LEFT JOIN posts p ON u.id = p.author_id
  WHERE u.active = true
`
```

### Complex Queries

```typescript
// Drizzle (may require raw SQL anyway)
const results = await db.execute(sql`
  WITH active_users AS (...)
  SELECT ...
`)

// Effect SQL (natural for complex queries)
const results = yield* sql`
  WITH active_users AS (
    SELECT * FROM users WHERE last_login > ${lastMonth}
  ),
  user_stats AS (
    SELECT user_id, COUNT(*) as order_count
    FROM orders
    GROUP BY user_id
  )
  SELECT 
    u.*,
    COALESCE(s.order_count, 0) as orders
  FROM active_users u
  LEFT JOIN user_stats s ON u.id = s.user_id
  ORDER BY s.order_count DESC
`
```

## Step 4: Convert Transactions

```typescript
// Drizzle
await db.transaction(async (tx) => {
  await tx.insert(ordersTable).values(order)
  await tx.update(inventoryTable)
    .set({ quantity: sql`quantity - ${order.quantity}` })
    .where(eq(inventoryTable.productId, order.productId))
})

// Effect SQL
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT INTO orders ${sql.insert(order)}`
    yield* sql`
      UPDATE inventory 
      SET quantity = quantity - ${order.quantity}
      WHERE product_id = ${order.productId}
    `
  })
)
```

## Step 5: Convert Error Handling

```typescript
// Drizzle
try {
  await db.insert(usersTable).values({ email })
} catch (error) {
  if (error.code === '23505') {
    throw new DuplicateEmailError(email)
  }
  throw error
}

// Effect SQL
yield* sql`INSERT INTO users ${sql.insert({ email })}`.pipe(
  Effect.catchTag("SqlError", (error) => {
    const cause = error.cause as any
    if (cause?.code === "23505") {
      return Effect.fail(new DuplicateEmailError(email))
    }
    return Effect.fail(error)
  })
)
```

## Step 6: Convert Migrations

### From Drizzle Migrations

Drizzle migrations are SQL files in `drizzle/` directory.

### To Effect SQL Migrations

Convert to Effect migrations:

```typescript
// migrations/001_initial.ts (Effect SQL)
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  // Copy the SQL from your Drizzle migration
  yield* sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
})
```

Setup the migrator:

```typescript
import { PgMigrator } from "@effect/sql-pg"
import { Migrator } from "@effect/sql"

export const MigratorLive = PgMigrator.layer({
  loader: Migrator.fromGlob(import.meta.glob("./migrations/*.ts"))
})
```

## Step 7: Update Services

### Before (Drizzle)

```typescript
export class UserService {
  constructor(private db: DrizzleDB) {}
  
  async findById(id: number) {
    return this.db.select().from(users).where(eq(users.id, id)).then(r => r[0])
  }
  
  async create(data: { name: string; email: string }) {
    return this.db.insert(users).values(data).returning().then(r => r[0])
  }
}
```

### After (Effect SQL)

```typescript
export class UserService extends Effect.Service<UserService>()("UserService", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    return {
      findById: (id: number) =>
        Effect.gen(function* () {
          const users = yield* sql<User>`SELECT * FROM users WHERE id = ${id}`
          return Option.fromNullable(users[0])
        }),
      
      create: (data: { name: string; email: string }) =>
        Effect.gen(function* () {
          const [user] = yield* sql<User>`
            INSERT INTO users ${sql.insert(data)} RETURNING *
          `
          return user
        })
    }
  })
}) {}
```

## Step 8: Update Entry Points

### Before

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool)

const userService = new UserService(db)
const user = await userService.findById(1)
```

### After

```typescript
import { Effect, Layer } from "effect"
import { SqlClient } from "@effect/sql"
import { PgClient } from "@effect/sql-pg"

const DatabaseLive = PgClient.layer({
  url: Redacted.make(process.env.DATABASE_URL!)
})

const AppLive = Layer.mergeAll(
  UserService.Default
).pipe(
  Layer.provideMerge(DatabaseLive)
)

const program = Effect.gen(function* () {
  const userService = yield* UserService
  const user = yield* userService.findById(1)
  return user
})

Effect.runPromise(program.pipe(Effect.provide(AppLive)))
```

## Step 9: Remove Drizzle

Once all queries are converted:

1. Remove Drizzle imports and schema
2. Delete drizzle configuration files
3. Uninstall packages:

```bash
npm uninstall drizzle-orm drizzle-kit @effect/sql-drizzle
```

## Type Safety Comparison

### Drizzle

Types are generated from schema:

```typescript
// Schema defines types
const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull()
})

// Types are inferred
type User = typeof users.$inferSelect
```

### Effect SQL

Types are declared explicitly:

```typescript
// Define types manually or with Schema
class User extends Schema.Class<User>("User")({
  id: Schema.Number,
  name: Schema.String
}) {}

// Or simple interface
interface User {
  id: number
  name: string
}

// Annotate queries
const users = yield* sql<User>`SELECT * FROM users`
```

For validated types, use SqlSchema:

```typescript
const findUser = SqlSchema.findOne({
  Request: Schema.Number,
  Result: User,  // Validated at runtime
  execute: (id) => sql`SELECT * FROM users WHERE id = ${id}`
})
```

## Common Patterns

### Optional Filters

```typescript
// Drizzle
let query = db.select().from(users)
if (name) query = query.where(like(users.name, `%${name}%`))
if (active) query = query.where(eq(users.active, true))

// Effect SQL
const conditions: Fragment[] = []
if (name) conditions.push(sql`name LIKE ${`%${name}%`}`)
if (active) conditions.push(sql`active = true`)

const where = conditions.length > 0
  ? sql`WHERE ${sql.and(conditions)}`
  : sql``

const users = yield* sql<User>`SELECT * FROM users ${where}`
```

## Checklist

- [ ] Install Effect SQL packages
- [ ] Set up database Layer
- [ ] Create Effect SQL migrations
- [ ] Convert simple queries
- [ ] Convert complex queries
- [ ] Convert transactions
- [ ] Update error handling
- [ ] Update services to use Effect.Service
- [ ] Update entry points
- [ ] Test thoroughly
- [ ] Remove Drizzle

## Next Steps

- [Core Concepts](/docs/core-concepts/sql-client) - Learn Effect SQL fundamentals
- [Models](/docs/advanced/models) - Type-safe domain models
- [Migrations](/docs/advanced/migrations) - Migration system details
