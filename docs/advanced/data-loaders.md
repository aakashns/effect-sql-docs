---
title: Data Loaders & Batching
description: Solve the N+1 problem with Effect SQL's built-in data loaders.
---

# Data Loaders & Batching

The N+1 problem occurs when you fetch related data in a loop, resulting in many individual queries instead of batched ones. Effect SQL's `SqlResolver` provides data loaders that automatically batch queries.

## The N+1 Problem

Consider fetching users and their posts:

```typescript
// ❌ N+1 queries!
const users = yield* sql`SELECT * FROM users`

for (const user of users) {
  // Each iteration = 1 query
  const posts = yield* sql`SELECT * FROM posts WHERE user_id = ${user.id}`
  console.log(user.name, posts.length)
}
// 1 query for users + N queries for posts = N+1 queries
```

With data loaders:

```typescript
// ✅ Only 2 queries total
const users = yield* sql`SELECT * FROM users`
const userPosts = yield* Effect.forEach(users, (user) => findPostsByUser(user.id))
// 1 query for users + 1 batched query for posts = 2 queries
```

## SqlResolver Basics

`SqlResolver` creates batched resolvers using Effect's request/resolver system:

```typescript
import { SqlResolver } from "@effect/sql"
import { Schema } from "effect"

// Define a resolver for finding users by ID
const UserByIdResolver = yield* SqlResolver.findById("UserById", {
  Id: Schema.Number,
  Result: User,
  ResultId: (user) => user.id,
  execute: (ids) => sql`SELECT * FROM users WHERE ${sql.in("id", ids)}`
})

// Use it - requests are automatically batched
const [user1, user2, user3] = yield* Effect.all([
  UserByIdResolver.execute(1),
  UserByIdResolver.execute(2),
  UserByIdResolver.execute(3)
])
// Only ONE query: SELECT * FROM users WHERE id IN (1, 2, 3)
```

## Resolver Types

### `findById` - Find by Primary Key

Returns `Option<A>` for each ID:

```typescript
const UserById = yield* SqlResolver.findById("UserById", {
  Id: Schema.Number,
  Result: User,
  ResultId: (user, row) => user.id,
  execute: (ids) => sql`SELECT * FROM users WHERE ${sql.in("id", ids)}`
})

const maybeUser = yield* UserById.execute(1)  // Option<User>
```

### `ordered` - Ordered Results

Returns results in the same order as requests:

```typescript
const UserInsert = yield* SqlResolver.ordered("UserInsert", {
  Request: User.insert,
  Result: User,
  execute: (users) => sql`INSERT INTO users ${sql.insert(users)} RETURNING *`
})

const [alice, bob] = yield* Effect.all([
  UserInsert.execute({ name: "Alice" }),
  UserInsert.execute({ name: "Bob" })
])
// One INSERT with multiple rows, results matched to requests
```

### `grouped` - Grouped Results

Returns multiple results per request:

```typescript
const PostsByUserId = yield* SqlResolver.grouped("PostsByUser", {
  Request: Schema.Number,
  RequestGroupKey: (userId) => userId,
  Result: Post,
  ResultGroupKey: (post) => post.userId,
  execute: (userIds) => sql`SELECT * FROM posts WHERE ${sql.in("user_id", userIds)}`
})

const alicePosts = yield* PostsByUserId.execute(1)  // Array<Post>
```

### `void` - Side Effects

For operations without meaningful results:

```typescript
const DeleteUser = yield* SqlResolver.void("DeleteUser", {
  Request: Schema.Number,
  execute: (ids) => sql`DELETE FROM users WHERE ${sql.in("id", ids)}`
})

yield* Effect.all([
  DeleteUser.execute(1),
  DeleteUser.execute(2),
  DeleteUser.execute(3)
])
// One DELETE statement
```

## Building Data Loaders

### With Effect's Request System

SqlResolvers integrate with Effect's request caching and deduplication:

```typescript
import { Effect } from "effect"

const findUser = (id: number) =>
  Effect.gen(function* () {
    const resolver = yield* UserByIdResolver
    return yield* resolver.execute(id)
  })

// Requests are deduplicated
const program = Effect.gen(function* () {
  const [a, b, c] = yield* Effect.all([
    findUser(1),
    findUser(1),  // Same ID - deduplicated!
    findUser(2)
  ])
})
// Query: SELECT * FROM users WHERE id IN (1, 2)
// (not 1, 1, 2)
```

### With Data Loader Pattern

For more control over batching windows:

```typescript
import * as RRX from "@effect/experimental/RequestResolver"

// Create the resolver
const UserByIdResolver = yield* SqlResolver.findById("UserById", {
  Id: Schema.Number,
  Result: User,
  ResultId: (user) => user.id,
  execute: (ids) => sql`SELECT * FROM users WHERE ${sql.in("id", ids)}`
})

// Wrap with data loader for time-based batching
const userLoader = yield* RRX.dataLoader(UserByIdResolver, {
  window: Duration.millis(50),  // Wait 50ms to collect requests
  maxBatchSize: 100             // Max batch size
})

// Create an execute function
const findUser = UserByIdResolver.makeExecute(userLoader)

// Use it
const user = yield* findUser(1)
```

