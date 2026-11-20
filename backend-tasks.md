# バックエンド実装タスクリスト

> 参照: `docs/manifest.md` v1.0(6 章 API設計・8 章 ディレクトリ構成・5 章 データモデリング・9 章 開発環境構築)、`docs/coding_standards.md`
> 各タスクは 15 分以内で完了できる粒度。完了したら `[x]` にする。
> プロジェクトルートは既存リポジトリ `internal-event-registration-system/`(テンプレート)。以下のパスはすべてこのルートからの相対パス。
> API の ID(E1, R1 など)はマニフェスト 6 章のエンドポイント一覧に対応する。
> フロントエンドの作業(`frontend/`、compose の `frontend` サービス)はこのリストの対象外。

## Phase 1: 環境構築・基本設定 【直列】
- 依存: なし
- 主な編集ファイル: `docker-compose.yml`, `backend/Dockerfile`, `package.json`, `backend/.env.example`, `backend/.env`, テンプレートの todos / signup 関連ファイル

- [x] 1-1 プロジェクトルート `internal-event-registration-system/` の構成がマニフェスト 8 章のトップレベル(`shared/`, `backend/`, `frontend/`, `docker/`, `docs/`, `docker-compose.yml`)と一致することを確認する(新規作成はしない)
- [x] 1-2 `backend/.env.example` を確認し、`DATABASE_URL` / `JWT_SECRET` / `PORT` / `NODE_ENV` / `CORS_ORIGIN` がマニフェスト 9.4 と一致することを確認する。`cp backend/.env.example backend/.env` で `.env` を作り、`JWT_SECRET` を 32 文字以上のランダム値にする(`openssl rand -hex 32`)
- [x] 1-3 テンプレートの todos を削除する: `backend/src/routes/todos.routes.ts`, `controllers/todos.controller.ts`, `services/todos.service.ts`, `tests/todos.api.test.ts`, `src/jobs/purgeCompletedTodos.ts`(と `server.ts` での呼び出し)、`routes/index.ts` の登録行
- [x] 1-4 テンプレートのサインアップを削除する: `routes/auth.routes.ts` の `POST /auth/signup`、`controllers/auth.controller.ts` の `signup`、`services/auth.service.ts` の `signup`、`tests/auth.api.test.ts` のサインアップのテスト
- [x] 1-5 `npm run typecheck -w backend` が通ることを確認する(この時点では shared の `todo.ts` / `signupSchema` は残っていてよい。削除は Phase 2)
- [x] 1-6 `backend/Dockerfile` を作成する(`node:24`、作業ディレクトリ、`npm ci` 用にワークスペースの `package.json` 群をコピー、`EXPOSE 3000`)
- [x] 1-7 `docker-compose.yml` に `backend` サービスを追加する: `build: { context: ., dockerfile: backend/Dockerfile }`、`depends_on: db (condition: service_healthy)`、ポート `3000:3000`、`environment`(`DATABASE_URL=postgresql://app:app@db:5432/app`、開発用 `JWT_SECRET`、`NODE_ENV=development`、`CORS_ORIGIN=http://localhost:5173`、`TZ=UTC`)
- [x] 1-8 `backend` サービスにソースのボリュームマウントと、`node_modules` 用の名前付きボリュームを追加する(ホストと共有しない)
- [x] 1-9 `backend` サービスの `command` を `prisma migrate deploy` → `seed` → `tsx watch` の順に実行するよう設定する(seed は Phase 2 で書き換えるまではテンプレートのもので可)
- [x] 1-10 ルートの `package.json` の `db:up` を `docker compose up -d --wait db` に変更する(ローカル実行では DB だけ起動する)
- [x] 1-11 `docker compose up -d` で `db` と `backend` が起動し、`curl http://localhost:3000/api/health` が `{"data":{"ok":true}}` を返すことを確認する
- [x] 1-12 ローカル実行(`npm run db:up && npm run dev -w backend`)でも同じヘルスチェックが通ることを確認する

