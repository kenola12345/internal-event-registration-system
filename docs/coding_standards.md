# コーディング規約

社内イベント参加登録システムの実装で、開発者とコーディングエージェントが守るルールです。

- **目的**: 誰が書いても(AI が書いても)同じ構造・同じ品質になるようにし、目視レビューを「規約に沿っているか」で判断できるようにする。
- **範囲**: `shared/`・`backend/`・`frontend/`・`e2e/` のすべてのコード、マイグレーション、テスト、Git 運用。
- **優先順位**: 仕様・設計の正本は [`docs/manifest.md`](manifest.md)。本書と食い違う場合はマニフェストが優先し、本書を直す。プロジェクト全体のルールは `CLAUDE.md`、構成の理由は `docs/ARCHITECTURE.md`。
- 例のコードはこのプロジェクトの実際のエンティティ(イベント・参加登録・キャンセル待ち・フィードバック・カテゴリ)と API(マニフェスト 6 章の ID: E1, R1 など)を使う。

## 目次

1. [全般的な言語規約](#1-全般的な言語規約)
2. [フロントエンド規約](#2-フロントエンド規約)
3. [バックエンド規約](#3-バックエンド規約)
4. [ORM/データベース規約](#4-ormデータベース規約)
5. [API設計規約](#5-api設計規約)
6. [テスト規約](#6-テスト規約)
7. [Git規約](#7-git規約)
8. [環境変数管理](#8-環境変数管理)
9. [セキュリティガイドライン](#9-セキュリティガイドライン)
10. [コードレビューチェックリスト](#10-コードレビューチェックリスト)

---

## 1. 全般的な言語規約

### 1.1 コンパイラ設定(tsconfig)

全パッケージは `tsconfig.base.json` を継承する。オプションを緩める変更はしない。

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

- バックエンドは `module` / `moduleResolution` を `nodenext`(ESM)。相対 import には `.js` 拡張子を付ける。
- フロントエンドは `moduleResolution: "bundler"`、エイリアス `@/*` は `paths` のみで定義する(TypeScript 6 のため `baseUrl` は設定しない)。

### 1.2 リンター・フォーマッター

- ESLint は `eslint.config.js`(`typescript-eslint` の `strictTypeChecked` + `simple-import-sort` + `react-hooks` + feature 境界ルール)。Prettier は `.prettierrc.json`(`printWidth: 100`、ダブルクォート、セミコロンあり、末尾カンマ `all`、Tailwind のクラス並び替え)。
- コミット前に `npm run typecheck && npm run lint` が通ること。整形は `npm run format`、import 順の修正は `npm run lint -- --fix`。
- 主なルール: `no-explicit-any`(error)、`consistent-type-imports`、`no-floating-promises`、`switch-exhaustiveness-check`、`eqeqeq`、`no-console`(`warn` / `error` のみ可)。

### 1.3 型定義

- `any` は使わない。外部から来る値は `unknown` で受けて Zod で絞り込む。
- API の入出力の型は `shared/src/*.ts` の Zod スキーマから `z.infer` で作る。同じ形の型を手で二重定義しない。
- 状態を表す値は文字列リテラルのユニオン(Prisma の enum と同じ値)にし、`switch` は網羅チェックに任せる。

```ts
// ❌ Bad: any で受けて手書きの型と二重管理。enum 値の綴りミスが実行時まで分からない
function markAttendance(body: any) {
  const status: string = body.status; // "PRESEN" でも通る
}
```

```ts
// ✅ Good: shared のスキーマが唯一の定義。型はスキーマから導出する
// shared/src/registration.ts
export const ATTENDANCE_STATUSES = ["UNMARKED", "PRESENT", "ABSENT"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const markAttendanceSchema = z.object({ status: z.enum(ATTENDANCE_STATUSES) });
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
```

```ts
// ✅ Good: ユニオンの switch は網羅チェックされる(ケースの書き忘れが lint エラーになる)
function attendanceLabel(status: AttendanceStatus): string {
  switch (status) {
    case "UNMARKED":
      return "未マーク";
    case "PRESENT":
      return "出席";
    case "ABSENT":
      return "欠席";
  }
}
```

### 1.4 命名規則

| 対象 | 規則 | 例 |
|---|---|---|
| 変数・関数 | camelCase。真偽値は `is` / `has` / `can` で始める | `remainingSeats`, `canRegister`, `hasFeedback` |
| 型・インターフェース・React コンポーネント | PascalCase | `EventDetail`, `RegistrationButton` |
| 定数(モジュールトップの不変値) | UPPER_SNAKE_CASE | `MAX_TAGS_PER_EVENT`, `SALT_ROUNDS` |
| Zod スキーマ | camelCase + `Schema` | `createEventSchema`, `eventIdParamSchema` |
| フロントのファイル | kebab-case | `registration-button.tsx`, `event-queries.ts` |
| バックのファイル | `<リソース>.<層>.ts` | `events.service.ts`, `registrations.routes.ts` |
| ディレクトリ | kebab-case、リソースは複数形 | `features/registrations/` |
| JSON のキー | camelCase(マニフェスト 7.5) | `startsAt`, `registrationDeadline` |
| DB のテーブル・カラム | snake_case(`users` のみ既存の camelCase 列) | `waitlist_entries.created_at` |

```ts
// ❌ Bad: 何の真偽値か分からない、略語、マジックナンバー
const flg = ev.cap - cnt > 0;
if (tags.length > 10) throw new Error("too many");
```

```ts
// ✅ Good: 意味のある名前と名前付き定数(上限はマニフェスト 3-4 の業務ルール)
const MAX_TAGS_PER_EVENT = 10;
const hasRemainingSeats = event.capacity - registeredCount > 0;
if (tags.length > MAX_TAGS_PER_EVENT) { /* Zod 側で検証済みなので通常ここには来ない */ }
```

### 1.5 インポート順序

`simple-import-sort` が自動で並べる(外部パッケージ → `@template/shared` → エイリアス `@/` → 相対)。型だけの import は `import type` にする。バレルファイル(`index.ts` での再エクスポート)は作らない。

```ts
// ❌ Bad: 型を値として import、バレル経由、順序がばらばら
import { EventDetail } from "@/features/events";
import { useState } from "react";
```

```ts
// ✅ Good
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { EventDetail } from "@template/shared";

import { apiFetch } from "@/lib/api-client";

import { eventKeys } from "./event-queries";
```

### 1.6 コメント

- コメントは **日本語** で、「何をしているか」ではなく **なぜそうするか**(業務ルール・セキュリティ上の理由)を書く。
- 関数・コンポーネントの先頭に 1 行の要約(JSDoc)を書く。

```ts
// ❌ Bad: コードを読めば分かることを繰り返している
// 待機者を取得する
const next = await tx.waitlistEntry.findFirst({ where: { eventId }, orderBy: { position: "asc" } });
```

```ts
// ✅ Good: 理由を書く
// position は振り直さない方式なので、最小値の行が常に先頭の待機者になる(マニフェスト 3-6)
const next = await tx.waitlistEntry.findFirst({ where: { eventId }, orderBy: { position: "asc" } });
```

---

## 2. フロントエンド規約

### 2.1 ディレクトリ構成

マニフェスト 8 章のとおり。依存の向きは **shared(`components` / `hooks` / `lib` / `utils` / `config`)→ `features` → `app`** の一方向で、ESLint が強制する。

```
frontend/src/
├── app/                  # router, provider, root-layout, route-guards, routes/*-page.tsx
├── features/
│   ├── auth/             # api/, components/
│   ├── events/
│   ├── registrations/
│   ├── feedbacks/
│   ├── categories/
│   └── me/
├── components/ui/        # Button, FormField, Spinner, ErrorMessage, Modal
├── utils/datetime.ts     # JST ⇔ UTC 変換と表示
├── lib/  config/  hooks/  styles/
└── testing/              # renderApp()
```

- feature は他の feature と `app/` を import しない。feature 内は相対 import を使う。
- 複数の feature を組み合わせるのは `app/routes/` のページだけ。
- shared に昇格させるのは、2 つ目の feature が必要になってから。

```tsx
// ❌ Bad: registrations feature が events feature を直接 import している(ESLint エラー)
// features/registrations/components/registration-button.tsx
import { useEventDetail } from "@/features/events/api/event-queries";
```

```tsx
// ✅ Good: ページが両方の feature を組み合わせ、必要な値を props で渡す
// app/routes/event-detail-page.tsx
const { data: event } = useEventDetail(eventId);
return <RegistrationButton eventId={eventId} myStatus={event.myStatus} permissions={event.permissions} />;
```

### 2.2 コンポーネント設計

- 1 ファイル 1 コンポーネント(小さな内部用コンポーネントは同じファイル可)。named export、PascalCase。
- データ取得はページか feature のコンテナで行い、表示用コンポーネントは props だけで描画する。
- **一覧・データ表示はすべて 読み込み中・エラー・空 の 3 状態を扱う**。
- ボタンの表示・活性は API の `permissions` / `myStatus` に従う。ロールや日時をフロントで再計算しない(マニフェスト 4.3)。
- 説明文などのユーザー入力は `{text}` で描画し、`dangerouslySetInnerHTML` を使わない。

```tsx
// ❌ Bad: 権限と締切をフロントで再計算(サーバーと判定がずれる)、空・エラー状態がない
export function RegistrationButton({ event, user }: Props) {
  const canRegister = event.organizer.id !== user.id && new Date() < new Date(event.startsAt);
  return canRegister ? <button onClick={register}>参加登録</button> : null;
}
```

```tsx
// ✅ Good: サーバーが判定した permissions だけで出し分ける
/** 参加状態に応じて 1 つのボタンを切り替える(マニフェスト 4 章の状態一覧) */
export function RegistrationButton({ eventId, myStatus, permissions }: RegistrationButtonProps) {
  const register = useRegister(eventId);
  const joinWaitlist = useJoinWaitlist(eventId);

  if (myStatus.kind === "ORGANIZER") return <p>あなたが主催者です</p>;
  if (permissions.canRegister) {
    return <Button onClick={() => register.mutate()} disabled={register.isPending}>参加登録</Button>;
  }
  if (permissions.canJoinWaitlist) {
    return <Button onClick={() => joinWaitlist.mutate()} disabled={joinWaitlist.isPending}>キャンセル待ちに登録</Button>;
  }
  // canCancel / canLeaveWaitlist / 受付終了 の分岐も同様
  return <Button disabled>受付終了</Button>;
}
```

```tsx
// ✅ Good: 3 状態を必ず扱う
export function ParticipantList({ eventId }: { eventId: string }) {
  const { data, isPending, isError, refetch } = useEventDetail(eventId);
  if (isPending) return <Spinner />;
  if (isError) return <ErrorMessage onRetry={() => void refetch()} />;
  if (data.participants.length === 0) return <p>まだ参加者はいません</p>;
  return <ul>{data.participants.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

### 2.3 データ取得とカスタムフック

- リクエスト関数(`<feature>.api.ts`)とフック(`<feature>-queries.ts`)を分け、どちらも feature の `api/` に置く。
- クエリキーは **feature ごとのキーファクトリ** で作る。グローバルな `queryKeys.ts` は作らない。
- 参加登録・キャンセル・待機の操作は **楽観的更新をしない**(空き判定はサーバーが行ロック下で決めるため)。送信中はボタンを無効化し、成功後にキャッシュを更新・無効化する。
- 409 系エラー(`EVENT_FULL` など)を受けたらトーストを出し、詳細を再取得する。

```ts
// ❌ Bad: キーを文字列で直書き、楽観的に空き数を減らす、マイページを更新し忘れる
useMutation({
  mutationFn: () => apiFetch(`/events/${eventId}/registration`, { method: "POST" }),
  onMutate: () => queryClient.setQueryData(["event", eventId], (e: EventDetail) => ({ ...e, remainingSeats: e.remainingSeats - 1 })),
});
```

```ts
// ✅ Good: features/events/api/event-queries.ts
export const eventKeys = {
  all: ["events"] as const,
  lists: () => [...eventKeys.all, "list"] as const,
  list: (filters: EventListQuery) => [...eventKeys.lists(), filters] as const,
  details: () => [...eventKeys.all, "detail"] as const,
  detail: (eventId: string) => [...eventKeys.details(), eventId] as const,
};

export const eventDetailQueryOptions = (eventId: string) =>
  queryOptions({ queryKey: eventKeys.detail(eventId), queryFn: () => fetchEventDetail(eventId) });
```

```ts
// ✅ Good: features/registrations/api/registration-queries.ts
/** 参加登録(R1)。成功レスポンスの event でキャッシュを置き換え、関連する一覧も無効化する */
export function useRegister(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => registerForEvent(eventId),
    onSuccess: ({ event }) => {
      queryClient.setQueryData(["events", "detail", eventId], event);
      // 一覧カードの空き数とマイページが古いまま残らないようにする
      void queryClient.invalidateQueries({ queryKey: ["events", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        // 画面を開いた後に満席・締切になった: 最新の状態に合わせる
        void queryClient.invalidateQueries({ queryKey: ["events", "detail", eventId] });
      }
    },
  });
}
```

> registrations feature は events feature を import できないため、キーは配列リテラルで書く。キーの形は `eventKeys` と一致させること(レビューで確認する)。

### 2.4 フォーム

- `shared/` の Zod スキーマ(`createEventSchema` など)でクライアント側も検証する。
- サーバーの `details`(`{ field, message }[]`)は該当フィールドの下に表示する。
- フォームのハンドラ型は `react` から import した `SubmitEvent` を使う。
- 日時は `utils/datetime.ts` の関数だけで変換する(`datetime-local` の値は JST として扱い UTC の ISO 文字列にする)。

```tsx
// ❌ Bad: ブラウザのタイムゾーンに依存した変換。サーバーのエラーを無視
const startsAt = new Date(form.startsAt).toISOString();
```

```tsx
// ✅ Good
import { jstLocalToUtcIso } from "@/utils/datetime";

const input = { ...values, startsAt: jstLocalToUtcIso(values.startsAt) };
const parsed = createEventSchema.safeParse(input);
if (!parsed.success) return setFieldErrors(toFieldErrors(parsed.error));
createEvent.mutate(parsed.data, {
  onError: (error) => {
    if (error instanceof ApiError && error.details) setFieldErrors(error.details);
  },
});
```

### 2.5 スタイリング(Tailwind CSS v4)

- 色・余白などは `styles/index.css` の `@theme` のトークンを使う。JSX に色コードを直書きしない。
- クラスの並びは Prettier の Tailwind プラグインに任せる。
- 改行を含むユーザー入力は `whitespace-pre-wrap` で表示する。
- 一覧はカードのグリッドで、スマートフォン幅では 1 列。

```tsx
// ❌ Bad: 色の直書き、インラインスタイル
<span style={{ color: "#e11d48" }}>満席</span>
```

```tsx
// ✅ Good: トークン(@theme で定義)を使う
<span className="text-danger">満席</span>
<p className="whitespace-pre-wrap">{event.description}</p>
<ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{/* EventCard */}</ul>
```

### 2.6 状態管理

- **サーバー状態は TanStack Query だけ** に置く。`useState` やグローバルストアにコピーしない。
- 一覧の検索条件(`q` / `categoryId` / `tag` / `sort` / `includePast` / `page`)は URL のクエリに持ち、クエリキーにも含める。
- フォームの入力中の値、モーダルの開閉など画面内だけの状態は `useState`。

```tsx
// ❌ Bad: サーバーの値を useState にコピー(更新されても古いまま)
const [event, setEvent] = useState<EventDetail>();
useEffect(() => { fetchEventDetail(eventId).then(setEvent); }, [eventId]);
```

```tsx
// ✅ Good
const { data: event } = useQuery(eventDetailQueryOptions(eventId));
const [searchParams, setSearchParams] = useSearchParams(); // 検索条件は URL に
```

---

## 3. バックエンド規約

### 3.1 ディレクトリ構成

```
backend/src/
├── app.ts  server.ts
├── config/env.ts           # process.env を読むのはここだけ
├── routes/                 # <resource>.routes.ts、index.ts で登録
├── middleware/             # validate, auth(requireAuth), requireRole, rateLimits, errorHandler
├── controllers/            # <resource>.controller.ts
├── services/               # <resource>.service.ts
│   └── policies/event-policy.ts
├── lib/                    # prisma, jwt, password, logger, tag-normalize, event-lock
└── errors/AppError.ts
```

### 3.2 レイヤードアーキテクチャ

リクエストの流れ: **routes → middleware(`validate`, `requireAuth`, `requireRole`)→ controllers → services → Prisma**。

| 層 | 責務 | やってはいけないこと |
|---|---|---|
| routes | URL・メソッドとミドルウェア・コントローラの対応付け | ロジックを書く |
| controllers | `getValidated()` で入力を読み、サービスを呼び、`{ data }` を返す | Prisma を使う、業務ルールを書く、try/catch |
| services | 業務ルール、権限判定(`event-policy`)、Prisma クエリ、トランザクション | `req` / `res`・ステータスコードを扱う |

```ts
// ❌ Bad: コントローラに業務ルールと Prisma、try/catch
export const register: RequestHandler = async (req, res) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
    const count = await prisma.registration.count({ where: { eventId: event!.id } });
    if (count >= event!.capacity) return res.status(409).json({ message: "full" });
    // ...
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
};
```

```ts
// ✅ Good: controllers/registrations.controller.ts(HTTP だけ)
export const register: RequestHandler = async (req, res) => {
  const { eventId } = getValidated(req, "params", eventIdParamSchema);
  const result = await registrations.register(currentUser(req), eventId);
  res.status(201).json({ data: result });
};
```

```ts
// ✅ Good: services/registrations.service.ts(業務ルールはここ。判定順はマニフェスト R1)
/** ログインユーザー自身を参加確定にする。満席なら EVENT_FULL */
export async function register(actor: Actor, eventId: string): Promise<RegisterResult> {
  return prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId); // SELECT ... FOR UPDATE。無い・削除済みは NOT_FOUND
    if (event.organizerId === actor.id) {
      throw new AppError("ORGANIZER_CANNOT_REGISTER", "主催者は自分のイベントに参加登録できません");
    }
    const now = new Date();
    if (now >= event.startsAt || now >= (event.registrationDeadline ?? event.startsAt)) {
      throw new AppError("REGISTRATION_CLOSED", "登録の受付は終了しています");
    }
    // 未登録・未待機の確認、空きの確認、作成 ...
  });
}
```

### 3.3 ルーティング

- 新しいルーターは `routes/index.ts` で登録する。
- 認証が必要なルートには必ず `requireAuth` を付ける(公開は A1・A2・H1 のみ)。admin 専用は続けて `requireRole("ADMIN")`。
- 入力はすべて `validate({ params, query, body })` を通す。

```ts
// ❌ Bad: admin 専用なのに requireRole がない、params を検証していない
router.delete("/events/:eventId/registrations/:registrationId", requireAuth, registrations.forceCancel);
```

```ts
// ✅ Good: routes/registrations.routes.ts
export const registrationsRouter = Router();

registrationsRouter.post(
  "/events/:eventId/registration",
  requireAuth,
  validate({ params: eventIdParamSchema }),
  registrations.register,
);
registrationsRouter.delete(
  "/events/:eventId/registrations/:registrationId",
  requireAuth,
  requireRole("ADMIN"),
  validate({ params: registrationIdParamSchema }),
  registrations.forceCancel,
);
```

### 3.4 権限判定

- イベント単位の権限(主催者 or admin)は `services/policies/event-policy.ts` の関数だけで判定する。各サービスに `if` を個別に書かない。
- 他人のイベントへの編集系操作は 403、論理削除済みは 404。

```ts
// ❌ Bad: サービスごとに判定を書く(admin の考慮漏れが起きる)
if (event.organizerId !== actor.id) throw new AppError("FORBIDDEN", "...");
```

```ts
// ✅ Good: services/policies/event-policy.ts
export type Actor = { id: string; role: UserRole };

/** 主催者本人か admin なら true(マニフェスト 2.5) */
export function canManageEvent(actor: Actor, event: { organizerId: string }): boolean {
  return actor.role === "ADMIN" || event.organizerId === actor.id;
}

export function assertCanManageEvent(actor: Actor, event: { organizerId: string }): void {
  if (!canManageEvent(actor, event)) {
    throw new AppError("FORBIDDEN", "このイベントを操作する権限がありません");
  }
}
```

### 3.5 エラーハンドリング

- 想定内の失敗はサービスで `AppError(code, message, details?)` を投げる。ステータスはコードから決まる(`shared/src/api.ts` の `ERROR_STATUS`)。
- Express 5 は非同期ハンドラの例外をエラーハンドラに渡すので、コントローラに try/catch を書かない。
- 想定外のエラーは `errorHandler` がログに出し、クライアントには汎用の `500 INTERNAL_ERROR` だけを返す(内部情報を漏らさない)。
- Prisma の既知のエラーはサービスで `AppError` に変換する(`P2002` → `ALREADY_REGISTERED` / `CATEGORY_NAME_TAKEN` / `FEEDBACK_ALREADY_EXISTS`、`P2003` → `CATEGORY_IN_USE`)。

```ts
// ❌ Bad: ステータスを直接選ぶ、Prisma のエラーがそのまま 500 になる
res.status(400).json({ msg: "already registered" });
await prisma.registration.create({ data }); // 同時登録で P2002 → 500
```

```ts
// ✅ Good
import { Prisma } from "@prisma/client";

try {
  await tx.registration.create({ data: { eventId, userId: actor.id } });
} catch (error) {
  // 事前チェックをすり抜けた同時登録は一意制約で検出する(二重登録防止の最後の砦)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new AppError("ALREADY_REGISTERED", "既に参加登録またはキャンセル待ちをしています");
  }
  throw error;
}
```

> サービス内の try/catch は「既知のエラーを `AppError` に変換する」場合だけ書く。握りつぶさない。

### 3.6 バリデーション

- スキーマは `shared/src/<resource>.ts` に置き、フロントと共有する。
- パスパラメータの ID も cuid として検証する。
- 日時の前後関係(終了 > 開始、締切 <= 開始)は `superRefine` で検証し、`path` に該当フィールドを入れる。
- 「現在より未来」のようにサーバー時刻が必要な検証はサービスで行う。

```ts
// ❌ Bad: 文字列のまま受け取り、前後関係を検証しない
const body = req.body as { startsAt: string; endsAt: string };
```

```ts
// ✅ Good: shared/src/event.ts
export const eventIdParamSchema = z.object({ eventId: z.cuid() });

export const createEventSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(2000),
    location: z.string().trim().max(100).nullish().transform((v) => v || null),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    capacity: z.int().min(1).max(1000),
    registrationDeadline: z.iso.datetime({ offset: true }).nullish(),
    cancelDeadline: z.iso.datetime({ offset: true }).nullish(),
    categoryId: z.cuid(),
    tags: z.array(z.string()).max(10).default([]),
  })
  .superRefine((v, ctx) => {
    if (new Date(v.endsAt) <= new Date(v.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "終了日時は開始日時より後にしてください" });
    }
    // registrationDeadline / cancelDeadline <= startsAt も同様
  });
```

### 3.7 ログ

- ログは `lib/logger.ts`(JSON Lines)だけを使う。`console.log` は使わない。
- 通知の代わりのログ(繰り上げ・日時変更・削除)は **トランザクションのコミット後** に出す。
- パスワード・トークン・Cookie・リクエストボディをログに出さない。

```ts
// ❌ Bad: トランザクション内でログ(ロールバックされても「繰り上げた」ログが残る)
await prisma.$transaction(async (tx) => {
  await promoteFirstWaiter(tx, eventId);
  logger.info("promoted", { eventId });
});
```

```ts
// ✅ Good
const promotion = await prisma.$transaction(async (tx) => cancelAndPromote(tx, actor, eventId));
if (promotion) {
  logger.info("waitlist promoted", { eventId, promotedUserId: promotion.promotedUserId, trigger: promotion.trigger });
}
```

---

## 4. ORM/データベース規約

### 4.1 スキーマ設計

スキーマの正本はマニフェスト 5.4(`backend/prisma/schema.prisma`)。

- ID は `String @id @default(cuid())`。
- 日時はすべて `@db.Timestamptz(3)`(UTC 保存)。
- 状態カラムは Prisma の `enum`(`UserRole` / `AttendanceStatus` / `PromotionTrigger`)。
- モデル名は単数 PascalCase、テーブルは `@@map` で snake_case 複数形、フィールドは camelCase で `@map` により snake_case 列(既存の `users` の列は camelCase のまま)。
- 履歴を参照する外部キーは `onDelete: Restrict`。カスケードは関連だけの `event_tags` のみ。
- 主な検索経路にインデックスを張る(`@@index([deletedAt, startsAt])` など)。
- CHECK 制約と `lower(name)` の一意インデックスは、`--create-only` で作ったマイグレーション SQL に適用前に追記する。

```prisma
// ❌ Bad: 自動採番 ID、タイムゾーンなし、カスケードで履歴が消える、列名がスキーマと DB で不一致
model Registration {
  id        Int      @id @default(autoincrement())
  eventId   String
  createdAt DateTime @default(now())
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
}
```

```prisma
// ✅ Good
model Registration {
  id         String           @id @default(cuid())
  eventId    String           @map("event_id")
  userId     String           @map("user_id")
  attendance AttendanceStatus @default(UNMARKED)
  createdAt  DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)

  event Event @relation(fields: [eventId], references: [id], onDelete: Restrict)
  user  User  @relation("RegistrationUser", fields: [userId], references: [id], onDelete: Restrict)

  @@unique([eventId, userId])
  @@map("registrations")
}
```

### 4.2 マイグレーション

- スキーマ変更は必ず新しいマイグレーション(`npm run db:migrate`)。適用済みのマイグレーションは編集しない。
- 名前は変更内容が分かる英語の snake_case(`add_waitlist_promotions` など)。

```bash
# ❌ Bad: 適用済みのマイグレーション SQL を直接書き換える
vim backend/prisma/migrations/20261118072202_init/migration.sql
```

```bash
# ✅ Good: CHECK 制約などを足す場合は、適用前のマイグレーションを作ってから追記する
npm run db:migrate -- --create-only --name add_event_tables
# 生成された migration.sql の末尾に CHECK / CREATE UNIQUE INDEX を追記してから
npm run db:migrate
```

### 4.3 クライアント設定

- `PrismaClient` は `lib/prisma.ts` の 1 インスタンスだけを使う(リクエストごとに作らない)。
- ログは開発時 `warn` / `error`、それ以外は `error` のみ(テンプレートの設定のまま)。
- 論理削除済みイベントを除外する条件 `deletedAt: null` を、イベントを読むすべてのクエリに付ける。

```ts
// ❌ Bad: リクエストごとに接続を作る、削除済みを除外し忘れる
const prisma = new PrismaClient();
const event = await prisma.event.findUnique({ where: { id: eventId } });
```

```ts
// ✅ Good
import { prisma } from "../lib/prisma.js";

const event = await prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
if (!event) throw new AppError("NOT_FOUND", "イベントが見つかりません");
```

### 4.4 トランザクション

次の処理は **必ず** `prisma.$transaction(async (tx) => …)` の中で、最初に `lockEvent()`(`SELECT ... FOR UPDATE`)を呼ぶ。

- 参加登録(R1)、本人キャンセル(R2)、強制キャンセル(R4)
- キャンセル待ち登録(W1)・解除(W2)
- 定員変更を含むイベント更新(E4)、イベント削除(E5)

理由: 空き判定・position の採番・繰り上げを、同じイベントへの同時リクエストと直列化するため(マニフェスト 3-6)。トランザクションの中では `prisma` ではなく `tx` を使う。

```ts
// ❌ Bad: 削除と繰り上げが別々(途中で落ちると繰り上げが失われる)、ロックなしで二重に繰り上がる
await prisma.registration.delete({ where: { id: registration.id } });
const next = await prisma.waitlistEntry.findFirst({ where: { eventId }, orderBy: { position: "asc" } });
if (next) await prisma.registration.create({ data: { eventId, userId: next.userId } });
```

```ts
// ✅ Good: lib/event-lock.ts
/** イベント行をロックして返す。無い・論理削除済みなら NOT_FOUND */
export async function lockEvent(tx: Prisma.TransactionClient, eventId: string) {
  // タグ付きテンプレートなので eventId はパラメータとして渡る(SQL インジェクションにならない)
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM events WHERE id = ${eventId} AND deleted_at IS NULL FOR UPDATE`;
  if (rows.length === 0) throw new AppError("NOT_FOUND", "イベントが見つかりません");
  return tx.event.findUniqueOrThrow({ where: { id: eventId } });
}
```

```ts
// ✅ Good: キャンセル + 繰り上げを 1 トランザクションで
return prisma.$transaction(async (tx) => {
  const event = await lockEvent(tx, eventId);
  const registration = await tx.registration.findUnique({
    where: { eventId_userId: { eventId, userId: actor.id } },
  });
  if (!registration) throw new AppError("NOT_FOUND", "参加登録が見つかりません");
  if (new Date() >= (event.cancelDeadline ?? event.startsAt)) {
    throw new AppError("CANCEL_DEADLINE_PASSED", "キャンセル期限を過ぎています");
  }
  await tx.registration.delete({ where: { id: registration.id } });
  return promoteFirstWaiter(tx, event, { trigger: "CANCELLATION", vacatedByUserId: actor.id });
});
```

---

## 5. API設計規約

マニフェスト 6 章が正本。新しいエンドポイントは先にマニフェストに追加してから実装する。

### 5.1 RESTful 命名

- ベースパスは `/api`。リソースは複数形の名詞(`/events`, `/categories`)、パラメータ名は `:eventId` のようにリソース名 + `Id`。
- ログインユーザー自身の 1 件は単数形のサブリソースにし、URL にユーザー ID を入れない(`/events/:eventId/registration`, `/waitlist`, `/feedback`)。
- admin 専用操作も `/admin` 配下にまとめず、通常のリソースに置いて `requireRole` で制御する。
- 状態の部分更新は `PATCH`、値を丸ごと設定するもの(出席状態)は `PUT`。

```text
❌ Bad
POST /api/registerEvent?userId=xxx         # 動詞の URL、他人の ID を指定できる
GET  /api/admin/categories                 # admin 用に別パスを作る
```

```text
✅ Good
POST   /api/events/:eventId/registration                              # R1 自分の参加登録
PUT    /api/events/:eventId/registrations/:registrationId/attendance  # R5 出席マーク
GET    /api/categories?includeInactive=true                           # C1(admin のみ有効)
```

### 5.2 レスポンス形式

- 成功: `{ "data": ... }`。作成は 201、削除・解除は 204(ボディなし)、その他は 200。
- 失敗: `{ "error": { "code", "message", "details"? } }`。`details` は `{ field, message }[]`。
- 一覧のページング: `{ "data": { "items", "total", "page", "limit" } }`。
- 日時は ISO 8601 UTC(`Z` 付き)、JSON のキーは camelCase。

```json
// ❌ Bad: 形式がばらばら、snake_case、ローカル時刻
{ "success": true, "event": { "starts_at": "2026/12/10 19:00" } }
```

```json
// ✅ Good: 成功
{ "data": { "id": "clx...", "title": "React 入門ハンズオン", "startsAt": "2026-12-10T10:00:00.000Z" } }
```

```json
// ✅ Good: 失敗
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid",
    "details": [{ "field": "endsAt", "message": "終了日時は開始日時より後にしてください" }]
  }
}
```

### 5.3 HTTP ステータスコード

| ステータス | 使う場面 | 主なコード |
|---|---|---|
| 200 | 取得・更新の成功 | — |
| 201 | 作成の成功(E3, R1, W1, F2, C2) | — |
| 204 | 削除・解除・ログアウト(E5, R2, R4, W2, C4, A2) | — |
| 400 | 入力形式・範囲・前後関係の不正、開催前の出席マーク | `VALIDATION_ERROR`, `EVENT_NOT_STARTED` |
| 401 | 未ログイン・トークン無効、ログイン失敗 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` |
| 403 | 権限なし、主催者の自己登録、フィードバック条件不足 | `FORBIDDEN`, `ORGANIZER_CANNOT_REGISTER`, `FEEDBACK_NOT_ALLOWED` |
| 404 | 存在しない・論理削除済み・自分の登録なし | `NOT_FOUND`, `ROUTE_NOT_FOUND` |
| 409 | 状態による業務ルール違反 | `ALREADY_REGISTERED`, `EVENT_FULL`, `SEATS_AVAILABLE`, `REGISTRATION_CLOSED`, `CANCEL_DEADLINE_PASSED`, `EVENT_ALREADY_STARTED`, `CAPACITY_BELOW_REGISTERED`, `CATEGORY_IN_USE`, `CATEGORY_NAME_TAKEN`, `FEEDBACK_ALREADY_EXISTS` |
| 429 | ログイン試行回数超過 | `RATE_LIMITED` |
| 500 | 想定外のエラー | `INTERNAL_ERROR` |

- 新しいエラーコードは `shared/src/api.ts` の `ERROR_STATUS` とマニフェストの一覧の両方に追加する。
- 他人の非公開データは 404、公開されているイベントへの権限外の操作は 403。

```ts
// ❌ Bad: 満席を 400、他人のイベント編集を 404 にする(マニフェストと不一致)
throw new AppError("VALIDATION_ERROR", "満席です");
```

```ts
// ✅ Good
throw new AppError("EVENT_FULL", "定員に達しています。キャンセル待ちに登録できます");
assertCanManageEvent(actor, event); // 主催者でも admin でもなければ 403 FORBIDDEN
```

---

## 6. テスト規約

### 6.1 ファイル構成

| 種類 | 場所 | ツール |
|---|---|---|
| バックエンド API テスト | `backend/tests/<resource>.api.test.ts` | Vitest + Supertest、実 DB(`app_test`) |
| 純粋関数のユニットテスト | 対象と同じ場所に `<name>.test.ts`(例: `lib/tag-normalize.test.ts`) | Vitest |
| フロントエンドのコンポーネントテスト | コンポーネントの隣に `<name>.test.tsx` | Vitest + Testing Library、`renderApp()` |
| E2E | `e2e/tests/<scenario>.spec.ts` | Playwright(Chromium) |

### 6.2 命名

- `describe` はエンドポイントか対象(`"POST /api/events/:eventId/registration"`)、`it` は **日本語で「条件 → 期待結果」**。

```ts
// ❌ Bad
it("works", async () => { /* ... */ });
```

```ts
// ✅ Good
describe("DELETE /api/events/:eventId/registration", () => {
  it("キャンセル待ちがいる場合、先頭の待機者が参加確定に繰り上がり履歴が残る", async () => { /* ... */ });
  it("キャンセル期限を過ぎていると 409 CANCEL_DEADLINE_PASSED", async () => { /* ... */ });
});
```

### 6.3 テストパターン

- **AAA(Arrange / Act / Assert)** で書き、各ブロックを空行で区切る。
- バックエンドは Prisma をモックせず、実 DB に対して実行する。各テストの前に `resetDb()` で全テーブルを空にする。
- 時刻はモックせず、イベントの日時を「現在 ± n 時間」で作って過去・未来を表現する。
- 正常系だけでなく、**業務ルールごとに失敗系** を書く(定員・締切・期限・二重登録・主催者・権限・開催前の出席マーク・フィードバック条件)。
- 繰り上げは同時実行のテストを書く(`Promise.all` で同時キャンセル → 定員超過・二重繰り上げが起きないこと)。
- 権限のテストでは「許可される人」と「拒否される人」の両方を確認する(偽陽性を防ぐ)。

```ts
// ❌ Bad: Prisma をモック(トランザクションや一意制約を検証できない)、失敗系がない
vi.mock("../src/lib/prisma.js");
it("registers", async () => {
  const res = await agent.post(`/api/events/${id}/registration`);
  expect(res.status).toBe(201);
});
```

```ts
// ✅ Good
it("同時に 2 人がキャンセルしても、待機者はそれぞれ 1 回だけ繰り上がる", async () => {
  // Arrange: 定員 2 が満席、待機 2 名
  const event = await createEvent({ capacity: 2, startsAt: hoursFromNow(48) });
  const [alice, bob] = await registerUsers(event.id, ["alice", "bob"]);
  await joinWaitlist(event.id, ["carol", "dave"]);

  // Act
  await Promise.all([
    alice.delete(`/api/events/${event.id}/registration`).expect(204),
    bob.delete(`/api/events/${event.id}/registration`).expect(204),
  ]);

  // Assert
  const registrations = await prisma.registration.findMany({ where: { eventId: event.id } });
  expect(registrations).toHaveLength(2);
  expect(await prisma.waitlistEntry.count({ where: { eventId: event.id } })).toBe(0);
  expect(await prisma.waitlistPromotion.count({ where: { eventId: event.id } })).toBe(2);
});
```

### 6.4 E2E

- 要素は `data-testid` で取得する(文言の変更でテストが壊れないように)。待機は Playwright の自動待機に任せ、`waitForTimeout` を使わない。
- 複数ユーザーのシナリオ(満席 → 待機 → キャンセルで繰り上げ)はブラウザコンテキストを分ける。

```ts
// ❌ Bad
await page.click("text=参加登録");
await page.waitForTimeout(2000);
```

```ts
// ✅ Good
await page.getByTestId("registration-button").click();
await expect(page.getByTestId("my-status")).toHaveText("参加確定");
```

---

## 7. Git規約

### 7.1 ブランチ

- `main` に直接コミットする(マニフェスト 9.7)。作業単位を小さく保ち、1 コミット 1 目的にする。
- コミット前に `npm run typecheck && npm run lint && npm test` を通す。

### 7.2 コミットメッセージ

Conventional Commits。`type(scope): subject` の 1 行目は英語の命令形で 72 文字以内、本文は必要なら日本語で「なぜ」を書く。

| type | 用途 |
|---|---|
| `feat` | 機能追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみ |
| `test` | テストの追加・修正 |
| `refactor` | 振る舞いを変えない変更 |
| `chore` | 設定・依存関係・ビルドなど |

scope はリソースか領域(`events`, `registrations`, `waitlist`, `feedbacks`, `categories`, `auth`, `db`, `docker`, `ci`)。

```bash
# ❌ Bad
git commit -m "修正"
git commit -m "update files"
```

```bash
# ✅ Good
git commit -m "feat(registrations): promote first waitlisted user on cancel

キャンセルと繰り上げを 1 トランザクションで行い、イベント行をロックして二重繰り上げを防ぐ。"
git commit -m "fix(events): reject capacity below registered count"
```

- AI が生成したコードをレビューで直した場合は、その修正を別コミット(`fix:` / `refactor:`)にして、目視レビューの履歴が残るようにする。

---

## 8. 環境変数管理

### 8.1 ファイル

| ファイル | コミット | 内容 |
|---|---|---|
| `backend/.env` | しない | ローカル実行用の実際の値 |
| `backend/.env.example` | する | 変数の一覧と説明、ダミー値 |
| `backend/.env.test` | する | テスト用(秘密情報なし、`app_test` を使う) |
| `docker-compose.yml` の `environment` | する | 開発用の値のみ。本物の秘密情報は置かない |

### 8.2 変数一覧(マニフェスト 9.4)

| 変数 | 設定先 | 説明 |
|---|---|---|
| `DATABASE_URL` | backend | PostgreSQL の接続先 |
| `JWT_SECRET` | backend | JWT の署名鍵(32 文字以上) |
| `PORT` | backend | API のポート(既定 3000) |
| `NODE_ENV` | backend | `development` / `test` / `production` |
| `CORS_ORIGIN` | backend | ブラウザから API を呼べるオリジン |
| `TZ` | backend コンテナ | `UTC` |
| `API_PROXY_TARGET` | frontend(Vite 設定) | `/api` のプロキシ先 |

### 8.3 読み込み

- バックエンドは `config/env.ts` だけが `process.env` を読み、Zod で検証した `env` を export する。不正な値なら起動時に終了する。
- 変数名は UPPER_SNAKE_CASE。新しい変数は `env.ts`・`.env.example`・マニフェスト 9.4 に同時に追加する。
- フロントエンドのコードに秘密情報を置かない(ブラウザに配信されるため)。

```ts
// ❌ Bad: サービスで直接 process.env を読む(未設定でも気づかない)
const secret = process.env.JWT_SECRET ?? "secret";
```

```ts
// ✅ Good
import { env } from "../config/env.js";

jwt.sign({ role }, env.JWT_SECRET, { subject: userId, algorithm: "HS256", expiresIn: TOKEN_TTL_SECONDS });
```

---

## 9. セキュリティガイドライン

### 9.1 認証

- JWT は httpOnly Cookie(`token`, `SameSite=Lax`, 本番は `Secure`)に保持する。`localStorage` に保存しない。
- 署名・検証のアルゴリズムは HS256 に固定する(`alg: none` の偽造トークンを拒否するため)。有効期限は 7 日。
- パスワードは bcrypt(12 ラウンド)。72 バイトを超える入力は拒否する。
- ログイン失敗はメール不存在とパスワード誤りを区別せず、存在しないメールでもダミーハッシュと照合する。ログインは IP 単位でレート制限する。

```ts
// ❌ Bad: トークンを JS から読める場所に置く
localStorage.setItem("token", token);
```

```ts
// ✅ Good: サーバーが httpOnly Cookie に設定する(フロントはトークンに触れない)
res.cookie("token", token, {
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  maxAge: TOKEN_TTL_SECONDS * 1000,
});
```

### 9.2 認可

- 公開ルート(A1・A2・H1)以外はすべて `requireAuth`。`requireAuth` は DB から現在のロールを読む。
- admin 専用(R4・F4・C2〜C4)は `requireRole("ADMIN")`。
- イベント単位の権限は `event-policy.ts` を必ず通す。
- 本人データは常にログインユーザーの ID で検索する(URL やボディの ID を信用しない)。
- 子リソースの ID(`registrationId` など)は、親(`eventId`)に属することを確認する。
- フロントのボタン制御は UX のためだけ。サーバーで必ず再判定する。

```ts
// ❌ Bad: registrationId だけで検索(別イベントの登録を操作できてしまう)
await tx.registration.update({ where: { id: registrationId }, data: { attendance: status } });
```

```ts
// ✅ Good
const registration = await tx.registration.findFirst({ where: { id: registrationId, eventId } });
if (!registration) throw new AppError("NOT_FOUND", "参加登録が見つかりません");
```

### 9.3 入力検証とマスアサインメント

- 全入力を Zod で検証し、スキーマに無いキーは捨てる(Zod の既定動作)。
- `organizerId`・`userId`・`role`・`isHidden` などの権限に関わる値をボディから受け取らない。

```ts
// ❌ Bad: ボディをそのまま保存(organizerId を他人にできる)
await prisma.event.create({ data: req.body });
```

```ts
// ✅ Good
const input = getValidated(req, "body", createEventSchema);
await events.createEvent(currentUser(req), input); // organizerId はサービスが actor.id を入れる
```

### 9.4 インジェクション・XSS

- SQL は Prisma のクエリビルダか `$queryRaw` のタグ付きテンプレートだけ。`$queryRawUnsafe` と文字列連結は使わない。
- React の自動エスケープに任せ、`dangerouslySetInnerHTML` を使わない。

```ts
// ❌ Bad
await prisma.$queryRawUnsafe(`SELECT id FROM events WHERE id = '${eventId}' FOR UPDATE`);
```

```ts
// ✅ Good
await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`;
```

### 9.5 CORS・ヘッダー

- CORS は `CORS_ORIGIN` のオリジンだけを許可し、`credentials: true` にする。`*` を使わない。
- `helmet` でセキュリティヘッダーを付ける。

### 9.6 秘密情報とログ

- `.env` と秘密情報をコミットしない。
- パスワード・トークン・Cookie・リクエストボディをログに出さない。ログに出すのは ID(`eventId`, `userId`)と件数まで。
- 想定外のエラーの詳細はサーバーログだけに出し、レスポンスには出さない。
- ユーザーの返却は `toUser()` を通す(`passwordHash` を漏らさない)。

```ts
// ❌ Bad
logger.info("login", { body: req.body });
res.json({ data: user }); // passwordHash を含む
```

```ts
// ✅ Good
logger.info("login succeeded", { userId: user.id });
res.json({ data: toUser(user) });
```

---

## 10. コードレビューチェックリスト

### 全般
- [ ] `npm run typecheck && npm run lint && npm test` が通る
- [ ] `any` がない。外部入力は Zod で検証している
- [ ] 命名規則(1.4)とファイル名(kebab-case / `<resource>.<layer>.ts`)に従っている
- [ ] コメントは日本語で「なぜ」を書いている
- [ ] マニフェストと食い違う仕様を実装していない(食い違うならマニフェストを先に更新した)

### フロントエンド
- [ ] feature が他の feature・`app/` を import していない
- [ ] データ表示に 読み込み中・エラー・空 の 3 状態がある
- [ ] ボタンの出し分けは `permissions` / `myStatus` に従い、フロントで権限・日時を再計算していない
- [ ] サーバー状態を `useState` にコピーしていない。クエリキーは feature のキーファクトリと一致している
- [ ] 参加系の操作で楽観的更新をしていない。成功後に関連キー(詳細・一覧・マイページ)を更新している
- [ ] 409 を受けたらメッセージを出して詳細を再取得している
- [ ] フォームは共有スキーマで検証し、サーバーの `details` を欄に表示している
- [ ] 日時変換は `utils/datetime.ts` だけで行い、表示は JST
- [ ] 色を直書きしていない。`dangerouslySetInnerHTML` を使っていない

### バックエンド
- [ ] routes / controllers / services の責務を守っている(コントローラに Prisma・業務ルール・try/catch がない)
- [ ] 公開ルート以外に `requireAuth`、admin 専用に `requireRole("ADMIN")` がある
- [ ] イベント単位の権限は `event-policy.ts` を通している
- [ ] 全入力(params / query / body)に `validate()` がある
- [ ] 想定内の失敗は `AppError` で、コードがマニフェストのエラー一覧と一致している
- [ ] Prisma の既知エラー(`P2002` / `P2003`)を `AppError` に変換している
- [ ] 通知の代わりのログはコミット後に出している。ログに秘密情報・ボディがない

### データベース
- [ ] イベントを読むクエリに `deletedAt: null` がある
- [ ] 登録・キャンセル・待機・定員変更・削除はトランザクション内で `lockEvent()` を最初に呼んでいる
- [ ] トランザクション内で `prisma` ではなく `tx` を使っている
- [ ] スキーマ変更は新しいマイグレーションで、適用済みのマイグレーションを編集していない
- [ ] 新しい列・テーブルは命名(snake_case `@map`)、`Timestamptz(3)`、`onDelete: Restrict` に従っている

### API
- [ ] パス・メソッド・ステータスコードがマニフェスト 6 章と一致している
- [ ] 成功は `{ data }`、失敗は `{ error: { code, message, details? } }`
- [ ] 本人データの URL にユーザー ID がない。子リソースの ID が親に属するか確認している
- [ ] 権限に関わる値をボディから受け取っていない

### テスト
- [ ] 業務ルールごとに失敗系のテストがある(定員・締切・期限・二重登録・主催者・開催前の出席マーク・フィードバック条件)
- [ ] 権限テストで「許可される人」と「拒否される人」の両方を確認している
- [ ] 繰り上げの同時実行テストがある
- [ ] Prisma をモックしていない。時刻は「現在 ± n 時間」のデータで表現している
- [ ] テスト名は日本語で「条件 → 期待結果」

### セキュリティ
- [ ] トークンを `localStorage` に置いていない。Cookie は httpOnly / SameSite=Lax
- [ ] `$queryRawUnsafe`・文字列連結の SQL がない
- [ ] `passwordHash` がレスポンスに出ない(`toUser()` を通している)
- [ ] `.env` や秘密情報がコミットに含まれていない
