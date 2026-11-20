# 社内イベント参加登録システム

社内の勉強会・懇親会・講演会・研修などを社員が主催・告知し、他の社員がオンラインで参加登録できる社内イベント運営プラットフォームです。定員・登録締切・キャンセル期限、キャンセル待ちと自動繰り上げ、出席管理、フィードバック(星評価 + コメント)、カテゴリ・タグを扱います。

AI駆動開発研修のメンタリング演習として、**要件定義 → マニフェスト → DB設計 → 実装 → 動作確認** の流れで作っています。仕様の正本は [`docs/manifest.md`](docs/manifest.md) です。

## ドキュメント

| ファイル                                                                                                                                                         | 内容                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`docs/manifest.md`](docs/manifest.md)                                                                                                                           | マニフェスト(要求・権限・画面・DB・API の確定版仕様) |
| [`docs/coding_standards.md`](docs/coding_standards.md)                                                                                                           | コーディング規約                                     |
| [`CLAUDE.md`](CLAUDE.md)                                                                                                                                         | AI(Claude Code)向けのプロジェクトルール              |
| [`backend-tasks.md`](backend-tasks.md)                                                                                                                           | バックエンド実装タスクリスト(進捗チェック付き)       |
| [`docs/初期選定要素リスト.md`](docs/初期選定要素リスト.md) / [`docs/技術スタック.md`](docs/技術スタック.md) / [`docs/詳細要求リスト.md`](docs/詳細要求リスト.md) | マニフェスト作成の過程(Phase 1〜3)                   |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                                                                                                                   | ディレクトリ構成の理由                               |

## 技術スタック

| 領域           | 採用技術                                                           |
| -------------- | ------------------------------------------------------------------ |
| モノレポ       | npm workspaces: `frontend/`, `backend/`, `shared/`                 |
| 言語           | TypeScript(`strict`)                                               |
| フロントエンド | React 19, Vite, React Router, TanStack Query, Tailwind CSS v4      |
| バックエンド   | Node.js 24, Express 5, Zod, Prisma 7, JWT(httpOnly Cookie), bcrypt |
| データベース   | PostgreSQL 17(Docker)                                              |
| テスト         | Vitest, Supertest(実 DB に対する API テスト), Testing Library      |

## Docker で起動する(推奨)

必要なもの: Docker Desktop のみ。

```bash
docker compose up -d
```

- `db`(PostgreSQL)が healthy になってから `backend` が起動し、マイグレーションの適用 → seed の投入 → API の起動を自動で行います。
- API: http://localhost:3000/api/health
- 停止: `docker compose down`(データも消す場合は `docker compose down -v`)

> 現在、Docker で起動するのは `db` と `backend` です。`frontend` のコンテナはフロントエンドの実装時に追加します。それまでは下の手順で画面を起動してください。

### 画面を起動する

```bash
npm install
npm run dev -w frontend
```

http://localhost:5173 を開きます(Vite が `/api` を http://localhost:3000 に転送します)。

### seed ユーザー

パスワードはすべて `password123`(開発専用)。

| メールアドレス                                                                                          | ロール |
| ------------------------------------------------------------------------------------------------------- | ------ |
| `admin@example.com`                                                                                     | ADMIN  |
| `alice@example.com` / `bob@example.com` / `carol@example.com` / `dave@example.com` / `erin@example.com` | MEMBER |

seed には「空きあり」「満席 + キャンセル待ち」「登録締切済み」「キャンセル期限済み」「開催済み(出席状態・レビューあり)」「論理削除済み」などのイベントが入っています。日時は seed 実行時刻からの相対値です。

## ローカルで起動する(Docker は DB のみ)

```bash
npm install
cp backend/.env.example backend/.env   # JWT_SECRET を 32 文字以上のランダム値にする(openssl rand -hex 32)
npm run db:up                          # PostgreSQL だけを起動(ホストのポート 5433)
npm run db:migrate
npm run db:seed
npm run dev                            # API :3000 + Web :5173
```

> **ポート 5433 が使用中の場合:** リポジトリのルートに `.env` を作り `POSTGRES_PORT=5434` のように別のポートを指定し、`backend/.env` の `DATABASE_URL` のポートも合わせてください。テストを実行するときは `DATABASE_URL=postgresql://app:app@localhost:5434/app_test npm test` のように接続先を上書きします(`backend/.env.test` は 5433 を指しています)。

## コマンド

| コマンド                            | 内容                                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                       | API + 画面(ホットリロード)                                     |
| `npm test`                          | バックエンドの API テスト + フロントエンドのテスト             |
| `npm run typecheck`                 | 全ワークスペースの型チェック                                   |
| `npm run lint` / `npm run format`   | ESLint / Prettier                                              |
| `npm run db:up` / `npm run db:down` | PostgreSQL の起動 / 停止                                       |
| `npm run db:migrate`                | スキーマ変更をマイグレーションとして適用(`prisma migrate dev`) |
| `npm run db:seed`                   | サンプルデータを入れ直す                                       |

バックエンドのテストは別のデータベース(`app_test`。Docker のボリュームを初めて作ったときに自動作成)を使い、開始時にマイグレーションを適用します。開発用のデータには触れません。

## Prisma スキーマの場所

課題の提出物にある `prisma/schema.prisma` は、このリポジトリでは **`backend/prisma/schema.prisma`** です(マイグレーションは `backend/prisma/migrations/`、seed は `backend/prisma/seed.ts`)。DB 設計の説明・ER 図はマニフェスト 5 章にあります。

## API

ベースパスは `/api`。成功は `{ "data": ... }`、失敗は `{ "error": { "code", "message", "details?" } }` です。全 27 エンドポイントの仕様・権限・エラーはマニフェスト 6 章、ロール別のアクセス表は 2 章を参照してください。

| リソース       | 主なエンドポイント                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| 認証           | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`                                                             |
| イベント       | `GET/POST /events`, `GET/PATCH/DELETE /events/:eventId`                                                             |
| 参加登録・出席 | `POST/DELETE /events/:eventId/registration`, `GET /events/:eventId/registrations`, `PUT .../attendance`             |
| キャンセル待ち | `POST/DELETE /events/:eventId/waitlist`                                                                             |
| フィードバック | `GET /events/:eventId/feedbacks`, `POST/PATCH /events/:eventId/feedback`, `PATCH /feedbacks/:feedbackId/visibility` |
| カテゴリ・タグ | `GET/POST /categories`, `PATCH/DELETE /categories/:categoryId`, `GET /tags`                                         |
| マイページ     | `GET /me/events`, `GET /me/stats`                                                                                   |

## CI

GitHub Actions(`.github/workflows/ci.yml`)が push のたびに lint・フォーマット・型チェック・テストを実行します。