## Phase 2: 共通基盤(スキーマ・共有型・共通部品)【直列】
- 依存: Phase 1
- 主な編集ファイル: `backend/prisma/schema.prisma`, `backend/prisma/migrations/**`, `shared/src/**`, `backend/src/lib/**`, `backend/src/middleware/auth.ts`, `backend/src/services/policies/event-policy.ts`, `backend/src/routes/index.ts`(全ルーターのスタブ登録), `backend/tests/helpers.ts`
- 共有ファイルの編集はこの Phase で終わらせ、Phase 3 以降の各 Phase が自分のファイルだけを触るようにする。

### スキーマ・マイグレーション
- [x] 2-1 `backend/prisma/schema.prisma` をマニフェスト 5.4 のスキーマに置き換える(`Todo` を削除、`UserRole` を `MEMBER` / `ADMIN` に)
- [x] 2-2 `npm run db:migrate -- --create-only --name event_domain` でマイグレーションを生成し、`USER` → `MEMBER` の enum 変更と `users` の日時列の `timestamptz` 化が含まれることを確認する
- [x] 2-3 生成された `migration.sql` の末尾に、マニフェスト 5.4 の CHECK 制約 6 本と `categories_name_lower_key`(`lower(name)` の一意インデックス)を追記する
- [x] 2-4 `npm run db:migrate` で適用し、`psql` で `\d events` を見て CHECK 制約があること、`INSERT` で `capacity = 0` が拒否されることを確認する

### 共有型(shared)
- [x] 2-5 `shared/src/api.ts` の `ERROR_STATUS` をマニフェスト 6 章のエラーコード一覧(21 個)にする(`EMAIL_TAKEN` を削除)
- [x] 2-6 `shared/src/auth.ts`: `USER_ROLES` を `["MEMBER", "ADMIN"]` にし、`signupSchema` / `SignupInput` を削除する。`shared/src/todo.ts` を削除し、`shared/src/index.ts` の export を整理する
- [x] 2-7 `shared/src/event.ts`: `eventIdParamSchema`、一覧クエリ `listEventsQuerySchema`(q / categoryId / tag / sort / includePast / page / limit)
- [x] 2-8 `shared/src/event.ts`: `createEventSchema`(前後関係の `superRefine` 含む)と `updateEventSchema`(全項目任意・最低 1 項目)
- [x] 2-9 `shared/src/event.ts`: レスポンス型 `Category`, `UserSummary`, `MyEventStatus`, `EventSummary`, `EventDetail`(`permissions` 含む), `EventUpdateWarning`
- [x] 2-10 `shared/src/registration.ts`: `registrationIdParamSchema`, `markAttendanceSchema`, `AttendanceStatus`, R3 のレスポンス型
- [x] 2-11 `shared/src/feedback.ts`: `createFeedbackSchema`, `updateFeedbackSchema`, `feedbackIdParamSchema`, `feedbackVisibilitySchema`, 一覧クエリ, `Feedback` / F1 のレスポンス型
- [x] 2-12 `shared/src/category.ts`: `createCategorySchema`, `updateCategorySchema`, `categoryIdParamSchema`, `listCategoriesQuerySchema`。`shared/src/tag.ts`: `listTagsQuerySchema`, タグ配列スキーマ(正規化前の長さ検証)
- [x] 2-13 `shared/src/me.ts`: M1 / M2 のレスポンス型。`shared/src/index.ts` に新ファイルの export を追加し、`npm run typecheck` が通ることを確認する

