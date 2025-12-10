---
layout: home
title: Effect SQL
titleTemplate: Type-safe, composable SQL for Effect

hero:
  name: Effect SQL
  text: Type-safe, composable SQL for Effect
  tagline: Write SQL queries that are safe, efficient, and integrate seamlessly with the Effect ecosystem
  actions:
    - theme: brand
      text: Get Started
      link: /docs/getting-started/introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/Effect-TS/effect/tree/main/packages/sql

features:
  - icon: 🔒
    title: Type-Safe by Design
    details: Write SQL with full TypeScript type safety. Catch errors at compile time, not runtime. Integrate with Effect Schema for validated, decoded results.
  
  - icon: ⚡
    title: Zero Boilerplate
    details: Use tagged template literals to write SQL naturally. Automatic parameter binding, query escaping, and result transformation—no ORM overhead.
  
  - icon: 🔄
    title: First-Class Transactions
    details: Transactions are composable and automatic. Nest transactions with savepoints, handle rollbacks gracefully, and never worry about connection leaks.
  
  - icon: 🗄️
    title: Multi-Database Support
    details: PostgreSQL, SQLite, MySQL, SQL Server, ClickHouse, Cloudflare D1, LibSQL—all with the same elegant API. Switch databases without rewriting code.
  
  - icon: 📦
    title: Built-in Migrations
    details: Version your database schema with Effect-native migrations. Run them as part of your application startup or as a separate process.
  
  - icon: 🚀
    title: Batching & Data Loaders
    details: Solve the N+1 problem elegantly with built-in request batching. Perfect for GraphQL resolvers and any scenario with repeated queries.
---

## Quick Example

```typescript
import { Effect } from "effect"
import { SqlClient } from "@effect/sql"
import { PgClient } from "@effect/sql-pg"

// Create a query - it's just a tagged template literal
const findUserById = (id: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    const users = yield* sql<{ id: number; name: string; email: string }>`
      SELECT id, name, email 
      FROM users 
      WHERE id = ${id}
    `
    
    return users[0]
  })

// Run with proper resource management
const program = findUserById(1).pipe(
  Effect.provide(PgClient.layer({
    host: "localhost",
    database: "myapp"
  }))
)

Effect.runPromise(program)
```

## Why Effect SQL?

Effect SQL is designed from the ground up to work with the Effect ecosystem. This means:

- **Automatic resource management** - Connections are acquired and released automatically
- **Structured error handling** - SQL errors are properly typed and handled
- **Observability built-in** - Queries emit spans for tracing automatically
- **Composable** - Build complex queries from simple, reusable pieces

<div class="tip custom-block" style="padding-top: 8px">
Ready to dive in? Start with the <a href="/docs/getting-started/introduction">Introduction</a> to learn the fundamentals.
</div>
