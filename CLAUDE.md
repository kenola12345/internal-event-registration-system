# CLAUDE.md

## Project

A full-stack TypeScript **template** (and hand-coding practice ground): React + Express + Prisma + PostgreSQL, with JWT cookie auth and a `todos` example feature. See `README.md` for setup and `docs/ARCHITECTURE.md` for the reasoning behind the layout.

When the user is **practicing by hand-writing code**, don't write the solution for them unless asked. Point to the equivalent example file, explain, or review what they wrote.

## Stack

- npm workspaces monorepo: `frontend/`, `backend/`, `shared/` (Zod schemas + types used by both)
- TypeScript everywhere, `strict`, no `any`
- Frontend: React 19, Vite, React Router, TanStack Query, Tailwind CSS v4
- Backend: Node (ESM), Express 5, Zod, Prisma 7 (driver adapter `@prisma/adapter-pg`), PostgreSQL 17 (Docker), JWT in httpOnly cookie, bcrypt
- IDs are `cuid` strings

## Commands (run from the repo root)

```bash
npm install
cp backend/.env.example backend/.env   # first time; set JWT_SECRET (32+ chars)
npm run db:up                          # PostgreSQL on host port 5433
npm run db:migrate                     # prisma migrate dev
npm run db:seed                        # alice@example.com / admin@example.com, password123
npm run dev                            # API :3000 + web :5173 (Vite proxies /api)
npm test                               # backend (Supertest, DB app_test) + frontend (Vitest)
npm run typecheck && npm run lint
npm run format
```

## Architecture rules

**Backend request flow:** `routes/` -> middleware (`validate`, `requireAuth`) -> `controllers/` -> `services/` -> Prisma.

- `routes/`: URL + middleware only. Register new routers in `routes/index.ts`.
- `controllers/`: HTTP only. Read input via `getValidated(req, part, schema)`, call a service, send `{ data }`. No Prisma, no business rules.
- `services/`: business rules and Prisma queries. Never touch `req`/`res`. Throw `AppError` for expected failures.
- Read env only through `config/env.ts`. Never `process.env` elsewhere.
- Express 5 forwards rejected promises to the error handler: no try/catch in controllers.
- Validate **all** input with Zod (`validate({ params, query, body })`). Schemas live in `shared/`.
- Responses: `{ data }` on success, `{ error: { code, message, details? } }` on failure. Error codes and statuses are defined once in `shared/src/api.ts`.
- Every query on user-owned data is scoped by `userId`. Other users' records answer 404, not 403.
- Users leave the backend only through `toUser()` so `passwordHash` can never leak.
- Never log passwords, tokens, cookies or request bodies.

**Frontend (flow is one-way: shared -> features -> app):**

- `app/`: router, providers, layout, pages. Composes features. The only place allowed to import `@/features/*`.
- `features/<name>/`: `api/` (request functions + TanStack Query hooks + key factory), `components/`, optionally `hooks/`, `types/`. **Never import another feature or `app/`** (ESLint enforces it). Use relative imports inside a feature.
- Shared code (`components/`, `hooks/`, `lib/`, `utils/`, `config/`) must not import features or `app/`. Promote code to shared only once a second feature needs it.
- No barrel (`index.ts`) files; import from the file directly.
- Query keys: one factory per feature, in that feature's `api/`. No global `queryKeys.ts`.
- Server state lives in TanStack Query. Don't copy it into `useState` or a global store.
- Tailwind with tokens defined in `styles/index.css` (`@theme`). No hard-coded colors in JSX.
- Files are kebab-case; components are PascalCase exports.
- Every list/data component handles loading, error and empty states.
- Forms reuse the shared Zod schema for client validation, and map server `details` onto fields.

## Conventions

- Add a feature: shared schema -> Prisma model + migration -> service -> controller -> route -> API test -> frontend feature -> page + route line. The README has the checklist.
- Tests: backend in `backend/tests/*.api.test.ts` (real test DB, no mocking Prisma); frontend next to the component as `*.test.tsx` using `renderApp()` from `src/testing/render-app.tsx`.
- Import order is enforced by `simple-import-sort`; `npm run lint -- --fix` fixes it.
- Comments explain WHY (a business rule, a security reason), not what the code does.
- Never commit `.env` files or secrets. `.env.example` and `.env.test` (no secrets) are committed.
- Schema change = new migration (`npm run db:migrate`). Never edit an applied migration.

## Gotchas

- Prisma 7 does not read `.env` by itself: `prisma.config.ts` loads it. The datasource URL is not in `schema.prisma`.
- Backend tests load `backend/.env.test` and run `prisma migrate deploy` in `tests/global-setup.ts`.
- The `app_test` database is created by `docker/postgres-init/` only when the Docker volume is first created. If it's missing, run `docker compose down -v && npm run db:up` (this wipes dev data).
- TypeScript 6: don't set `baseUrl`; the `@/*` alias uses `paths` only. Use `SubmitEvent` imported from `react` for form handlers.