### 認証・共通部品
- [x] 2-14 `backend/src/lib/jwt.ts` の `payloadSchema` のロールを `MEMBER` / `ADMIN` にする
- [x] 2-15 `backend/src/middleware/auth.ts`: `requireAuth` を非同期にし、JWT 検証後に DB からユーザーを読み込んで `req.user = { id, role }`(DB の現在のロール)を設定する。ユーザーが存在しなければ `401 UNAUTHENTICATED`
- [x] 2-16 `backend/src/lib/prisma-errors.ts`: `isUniqueViolation(error)`(`P2002`)と `isForeignKeyViolation(error)`(`P2003`)を作る
- [x] 2-17 `backend/src/lib/event-lock.ts`: `lockEvent(tx, eventId)`(`$queryRaw` で `SELECT ... FOR UPDATE`、未削除のみ、無ければ `NOT_FOUND`)
- [x] 2-18 `backend/src/lib/tag-normalize.ts`: `normalizeTag()`(trim → NFKC → 小文字化 → 連続空白を 1 つ)と `normalizeTags()`(重複除去・1〜20 文字検証)
- [x] 2-19 `backend/src/lib/tag-normalize.test.ts`: 「React」「react」「ＲＥＡＣＴ」が同一になる、空白の正規化、重複除去のユニットテスト
- [x] 2-20 `backend/src/services/policies/event-policy.ts`: `Actor` 型、`canManageEvent`, `assertCanManageEvent`
- [x] 2-21 `backend/src/services/policies/event-policy.test.ts`: 主催者・admin・他の member の 3 パターンのユニットテスト

### イベントの表示と繰り上げ(複数 Phase が使う共通サービス)
- [x] 2-22 `backend/src/services/event-view.service.ts`: イベント行 + 集計(参加確定数・待機数)+ 閲覧者から `EventSummary` を組み立てる `toEventSummary()`(`myStatus` と待機順位の計算を含む)
- [x] 2-23 `backend/src/services/event-view.service.ts`: `getEventDetail(actor, eventId, tx?)`。説明・締切・`scheduleChangedAt`・参加者(登録順)・平均評価(非公開除外、小数第 1 位)を含める
- [x] 2-24 `backend/src/services/event-view.service.ts`: `permissions` の 9 項目(`canEdit` 〜 `canEditFeedback`)をマニフェスト E2 の条件どおりに計算する
- [x] 2-25 `backend/src/services/waitlist-promotion.service.ts`: `promoteWaiters(tx, event, { count, trigger, vacatedByUserId })`。position 昇順に参加確定行作成 → 待機行削除 → `waitlist_promotions` 記録。開催開始後は何もしない。繰り上げた結果を返す(ログはコミット後に呼び出し側で出す)
- [x] 2-26 `backend/src/services/waitlist-promotion.service.ts`: `logPromotions(promotions)`(コミット後に呼ぶログ出力)

### ルーター・テスト基盤・seed
- [x] 2-27 空のルーター(`Router()` を export するだけ)として `routes/events.routes.ts`, `registrations.routes.ts`, `waitlist.routes.ts`, `feedbacks.routes.ts`, `categories.routes.ts`, `tags.routes.ts`, `me.routes.ts` を作り、`routes/index.ts` にすべて登録する(以降の Phase はこの index を触らない)
- [x] 2-28 `backend/tests/helpers.ts`: `resetDb()` を全テーブル対応にする(子テーブルから削除)。`hoursFromNow(n)` を追加する
- [x] 2-29 `backend/tests/helpers.ts`: ファクトリ `createUser({ role })`, `createCategory()`, `createEvent({ organizerId, capacity, startsAt, ... })` と、ログイン済みエージェント `loginAs(user)` を作る(サインアップを使わない)
- [x] 2-30 `backend/prisma/seed.ts`: 既存データ削除(子テーブルから)とユーザー 6 名(`admin` + `alice`〜`erin`、パスワード `password123`)
- [x] 2-31 `backend/prisma/seed.ts`: カテゴリ 5 件と、無効化カテゴリ 1 件(⑧用)、タグ
- [x] 2-32 `backend/prisma/seed.ts`: イベント ①空きあり ②満席 + 待機 2 名 ③登録締切済み ④キャンセル期限済み(日時は実行時刻からの相対値)
- [x] 2-33 `backend/prisma/seed.ts`: イベント ⑤開催済み(出席・欠席・未マーク混在、レビュー 3 件うち匿名 1・非公開 1)⑥開催済み・未投稿の出席者あり ⑦論理削除済み ⑧無効化カテゴリ使用
- [x] 2-34 `npm run db:seed` を 2 回続けて実行しても成功し、同じ件数になることを確認する

