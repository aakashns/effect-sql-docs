---
title: Introduction
description: Learn what Effect SQL is and why you might want to use it for database access in your Effect applications.
---

# Introduction

Effect SQL is a collection of packages that provide type-safe, composable SQL database access for Effect applications. It's designed to give you the power and flexibility of raw SQL while eliminating entire categories of bugs through TypeScript's type system.

## What is Effect SQL?

At its core, Effect SQL lets you write SQL queries using tagged template literals:

```typescript
const sql = yield* SqlClient.SqlClient

const users = yield* sql`SELECT * FROM users WHERE age > ${18}`
```

But unlike raw SQL strings, this approach gives you:

- **Automatic parameter binding** - Values like `${18}` become parameterized queries, preventing SQL injection
- **Connection management** - Connections are acquired from a pool and released automatically
- **Transaction support** - Wrap any Effect in a transaction with a single function call
- **Observability** - Every query emits telemetry spans for monitoring and debugging
- **Schema integration** - Validate and transform query results using Effect Schema

## The Package Ecosystem

Effect SQL consists of a core package and database-specific adapters:

| Package | Description |
|---------|-------------|
| `@effect/sql` | Core abstractions and utilities |
| `@effect/sql-pg` | PostgreSQL adapter (via `pg`) |
| `@effect/sql-sqlite-node` | SQLite adapter for Node.js (via `better-sqlite3`) |
| `@effect/sql-sqlite-bun` | SQLite adapter for Bun |
| `@effect/sql-sqlite-wasm` | SQLite adapter for WebAssembly |
| `@effect/sql-sqlite-react-native` | SQLite adapter for React Native |
| `@effect/sql-mysql2` | MySQL adapter (via `mysql2`) |
| `@effect/sql-mssql` | Microsoft SQL Server adapter |
| `@effect/sql-clickhouse` | ClickHouse adapter |
| `@effect/sql-d1` | Cloudflare D1 adapter |
| `@effect/sql-libsql` | LibSQL/Turso adapter |
| `@effect/sql-drizzle` | Integration with Drizzle ORM |

## Design Philosophy

Effect SQL follows several key principles:

### SQL First

Rather than hiding SQL behind an ORM abstraction, Effect SQL embraces SQL as a first-class citizen. You write real SQL queries, giving you access to the full power of your database. This means:

- Use database-specific features without workarounds
- Optimize queries using your database's query planner
- No "magic" queries that are hard to debug
- Copy queries directly to database tools for analysis

### Composability

Every piece of Effect SQL is designed to compose with other pieces. Queries return Effects, which means you can:

```typescript
// Compose queries with Effect combinators
const getUserWithPosts = (userId: number) =>
  Effect.all({
    user: getUser(userId),
    posts: getPosts(userId)
  })

// Run in parallel
const results = yield* Effect.all([query1, query2, query3], { 
  concurrency: "unbounded" 
})

// Map and transform
const names = yield* sql`SELECT name FROM users`.pipe(
  Effect.map(users => users.map(u => u.name))
)
```

### Type Safety

While Effect SQL doesn't generate types from your database schema (like Prisma does), it provides several layers of type safety:

1. **Query result types** - Specify the shape of your results with generics
2. **Schema validation** - Use Effect Schema to validate and transform results
3. **Model definitions** - Define domain models with full type inference
4. **Branded types** - Use branded types for IDs to prevent mixing up entities

### Minimal Overhead

Effect SQL adds minimal runtime overhead over raw database drivers:

- No query parsing or transformation
- No runtime schema inspection
- Thin wrapper over native database clients
- Connection pooling delegated to proven libraries

## Prerequisites

This documentation assumes you're familiar with:

- **Effect basics** - `Effect.Effect`, `Effect.gen`, `pipe`, `Layer`
- **Effect Schema** - Basic schema definitions and transformations

If you're new to Effect, we recommend starting with the [Effect documentation](https://effect.website/docs/introduction) first.

## Next Steps

Ready to get started? Head to the [Installation](/docs/getting-started/installation) guide to add Effect SQL to your project, or jump straight to the [Quick Start](/docs/getting-started/quick-start) for a hands-on example.
