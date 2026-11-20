# Architecture

Why the project is organized the way it is. Each decision cites the source it comes from.

## Monorepo with a `shared/` package

`frontend/` and `backend/` both import `@template/shared`, which holds the Zod schemas and types of the API. One definition validates requests on the server and forms in the browser, so the two sides can't drift apart.

## Frontend

Source: [Bulletproof React: project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md).

```
src/
├── app/         routes, providers, layout (the application layer)
├── features/    one folder per feature; most code lives here
├── components/  shared UI
├── hooks/ lib/ utils/ config/ styles/ testing/ assets/
```

- **Features over file types.** Everything for "todos" (API calls, hooks, components) sits together in `features/todos/`, so a feature can be understood, changed or deleted in one place. A flat `components/` + `hooks/` + `api/` layout turns into a maze as the app grows.
- **One-way imports: shared -> features -> app.** Shared code can't import features; features can't import the app. `app/` is where features are composed into pages.
- **Features don't import each other.** Cross-feature imports create hidden coupling. If two features need the same thing, either compose them in `app/` or promote the code to a shared folder. Enforced by `no-restricted-imports` in `eslint.config.js`.
- **No barrel files.** The source notes that re-export `index.ts` files can hurt Vite's tree-shaking and make code harder to trace. Import from the file.
- **Only create the subfolders a feature needs.** `hooks/`, `types/` etc. are added when there is something to put in them.

### Data fetching

Source: [TkDodo, Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys).

- Query keys are built by a **key factory next to the queries that use them** (`features/todos/api/todo-queries.ts`), not in a global `queryKeys.ts`. Keys go from generic to specific so you can invalidate any level (`all` -> `lists()`).
- `queryOptions()` bundles key + fetcher so it can be reused by hooks, prefetching and route loaders.
- Plain request functions (`todos.api.ts`) are separate from hooks (`todo-queries.ts`), so the former are testable without React.
- Server state stays in TanStack Query. There is no global store because nothing needs one yet; add `stores/` only when client-only state is shared across components.

## Backend

Source: [Bulletproof Node.js project architecture](https://dev.to/santypk4/bulletproof-node-js-project-architecture-4epf) (3-layer architecture), plus common Express layering guidance.

```
routes -> middleware -> controllers -> services -> Prisma
```

| Layer       | Responsibility                                             | Must not                            |
| ----------- | ---------------------------------------------------------- | ----------------------------------- |
| routes      | Map URL + method to middleware and a controller            | Contain logic                       |
| middleware  | Cross-cutting: validation, authentication, rate limits     | Know about specific features        |
| controllers | Read validated input, call a service, shape the HTTP reply | Query the DB or hold business rules |
| services    | Business rules and data access                             | Touch `req`, `res`, status codes    |

Why: services that don't know about HTTP can be reused by jobs, scripts and tests, and controller tests don't need to mock `req`/`res`.

Other decisions:

- **`app.ts` vs `server.ts`.** `createApp()` builds the app without listening, so Supertest can call it directly. `server.ts` only starts it.
- **One validated `env`.** `config/env.ts` parses `process.env` with Zod at startup; a bad config fails immediately with a readable message.
- **One error path.** Services throw `AppError(code, message)`. The error handler turns it into `{ error: { code, message, details? } }`. Unknown errors are logged and returned as a generic 500, so internals never leak.
- **Express 5** passes rejected promises from async handlers to the error handler, so controllers need no `try/catch`.

## Authentication

- Passwords are hashed with bcrypt (12 rounds); inputs over 72 bytes are rejected because bcrypt ignores the rest.
- The JWT is in an **httpOnly, SameSite=Lax cookie** (`Secure` in production), so scripts can't read it and cross-site POSTs don't carry it. The algorithm is pinned to HS256 when verifying.
- Login returns the same error for "unknown email" and "wrong password" and compares against a dummy hash for unknown emails, so neither the message nor the timing reveals which emails exist.
- Signup relies on the database's unique constraint rather than "check, then insert", which avoids a race condition.
- Login and signup are rate limited per IP.
- User-owned data is always queried with `userId`; someone else's record behaves like a missing one (404).
- Roles: `requireRole("ADMIN")` after `requireAuth` protects admin-only routes.

## Testing

- Backend: Supertest against the real app and a real, separate Postgres database. Prisma isn't mocked, so queries, constraints and migrations are tested for real.
- Frontend: Testing Library with `fetch` replaced by a per-test mock; the whole app (router included) is rendered, so tests exercise routing and data fetching as a user would.
