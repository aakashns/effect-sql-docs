---
title: Repository Pattern
description: Organizing data access with the repository pattern in Effect SQL.
---

# Repository Pattern

The repository pattern abstracts data access, providing a clean interface between your domain logic and database operations.

## Why Repositories?

Repositories provide:
- **Abstraction** - Domain logic doesn't know about SQL
- **Testability** - Easy to mock for unit tests
- **Organization** - Clear location for data access code
- **Consistency** - Standard patterns across your codebase

## Basic Repository

```typescript
import { Effect, Option, Data } from "effect"
import { SqlClient, SqlSchema } from "@effect/sql"
import { Schema } from "effect"

// Domain model
class User extends Schema.Class<User>("User")({
  id: Schema.Number,
  email: Schema.String,
  name: Schema.String,
  createdAt: Schema.Date
}) {}

// Repository service
export class UserRepository extends Effect.Service<UserRepository>()("UserRepository", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    return {
      findById: (id: number) =>
        Effect.gen(function* () {
          const users = yield* sql<User>`SELECT * FROM users WHERE id = ${id}`
          return Option.fromNullable(users[0])
        }),
      
      findByEmail: (email: string) =>
        Effect.gen(function* () {
          const users = yield* sql<User>`SELECT * FROM users WHERE email = ${email}`
          return Option.fromNullable(users[0])
        }),
      
      create: (data: { email: string; name: string }) =>
        Effect.gen(function* () {
          const [user] = yield* sql<User>`
            INSERT INTO users ${sql.insert(data)} RETURNING *
          `
          return user
        }),
      
      update: (id: number, data: { name?: string; email?: string }) =>
        Effect.gen(function* () {
          const [user] = yield* sql<User>`
            UPDATE users SET ${sql.update({ id, ...data }, ["id"])}
            WHERE id = ${id}
            RETURNING *
          `
          return user
        }),
      
      delete: (id: number) =>
        Effect.gen(function* () {
          yield* sql`DELETE FROM users WHERE id = ${id}`
        })
    }
  })
}) {}
```

## Using the Repository

```typescript
const program = Effect.gen(function* () {
  const userRepo = yield* UserRepository
  
  // Create
  const user = yield* userRepo.create({
    email: "alice@example.com",
    name: "Alice"
  })
  
  // Read
  const found = yield* userRepo.findById(user.id)
  
  // Update
  const updated = yield* userRepo.update(user.id, { name: "Alice Smith" })
  
  // Delete
  yield* userRepo.delete(user.id)
})

// Provide the repository
program.pipe(
  Effect.provide(UserRepository.Default),
  Effect.provide(DatabaseLive)
)
```

## Repository with Schema Validation

Use `SqlSchema` for validated queries:

```typescript
export class UserRepository extends Effect.Service<UserRepository>()("UserRepository", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    const findById = SqlSchema.findOne({
      Request: Schema.Number,
      Result: User,
      execute: (id) => sql`SELECT * FROM users WHERE id = ${id}`
    })
    
    const findAll = SqlSchema.findAll({
      Request: Schema.Void,
      Result: User,
      execute: () => sql`SELECT * FROM users ORDER BY created_at DESC`
    })
    
    const create = SqlSchema.single({
      Request: Schema.Struct({ email: Schema.String, name: Schema.String }),
      Result: User,
      execute: (data) => sql`INSERT INTO users ${sql.insert(data)} RETURNING *`
    })
    
    return {
      findById,
      findAll: () => findAll(undefined),
      create
    }
  })
}) {}
```

## Repository with Models

Use `Model.makeRepository` for common CRUD:

```typescript
import { Model } from "@effect/sql"

class User extends Model.Class<User>("User")({
  id: Model.Generated(Schema.Number.pipe(Schema.brand("UserId"))),
  email: Schema.String,
  name: Schema.String,
  createdAt: Model.DateTimeInsertFromDate
}) {}

export class UserRepository extends Effect.Service<UserRepository>()("UserRepository", {
  effect: Effect.gen(function* () {
    const repo = yield* Model.makeRepository(User, {
      tableName: "users",
      spanPrefix: "UserRepo",
      idColumn: "id"
    })
    
    // Add custom methods
    const findByEmail = (email: string) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const users = yield* sql<User>`SELECT * FROM users WHERE email = ${email}`
        return Option.fromNullable(users[0])
      })
    
    return {
      ...repo,
      findByEmail
    }
  })
}) {}
```