## Phase 3: 認証 API 【並列可】
- 依存: Phase 2
- 主な編集ファイル: `backend/src/routes/auth.routes.ts`, `controllers/auth.controller.ts`, `services/auth.service.ts`, `backend/tests/auth.api.test.ts`
- 対象エンドポイント: A1 `POST /api/auth/login`, A2 `POST /api/auth/logout`, A3 `GET /api/auth/me`

- [ ] 3-1 A1: ログインのサービスとコントローラが `MEMBER` / `ADMIN` で動き、`toUser()` を通すこと、ダミーハッシュ照合とレート制限が残っていることを確認する
- [ ] 3-2 A2・A3: ログアウトが未ログインでも 204、`me` が `requireAuth`(DB 読み込み版)で動くことを確認する
- [ ] 3-3 `tests/auth.api.test.ts`: ログイン成功で Cookie(`HttpOnly`, `SameSite=Lax`)が付く、メール不存在とパスワード誤りが同じ `401 INVALID_CREDENTIALS`、形式不正 400
- [ ] 3-4 `tests/auth.api.test.ts`: `me` が未ログイン・改ざんトークン・削除済みユーザーで 401、ロールを DB で変更すると次のリクエストから反映される

## Phase 4: イベント API 【並列可】
- 依存: Phase 2
- 主な編集ファイル: `backend/src/routes/events.routes.ts`, `controllers/events.controller.ts`, `services/events.service.ts`, `backend/tests/events.api.test.ts`
- 対象エンドポイント: E1 `GET /api/events`, E2 `GET /api/events/:eventId`, E3 `POST /api/events`, E4 `PATCH /api/events/:eventId`, E5 `DELETE /api/events/:eventId`

- [ ] 4-1 E1 service: `listEvents(actor, query)` の where 条件(`deletedAt: null`、`includePast`、`q` の大文字小文字無視の部分一致、`categoryId`、正規化した `tag`)
- [ ] 4-2 E1 service: ソート(`startsAt` + `id`)とページング、`total` の取得、`toEventSummary()` で整形
- [ ] 4-3 E1 route + controller(`validate({ query })`)
- [ ] 4-4 E2 route + controller(`getEventDetail` を呼ぶだけ。無い・削除済みは 404)
- [ ] 4-5 E3 service: サーバー時刻で `startsAt` / `registrationDeadline` が未来か検証、カテゴリが存在し有効か検証(違反は `VALIDATION_ERROR` の `details`)
- [ ] 4-6 E3 service: タグを正規化して upsert し、`organizerId = actor.id` でイベントと `event_tags` を作成、`getEventDetail` を返す
- [ ] 4-7 E3 route + controller(201)
- [ ] 4-8 E4 service: トランザクション + `lockEvent`、`assertCanManageEvent`、既存値とのマージ後の前後関係検証、変更された項目の判定
- [ ] 4-9 E4 service: 開催開始後の日時・定員・締切の変更を `409 EVENT_ALREADY_STARTED`、参加確定数未満の定員を `409 CAPACITY_BELOW_REGISTERED`、カテゴリ変更時の有効性チェック
- [ ] 4-10 E4 service: 定員増加時の `promoteWaiters(trigger: CAPACITY_INCREASE)`、参加者ありの日時変更で `scheduleChangedAt` 記録、タグの置き換え、`warnings` の組み立て
- [ ] 4-11 E4 service: コミット後のログ(日時変更の `warn`、繰り上げ)。route + controller(`{ event, warnings }` を返す)
- [ ] 4-12 E5 service + route + controller: `lockEvent`、`assertCanManageEvent`、`deletedAt` 設定、コミット後に参加者・待機者数をログ、204
- [ ] 4-13 `tests/events.api.test.ts`: E1 の検索・カテゴリ・タグ・ソート・`includePast`・ページング、削除済みが出ない、存在しない `categoryId` で 0 件
- [ ] 4-14 `tests/events.api.test.ts`: E2 の `permissions` / `myStatus`(主催者・参加確定・待機中・未参加)、削除済み 404
- [ ] 4-15 `tests/events.api.test.ts`: E3 の過去日時 400、終了 <= 開始 400、締切 > 開始 400、無効カテゴリ 400、ボディの `organizerId` が無視される、タグの正規化
- [ ] 4-16 `tests/events.api.test.ts`: E4 の他人 403、開催後の日時変更 409、定員減少 409、定員増で繰り上げ + `WAITLIST_PROMOTED`、参加者ありの日時変更で `SCHEDULE_CHANGED_WITH_PARTICIPANTS`
- [ ] 4-17 `tests/events.api.test.ts`: E5 の他人 403、admin は削除可、削除後 E2 が 404、二重削除 404

