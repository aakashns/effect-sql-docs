---
title: Building a REST API
description: Build a complete REST API with Effect SQL and Effect HTTP.
---

# Building a REST API

This guide walks through building a REST API with Effect SQL, demonstrating patterns for real-world applications.

## Project Setup

```bash
mkdir todo-api && cd todo-api
npm init -y
npm install effect @effect/sql @effect/sql-sqlite-node @effect/platform @effect/platform-node
npm install -D typescript tsx
```

## Database Layer

```typescript
// src/db.ts
import { SqliteClient } from "@effect/sql-sqlite-node"
import { SqliteMigrator } from "@effect/sql-sqlite-node"
import { Migrator } from "@effect/sql"
import { Layer } from "effect"

export const DatabaseLive = SqliteClient.layer({
  filename: "./data.db"
})

export const MigratorLive = SqliteMigrator.layer({
  loader: Migrator.fromGlob(import.meta.glob("./migrations/*.ts"))
})
```

## Models

```typescript
// src/models/todo.ts
import { Schema } from "effect"
import { Model } from "@effect/sql"

export const TodoId = Schema.Number.pipe(Schema.brand("TodoId"))
export type TodoId = Schema.Schema.Type<typeof TodoId>

export class Todo extends Model.Class<Todo>("Todo")({
  id: Model.Generated(TodoId),
  title: Schema.NonEmptyString,
  completed: Schema.Boolean.pipe(Schema.propertySignature, Schema.withConstructorDefault(() => false)),
  createdAt: Model.DateTimeInsertFromDate
}) {}

// Request/Response schemas for the API
export const CreateTodoRequest = Schema.Struct({
  title: Schema.NonEmptyString
})

export const UpdateTodoRequest = Schema.Struct({
  title: Schema.optional(Schema.NonEmptyString),
  completed: Schema.optional(Schema.Boolean)
})
```

## Repository

```typescript
// src/repositories/todo.ts
import { Effect, Option } from "effect"
import { SqlClient, SqlSchema } from "@effect/sql"
import { Todo, TodoId, CreateTodoRequest, UpdateTodoRequest } from "../models/todo.js"

export class TodoRepository extends Effect.Service<TodoRepository>()("TodoRepository", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    const findAll = SqlSchema.findAll({
      Request: Schema.Void,
      Result: Todo,
      execute: () => sql`SELECT * FROM todos ORDER BY created_at DESC`
    })
    
    const findById = SqlSchema.findOne({
      Request: TodoId,
      Result: Todo,
      execute: (id) => sql`SELECT * FROM todos WHERE id = ${id}`
    })
    
    const create = SqlSchema.single({
      Request: Todo.insert,
      Result: Todo,
      execute: (todo) => sql`INSERT INTO todos ${sql.insert(todo)} RETURNING *`
    })
    
    const update = (id: TodoId, data: typeof UpdateTodoRequest.Type) =>
      Effect.gen(function* () {
        const existing = yield* findById(id)
        if (Option.isNone(existing)) {
          return Option.none<Todo>()
        }
        
        const updates: Record<string, unknown> = { id }
        if (data.title !== undefined) updates.title = data.title
        if (data.completed !== undefined) updates.completed = data.completed
        
        const [updated] = yield* sql`
          UPDATE todos 
          SET ${sql.update(updates, ["id"])}
          WHERE id = ${id}
          RETURNING *
        `
        return Option.some(updated as Todo)
      })
    
    const remove = (id: TodoId) =>
      Effect.gen(function* () {
        const result = yield* sql`DELETE FROM todos WHERE id = ${id}`
        return result.length > 0
      })
    
    return {
      findAll: () => findAll(undefined),
      findById,
      create,
      update,
      remove
    }
  })
}) {}
```

## HTTP Handlers

