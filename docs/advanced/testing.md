---
title: Testing
description: Strategies for testing database code with Effect SQL.
---

# Testing

Testing database code requires careful consideration of isolation, speed, and reliability. Effect SQL's design makes testing straightforward.

## Testing Strategies

### 1. In-Memory SQLite

The fastest approach—use an in-memory SQLite database:

```typescript
import { it, describe } from "@effect/vitest"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { SqlClient } from "@effect/sql"

const TestDatabase = SqliteClient.layer({
  filename: ":memory:"
})

describe("UserRepository", () => {
  it.effect("creates users", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      
      // Setup
      yield* sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`
      
      // Test
      yield* sql`INSERT INTO users ${sql.insert({ name: "Alice" })}`
      const users = yield* sql`SELECT * FROM users`
      
      expect(users).toEqual([{ id: 1, name: "Alice" }])
    }).pipe(Effect.provide(TestDatabase))
  )
})
```

Benefits:
- Very fast (no disk I/O)
- Perfect isolation (fresh database per test)
- No external dependencies

Limitations:
- SQLite syntax only
- May miss database-specific behavior

### 2. Test Containers

For testing against real databases, use test containers:

```typescript
import { GenericContainer } from "testcontainers"
import { PgClient } from "@effect/sql-pg"

const makePostgresContainer = Effect.gen(function* () {
  const container = yield* Effect.promise(() =>
    new GenericContainer("postgres:15")
      .withEnvironment({
        POSTGRES_USER: "test",
        POSTGRES_PASSWORD: "test",
        POSTGRES_DB: "test"
      })
      .withExposedPorts(5432)
      .start()
  )
  
  return PgClient.layer({
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: "test",
    username: "test",
    password: Redacted.make("test")
  })
})

describe("PostgreSQL Integration", () => {
  it.effect("works with real PostgreSQL", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const result = yield* sql`SELECT 1 + 1 as sum`
      expect(result[0].sum).toBe(2)
    }).pipe(
      Effect.provide(makePostgresContainer)
    ),
    { timeout: 60000 }
  )
})
```

Benefits:
- Tests against real database
- Catches database-specific issues
- Production-like behavior

Limitations:
- Slower (container startup)
- Requires Docker

### 3. Shared Test Database

Use a shared test database with transaction rollback:

```typescript
const TestDatabase = PgClient.layer({
  host: "localhost",
  database: "myapp_test"
})

const withTestTransaction = <A, E>(effect: Effect.Effect<A, E, SqlClient>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const result = yield* effect
        // Always rollback - test isolation
        yield* Effect.fail(new TestRollback())
        return result
      })
    )
  }).pipe(
    Effect.catchTag("TestRollback", () => Effect.succeed(undefined as any))
  )

describe("UserRepository", () => {
  it.effect("creates users", () =>
    withTestTransaction(
      Effect.gen(function* () {
        const repo = yield* UserRepository
        const user = yield* repo.create({ name: "Alice" })
        expect(user.name).toBe("Alice")
      })
    ).pipe(Effect.provide(TestDatabase))
  )
})
```

Benefits:
- Fast (no database recreation)
- Tests against real database
- Transaction rollback provides isolation

Limitations:
- Some operations can't be rolled back
- Shared state risks if rollback fails

## Testing Patterns

### Repository Testing

```typescript
// src/repositories/user.ts
export class UserRepository extends Effect.Service<UserRepository>()("UserRepository", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    return {
      create: (data: { name: string }) =>
        Effect.gen(function* () {
          const [user] = yield* sql`
            INSERT INTO users ${sql.insert(data)} RETURNING *
          `
          return user
        }),
      
      findById: (id: number) =>
        Effect.gen(function* () {
          const users = yield* sql`SELECT * FROM users WHERE id = ${id}`
          return Option.fromNullable(users[0])
        })
    }
  })
}) {}

