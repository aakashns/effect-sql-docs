---
title: Effect SQL vs Drizzle
description: A detailed comparison between Effect SQL and Drizzle ORM.
---

# Effect SQL vs Drizzle

Both Effect SQL and Drizzle are modern, type-safe approaches to database access in TypeScript. This page provides an honest comparison to help you choose the right tool.

## Philosophy

### Effect SQL

Effect SQL is **SQL-first**. You write actual SQL queries using tagged template literals. The library handles:
- Parameter binding and SQL injection prevention
- Connection management and pooling
- Transaction handling
- Observability (tracing, spans)
- Integration with Effect's error handling and resource management

```typescript
const users = yield* sql`
  SELECT u.*, COUNT(p.id) as post_count
  FROM users u
  LEFT JOIN posts p ON u.id = p.author_id
  WHERE u.created_at > ${lastWeek}
  GROUP BY u.id
  HAVING COUNT(p.id) > ${5}
  ORDER BY post_count DESC
`
```

### Drizzle

Drizzle is **schema-first**. You define your database schema in TypeScript, and Drizzle generates types and provides a query builder:

```typescript
const users = await db
  .select({
    ...usersTable,
    postCount: count(postsTable.id)
  })
  .from(usersTable)
  .leftJoin(postsTable, eq(usersTable.id, postsTable.authorId))
  .where(gt(usersTable.createdAt, lastWeek))
  .groupBy(usersTable.id)
  .having(gt(count(postsTable.id), 5))
  .orderBy(desc(count(postsTable.id)))
```

## Feature Comparison

| Feature | Effect SQL | Drizzle |
|---------|------------|---------|
| Query style | Raw SQL with tagged templates | Query builder + SQL-like API |
| Type safety | Manual type annotations | Generated from schema |
| Schema definition | Manual SQL migrations | TypeScript schema |
| Migrations | Effect-native, code-based | Drizzle Kit (CLI) |
| Transaction handling | Effect-based, automatic rollback | Manual or callback-based |
| Error handling | Effect error channel | Promise rejection |
| Observability | Built-in spans/tracing | External integration |
| Resource management | Automatic via Effect | Manual |
| Connection pooling | Adapter-specific | Adapter-specific |
| Batching/DataLoaders | Built-in SqlResolver | Not built-in |
| Learning curve | Know SQL + Effect | Learn Drizzle API |

## Code Comparison

### Simple Query

**Effect SQL:**
```typescript
const user = yield* sql<User>`SELECT * FROM users WHERE id = ${id}`
```

**Drizzle:**
```typescript
const user = await db.select().from(users).where(eq(users.id, id))
```

### Insert with Return

**Effect SQL:**
```typescript
const [newUser] = yield* sql<User>`
  INSERT INTO users ${sql.insert({ name, email })}
  RETURNING *
`
```

**Drizzle:**
```typescript
const [newUser] = await db.insert(users).values({ name, email }).returning()
```

### Transaction

**Effect SQL:**
```typescript
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${from}`
    yield* sql`UPDATE accounts SET balance = balance + ${amount} WHERE id = ${to}`
  })
)
// Automatic rollback on any error
```

**Drizzle:**
```typescript
await db.transaction(async (tx) => {
  await tx.update(accounts).set({ balance: sql`balance - ${amount}` }).where(eq(accounts.id, from))
  await tx.update(accounts).set({ balance: sql`balance + ${amount}` }).where(eq(accounts.id, to))
})
// Manual error handling
```

### Complex Query

**Effect SQL:**
```typescript
const results = yield* sql`
  WITH active_users AS (
    SELECT * FROM users WHERE last_login > ${thirtyDaysAgo}
  ),
  user_stats AS (
    SELECT 
      user_id,
      COUNT(*) as order_count,
      SUM(total) as total_spent
    FROM orders
    WHERE created_at > ${startDate}
    GROUP BY user_id
  )
  SELECT 
    u.*,
    COALESCE(s.order_count, 0) as orders,
    COALESCE(s.total_spent, 0) as spent
  FROM active_users u
  LEFT JOIN user_stats s ON u.id = s.user_id
  ORDER BY s.total_spent DESC NULLS LAST
`
```

**Drizzle:**
```typescript
// CTEs are more verbose in Drizzle
const activeUsers = db.$with('active_users').as(
  db.select().from(users).where(gt(users.lastLogin, thirtyDaysAgo))
)
// ... more complex setup required
```

## When to Choose Effect SQL

Choose Effect SQL if you:

- ✅ Are building an Effect-based application
- ✅ Prefer writing raw SQL
- ✅ Need built-in observability (tracing, spans)
- ✅ Want automatic resource management
- ✅ Need proper error handling with typed errors
- ✅ Use complex SQL features (CTEs, window functions, recursive queries)
- ✅ Want built-in data loaders / request batching
- ✅ Prefer code-based migrations

## When to Choose Drizzle

Choose Drizzle if you:

- ✅ Want type generation from schema definition
- ✅ Prefer a query builder API over raw SQL
- ✅ Are not using Effect in your application
- ✅ Want relational queries with automatic joins
- ✅ Prefer CLI-based migrations
- ✅ Need a larger community and ecosystem

## Why Not Both?

Effect SQL includes `@effect/sql-drizzle`, which lets you use Drizzle's query builder while getting Effect's benefits:

```typescript
import * as Drizzle from "@effect/sql-drizzle/Pg"

const program = Effect.gen(function* () {
  const db = yield* Drizzle.PgDrizzle
  
  // Use Drizzle's query builder
  const users = yield* db.select().from(usersTable).where(eq(usersTable.active, true))
  
  // Drizzle queries return Effects!
  // You get Effect's error handling, observability, etc.
})
```

This gives you:
- Drizzle's type-safe query builder
- Effect's error handling
- Effect's resource management
- Effect's tracing/observability

See [Using Drizzle with Effect](/docs/comparison/drizzle-integration) for details.

## Performance

Both libraries add minimal overhead over raw SQL:

- **Effect SQL**: Direct query execution with parameter binding
- **Drizzle**: Query builder compiles to SQL, then executes

For most applications, the difference is negligible. Choose based on developer experience and features, not performance.

## Migration Path

If you're currently using Drizzle and want to adopt Effect:

1. **Start with the integration**: Use `@effect/sql-drizzle` to get Effect benefits immediately
2. **Migrate gradually**: Convert queries to Effect SQL as you touch them
3. **Full migration**: Eventually drop Drizzle if you prefer raw SQL

See [Migration from Drizzle](/docs/comparison/migration-from-drizzle) for a detailed guide.

## Summary

| Aspect | Effect SQL | Drizzle |
|--------|------------|---------|
| Best for | Effect users who know SQL | Anyone who prefers query builders |
| Learning | SQL + Effect basics | Drizzle API |
| Type safety | Manual annotations | Schema-generated |
| Flexibility | Full SQL power | Some limitations |
| Effect integration | Native | Via adapter |
| Community | Growing | Larger |

Both are excellent choices. If you're using Effect, Effect SQL (possibly with Drizzle integration) is the natural choice. If you're not using Effect and prefer a query builder, Drizzle is excellent.