### Using Model.makeDataLoaders

For common CRUD operations:

```typescript
import { Model } from "@effect/sql"

const UserLoaders = yield* Model.makeDataLoaders(User, {
  tableName: "users",
  spanPrefix: "UserLoader",
  idColumn: "id",
  window: Duration.millis(50),
  maxBatchSize: 100
})

// Available methods:
yield* UserLoaders.findById(1)    // Option<User>
yield* UserLoaders.insert(user)   // User
yield* UserLoaders.insertVoid(user) // void
yield* UserLoaders.delete(1)      // void
```

## Practical Examples

### GraphQL Resolvers

```typescript
// Post type resolver
const Post = {
  author: (post: Post) =>
    Effect.gen(function* () {
      const userLoader = yield* UserByIdResolver
      return yield* userLoader.execute(post.authorId)
    })
}

// Query resolver
const resolvers = {
  Query: {
    posts: () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        return yield* sql`SELECT * FROM posts LIMIT 10`
      })
  },
  Post
}

// When resolving 10 posts:
// - 1 query for posts
// - 1 batched query for all 10 authors (not 10 separate queries!)
```

### Nested Data Loading

```typescript
const loadUserWithRelations = (userId: number) =>
  Effect.gen(function* () {
    const userResolver = yield* UserByIdResolver
    const postsByUserResolver = yield* PostsByUserId
    const commentsByPostResolver = yield* CommentsByPostId
    
    const user = yield* userResolver.execute(userId)
    if (Option.isNone(user)) return Option.none()
    
    const posts = yield* postsByUserResolver.execute(userId)
    const allComments = yield* Effect.forEach(
      posts,
      (post) => commentsByPostResolver.execute(post.id)
    )
    
    return Option.some({
      ...user.value,
      posts: posts.map((post, i) => ({
        ...post,
        comments: allComments[i]
      }))
    })
  })

// Queries:
// 1. SELECT * FROM users WHERE id = ?
// 2. SELECT * FROM posts WHERE user_id = ?
// 3. SELECT * FROM comments WHERE post_id IN (?, ?, ...)
```

### Caching

SqlResolvers support Effect's request caching:

```typescript
// Populate cache
yield* UserByIdResolver.cachePopulate(1, user)

// Invalidate cache
yield* UserByIdResolver.cacheInvalidate(1)

// Check cache before querying
const result = yield* Effect.cached(
  UserByIdResolver.execute(1),
  Duration.minutes(5)
)
```

## Batching Configuration

### Time Window

Collect requests for a time window before executing:

```typescript
const loader = yield* RRX.dataLoader(resolver, {
  window: Duration.millis(10)  // 10ms batching window
})
```

Smaller windows = lower latency, larger windows = more batching.

### Max Batch Size

Limit batch size to avoid huge queries:

```typescript
const loader = yield* RRX.dataLoader(resolver, {
  maxBatchSize: 100  // Max 100 IDs per query
})
```

### Context Propagation

For resolvers that need context (e.g., current user):

```typescript
const MyResolver = yield* SqlResolver.findById("MyResolver", {
  // ... options
  withContext: true  // Enable context propagation
})
```

## Best Practices

### 1. Create Resolvers at Layer Level

```typescript
class UserService extends Effect.Service<UserService>()("UserService", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    const byIdResolver = yield* SqlResolver.findById("UserById", {
      Id: Schema.Number,
      Result: User,
      ResultId: (user) => user.id,
      execute: (ids) => sql`SELECT * FROM users WHERE ${sql.in("id", ids)}`
    })
    
    return {
      findById: (id: number) => byIdResolver.execute(id)
    }
  })
}) {}
```

### 2. Use Meaningful Resolver Names

```typescript
// ✅ Good: Descriptive name
yield* SqlResolver.findById("User/findById", ...)
yield* SqlResolver.grouped("Post/findByAuthorId", ...)

// ❌ Bad: Generic name
yield* SqlResolver.findById("resolver1", ...)
```

### 3. Batch Compatible Operations

```typescript
// ✅ Good: Operations that batch well
execute: (ids) => sql`SELECT * FROM users WHERE ${sql.in("id", ids)}`

// ❌ Bad: Operations that don't batch
execute: (ids) => Effect.forEach(ids, (id) => sql`SELECT * FROM users WHERE id = ${id}`)
```

### 4. Consider Batch Size Limits

```typescript
// For very large batches, chunk the IDs
execute: (ids) =>
  ids.length > 1000
    ? Effect.forEach(
        chunk(ids, 1000),
        (batch) => sql`SELECT * FROM users WHERE ${sql.in("id", batch)}`
      ).pipe(Effect.map(Array.flatten))
    : sql`SELECT * FROM users WHERE ${sql.in("id", ids)}`
```

## Next Steps

- [Models](/docs/advanced/models) - Define models with built-in loaders
- [Repository Pattern](/docs/guides/repository-pattern) - Organize data access
- [Testing](/docs/advanced/testing) - Test data loaders
