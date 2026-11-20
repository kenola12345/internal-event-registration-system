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

## Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

// Prisma 7: 接続 URL は prisma.config.ts で読み込む
datasource db {
  provider = "postgresql"
}

enum UserRole {
  MEMBER
  ADMIN
}

enum AttendanceStatus {
  UNMARKED
  PRESENT
  ABSENT
}

enum PromotionTrigger {
  CANCELLATION
  ADMIN_CANCELLATION
  CAPACITY_INCREASE
}

/// テンプレートの列名(camelCase)を維持する
model User {
  id           String   @id @default(cuid())
  /// 小文字に正規化して保存
  email        String   @unique
  name         String
  /// bcrypt ハッシュ。auth サービス以外で select しない
  passwordHash String
  role         UserRole @default(MEMBER)
  createdAt    DateTime @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt @db.Timestamptz(3)

  organizedEvents    Event[]             @relation("EventOrganizer")
  registrations      Registration[]      @relation("RegistrationUser")
  markedAttendances  Registration[]      @relation("AttendanceMarkedBy")
  waitlistEntries    WaitlistEntry[]
  promotionsReceived WaitlistPromotion[] @relation("PromotedUser")
  promotionsVacated  WaitlistPromotion[] @relation("VacatedByUser")
  feedbacks          Feedback[]          @relation("FeedbackAuthor")
  hiddenFeedbacks    Feedback[]          @relation("FeedbackHiddenBy")

  @@map("users")
}

model Category {
  id        String   @id @default(cuid())
  /// 大文字小文字を区別しない一意性は lower(name) の一意インデックス(マイグレーション SQL)で担保
  name      String   @unique @db.VarChar(30)
  sortOrder Int      @default(0) @map("sort_order")
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  events Event[]

  @@map("categories")
}

model Event {
  id                   String    @id @default(cuid())
  title                String    @db.VarChar(100)
  /// 最大 2000 文字(Zod で検証)
  description          String
  location             String?   @db.VarChar(100)
  startsAt             DateTime  @map("starts_at") @db.Timestamptz(3)
  endsAt               DateTime  @map("ends_at") @db.Timestamptz(3)
  capacity             Int
  /// NULL = 開催開始まで
  registrationDeadline DateTime? @map("registration_deadline") @db.Timestamptz(3)
  /// NULL = 開催開始まで
  cancelDeadline       DateTime? @map("cancel_deadline") @db.Timestamptz(3)
  scheduleChangedAt    DateTime? @map("schedule_changed_at") @db.Timestamptz(3)
  categoryId           String    @map("category_id")
  organizerId          String    @map("organizer_id")
  /// 論理削除
  deletedAt            DateTime? @map("deleted_at") @db.Timestamptz(3)
  createdAt            DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt            DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)

  category        Category            @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  organizer       User                @relation("EventOrganizer", fields: [organizerId], references: [id], onDelete: Restrict)
  tags            EventTag[]
  registrations   Registration[]
  waitlistEntries WaitlistEntry[]
  promotions      WaitlistPromotion[]
  feedbacks       Feedback[]

  @@index([deletedAt, startsAt])
  @@index([categoryId])
  @@index([organizerId])
  @@map("events")
}

model Tag {
  id        String   @id @default(cuid())
  /// 正規化済み(trim → NFKC → 英字小文字化 → 連続空白を 1 つ)
  name      String   @unique @db.VarChar(20)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  events EventTag[]

  @@map("tags")
}

model EventTag {
  eventId String @map("event_id")
  tagId   String @map("tag_id")

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  tag   Tag   @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([eventId, tagId])
  @@index([tagId])
  @@map("event_tags")
}

model Registration {
  id                   String           @id @default(cuid())
  eventId              String           @map("event_id")
  userId               String           @map("user_id")
  attendance           AttendanceStatus @default(UNMARKED)
  attendanceMarkedAt   DateTime?        @map("attendance_marked_at") @db.Timestamptz(3)
  attendanceMarkedById String?          @map("attendance_marked_by_id")
  /// 参加確定日時(registeredAt)
  createdAt            DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt            DateTime         @updatedAt @map("updated_at") @db.Timestamptz(3)

  event              Event @relation(fields: [eventId], references: [id], onDelete: Restrict)
  user               User  @relation("RegistrationUser", fields: [userId], references: [id], onDelete: Restrict)
  attendanceMarkedBy User? @relation("AttendanceMarkedBy", fields: [attendanceMarkedById], references: [id], onDelete: SetNull)

  @@unique([eventId, userId])
  @@index([userId])
  @@map("registrations")
}

model WaitlistEntry {
  id        String   @id @default(cuid())
  eventId   String   @map("event_id")
  userId    String   @map("user_id")
  /// 現在の待機行の最大 + 1 で採番し、振り直さない
  position  Int
  /// 待機登録日時(joinedAt)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  event Event @relation(fields: [eventId], references: [id], onDelete: Restrict)
  user  User  @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@unique([eventId, userId])
  @@unique([eventId, position])
  @@index([userId])
  @@map("waitlist_entries")
}

/// 繰り上げ履歴。追記のみ
model WaitlistPromotion {
  id               String           @id @default(cuid())
  eventId          String           @map("event_id")
  promotedUserId   String           @map("promoted_user_id")
  vacatedByUserId  String?          @map("vacated_by_user_id")
  trigger          PromotionTrigger
  waitlistPosition Int              @map("waitlist_position")
  promotedAt       DateTime         @default(now()) @map("promoted_at") @db.Timestamptz(3)

  event         Event @relation(fields: [eventId], references: [id], onDelete: Restrict)
  promotedUser  User  @relation("PromotedUser", fields: [promotedUserId], references: [id], onDelete: Restrict)
  vacatedByUser User? @relation("VacatedByUser", fields: [vacatedByUserId], references: [id], onDelete: SetNull)

  @@index([eventId, promotedAt])
  @@index([promotedUserId])
  @@map("waitlist_promotions")
}

model Feedback {
  id          String    @id @default(cuid())
  eventId     String    @map("event_id")
  /// 匿名投稿でも保存する
  userId      String    @map("user_id")
  rating      Int       @db.SmallInt
  comment     String    @db.VarChar(200)
  isAnonymous Boolean   @default(false) @map("is_anonymous")
  isHidden    Boolean   @default(false) @map("is_hidden")
  hiddenAt    DateTime? @map("hidden_at") @db.Timestamptz(3)
  hiddenById  String?   @map("hidden_by_id")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)

  event    Event @relation(fields: [eventId], references: [id], onDelete: Restrict)
  user     User  @relation("FeedbackAuthor", fields: [userId], references: [id], onDelete: Restrict)
  hiddenBy User? @relation("FeedbackHiddenBy", fields: [hiddenById], references: [id], onDelete: SetNull)

  @@unique([eventId, userId])
  @@index([eventId, isHidden])
  @@map("feedbacks")
}
```