// tests/repositories/user.test.ts
describe("UserRepository", () => {
  const TestLayer = UserRepository.Default.pipe(
    Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" }))
  )
  
  it.effect("create returns the new user", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`
      
      const repo = yield* UserRepository
      const user = yield* repo.create({ name: "Alice" })
      
      expect(user).toMatchObject({ name: "Alice" })
      expect(user.id).toBeDefined()
    }).pipe(Effect.provide(TestLayer))
  )
  
  it.effect("findById returns None for missing user", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`
      
      const repo = yield* UserRepository
      const result = yield* repo.findById(999)
      
      expect(Option.isNone(result)).toBe(true)
    }).pipe(Effect.provide(TestLayer))
  )
})
```

### Migration Testing

```typescript
describe("Migrations", () => {
  it.effect("001_create_users creates users table", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      
      // Run migration
      yield* migration001
      
      // Verify table exists
      const tables = yield* sql`
        SELECT name FROM sqlite_master WHERE type='table' AND name='users'
      `
      expect(tables).toHaveLength(1)
      
      // Verify columns
      const cols = yield* sql`PRAGMA table_info(users)`
      expect(cols.map(c => c.name)).toContain("id")
      expect(cols.map(c => c.name)).toContain("name")
    }).pipe(Effect.provide(TestDatabase))
  )
})
```

### Transaction Testing

```typescript
describe("Transactions", () => {
  it.effect("rolls back on error", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)`
      yield* sql`INSERT INTO accounts VALUES (1, 100)`
      
      // Attempt transfer that fails
      const result = yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`UPDATE accounts SET balance = balance - 50 WHERE id = 1`
          yield* Effect.fail(new Error("Simulated failure"))
        })
      ).pipe(Effect.either)
      
      expect(Either.isLeft(result)).toBe(true)
      
      // Balance should be unchanged
      const [account] = yield* sql`SELECT balance FROM accounts WHERE id = 1`
      expect(account.balance).toBe(100)
    }).pipe(Effect.provide(TestDatabase))
  )
})
```

### Data Loader Testing

```typescript
describe("UserLoader", () => {
  it.effect("batches multiple requests", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`
      yield* sql`INSERT INTO users VALUES (1, 'Alice'), (2, 'Bob'), (3, 'Charlie')`
      
      // Track queries
      const queries: string[] = []
      const trackedSql = /* wrap sql to track queries */
      
      const loader = yield* makeUserLoader
      
      // Concurrent requests should batch
      const [u1, u2, u3] = yield* Effect.all([
        loader.findById(1),
        loader.findById(2),
        loader.findById(3)
      ])
      
      expect(queries).toHaveLength(1)  // Only one batched query
      expect(u1).toMatchObject({ name: "Alice" })
    }).pipe(Effect.provide(TestLayer))
  )
})
```

## Test Fixtures

### Setup Helpers

```typescript
const setupTestData = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  yield* sql`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE
    )
  `
  
  yield* sql`
    INSERT INTO users (name, email) VALUES
      ('Alice', 'alice@example.com'),
      ('Bob', 'bob@example.com')
  `
})

describe("with test data", () => {
  it.effect("finds existing users", () =>
    Effect.gen(function* () {
      yield* setupTestData
      
      const repo = yield* UserRepository
      const user = yield* repo.findByEmail("alice@example.com")
      
      expect(Option.isSome(user)).toBe(true)
    }).pipe(Effect.provide(TestLayer))
  )
})
```

### Factory Functions

```typescript
const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  name: "Test User",
  email: "test@example.com",
  createdAt: new Date(),
  ...overrides
})

const insertUser = (user: Partial<User> = {}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [inserted] = yield* sql`
      INSERT INTO users ${sql.insert(makeUser(user))}
      RETURNING *
    `
    return inserted
  })
```

## Mocking

For unit testing without database:

```typescript
const MockSqlClient = Layer.succeed(
  SqlClient.SqlClient,
  {
    // Mock implementation
  } as SqlClient.SqlClient
)

// Or mock at repository level
const MockUserRepository = Layer.succeed(
  UserRepository,
  {
    create: () => Effect.succeed({ id: 1, name: "Mock User" }),
    findById: () => Effect.succeed(Option.some({ id: 1, name: "Mock User" }))
  }
)
```

## Best Practices

1. **Use fresh databases per test** for isolation
2. **Keep tests fast** with in-memory SQLite when possible
3. **Test against real databases** in CI for integration tests
4. **Use factories** for test data consistency
5. **Test error cases** not just happy paths
6. **Run migrations in tests** to catch migration issues early

## Next Steps

- [Migrations](/docs/advanced/migrations) - Test your migrations
- [Transactions](/docs/advanced/transactions) - Test transaction behavior
- [Error Handling](/docs/core-concepts/error-handling) - Test error scenarios