## Phase 5: 参加登録・出席 API 【並列可】
- 依存: Phase 2
- 主な編集ファイル: `backend/src/routes/registrations.routes.ts`, `controllers/registrations.controller.ts`, `services/registrations.service.ts`, `services/attendance.service.ts`, `backend/tests/registrations.api.test.ts`, `backend/tests/attendance.api.test.ts`
- 対象エンドポイント: R1 `POST /api/events/:eventId/registration`, R2 `DELETE /api/events/:eventId/registration`, R3 `GET /api/events/:eventId/registrations`, R4 `DELETE /api/events/:eventId/registrations/:registrationId`, R5 `PUT /api/events/:eventId/registrations/:registrationId/attendance`

- [ ] 5-1 R1 service: トランザクション + `lockEvent`、判定順(主催者 403 → 締切・開始 409 → 登録済み/待機中 409 → 空き 409 `EVENT_FULL`)
- [ ] 5-2 R1 service: 作成と `P2002` → `ALREADY_REGISTERED` の変換、`{ registrationId, event }` を返す。route + controller(201)
- [ ] 5-3 R2 service: トランザクション + `lockEvent`、自分の登録の取得(無ければ 404)、キャンセル期限 409、削除、開催前なら `promoteWaiters(count: 1, trigger: CANCELLATION, vacatedByUserId: 本人)`
- [ ] 5-4 R2: コミット後の繰り上げログ。route + controller(204)
- [ ] 5-5 R3 service + route + controller: `assertCanManageEvent`、参加確定者(登録順・出席状態)、待機者(position 昇順・順位)、`summary`
- [ ] 5-6 R4 service + route + controller: `requireRole("ADMIN")`、`registrationId` がイベントに属するか(違反 404)、期限チェックなしで削除、開催前なら `promoteWaiters(trigger: ADMIN_CANCELLATION)`、コミット後のログ、204
- [ ] 5-7 R5 service(`attendance.service.ts`)+ route + controller: 判定順(イベント 404 → 権限 403 → 開催前 400 `EVENT_NOT_STARTED` → 登録 404)、マーク日時・マーク者の記録 / `UNMARKED` で NULL
- [ ] 5-8 `tests/registrations.api.test.ts`: R1 の成功、満席 409、締切後 409、開催後 409、二重登録 409、待機中の登録 409、主催者 403
- [ ] 5-9 `tests/registrations.api.test.ts`: R2 の成功、期限後 409、未登録 404、キャンセルで先頭の待機者が繰り上がり履歴(`CANCELLATION`, 空きを作った人)が残る
- [ ] 5-10 `tests/registrations.api.test.ts`: **同時キャンセル 2 件(`Promise.all`)で定員超過・二重繰り上げが起きない**、空き 1 席への同時登録 2 件で 1 件だけ成功する
- [ ] 5-11 `tests/registrations.api.test.ts`: R3 の他人 403・主催者と admin は取得可、R4 の member 403・期限後も admin は成功・別イベントの `registrationId` は 404・開催後は繰り上げなし
- [ ] 5-12 `tests/attendance.api.test.ts`: R5 の開催前 400、出席→欠席→未マークの変更、`attendanceMarkedAt` の設定と NULL 化、他人 403

