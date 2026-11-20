# Fullstack Template

A starter project for full-stack TypeScript development: **React + Express + Prisma + PostgreSQL**, with login (JWT in an httpOnly cookie) and a small working example feature (todos) wired end to end.

## What this project is for

1. **A starting point for new projects.** Copy it, delete the `todos` example, and build your own features on a structure that already has validation, error handling, auth, tests and lint rules in place.
2. **A practice ground for hand-writing code.** Every layer has one complete, small example. Delete a file (for example `backend/src/services/todos.service.ts`) and rewrite it from memory, then check with `npm test`. The tests tell you if you got it right.

## Tech stack

| Area     | Tools                                                              |
| -------- | ------------------------------------------------------------------ |
| Monorepo | npm workspaces: `frontend/`, `backend/`, `shared/`                 |
| Language | TypeScript everywhere (`strict`)                                   |
| Frontend | React 19, Vite, React Router, TanStack Query, Tailwind CSS v4      |
| Backend  | Node.js, Express 5, Zod, Prisma 7, JWT (httpOnly cookie), bcrypt   |
| Database | PostgreSQL 17 in Docker                                            |
| Testing  | Vitest, Testing Library (frontend), Supertest (backend API tests)  |
| Quality  | ESLint (strict type-checked), Prettier, import-boundary lint rules |

## Prerequisites

- **Node.js 22.9 or newer** (`.nvmrc` pins 24: `nvm use`)
- **Docker** (runs PostgreSQL)

## Getting started

Run everything from the repository root.

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Create your env file, then set JWT_SECRET to a random value
cp backend/.env.example backend/.env
#    openssl rand -hex 32   <- paste the output as JWT_SECRET

# 3. Start PostgreSQL (waits until it is healthy)
npm run db:up

# 4. Create the tables
npm run db:migrate

# 5. (Optional) Load sample data: alice@example.com / admin@example.com, password "password123"
npm run db:seed

# 6. Start the API and the web app together
npm run dev
```

- Web app: http://localhost:5173 (Vite forwards `/api` to the backend, so there is no CORS setup to do)
- API: http://localhost:3000/api/health

Without the seed, click **Sign up** and create an account.

> **Port 5432 already in use?** The database is published on host port **5433** to avoid clashing with a local Postgres. Change `POSTGRES_PORT` and the port in `backend/.env` together if you need another one.

## Commands

| Command                             | What it does                                   |
| ----------------------------------- | ---------------------------------------------- |
| `npm run dev`                       | API + web app with hot reload                  |
| `npm test`                          | Backend API tests and frontend component tests |
| `npm run typecheck`                 | TypeScript check in every workspace            |
| `npm run lint` / `npm run format`   | ESLint / Prettier                              |
| `npm run build`                     | Production build of the frontend               |
| `npm run db:up` / `npm run db:down` | Start / stop PostgreSQL                        |
| `npm run db:migrate`                | Apply schema changes (`prisma migrate dev`)    |
| `npm run db:seed`                   | Reset and load sample data                     |

Backend tests use a separate database (`app_test`, created automatically the first time the Docker volume is created) and apply migrations themselves. They never touch your development data.

## Folder structure

```
.
├── backend/
│   ├── prisma/              schema.prisma, migrations/, seed.ts
│   ├── src/
│   │   ├── config/          env.ts: the only place that reads process.env
│   │   ├── routes/          URL + middleware -> controller (no logic)
│   │   ├── controllers/     HTTP in/out: read validated input, call a service, respond
│   │   ├── services/        business rules + Prisma queries (no req/res)
│   │   ├── middleware/      auth, requireRole, validate (Zod), errorHandler, rateLimits
│   │   ├── errors/          AppError (expected failures)
│   │   ├── jobs/            recurring background tasks
│   │   ├── lib/             prisma client, jwt, password hashing, logger
│   │   ├── types/           Express type augmentation (req.user)
│   │   ├── app.ts           builds the Express app (no listen: easy to test)
│   │   └── server.ts        starts the server
│   └── tests/               *.api.test.ts (Supertest against the test DB)
├── frontend/
│   └── src/
│       ├── app/             router, providers, layout, pages: composes features
│       ├── features/        one folder per feature: api/, components/, (hooks/, types/)
│       │   ├── auth/
│       │   └── todos/
│       ├── components/ui/   shared, generic UI (button, form-field, spinner)
│       ├── lib/             api-client, query-client
│       ├── config/          app-wide constants
│       ├── hooks/ utils/ assets/   shared, empty until needed
│       ├── styles/          Tailwind + design tokens
│       └── testing/         test setup and helpers
├── shared/src/              Zod schemas + types used by BOTH sides (the API contract)
├── docs/ARCHITECTURE.md     why it is organized this way, with sources
├── docker-compose.yml       PostgreSQL
└── CLAUDE.md                instructions for Claude Code
```

A request flows `route -> middleware (validate / auth) -> controller -> service -> Prisma`. More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## API overview

All responses are `{ "data": ... }` on success or `{ "error": { "code", "message", "details?" } }` on failure.

| Method & path                 | Auth | Description                        |
| ----------------------------- | ---- | ---------------------------------- |
| `GET /api/health`             | no   | Liveness check                     |
| `POST /api/auth/signup`       | no   | Create account (sets login cookie) |
| `POST /api/auth/login`        | no   | Log in (sets login cookie)         |
| `POST /api/auth/logout`       | no   | Clear the cookie                   |
| `GET /api/auth/me`            | yes  | Current user                       |
| `GET/POST /api/todos`         | yes  | List / create your todos           |
| `PATCH/DELETE /api/todos/:id` | yes  | Update / delete your todo          |

## Adding your own feature (example: "notes")

1. **`shared/src/note.ts`**: Zod schemas and the `Note` type; export from `shared/src/index.ts`.
2. **`backend/prisma/schema.prisma`**: add the model, then `npm run db:migrate`.
3. **Backend**: `services/notes.service.ts`, `controllers/notes.controller.ts`, `routes/notes.routes.ts`; register the router in `routes/index.ts`.
4. **`backend/tests/notes.api.test.ts`**: write the test first if you want to practice.
5. **Frontend**: `features/notes/{api,components}`, a page in `app/routes/`, and one line in `app/router.tsx`.

## Known gaps (left for you to decide)

- **No production build for the backend.** It runs with `tsx`. Add a bundler or compile step and a Dockerfile when you deploy.
- **No end-to-end (Playwright) tests** and no CI workflow yet.
- **No email verification or password reset.**
- `npm audit` reports advisories in transitive dev tooling; review before shipping.

## References

The structure follows these sources rather than any single codebase:

- [Bulletproof React: project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md): feature folders, unidirectional imports, no barrel files
- [TkDodo: Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys): query key factories colocated with their feature
- [Bulletproof Node.js project architecture](https://dev.to/santypk4/bulletproof-node-js-project-architecture-4epf): controller / service layers, config module, keeping logic out of controllers
