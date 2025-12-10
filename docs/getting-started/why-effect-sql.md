---
title: Why Effect SQL?
description: Understanding when and why you might choose Effect SQL over other database libraries.
---

# Why Effect SQL?

There are many ways to interact with databases in TypeScript. This page explains the design philosophy behind Effect SQL and when it might be the right choice for your project.

## The Problem with ORMs

Traditional ORMs like TypeORM or Sequelize promise to abstract away SQL and let you work with objects. But this abstraction often becomes a limitation:

**1. Query Complexity**

```typescript
// ORM approach - looks simple...
const users = await User.findAll({
  include: [{ model: Post, where: { published: true } }],
  order: [['createdAt', 'DESC']],
  limit: 10
})

// But what SQL does this generate?
// Is it efficient? Does it use the right indexes?
// When things get complex, the ORM fights you
```

**2. The N+1 Problem**

```typescript
// This innocent-looking code...
const users = await User.findAll()
for (const user of users) {
  const posts = await user.getPosts() // Oops! N+1 queries
}
```

**3. Database Lock-in**

ORMs try to be database-agnostic, but this means you can't use database-specific features without escape hatches.

## Why Raw SQL is Better

SQL has been the language of databases for 50 years. It's:

- **Optimized** - Database query planners understand SQL deeply
- **Portable** - Skills transfer between databases and tools
- **Powerful** - Window functions, CTEs, recursive queries—all available
- **Debuggable** - Copy the query, run it in your database GUI

Effect SQL embraces SQL as a first-class citizen rather than trying to hide it.

## What Effect SQL Adds to Raw SQL

Writing raw SQL with `pg.query('SELECT...')` works, but you lose:

### 1. Parameter Safety

```typescript
// Raw pg - easy to make mistakes
const name = "O'Brien" // This could cause issues
client.query(`SELECT * FROM users WHERE name = '${name}'`) // SQL injection!

// Effect SQL - automatic parameterization
const users = yield* sql`SELECT * FROM users WHERE name = ${name}`
// Compiles to: SELECT * FROM users WHERE name = $1, ['O\'Brien']
```

### 2. Resource Management

```typescript
// Raw pg - manual connection handling
const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query('INSERT ...')
  await client.query('COMMIT')
} catch (e) {
  await client.query('ROLLBACK')
  throw e
} finally {
  client.release() // Easy to forget!
}

// Effect SQL - automatic resource management
yield* sql.withTransaction(
  Effect.gen(function* () {
    yield* sql`INSERT ...`
    yield* sql`UPDATE ...`
  })
)
// Connections acquired and released automatically
// Rollback on any error
```

### 3. Composability

```typescript
// Effect SQL - queries are Effects, so they compose
const getUserWithRelations = (userId: number) =>
  Effect.all({
    user: getUser(userId),
    posts: getPosts(userId),
    followers: getFollowers(userId)
  }, { concurrency: 3 })

// Retry on transient errors
const resilientQuery = myQuery.pipe(
  Effect.retry({ times: 3, delay: "1 second" })
)

// Add timeouts
const timedQuery = myQuery.pipe(
  Effect.timeout("5 seconds")
)
```

### 4. Observability

```typescript
// Effect SQL automatically creates spans for every query
// In your telemetry dashboard, you'll see:
// - Query text
// - Parameters
// - Duration
// - Connection info
// - Errors with full context
```

## Effect SQL vs Query Builders

Libraries like Knex.js or Kysely provide type-safe query builders:

```typescript
// Kysely
const users = await db
  .selectFrom('users')
  .select(['id', 'name'])
  .where('age', '>', 18)
  .execute()
```

This is great for dynamic queries, but:

- **Learning curve** - You learn the builder API instead of SQL
- **Limitations** - Complex queries may not be expressible
- **Debugging** - You need to print the generated SQL to debug

Effect SQL can actually be used *with* Kysely if you want the best of both worlds—see the [Query Builders](/docs/guides/query-builders) guide.

## Effect SQL vs Drizzle

Drizzle is the closest comparison because it also emphasizes SQL-first design. However:

**Effect SQL advantages:**
- Native Effect integration (proper error handling, resources, observability)
- Simpler setup—just write SQL
- Schema validation with Effect Schema
- Built-in data loaders for batching
- Migrations are just Effect functions

**Drizzle advantages:**
- Schema-driven type generation
- More mature relational query API
- Larger community and ecosystem

If you're already using Effect, Effect SQL is the natural choice. If you want schema-driven types and don't use Effect, Drizzle is excellent.

See the [detailed comparison](/docs/comparison/drizzle) and [migration guide](/docs/comparison/migration-from-drizzle).

## When to Use Effect SQL

Effect SQL is ideal when:

- ✅ You're building an Effect-based application
- ✅ You prefer writing SQL over using a query builder
- ✅ You want proper error handling and resource management
- ✅ You need observability (tracing, metrics) out of the box
- ✅ You want to use database-specific features freely
- ✅ You're comfortable defining TypeScript types for your queries

Effect SQL might not be the best fit when:

- ❌ You're not using Effect in your application
- ❌ You need schema-driven type generation
- ❌ You prefer a full ORM with entities and relationships
- ❌ You're working with a team unfamiliar with SQL

## The Effect Ecosystem Advantage

Effect SQL is part of the broader Effect ecosystem, which means:

```typescript
// Combine with Effect services
const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const config = yield* Config.Config
  const logger = yield* Logger.Logger
  
  yield* logger.info("Fetching users...")
  const users = yield* sql`SELECT * FROM users`
  yield* logger.info(`Found ${users.length} users`)
})

// Structured concurrency
const results = yield* Effect.forEach(
  userIds,
  (id) => findUser(id),
  { concurrency: 10 }
)

// Proper interruption
const cancelable = yield* Effect.fork(longRunningQuery)
yield* Effect.sleep("5 seconds")
yield* Fiber.interrupt(cancelable)
```

## Summary

Effect SQL sits in a sweet spot:
- **More powerful than ORMs** - You write real SQL
- **Safer than raw SQL** - Parameterization and resource management
- **More composable than query builders** - Thanks to Effect
- **Better integrated** - When you're already using Effect

Ready to dive in? Start with the [Quick Start](/docs/getting-started/quick-start) guide.