## Phase 6: キャンセル待ち API 【並列可】
- 依存: Phase 2
- 主な編集ファイル: `backend/src/routes/waitlist.routes.ts`, `controllers/waitlist.controller.ts`, `services/waitlist.service.ts`, `backend/tests/waitlist.api.test.ts`
- 対象エンドポイント: W1 `POST /api/events/:eventId/waitlist`, W2 `DELETE /api/events/:eventId/waitlist`

- [ ] 6-1 W1 service: トランザクション + `lockEvent`、判定順(主催者 403 → 締切・開始 409 → 登録済み/待機中 409 → 空きあり 409 `SEATS_AVAILABLE`)
- [ ] 6-2 W1 service: `現在の最大 position + 1` で採番して作成、`P2002` → `ALREADY_REGISTERED`、`{ waitlistEntryId, event }` を返す。route + controller(201)
- [ ] 6-3 W2 service + route + controller: トランザクション + `lockEvent`、自分の待機行が無ければ 404、削除(他の行は更新しない)、204
- [ ] 6-4 `tests/waitlist.api.test.ts`: W1 の満席時のみ成功・空きあり 409・主催者 403・締切後 409・二重 409、順位(`myStatus.rank`)が 1, 2, 3 と付く
- [ ] 6-5 `tests/waitlist.api.test.ts`: W2 で中間の人が抜けると後ろの人の順位が 1 つ上がる、再登録で最後尾、繰り上げ済みの人の W2 は 404

## Phase 7: フィードバック API 【並列可】
- 依存: Phase 2
- 主な編集ファイル: `backend/src/routes/feedbacks.routes.ts`, `controllers/feedbacks.controller.ts`, `services/feedbacks.service.ts`, `backend/tests/feedbacks.api.test.ts`
- 対象エンドポイント: F1 `GET /api/events/:eventId/feedbacks`, F2 `POST /api/events/:eventId/feedback`, F3 `PATCH /api/events/:eventId/feedback`, F4 `PATCH /api/feedbacks/:feedbackId/visibility`

- [ ] 7-1 F1 service: 公開分の平均(小数第 1 位)と件数、`myFeedback`、ロール別の `items`(一般は公開のみ、admin は全件)とページング
- [ ] 7-2 F1 service: `Feedback` への整形(匿名かつ閲覧者が admin でなければ `author: null`、`isMine`)。route + controller
- [ ] 7-3 F2 service: 判定順(イベント 404 → 主催者・開催終了前・`PRESENT` でない 403 `FEEDBACK_NOT_ALLOWED`(理由別メッセージ)→ 投稿済み 409)、`P2002` → `FEEDBACK_ALREADY_EXISTS`。route + controller(201)
- [ ] 7-4 F3 service + route + controller: 自分の投稿が無ければ 404、`PRESENT` でなければ 403、非公開状態は変えない
- [ ] 7-5 F4 service + route + controller: `requireRole("ADMIN")`、削除済みイベントのレビューは 404、`isHidden` に応じて `hiddenAt` / `hiddenById` を設定・NULL 化
- [ ] 7-6 `tests/feedbacks.api.test.ts`: F2 の開催終了前 403、欠席・未マーク 403、主催者 403、2 件目 409、成功
- [ ] 7-7 `tests/feedbacks.api.test.ts`: F1 の匿名投稿者が member には `null`・admin には見える、非公開が平均・件数・member の一覧から除外され `myFeedback` には出る
- [ ] 7-8 `tests/feedbacks.api.test.ts`: F3 の編集成功、欠席に変わった後は 403、非公開のまま編集しても非公開。F4 の member 403、非公開化と再公開

