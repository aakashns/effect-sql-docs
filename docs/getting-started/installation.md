---
title: Installation
description: How to install Effect SQL and database-specific adapters for your project.
---

# Installation

Effect SQL is distributed as multiple npm packages. You'll need the core package plus an adapter for your specific database.

## Core Package

The core package contains shared abstractions used by all database adapters:

::: code-group

```bash [npm]
npm install @effect/sql
```

```bash [pnpm]
pnpm add @effect/sql
```

```bash [yarn]
yarn add @effect/sql
```

```bash [bun]
bun add @effect/sql
```

:::

## Database Adapters

Choose the adapter for your database:

### PostgreSQL

```bash
npm install @effect/sql-pg
```

This package uses [pg](https://node-postgres.com/) under the hood, which will be installed automatically as a peer dependency.

### SQLite

Choose based on your runtime:

::: code-group

```bash [Node.js]
npm install @effect/sql-sqlite-node
```

```bash [Bun]
npm install @effect/sql-sqlite-bun
```

```bash [React Native]
npm install @effect/sql-sqlite-react-native
```

```bash [WebAssembly]
npm install @effect/sql-sqlite-wasm
```

:::

The Node.js adapter uses [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), which requires native compilation. If you encounter issues, ensure you have the required build tools installed for your platform.

### MySQL

```bash
npm install @effect/sql-mysql2
```

This package uses [mysql2](https://sidorares.github.io/node-mysql2/docs) under the hood.

### Microsoft SQL Server

```bash
npm install @effect/sql-mssql
```

### ClickHouse

```bash
npm install @effect/sql-clickhouse
```

### Cloudflare D1

```bash
npm install @effect/sql-d1
```

### LibSQL / Turso

```bash
npm install @effect/sql-libsql
```

## Peer Dependencies

All packages require `effect` as a peer dependency. Make sure you have it installed:

```bash
npm install effect
```

Some adapters also require `@effect/platform` for file system operations (used by the migration system):

```bash
npm install @effect/platform @effect/platform-node
```

## TypeScript Configuration

Effect SQL requires TypeScript 5.0 or later. Ensure your `tsconfig.json` has the following settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "moduleResolution": "bundler", // or "node16" / "nodenext"
    "module": "ESNext",
    "target": "ES2022"
  }
}
```

## Verifying Installation

Create a simple test file to verify everything is working:

```typescript
import { Effect } from "effect"
import { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-node"

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const result = yield* sql`SELECT 1 + 1 as sum`
  console.log("Result:", result)
})

const SqlLive = SqliteClient.layer({
  filename: ":memory:"
})

Effect.runPromise(program.pipe(Effect.provide(SqlLive)))
```

Run this with:

```bash
npx tsx test.ts
```

If you see `Result: [ { sum: 2 } ]`, you're all set!

## Next Steps

Now that you have Effect SQL installed, head to the [Quick Start](/docs/getting-started/quick-start) guide to learn the basics.