```typescript
// src/handlers/todos.ts
import { Effect, Schema } from "effect"
import { HttpRouter, HttpServerResponse, HttpServerRequest } from "@effect/platform"
import { TodoRepository, Todo, TodoId, CreateTodoRequest, UpdateTodoRequest } from "../repositories/todo.js"

// List all todos
const listTodos = Effect.gen(function* () {
  const repo = yield* TodoRepository
  const todos = yield* repo.findAll()
  return HttpServerResponse.json(todos)
})

// Get single todo
const getTodo = (id: number) =>
  Effect.gen(function* () {
    const repo = yield* TodoRepository
    const todo = yield* repo.findById(id as TodoId)
    
    return Option.match(todo, {
      onNone: () => HttpServerResponse.json({ error: "Not found" }, { status: 404 }),
      onSome: (todo) => HttpServerResponse.json(todo)
    })
  })

// Create todo
const createTodo = Effect.gen(function* () {
  const repo = yield* TodoRepository
  const request = yield* HttpServerRequest.HttpServerRequest
  const body = yield* request.json
  const data = yield* Schema.decodeUnknown(CreateTodoRequest)(body)
  
  const todo = yield* repo.create({ title: data.title })
  return HttpServerResponse.json(todo, { status: 201 })
})

// Update todo
const updateTodo = (id: number) =>
  Effect.gen(function* () {
    const repo = yield* TodoRepository
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = yield* request.json
    const data = yield* Schema.decodeUnknown(UpdateTodoRequest)(body)
    
    const result = yield* repo.update(id as TodoId, data)
    
    return Option.match(result, {
      onNone: () => HttpServerResponse.json({ error: "Not found" }, { status: 404 }),
      onSome: (todo) => HttpServerResponse.json(todo)
    })
  })

// Delete todo
const deleteTodo = (id: number) =>
  Effect.gen(function* () {
    const repo = yield* TodoRepository
    yield* repo.remove(id as TodoId)
    return HttpServerResponse.empty({ status: 204 })
  })

// Router
export const TodoRoutes = HttpRouter.empty.pipe(
  HttpRouter.get("/todos", listTodos),
  HttpRouter.get("/todos/:id", (req) => getTodo(Number(req.params.id))),
  HttpRouter.post("/todos", createTodo),
  HttpRouter.patch("/todos/:id", (req) => updateTodo(Number(req.params.id))),
  HttpRouter.delete("/todos/:id", (req) => deleteTodo(Number(req.params.id)))
)
```

## Server

```typescript
// src/server.ts
import { Effect, Layer } from "effect"
import { HttpServer, HttpMiddleware, HttpRouter } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Migrator } from "@effect/sql"
import { TodoRoutes } from "./handlers/todos.js"
import { TodoRepository } from "./repositories/todo.js"
import { DatabaseLive, MigratorLive } from "./db.js"

const app = TodoRoutes.pipe(
  HttpRouter.use(HttpMiddleware.logger),
  HttpServer.serve(HttpMiddleware.xForwardedHeaders)
)

const ServerLive = NodeHttpServer.layer(() => ({ port: 3000 }), { listen: true })

const program = Effect.gen(function* () {
  yield* Migrator.Migrator
  yield* Effect.log("Migrations complete")
  yield* Effect.log("Server listening on http://localhost:3000")
  yield* Effect.never  // Keep server running
})

const MainLive = Layer.mergeAll(
  ServerLive,
  TodoRepository.Default,
  MigratorLive
).pipe(
  Layer.provideMerge(DatabaseLive)
)

NodeRuntime.runMain(program.pipe(Effect.provide(MainLive)))
```

## Migration

```typescript
// src/migrations/001_create_todos.ts
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  yield* sql`
    CREATE TABLE todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `
})
```

## Error Handling

Add proper error handling:

```typescript
// src/handlers/todos.ts
import { HttpServerResponse } from "@effect/platform"
import { SqlError } from "@effect/sql"
import { ParseResult } from "effect"

const withErrorHandling = <A, E, R>(handler: Effect.Effect<A, E, R>) =>
  handler.pipe(
    Effect.catchTags({
      SqlError: (error) =>
        HttpServerResponse.json(
          { error: "Database error", message: error.message },
          { status: 500 }
        ),
      ParseError: (error) =>
        HttpServerResponse.json(
          { error: "Validation error", message: ParseResult.TreeFormatter.formatError(error) },
          { status: 400 }
        )
    }),
    Effect.catchAll((error) =>
      HttpServerResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    )
  )
```

## Testing

```typescript
// tests/todos.test.ts
import { it, describe, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { TodoRepository } from "../src/repositories/todo.js"
import migration001 from "../src/migrations/001_create_todos.js"

const TestLayer = TodoRepository.Default.pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" }))
)

describe("TodoRepository", () => {
  it.effect("creates and retrieves todos", () =>
    Effect.gen(function* () {
      yield* migration001
      
      const repo = yield* TodoRepository
      const todo = yield* repo.create({ title: "Test todo" })
      
      expect(todo.title).toBe("Test todo")
      expect(todo.completed).toBe(false)
      
      const found = yield* repo.findById(todo.id)
      expect(Option.isSome(found)).toBe(true)
    }).pipe(Effect.provide(TestLayer))
  )
})
```

## Next Steps

- [Repository Pattern](/docs/guides/repository-pattern) - More repository patterns
- [Connection Pooling](/docs/guides/connection-pooling) - Production configuration
- [Migrations](/docs/advanced/migrations) - Schema management