## Domain Errors

Define domain-specific errors:

```typescript
import { Data } from "effect"

class UserNotFound extends Data.TaggedError("UserNotFound")<{
  userId: number
}> {}

class EmailAlreadyExists extends Data.TaggedError("EmailAlreadyExists")<{
  email: string
}> {}

export class UserRepository extends Effect.Service<UserRepository>()("UserRepository", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    return {
      findByIdOrFail: (id: number) =>
        Effect.gen(function* () {
          const users = yield* sql<User>`SELECT * FROM users WHERE id = ${id}`
          if (users.length === 0) {
            return yield* Effect.fail(new UserNotFound({ userId: id }))
          }
          return users[0]
        }),
      
      create: (data: { email: string; name: string }) =>
        Effect.gen(function* () {
          // Check for existing email
          const existing = yield* sql`SELECT 1 FROM users WHERE email = ${data.email}`
          if (existing.length > 0) {
            return yield* Effect.fail(new EmailAlreadyExists({ email: data.email }))
          }
          
          const [user] = yield* sql<User>`
            INSERT INTO users ${sql.insert(data)} RETURNING *
          `
          return user
        }).pipe(
          Effect.catchTag("SqlError", (error) => {
            // Handle unique constraint at DB level
            const cause = error.cause as any
            if (cause?.code === "23505") {
              return Effect.fail(new EmailAlreadyExists({ email: data.email }))
            }
            return Effect.fail(error)
          })
        )
    }
  })
}) {}
```

## Transaction Support

Wrap multiple repository operations in transactions:

```typescript
class OrderRepository extends Effect.Service<OrderRepository>()("OrderRepository", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    return {
      createWithItems: (order: NewOrder, items: NewOrderItem[]) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const [newOrder] = yield* sql`
              INSERT INTO orders ${sql.insert(order)} RETURNING *
            `
            
            yield* sql`
              INSERT INTO order_items ${sql.insert(
                items.map(item => ({ ...item, orderId: newOrder.id }))
              )}
            `
            
            return newOrder
          })
        )
    }
  })
}) {}
```

## Testing Repositories

```typescript
// Mock repository for tests
const mockUserRepo: typeof UserRepository.Service = {
  findById: () => Effect.succeed(Option.some(mockUser)),
  create: () => Effect.succeed(mockUser),
  // ...
}

const MockUserRepository = Layer.succeed(UserRepository, mockUserRepo)

// Test with real database
const TestLayer = UserRepository.Default.pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" }))
)

it.effect("creates users", () =>
  Effect.gen(function* () {
    yield* setupDatabase
    const repo = yield* UserRepository
    const user = yield* repo.create({ email: "test@example.com", name: "Test" })
    expect(user.email).toBe("test@example.com")
  }).pipe(Effect.provide(TestLayer))
)
```

## Composition

Compose repositories for complex operations:

```typescript
class UserService extends Effect.Service<UserService>()("UserService", {
  effect: Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const profileRepo = yield* ProfileRepository
    const sql = yield* SqlClient.SqlClient
    
    return {
      createUserWithProfile: (userData: NewUser, profileData: NewProfile) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const user = yield* userRepo.create(userData)
            const profile = yield* profileRepo.create({
              ...profileData,
              userId: user.id
            })
            return { user, profile }
          })
        )
    }
  })
}) {}
```

## Best Practices

1. **Keep repositories focused** - One aggregate root per repository
2. **Return domain types** - Not raw database rows
3. **Use domain errors** - Not generic SQL errors
4. **Encapsulate queries** - Don't expose SQL details
5. **Support transactions** - Allow composition
6. **Make it testable** - Use Effect Services for DI

## Next Steps

- [Models](/docs/advanced/models) - Type-safe domain models
- [Data Loaders](/docs/advanced/data-loaders) - Batching with repositories
- [Testing](/docs/advanced/testing) - Testing strategies