## Phase 8: カテゴリ・タグ API 【並列可】
- 依存: Phase 2
- 主な編集ファイル: `backend/src/routes/categories.routes.ts`, `routes/tags.routes.ts`, `controllers/categories.controller.ts`, `controllers/tags.controller.ts`, `services/categories.service.ts`, `services/tags.service.ts`, `backend/tests/categories.api.test.ts`, `backend/tests/tags.api.test.ts`
- 対象エンドポイント: C1 `GET /api/categories`, C2 `POST /api/categories`, C3 `PATCH /api/categories/:categoryId`, C4 `DELETE /api/categories/:categoryId`, T1 `GET /api/tags`

- [ ] 8-1 C1 service + route + controller: 有効のみ / admin の `includeInactive=true` で無効と `eventCount`(削除済みイベント含む)、member の指定は無視、`sortOrder` → `name` 順
- [ ] 8-2 C2 service + route + controller: `requireRole("ADMIN")`、大文字小文字を無視した重複チェック、`P2002` → `CATEGORY_NAME_TAKEN`、201
- [ ] 8-3 C3 service + route + controller: 自分以外との名前重複 409、`isActive` の切り替え、無ければ 404
- [ ] 8-4 C4 service + route + controller: 使用件数(削除済み含む)> 0 なら `409 CATEGORY_IN_USE`(件数入りメッセージ)、`P2003` も同じに変換、204
- [ ] 8-5 T1 service + route + controller: `q` を正規化して前方一致、未削除イベントでの使用件数の降順 → 名前順、`limit`
- [ ] 8-6 `tests/categories.api.test.ts`: member の C2〜C4 が 403、「勉強会」と大文字小文字違いの重複 409、使用中の削除 409・未使用は 204、無効カテゴリが member の C1 に出ない
- [ ] 8-7 `tests/tags.api.test.ts`: 前方一致・正規化(「ＲＥＡ」で `react` が出る)・使用件数順・削除済みイベントを数えない

## Phase 9: マイページ API 【並列可】
- 依存: Phase 2
- 主な編集ファイル: `backend/src/routes/me.routes.ts`, `controllers/me.controller.ts`, `services/me.service.ts`, `backend/tests/me.api.test.ts`
- 対象エンドポイント: M1 `GET /api/me/events`, M2 `GET /api/me/stats`

- [ ] 9-1 M1 service: `organizing` / `organizedPast`(最大 20)/ `registered` / `waitlisted` の 4 区分(削除済み除外、並び順はマニフェスト M1)
- [ ] 9-2 M1 service: `history`(参加確定・開催開始済み・新しい順・最大 50、`attendance` と `hasFeedback` 付き)。route + controller
- [ ] 9-3 M2 service + route + controller: 母集団(開催開始済み・未削除・参加確定)から `participationCount`、出席状態別件数、`attendanceRate`(分母 0 で `null`)、`byCategory`(件数 0 は除外)
- [ ] 9-4 `tests/me.api.test.ts`: M1 の各区分に正しいイベントが入る(主催・参加・待機・履歴、削除済みは出ない)
- [ ] 9-5 `tests/me.api.test.ts`: M2 の出席率(未マークは分母から除外、全員未マークで `null`)、累計参加数に欠席を含めない、カテゴリ別集計

## Phase 10: 統合・最終確認 【直列】
- 依存: Phase 3〜9
- 主な編集ファイル: `.github/workflows/ci.yml`, `README.md`, `backend/tests/health.api.test.ts`

