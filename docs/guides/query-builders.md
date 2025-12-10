---
title: Query Builders
description: Using query builders like Kysely with Effect SQL.
---

# Query Builders

While Effect SQL encourages writing SQL directly, sometimes a type-safe query builder is helpful for dynamic queries. Effect SQL integrates with Kysely for this purpose.

## Why Use a Query Builder?

Query builders are useful when:
- Building complex dynamic queries with many optional filters
- You want compile-time validation of table/column names
- Teams prefer builder APIs over raw SQL
- Generating type-safe queries from a schema

Effect SQL is great for static queries:
```typescript
// Clear and direct
yield* sql`SELECT * FROM users WHERE id = ${id}`
```

Query builders shine for dynamic queries:
```typescript
// Many optional conditions
let query = db.selectFrom("users")
if (name) query = query.where("name", "like", `%${name}%`)
if (email) query = query.where("email", "=", email)
if (minAge) query = query.where("age", ">=", minAge)
const users = await query.execute()
```

## Kysely Integration

Install Kysely:

```bash
npm install kysely @effect/sql-kysely
```

### Setup

```typescript
import { Effect, Layer } from "effect"
import { SqlClient } from "@effect/sql"
import { PgClient } from "@effect/sql-pg"
import { KyselyClient } from "@effect/sql-kysely"
import { PostgresDialect } from "kysely"

// Define your database types
interface Database {
  users: {
    id: number
    name: string
    email: string
    age: number
    created_at: Date
  }
  posts: {
    id: number
    user_id: number
    title: string
    content: string
  }
}

// Create the Kysely layer
const KyselyLive = KyselyClient.layer<Database>()

// Use in your program
const program = Effect.gen(function* () {
  const db = yield* KyselyClient.KyselyClient<Database>
  
  const users = yield* Effect.promise(() =>
    db.selectFrom("users")
      .where("age", ">", 18)
      .selectAll()
      .execute()
  )
  
  return users
})

program.pipe(
  Effect.provide(KyselyLive),
  Effect.provide(PgClient.layer({ database: "myapp" }))
)
```

### Using with Effect SQL

Combine Kysely for dynamic queries with Effect SQL for static queries:

```typescript
const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const db = yield* KyselyClient.KyselyClient<Database>
  
  // Static queries with Effect SQL
  const [user] = yield* sql<User>`SELECT * FROM users WHERE id = ${userId}`
  
  // Dynamic queries with Kysely
  const searchResults = yield* Effect.promise(() =>
    db.selectFrom("users")
      .where("name", "like", `%${search}%`)
      .where("age", ">=", minAge)
      .orderBy("created_at", "desc")
      .limit(20)
      .selectAll()
      .execute()
  )
})
```

## Building Dynamic Queries

### Optional Filters

```typescript
interface UserFilters {
  name?: string
  email?: string
  minAge?: number
  maxAge?: number
}

const findUsers = (filters: UserFilters) =>
  Effect.gen(function* () {
    const db = yield* KyselyClient.KyselyClient<Database>
    
    let query = db.selectFrom("users").selectAll()
    
    if (filters.name) {
      query = query.where("name", "like", `%${filters.name}%`)
    }
    if (filters.email) {
      query = query.where("email", "=", filters.email)
    }
    if (filters.minAge !== undefined) {
      query = query.where("age", ">=", filters.minAge)
    }
    if (filters.maxAge !== undefined) {
      query = query.where("age", "<=", filters.maxAge)
    }
    
    return yield* Effect.promise(() => query.execute())
  })
```

### Dynamic Sorting

```typescript
const findUsers = (sortBy: "name" | "email" | "created_at", order: "asc" | "desc") =>
  Effect.gen(function* () {
    const db = yield* KyselyClient.KyselyClient<Database>
    
    return yield* Effect.promise(() =>
      db.selectFrom("users")
        .orderBy(sortBy, order)
        .selectAll()
        .execute()
    )
  })
```

### Pagination

```typescript
const findUsersPaginated = (page: number, pageSize: number) =>
  Effect.gen(function* () {
    const db = yield* KyselyClient.KyselyClient<Database>
    
    return yield* Effect.promise(() =>
      db.selectFrom("users")
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .selectAll()
        .execute()
    )
  })
```

## When to Use Each

### Use Effect SQL When:
- Queries are static or have simple conditionals
- You want raw SQL clarity
- Performance is critical (no builder overhead)
- Complex queries (CTEs, window functions) that builders struggle with

```typescript
// Effect SQL - clear and direct
yield* sql`
  WITH recent_orders AS (
    SELECT * FROM orders WHERE created_at > NOW() - INTERVAL '30 days'
  )
  SELECT users.*, COUNT(recent_orders.id) as order_count
  FROM users
  LEFT JOIN recent_orders ON users.id = recent_orders.user_id
  GROUP BY users.id
  HAVING COUNT(recent_orders.id) > 0
`
```

### Use Kysely When:
- Building search/filter UIs with many optional parameters
- You need compile-time column/table validation
- Team prefers builder API
- Generating queries programmatically

```typescript
// Kysely - flexible for dynamic conditions
let query = db.selectFrom("products").selectAll()

if (category) query = query.where("category", "=", category)
if (minPrice) query = query.where("price", ">=", minPrice)
if (maxPrice) query = query.where("price", "<=", maxPrice)
if (search) query = query.where("name", "like", `%${search}%`)
if (inStock) query = query.where("stock", ">", 0)

await query.orderBy(sortBy, sortOrder).limit(limit).execute()
```

## Hybrid Approach

Use both in the same codebase:

```typescript
class ProductRepository extends Effect.Service<ProductRepository>()("ProductRepository", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const db = yield* KyselyClient.KyselyClient<Database>
    
    return {
      // Static queries with Effect SQL
      findById: (id: number) =>
        Effect.gen(function* () {
          const [product] = yield* sql<Product>`SELECT * FROM products WHERE id = ${id}`
          return Option.fromNullable(product)
        }),
      
      // Dynamic queries with Kysely
      search: (filters: ProductFilters) =>
        Effect.gen(function* () {
          let query = db.selectFrom("products").selectAll()
          // ... apply filters
          return yield* Effect.promise(() => query.execute())
        })
    }
  })
}) {}
```

## Next Steps

- [Repository Pattern](/docs/guides/repository-pattern) - Organizing data access
- [Core Concepts](/docs/core-concepts/sql-client) - Effect SQL fundamentals