- [ ] 10-1 H1 `GET /api/health` が未ログインで `{ data: { ok: true } }` を返すことを `tests/health.api.test.ts` で確認する(テンプレート既存のテストを流用)
- [ ] 10-2 全 API の権限を横断チェックする: 未ログインで A1・A2・H1 以外が 401 になることを 1 つのテストでまとめて確認する
- [ ] 10-3 `npm run typecheck && npm run lint && npm test` がすべて通ることを確認する
- [ ] 10-4 `docker compose down -v && docker compose up -d` で、マイグレーションと seed が自動で適用され、seed ユーザーで A1 ログイン → E1 一覧 → R1 登録が `curl` で通ることを確認する
- [ ] 10-5 `.github/workflows/ci.yml`: push 時に Postgres サービスコンテナを起動し、`npm ci` → `prisma migrate deploy` → lint・型チェック・`npm test` を実行する
- [ ] 10-6 `README.md` を更新する: Docker での起動方法、seed ユーザー、Prisma スキーマの場所(`backend/prisma/`)、テストコマンド
- [ ] 10-7 マニフェスト 11 章相当の実装状況(Should 機能を含む)に未実装が無いか確認し、あればマニフェストに「未実装」と理由を書く

## 並列実装サマリー

| Phase | 種別 | 依存Phase | 並列実行可能な相手 | 理由（依存・共通ファイル） |
|---|---|---|---|---|
| 1 環境構築 | 直列 | なし | なし | すべての Phase の前提。compose・ルートの `package.json` を編集する |
| 2 共通基盤 | 直列 | 1 | なし | スキーマ・マイグレーション・shared・`routes/index.ts`・テストヘルパーなど、全 Phase が共有するファイルをここで確定させる |
| 3 認証 API | 並列可 | 2 | 4, 5, 6, 7, 8, 9 | `auth.*` と `auth.api.test.ts` だけを編集する |
| 4 イベント API | 並列可 | 2 | 3, 5, 6, 7, 8, 9 | `events.*` だけを編集する。表示・繰り上げは Phase 2 の共通サービスを呼ぶだけ |
| 5 参加登録・出席 API | 並列可 | 2 | 3, 4, 6, 7, 8, 9 | `registrations.*` / `attendance.*` だけを編集する |
| 6 キャンセル待ち API | 並列可 | 2 | 3, 4, 5, 7, 8, 9 | `waitlist.*` だけを編集する |
| 7 フィードバック API | 並列可 | 2 | 3, 4, 5, 6, 8, 9 | `feedbacks.*` だけを編集する |
| 8 カテゴリ・タグ API | 並列可 | 2 | 3, 4, 5, 6, 7, 9 | `categories.*` / `tags.*` だけを編集する |
| 9 マイページ API | 並列可 | 2 | 3, 4, 5, 6, 7, 8 | `me.*` だけを編集する |
| 10 統合・最終確認 | 直列 | 3〜9 | なし | CI・README・全体テストで全 Phase の結果を使う |

- 並列 Phase の間でテストデータが衝突しないよう、各 Phase のテストはそれぞれのテストファイル内で `resetDb()` とファクトリを使う(Vitest のテストファイルは直列実行の設定を維持する)。
- 並列 Phase で `event-view.service.ts` / `waitlist-promotion.service.ts` / shared の型に不足が見つかった場合は、その Phase で直さず、Phase 2 の追加タスクとして記録して直列で修正する。

### 推奨実行順序
1. Phase 1 → Phase 2(直列)
2. Phase 3 / 4 / 5 / 6 / 7 / 8 / 9(並列)
3. Phase 10(統合・直列)

**カバレッジ: 全 27 エンドポイントをカバー**(A1〜A3: Phase 3、E1〜E5: Phase 4、R1〜R5: Phase 5、W1〜W2: Phase 6、F1〜F4: Phase 7、C1〜C4・T1: Phase 8、M1〜M2: Phase 9、H1: Phase 10)
