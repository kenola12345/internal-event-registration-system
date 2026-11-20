# アプリケーション設計書（MANIFEST）

> ステータス: 確定版 v1.0(2026-11-20)
> 根拠: `docs/詳細要求リスト.md`。仕様の正本はこのファイル。実装はこのマニフェストに沿って行い、仕様変更は先に本書(と詳細要求リスト)を更新してからコードを変更する。

## 1. プロジェクト概要

- **名称**: 社内イベント参加登録システム(拡張版)
- **目的**: 社内の勉強会・懇親会・講演会・研修などを社員が主催・告知し、他の社員がオンラインで参加登録できる社内イベント運営プラットフォームを提供する。
- **背景**: 社内イベントの告知・参加受付・出欠確認・振り返りがばらばらに行われ、定員管理やキャンセル待ちの繰り上げ、出席状況の把握が主催者の手作業になっている。本システムはそれを 1 か所にまとめる。あわせて、AI駆動開発研修後のメンタリング演習として、要件定義 → マニフェスト → DB設計 → 実装 → 動作確認 の流れを実践する題材でもある。
- **対象ユーザー**:
  - 一般社員(`MEMBER`): イベントを探して参加登録し、参加履歴と出席率を振り返り、フィードバックを投稿する。イベントを作成するとそのイベントの主催者になる。
  - 運営担当(`ADMIN`): 全イベントを管理し、不適切なイベント・レビューに対処し、カテゴリマスタを管理する。
- **スコープ(今回作るもの)**:
  - メール + パスワードのログイン(ユーザーは seed で作成)→ 3-1
  - イベントの一覧・検索・詳細・作成・編集・論理削除、マイイベント → 3-2
  - 定員・締切・キャンセル期限つきの参加登録・キャンセル → 3-3
  - カテゴリ(マスタ管理)とタグ(多対多)→ 3-4
  - 開催後の出席マークと、マイページの参加統計 → 3-5
  - キャンセル待ちと自動繰り上げ(Should)→ 3-6
  - 星評価 + コメントのフィードバックと非公開化(Should)→ 3-7
  - 通知の代わりのログ出力 → 3-8
- **スコープ外**: 通知の実送信、ユーザー登録・招待、イベントの復元、リアルタイム反映など(10 章)。
- **提供価値**: 主催者は定員・待機・出席を手作業なしで管理でき、参加者は空き状況と自分の参加履歴・出席率をいつでも確認でき、admin は全イベントとカテゴリを統制できる。

## 2. ユーザーロール定義（RBAC）

### 2.1 ロール

| ロール | 値 | 役割 |
| --- | --- | --- |
| member | `MEMBER` | 全社員のデフォルト。イベントを探して参加登録し、フィードバックを投稿する。イベントを作成すると、そのイベントの主催者になる |
| admin | `ADMIN` | 全イベント・全ユーザーを操作できる。カテゴリマスタの管理、不適切レビューの非公開化、他人の参加の強制キャンセルを担当する |

- 「主催者」は独立したロールではない。`events.organizer_id` がログインユーザーと一致するイベントに対してのみ主催者権限を持つ。admin が自分で作成したイベントにも主催者ルール(自分のイベントには参加登録できない等)が適用される。
- テンプレートのロール `USER` は `MEMBER` にリネームする。
- JWT のペイロードは `sub`(ユーザーID)と `role`(仕様上の要件)。ただし認可にはリクエストごとに DB から読み込んだ現在のロールを使う。

### 2.2 権限マトリクス(主要操作)

| 操作 | member(参加者) | member(主催者) | admin |
| --- | --- | --- | --- |
| ログイン・一覧/詳細閲覧・イベント作成 | ○ | ○ | ○ |
| イベント編集・削除 | ✕ | ○(自分の) | ○(全て) |
| 参加者一覧(出席状況・待機リスト込み) | ✕(氏名のみ) | ○(自分の) | ○ |
| 参加登録・キャンセル・キャンセル待ち | ○ | ✕(自分主催) | ○(自分主催以外) |
| 他人の参加の強制キャンセル(期限後も可) | ✕ | ✕ | ○ |
| 出席マーク | ✕ | ○(自分主催のみ) | ○ |
| フィードバック投稿(条件充足時) | ○ | ✕(自分主催) | ○ |
| 匿名レビューの投稿者・非公開レビューの閲覧(本人の投稿を除く) | ✕ | ✕ | ○ |
| カテゴリマスタ管理・レビュー非公開化 | ✕ | ✕ | ○ |

### 2.3 API アクセスマトリクス(全エンドポイント)

ID は 6 章のエンドポイント一覧と対応する。「本人」= ログインユーザー自身のデータのみ。

| ID | エンドポイント | 未ログイン | member(参加者) | member(主催者) | admin |
| --- | --- | --- | --- | --- | --- |
| A1 | `POST /api/auth/login` | ✅ | ✅ | ✅ | ✅ |
| A2 | `POST /api/auth/logout` | ✅ | ✅ | ✅ | ✅ |
| A3 | `GET /api/auth/me` | ❌ | ✅ | ✅ | ✅ |
| E1 | `GET /api/events` | ❌ | ✅ | ✅ | ✅ |
| E2 | `GET /api/events/:eventId` | ❌ | ✅ | ✅ | ✅ |
| E3 | `POST /api/events` | ❌ | ✅(作成者が主催者になる) | ✅ | ✅ |
| E4 | `PATCH /api/events/:eventId` | ❌ | ❌(403) | ✅(自分のイベント) | ✅ |
| E5 | `DELETE /api/events/:eventId` | ❌ | ❌(403) | ✅(自分のイベント) | ✅ |
| R1 | `POST /api/events/:eventId/registration` | ❌ | ✅(本人) | ❌(自分主催は 403) | ✅(本人・自分主催以外) |
| R2 | `DELETE /api/events/:eventId/registration` | ❌ | ✅(本人・期限前) | — (登録なし → 404) | ✅(本人・期限前) |
| R3 | `GET /api/events/:eventId/registrations` | ❌ | ❌(403) | ✅(自分のイベント) | ✅ |
| R4 | `DELETE /api/events/:eventId/registrations/:registrationId` | ❌ | ❌(403) | ❌(403) | ✅(期限無視) |
| R5 | `PUT /api/events/:eventId/registrations/:registrationId/attendance` | ❌ | ❌(403) | ✅(自分のイベント・開催開始後) | ✅(開催開始後) |
| W1 | `POST /api/events/:eventId/waitlist` | ❌ | ✅(本人・満席時) | ❌(自分主催は 403) | ✅(本人・自分主催以外) |
| W2 | `DELETE /api/events/:eventId/waitlist` | ❌ | ✅(本人) | — (待機なし → 404) | ✅(本人) |
| F1 | `GET /api/events/:eventId/feedbacks` | ❌ | ✅(公開分 + 本人分) | ✅(公開分) | ✅(非公開・匿名投稿者を含む全件) |
| F2 | `POST /api/events/:eventId/feedback` | ❌ | ✅(本人・投稿条件充足時) | ❌(403) | ✅(本人・投稿条件充足時) |
| F3 | `PATCH /api/events/:eventId/feedback` | ❌ | ✅(本人の投稿・出席のまま) | — (投稿なし → 404) | ✅(本人の投稿・出席のまま) |
| F4 | `PATCH /api/feedbacks/:feedbackId/visibility` | ❌ | ❌(403) | ❌(403) | ✅ |
| C1 | `GET /api/categories` | ❌ | ✅(有効のみ) | ✅(有効のみ) | ✅(`includeInactive` で無効・使用件数も) |
| C2 | `POST /api/categories` | ❌ | ❌(403) | ❌(403) | ✅ |
| C3 | `PATCH /api/categories/:categoryId` | ❌ | ❌(403) | ❌(403) | ✅ |
| C4 | `DELETE /api/categories/:categoryId` | ❌ | ❌(403) | ❌(403) | ✅(未使用時のみ) |
| T1 | `GET /api/tags` | ❌ | ✅ | ✅ | ✅ |
| M1 | `GET /api/me/events` | ❌ | ✅(本人) | ✅(本人) | ✅(本人) |
| M2 | `GET /api/me/stats` | ❌ | ✅(本人) | ✅(本人) | ✅(本人) |
| H1 | `GET /api/health` | ✅ | ✅ | ✅ | ✅ |

未ログインの ❌ はすべて `401 UNAUTHENTICATED`。

### 2.4 ページアクセス(概要)

| ページ | 未ログイン | `MEMBER` | `ADMIN` |
| --- | --- | --- | --- |
| P-01 ログイン | ✅ | ログイン済みは P-02 へ | ログイン済みは P-02 へ |
| P-02 一覧 / P-03 詳細 / P-04 作成 / P-08 マイページ | P-01 へ | ✅ | ✅ |
| P-05 編集 / P-06 出席管理 | P-01 へ | 主催者のみ(それ以外は P-10) | ✅ |
| P-07 フィードバック | P-01 へ | 投稿条件を満たす人のみ | 投稿条件を満たす場合のみ |
| P-09 カテゴリ管理 | P-01 へ | P-10 | ✅ |
| P-10 権限エラー / P-11 404 | — | ✅ | ✅ |

### 2.5 認可の実装方針
- 未ログインで呼べる API は A1・A2・H1 のみ。他の全ルートに `requireAuth` を付ける。
- `requireAuth` は JWT を検証したうえで DB からユーザーを読み込み、現在のロールを使う(ロール変更を即時反映し、存在しないユーザーのトークンは拒否する)。
- admin 専用ルート(R4・F4・C2〜C4)はルート定義に `requireRole("ADMIN")` を付ける。
- イベント単位の権限(主催者 or admin)は `backend/src/services/policies/event-policy.ts` に集約し、E4・E5・R3・R5 のサービスは必ずこれを通す。
- 他人のイベントへの編集系操作は 403(イベントは全員に公開されているため 404 にしない)。論理削除済みイベントは誰に対しても 404。
- 本人データ(R1・R2・W1・W2・F2・F3・M1・M2)は URL にユーザー ID を含めず、常にログインユーザーを対象にする。

## 3. 機能要件

各機能の「関連」は、画面(4 章の P-xx / M-xx)、API(6 章の ID)、テーブル(5 章)を示す。

### 3-1. 認証(Must)
- **概要**: メールアドレス + パスワードでログインし、JWT でセッションを管理する。ログアウトとログイン状態の確認ができる。ユーザーは seed で作成し、サインアップ API・画面は作らない。
- **ルール**
  - JWT は httpOnly Cookie(`token`, `SameSite=Lax`, 本番は `Secure`)に保持する。ペイロードは `sub` と `role`、署名は HS256 に固定、有効期限は 7 日の単一トークン(リフレッシュトークンなし)。
  - パスワードは bcrypt(12 ラウンド)でハッシュ化して保存する。平文保存は禁止。
  - ログイン失敗時は、メール不存在とパスワード誤りを区別しないメッセージを返し、存在しないメールでもダミーハッシュと照合して応答時間を揃える。ログインは IP 単位でレート制限する。
  - ログアウトは Cookie を削除する(未ログインでも 204)。
  - 未ログイン・トークン期限切れ(401)で保護ページを開いた場合は `/login` に遷移し、ログイン後に元のページへ戻す。
- **関連**: P-01、ヘッダー / A1・A2・A3 / `users`

### 3-2. イベント基本機能(Must)
- **概要**: イベントの一覧(検索・絞り込み・ソート・ページング)、詳細、作成、編集、削除、マイイベント一覧。全 member が作成でき、作成者が主催者になる。編集・削除は主催者本人と admin のみ。
- **ルール**
  - 一覧: キーワード(タイトル・説明文の部分一致、大文字小文字無視)、カテゴリ、タグ(正規化後の完全一致)、開催日順ソート(`startsAt_asc` / `startsAt_desc`)。既定は開催前のみ・開催日昇順で、`includePast` で開催済みも含める。存在しない `categoryId` は 0 件を返す。論理削除済みは常に除外。
  - 作成: 開始日時は現在より未来(過去日時は作成不可)、終了は開始より後、定員 1〜1000、登録締切は設定する場合は現在より未来かつ開始以前、キャンセル期限は設定する場合は開始以前(過去日時も可)。カテゴリは有効なもののみ。`organizerId` はボディから受け取らない。
  - 編集: 日時を変更する場合、新しい開始日時は未来。開催開始後は日時・定員・締切・期限を変更できない(タイトル・説明・場所・カテゴリ・タグは可)。現在のカテゴリが無効化済みでも、変更しなければそのまま保存できる。
  - 参加確定者がいる状態で日時を変更した場合: 保存前に確認ダイアログを出し、保存時に `schedule_changed_at` を記録し、警告ログ(コミット後)とレスポンスの `SCHEDULE_CHANGED_WITH_PARTICIPANTS` 警告を返す。参加確定者には詳細画面でバナーを表示する。
  - 定員: 参加確定者数未満には変更できない。増やした場合は待機者を繰り上げ、`WAITLIST_PROMOTED` 警告を返す(3-6)。
  - 削除: 論理削除(`deleted_at`)。開催前・開催中・開催済みのいずれでも削除できる。削除済みは一覧・詳細・マイページ・集計から除外し、どの API からも 404。参加者・待機者がいれば件数をログ出力する。復元 API は作らない。理由: 参加・繰り上げ・フィードバックの履歴を残し、誤削除を DB から復旧できるようにするため。
  - マイイベント: 主催予定・主催済み・参加予定・キャンセル待ち(順位)・参加履歴(出席状態・フィードバック有無)を表示する。
- **関連**: P-02・P-03・P-04・P-05・P-08、M-02・M-03 / E1〜E5・M1・C1・T1 / `events`・`categories`・`tags`・`event_tags`

### 3-3. 参加登録・キャンセル(Must)
- **概要**: 参加登録・キャンセルと、登録者数・空き数(`max(capacity - 参加確定者数, 0)`)の表示。admin は他人の参加を期限後も強制キャンセルできる。
- **ルール**
  - 登録できるのは、主催者でなく、開催開始前かつ登録締切前で、未登録・未待機で、空きがある場合のみ(判定はこの順。違反はそれぞれ `403 ORGANIZER_CANNOT_REGISTER` / `409 REGISTRATION_CLOSED` / `409 ALREADY_REGISTERED` / `409 EVENT_FULL`)。
  - 登録締切の実効値は `registration_deadline ?? starts_at`、キャンセル期限の実効値は `cancel_deadline ?? starts_at`。判定はサーバー時刻のみ。
  - 二重登録はアプリの判定と DB 一意制約の両方で防ぐ。
  - 主催者は自分のイベントに参加登録・キャンセル待ちできず、定員・登録者数・出席率にも含めない。理由: 定員の意味を一定にし、出席・フィードバック・集計での除外分岐をなくすため。
  - 本人のキャンセルはキャンセル期限前のみ(`409 CANCEL_DEADLINE_PASSED`)、確認ダイアログを出す。admin の強制キャンセルは期限を無視する。
  - キャンセルは参加確定行を物理削除する(キャンセルは参加履歴ではないため)。再登録は可能。
  - 開催前のキャンセル・強制キャンセルでは、同じトランザクションで先頭の待機者を繰り上げる(3-6)。
- **関連**: P-03・P-06、M-01・M-04 / R1・R2・R4・E2 / `registrations`・`waitlist_entries`・`waitlist_promotions`

### 3-4. カテゴリ・タグ(Must)
- **概要**: 各イベントは必ず 1 つのカテゴリと 0〜10 個のタグを持つ。admin はカテゴリを追加・編集・無効化・削除できる。一覧画面でカテゴリ絞り込みとタグ検索(オートコンプリート + カード上のタグクリック)ができる。
- **ルール**
  - 初期カテゴリは 勉強会 / 懇親会 / 講演会 / 研修 / その他。
  - カテゴリ名は 1〜30 文字で一意(大文字小文字違いも重複扱い。`409 CATEGORY_NAME_TAKEN`)。
  - イベント(論理削除済み含む)が紐づくカテゴリは削除できない(`409 CATEGORY_IN_USE`)。未使用なら物理削除。使用中は `isActive: false` で無効化し、新規選択肢と絞り込み候補から消す(既存イベントの表示には残す)。理由: 自動移動は意図しない分類変更と過去集計の書き換えになり、論理削除のみでは誤登録カテゴリが残り続けるため。
  - カテゴリ一覧の `includeInactive=true` は admin のみ有効で、無効カテゴリと使用件数(`eventCount`)を含める。admin 以外の指定は無視する。
  - タグは `trim` → NFKC → 英字小文字化 → 連続空白を 1 つ、の順で正規化。1〜20 文字。重複はまとめる。未登録タグは保存時に作成し、使われなくなっても削除しない。検索は正規化後の完全一致、候補は前方一致で使用件数の多い順。
- **関連**: P-02・P-04・P-05・P-09、M-05・M-06 / C1〜C4・T1・E1・E3・E4 / `categories`・`tags`・`event_tags`

### 3-5. 出席管理(Must)
- **概要**: 主催者と admin は参加確定者を `PRESENT`(出席)/ `ABSENT`(欠席)/ `UNMARKED`(未マーク)にマークする。出席管理画面に出席状態と集計を表示し、マイページに累計参加数・出席率・カテゴリ別参加傾向を表示する。
- **ルール**
  - 出席マークは開催開始日時以降のみ(それ以前は `400 EVENT_NOT_STARTED`)。マーク後も相互に変更でき、未マークにも戻せる。マークした日時と人を記録する。
  - 出席率 = 出席 ÷ (出席 + 欠席)。未マークは分母から除外。分母 0 なら `null`(画面は「-」)。
  - 累計参加数 = 開催開始済み・未削除のイベントのうち、参加確定で `ABSENT` 以外(`PRESENT` + `UNMARKED`)の件数。
  - カテゴリ別参加傾向 = 累計参加数と同じ母集団のカテゴリ別件数(無効化カテゴリも含む)。マイページでは数値と Tailwind の横棒で表示する。
- **関連**: P-06・P-08 / R3・R5・M2 / `registrations`

### 3-6. キャンセル待ち + 自動繰り上げ(Should)
- **概要**: 満席時は参加ボタンが「キャンセル待ちに登録」に切り替わる。待機順位を表示し、いつでも待機解除できる。参加確定者のキャンセル・admin の強制キャンセル・定員増加のときに先頭の待機者を自動で繰り上げ、繰り上げ履歴を保存する。
- **ルール**
  - キャンセル待ちは満席時のみ(空きがあれば `409 SEATS_AVAILABLE`)、かつ登録締切前・開催開始前のみ登録できる。
  - position は `現在の待機行の最大 position + 1` で採番し、解除・繰り上げ時に振り直さない。表示順位は API が position 昇順で計算する。解除して再登録すると最後尾。理由: 詰め直し方式は多数行の更新と一意制約の衝突が起きるため。
  - 参加登録・キャンセル・強制キャンセル・待機登録・待機解除・定員変更・イベント削除は、トランザクション内で最初に `SELECT ... FOR UPDATE` でイベント行をロックし、イベント単位で直列化する。一意制約違反(`P2002`)は `409 ALREADY_REGISTERED`。
  - キャンセル時は 1 トランザクションで、参加確定行の削除 → 先頭待機者の昇格 → 待機行の削除 → 繰り上げ履歴の記録 を行う。
  - 繰り上げは開催開始前なら登録締切後でも行い、開催開始後は行わない。
  - 定員を増やしたら増えた枠の分だけ繰り上げる。
  - 繰り上げ履歴は追記のみ(イベント、繰り上がった人、空きを作った人(定員増加時は NULL)、きっかけ、当時の position、日時)。
- **関連**: P-03・P-06・P-08 / W1・W2・R2・R4・E4 / `waitlist_entries`・`waitlist_promotions`・`registrations`

### 3-7. フィードバック(Should)
- **概要**: 1〜5 の星評価 + 一言コメント(1〜200 文字)+ 匿名フラグで投稿・編集できる。詳細画面に平均評価(小数第 1 位、0 件なら `null`)と件数、レビュー一覧を表示する。admin は非公開化・再公開できる。
- **ルール**
  - 投稿できるのは、イベント未削除・開催終了済み(`now >= ends_at`)・自分の参加が `PRESENT`・主催者でない・未投稿、のすべてを満たす場合のみ(`403 FEEDBACK_NOT_ALLOWED` / `409 FEEDBACK_ALREADY_EXISTS`)。
  - 1 イベント 1 人 1 件。編集は本人のみで、編集時も `PRESENT` を再確認する。出席が後から変わっても既存レビューは削除しない。
  - 匿名投稿の投稿者は一般ユーザーには非表示、admin には表示する(`user_id` は保存する)。
  - 非公開レビューは平均・件数と一般ユーザーの一覧から除外する。本人には「非公開」状態で、admin には「非公開」ラベル付きで見える。本人が編集しても非公開のまま(admin の判断を投稿者が解除できないようにするため)。
- **関連**: P-03・P-07・P-08 / F1〜F4・E2 / `feedbacks`

### 3-8. 通知(ログ出力)
- **概要**: 通知の実送信は行わず、既存の JSON Lines ロガー(`lib/logger.ts`)へのログ出力で代替する。
- **ルール**
  - 対象は、繰り上げ、参加者がいる状態での日時変更、参加者・待機者がいるイベントの削除。admin の強制キャンセルそのものはログ出力しない(それに伴う繰り上げのみ)。
  - ログ出力はトランザクションのコミット後に行う(ロールバックされた処理のログは出さない)。
  - 将来の通知用の記録は、繰り上げ履歴(`waitlist_promotions`)のみ残す。
  - アプリ内通知は、日時変更時に参加確定者向けのバナーを詳細画面に表示するのみ。
- **関連**: P-03 / R2・R4・E4・E5 / `waitlist_promotions`・`events.schedule_changed_at`

### 3-9. 非機能
- 全入力(パス・クエリパラメータ含む)を `shared/` の Zod スキーマで検証し、フロントのフォームでも同じスキーマを使い、サーバーの `details` を該当欄に表示する。
- 想定外のリクエストで 500 を返さない(バリデーション・存在チェック・一意制約違反をそれぞれ 4xx に変換する)。
- SQL は Prisma のクエリビルダか `$queryRaw` タグ付きテンプレートのみ。`dangerouslySetInnerHTML` は使わず、説明文の改行は `white-space: pre-wrap`。
- パスワード・トークン・Cookie・リクエストボディをログに出さない。
- 日時は DB で UTC 保存(`timestamptz`)、API は ISO 8601 UTC(`Z` 付き)、画面は JST(`Asia/Tokyo`)。
- すべての一覧に読み込み中・エラー・空の状態を用意する。

## 4. 画面遷移・構成

画面は個別ページで構成し、取り消せない操作の確認とカテゴリの追加・編集だけをモーダルにする。ページ・モーダルの一覧は 4.1・4.2 を参照。

**主要な遷移(概略)**: ログイン → 一覧 → 詳細 →(参加登録 / キャンセル待ち / キャンセル)、詳細 → 編集 / 出席管理 / フィードバック、ヘッダー → マイページ / カテゴリ管理(admin)。

**決定済みの UI 方針**
- 参加ボタンは 1 つのボタンを状態で切り替える: 主催者(ボタンなし)/ 受付終了 / 参加登録 / キャンセル待ちに登録 / キャンセル / キャンセル期限切れ / 待機中(順位表示 + 待機解除)。
- 参加のキャンセル、参加確定者がいる状態での日時変更の保存前には確認ダイアログを出す。日時変更の警告は保存後にトーストでも知らせる。
- ボタンの表示制御は API の `permissions` に従い、フロントで権限ロジックを再実装しない。
- 権限のないページに直接アクセスした場合は「権限がありません」画面。admin 専用ルートはルートガードでも弾く。
- 409 系エラーを受けたらメッセージを表示し、詳細を再取得する。
- 一覧カードの表示項目: タイトル・カテゴリ・タグ・開催日時・主催者名・定員・登録者数・空き数・自分の状態。
- タグ検索は既存タグのオートコンプリート入力(`GET /api/tags`)+ カード上のタグクリックで絞り込み。
- マイページの統計は数値(累計参加数・出席率)と Tailwind の横棒(カテゴリ別)。グラフライブラリは使わない。
- 日時入力はネイティブの `datetime-local` を JST として扱い、UTC に変換して送る(`frontend/src/utils/datetime.ts` に集約)。
- 主催者は詳細画面で参加者リストとは別に表示する。

### 4.1 ページ一覧

アクセス権の表記: `未ログイン` = ログイン前のみ、`全員` = ログイン済みの `MEMBER` / `ADMIN`、`主催者` = そのイベントの主催者である `MEMBER`(または `ADMIN`)。

| ID | 画面名 | URL | 概要 | アクセス権 |
|---|---|---|---|---|
| P-01 | ログイン | `/login` | メール・パスワードでログイン(A1)。ログイン後は `returnTo` の元ページ、無ければ `/events` へ。ログイン済みで開いた場合は `/events` へリダイレクト | 未ログイン |
| P-02 | イベント一覧 | `/events`(`/` はここへリダイレクト) | キーワード・カテゴリ・タグ(オートコンプリート)・ソート・過去表示の切替、カードのグリッド、ページング(E1, C1, T1)。「新規作成」ボタン。検索条件は URL のクエリに保持する | 全員 |
| P-03 | イベント詳細 | `/events/:eventId` | 基本情報・主催者・空き状況・参加者・参加ボタン(R1/R2/W1/W2)・日時変更バナー・平均評価とレビュー一覧(E2, F1)。主催者/ADMIN 向けに編集・出席管理・削除、ADMIN 向けにレビュー非公開化(F4) | 全員 |
| P-04 | イベント作成 | `/events/new` | 作成フォーム: タイトル・説明・場所・開始/終了日時・定員・登録締切・キャンセル期限・カテゴリ(有効のみ)・タグ(E3, C1, T1)。作成後は P-03 へ | 全員 |
| P-05 | イベント編集 | `/events/:eventId/edit` | P-04 と同じフォームに既存値を表示(E2, E4)。開催開始後は日時・定員・締切・期限を読み取り専用にする。参加確定者がいる状態で日時を変えて保存すると M-02。保存後は警告をトーストで表示して P-03 へ | 主催者・ADMIN |
| P-06 | 出席管理 | `/events/:eventId/attendance` | 参加確定者ごとの「出席 / 欠席 / 未マーク」切替と集計、キャンセル待ちリスト(順位付き)(R3, R5)。開催開始前は出席ボタンを無効化して「開催開始後にマークできます」と表示。ADMIN には各行に「強制キャンセル」(M-04) | 主催者・ADMIN |
| P-07 | フィードバック投稿・編集 | `/events/:eventId/feedback` | 星評価(1〜5)・コメント(200 文字以内、残り文字数表示)・匿名チェック(F1 の `myFeedback`, F2, F3)。投稿済みなら編集モード。非公開化されている場合は「非公開になっています」と表示 | 全員(投稿条件を満たす人。満たさなければ P-03 へ戻して理由を表示) |
| P-08 | マイページ | `/me` | 統計(累計参加数・出席率を数値、カテゴリ別を横棒)、主催予定・主催済み・参加予定・キャンセル待ち(順位)・参加履歴(出席状態、レビュー投稿/編集リンク)(M1, M2) | 全員 |
| P-09 | カテゴリ管理 | `/admin/categories` | 全カテゴリ(無効含む)の一覧と使用件数、追加・編集(M-05)、有効/無効の切替、削除(M-06。使用件数 0 のときだけ表示し、使用中は「無効化」を案内)(C1〜C4) | ADMIN |
| P-10 | 権限エラー | (アクセスした URL のまま表示) | 「権限がありません」と一覧へのリンク。API の 403、または ADMIN 専用ルートへの MEMBER のアクセスで表示 | 全員 |
| P-11 | ページが見つかりません | `*`(該当なし)/ API の 404 | テンプレート既存の 404。存在しない・削除済みイベントの URL でも表示 | 全員 |

ヘッダー(全ページ共通、ログイン後): ロゴ(P-02 へ)、「イベント一覧」「マイページ」、ADMIN のみ「カテゴリ管理」、ユーザー名、ログアウト(A2)。

### 4.2 モーダル一覧

| ID | モーダル名 | トリガー（操作） | 主な機能 |
|---|---|---|---|
| M-01 | 参加キャンセル確認 | P-03 の「キャンセル」ボタン(`permissions.canCancel` のとき) | 期限内であることと、キャンセル後の再登録は空きがある場合のみであることを表示し、確定で R2 を呼ぶ |
| M-02 | 開催日時変更の確認 | P-05 で、参加確定者が 1 人以上いる状態で開始・終了日時を変えて「保存」を押したとき | 「参加者 N 名がいます。日時を変更すると参加者に変更バナーが表示されます」と表示し、確定で E4 を呼ぶ |
| M-03 | イベント削除確認 | P-03 の「削除」ボタン(`permissions.canEdit` のとき) | 参加確定者数・待機者数を表示し、元に戻せないことを伝え、確定で E5 を呼んで P-02 へ |
| M-04 | 強制キャンセル確認 | P-06 の各行の「強制キャンセル」ボタン(ADMIN のみ表示) | 対象者名と、期限を無視すること・開催前なら先頭の待機者が繰り上がることを表示し、確定で R4 を呼ぶ |
| M-05 | カテゴリ追加・編集 | P-09 の「＋カテゴリ追加」ボタン、または各行の「編集」ボタン | 名前(30 文字以内)・表示順を入力し C2 / C3 を呼ぶ。`CATEGORY_NAME_TAKEN` は名前欄の下に表示 |
| M-06 | カテゴリ削除確認 | P-09 の各行の「削除」ボタン(`eventCount = 0` のときのみ表示) | 元に戻せないことを伝え、確定で C4 を呼ぶ。409 `CATEGORY_IN_USE` の場合は無効化を案内 |

### 4.3 UI/UX設計方針

#### メイン画面レイアウト（イベント詳細 P-03）

```
+------------------------------------------------------------------------------+
| [AppHeader] ロゴ | イベント一覧 | マイページ | (ADMIN)カテゴリ管理 | 名前 ログアウト |
+------------------------------------------------------------------------------+
| [ScheduleChangedBanner] ⚠ 開催日時が変更されました(2026/12/01 10:00 更新)       |
+------------------------------------------------------------------------------+
| [EventHeader]                                [OrganizerActions]              |
|  <CategoryBadge 勉強会>  #react #新人向け       [編集] [出席管理] [削除]          |
|  React 入門ハンズオン                          (主催者・ADMIN のみ表示)          |
+--------------------------------------------+---------------------------------+
| [EventInfo]                                | [RegistrationPanel]             |
|  日時   12/10(水) 19:00〜21:00 (JST)          |  定員 30 / 参加 28 / 残り 2 席     |
|  場所   本社 5F 会議室A                       |  キャンセル待ち 0 人               |
|  主催者 Alice                                |  登録締切 12/09 18:00             |
|  登録締切 12/09 18:00                         |  キャンセル期限 12/09 18:00        |
|  キャンセル期限 12/09 18:00                   |  +---------------------------+  |
|                                            |  | [RegistrationButton]      |  |
| [EventDescription]                         |  |  参加登録 / キャンセル待ち   |  |
|  説明文(white-space: pre-wrap)              |  |  / キャンセル / 待機解除    |  |
|  ...                                       |  +---------------------------+  |
|                                            |  状態: 3 番目で待機中 など         |
+--------------------------------------------+---------------------------------+
| [ParticipantList] 参加者(28)  Bob, Carol, Dave, ...(氏名のみ・登録順)           |
+------------------------------------------------------------------------------+
| [ReviewSection]  ★ 4.3(12 件)                  [フィードバックを書く/編集する]     |
|  +------------------------------------------------------------------------+  |
|  | [ReviewItem] ★★★★★  とても分かりやすかった   匿名 / Erin   12/11            |  |
|  |              (ADMIN) [非公開にする]  ・非公開ラベル                          |  |
|  +------------------------------------------------------------------------+  |
|  [Pagination]                                                                |
+------------------------------------------------------------------------------+
```

- **AppHeader**: 全ページ共通。ADMIN のときだけ「カテゴリ管理」を出す(A3 のロール)。
- **ScheduleChangedBanner**: `scheduleChangedAt` があり、`myStatus.kind = "REGISTERED"` のときだけ表示。
- **EventHeader / OrganizerActions**: カテゴリ・タグ(タグをクリックすると `/events?tag=...`)。編集・出席管理・削除は `permissions.canEdit` / `canManageAttendance` のときだけ表示。削除は M-03。
- **EventInfo / EventDescription**: 日時はすべて JST 表示。締切・期限が未設定なら開始日時を表示する。
- **RegistrationPanel / RegistrationButton**: 空き状況と、`permissions` に従う 1 つのボタン(4 章冒頭の状態一覧)。キャンセルは M-01。
- **ParticipantList**: 参加確定者の氏名のみ。主催者は EventInfo 側に表示し、ここには含めない。
- **ReviewSection**: 平均評価・件数・一覧(F1)。「フィードバックを書く/編集する」は `canPostFeedback` / `canEditFeedback` のときだけ表示し P-07 へ。ADMIN には非公開化/再公開トグル(F4)と非公開ラベル、匿名レビューの投稿者名を表示。

#### 参加(ユーザーとイベントの関係)のライフサイクル

```mermaid
stateDiagram-v2
    [*] --> 未参加

    未参加 --> 参加確定: 参加登録(本人)<br/>条件: 空きあり・登録締切前・開催前・主催者でない
    未参加 --> 待機中: キャンセル待ち登録(本人)<br/>条件: 満席・登録締切前・開催前・主催者でない

    待機中 --> 未参加: 待機解除(本人)<br/>いつでも可
    待機中 --> 参加確定: 自動繰り上げ(システム)<br/>先頭の待機者のみ・開催前<br/>きっかけ: 他者のキャンセル / ADMIN の強制キャンセル / 定員増<br/>副作用: 繰り上げ履歴の記録・コミット後にログ出力

    参加確定 --> 未参加: キャンセル(本人)<br/>条件: キャンセル期限前<br/>副作用: 開催前なら先頭の待機者を繰り上げ
    参加確定 --> 未参加: 強制キャンセル(ADMIN)<br/>期限無視<br/>副作用: 開催前なら先頭の待機者を繰り上げ

    state 参加確定 {
        [*] --> 未マーク
        未マーク --> 出席: 出席マーク(主催者・ADMIN)<br/>開催開始後
        未マーク --> 欠席: 欠席マーク(主催者・ADMIN)<br/>開催開始後
        出席 --> 欠席: 変更(主催者・ADMIN)
        欠席 --> 出席: 変更(主催者・ADMIN)
        出席 --> 未マーク: 未マークに戻す(主催者・ADMIN)
        欠席 --> 未マーク: 未マークに戻す(主催者・ADMIN)
        出席 --> レビュー投稿済み: フィードバック投稿(本人)<br/>条件: 開催終了後・未投稿
        レビュー投稿済み --> レビュー投稿済み: 編集(本人、出席のままの場合のみ)<br/>非公開化/再公開(ADMIN)
    }
```

- 主催者は自分のイベントに対してこのライフサイクルに入らない(参加者とは別管理)。
- イベントが論理削除されると、どの状態にあっても画面・API からは見えなくなる(行は残る)。
- `レビュー投稿済み` の後に出席状態が `欠席` / `未マーク` に変更されても、レビューは削除されない(編集だけ不可になる)。
- 開催開始後は 未参加 → 参加確定 / 待機中 の遷移と自動繰り上げは起きない。

#### SPAとしてのUI/UX設計ポイント

- **参加系操作は楽観的更新をしない。** 空き判定と繰り上げはサーバーが行ロック下で決めるため、ボタンは送信中に無効化(スピナー表示)し、成功レスポンスの `event`(R1・W1 は `EventDetail` を返す)でキャッシュを置き換える。R2・W2(204)の後は詳細を再取得する。
- **キャッシュ無効化の範囲を揃える。** 参加登録・キャンセル・待機の登録/解除の後は、events の `detail(eventId)`・`lists()`・me の `events`・`stats` を invalidate する(TanStack Query のキーファクトリは feature ごとに置く)。一覧カードの空き数とマイページが古いまま残らないようにするため。
- **409 は「状態が変わった」合図として扱う。** `EVENT_FULL`・`REGISTRATION_CLOSED`・`CANCEL_DEADLINE_PASSED` などを受けたら、トーストでメッセージを出して詳細を再取得し、ボタンを現在の状態に合わせる(画面を開いた後で満席・締切になった場合への対応)。
- **ボタンは `permissions` だけで出し分ける。** RegistrationButton・OrganizerActions・レビューボタンはロールや日時をフロントで再計算せず、E2 の `permissions` と `myStatus` から描画する。サーバーとフロントで判定がずれないようにするため。
- **検索条件は URL に持つ。** P-02 の `q` / `categoryId` / `tag` / `sort` / `includePast` / `page` は URL のクエリと同期し、クエリキーにも含める。戻るボタンで条件が復元され、タグクリック(`?tag=`)でもそのまま絞り込める。キーワード入力は 300ms 程度のデバウンスをかける。
- **フォームは共有 Zod スキーマで即時検証し、サーバーの `details` を欄に戻す。** 「開始は未来」「終了は開始より後」「締切は開始以前」をフロントでも同じスキーマで検証し、サーバーの 400(`details.field`)と 409(`CATEGORY_NAME_TAKEN` など)は該当欄の下に表示する。
- **日時は JST で入力・表示し、UTC で送る。** `datetime-local` の値は `utils/datetime.ts` で JST として UTC に変換し、表示は `Asia/Tokyo` に固定する(ブラウザのタイムゾーンに依存させない)。
- **日時変更は保存前に気づかせる。** P-05 はフォーム読み込み時の開始・終了日時と `registeredCount` を覚えておき、参加者がいる状態で日時が変わっていれば M-02 を出す。保存後のレスポンスの `warnings` はトーストで表示する。
- **認証切れと権限エラーを画面遷移で扱う。** API の 401 は `returnTo` 付きで P-01 へ、403 は P-10、404 は P-11 を表示する。ADMIN 専用ルートはルートガードでも先に弾く。
- **すべての一覧に読み込み中・エラー・空の状態を用意する。** 一覧、参加者、レビュー、マイページの各区分、出席管理、カテゴリ管理で、スピナー・再試行付きのエラー表示・「まだありません」の空表示を出し分ける。


## 5. データモデリング

**方針**
- DB は PostgreSQL 17。ID はすべて cuid 文字列(`TEXT`, `@default(cuid())`)。
- 日時カラムはすべて `TIMESTAMPTZ(3)`(`@db.Timestamptz(3)`)で UTC 保存する。コンテナ・DB の TZ は UTC のまま、表示時に JST に変換する。
- 状態カラム(ロール・出席状態・繰り上げのきっかけ)は Prisma の `enum`(PostgreSQL の enum 型)。
- 列名: 既存の `users` はテンプレートの camelCase を維持し、新規テーブルは snake_case(`@map`)。テーブル名は snake_case の複数形(`@@map`)。
- テンプレートの `Todo` モデルは削除する。
- 削除方針: イベントは論理削除(`deleted_at`)、それ以外は 5.3 のとおり。履歴を参照する外部キーは `ON DELETE RESTRICT` にし、物理削除のカスケードで履歴が消えないようにする(カスケードは関連だけを持つ `event_tags` のみ)。
- Prisma スキーマで表現できない制約(CHECK、大文字小文字を区別しない一意性)は、`npm run db:migrate -- --create-only` で生成したマイグレーション SQL に **適用前に** 追記する(5.4 末尾)。適用済みマイグレーションは編集しない。

### 5.1 ER図

```mermaid
erDiagram
  users ||--o{ events : "主催する (organizer_id)"
  categories ||--o{ events : "分類する (category_id)"
  events ||--o{ event_tags : "持つ"
  tags ||--o{ event_tags : "付く"
  events ||--o{ registrations : "参加確定"
  users ||--o{ registrations : "参加する (user_id)"
  users |o--o{ registrations : "出席をマークする (attendance_marked_by_id)"
  events ||--o{ waitlist_entries : "キャンセル待ち"
  users ||--o{ waitlist_entries : "待機する"
  events ||--o{ waitlist_promotions : "繰り上げ履歴"
  users ||--o{ waitlist_promotions : "繰り上がる (promoted_user_id)"
  users |o--o{ waitlist_promotions : "空きを作る (vacated_by_user_id)"
  events ||--o{ feedbacks : "評価される"
  users ||--o{ feedbacks : "投稿する (user_id)"
  users |o--o{ feedbacks : "非公開化する (hidden_by_id)"

  users {
    text id PK
    text email UK
    text name
    text passwordHash
    UserRole role
    timestamptz createdAt
    timestamptz updatedAt
  }
  categories {
    text id PK
    varchar name UK
    int sort_order
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
  }
  events {
    text id PK
    varchar title
    text description
    varchar location
    timestamptz starts_at
    timestamptz ends_at
    int capacity
    timestamptz registration_deadline
    timestamptz cancel_deadline
    timestamptz schedule_changed_at
    text category_id FK
    text organizer_id FK
    timestamptz deleted_at
    timestamptz created_at
    timestamptz updated_at
  }
  tags {
    text id PK
    varchar name UK
    timestamptz created_at
  }
  event_tags {
    text event_id PK, FK
    text tag_id PK, FK
  }
  registrations {
    text id PK
    text event_id FK
    text user_id FK
    AttendanceStatus attendance
    timestamptz attendance_marked_at
    text attendance_marked_by_id FK
    timestamptz created_at
    timestamptz updated_at
  }
  waitlist_entries {
    text id PK
    text event_id FK
    text user_id FK
    int position
    timestamptz created_at
  }
  waitlist_promotions {
    text id PK
    text event_id FK
    text promoted_user_id FK
    text vacated_by_user_id FK
    PromotionTrigger trigger
    int waitlist_position
    timestamptz promoted_at
  }
  feedbacks {
    text id PK
    text event_id FK
    text user_id FK
    smallint rating
    varchar comment
    boolean is_anonymous
    boolean is_hidden
    timestamptz hidden_at
    text hidden_by_id FK
    timestamptz created_at
    timestamptz updated_at
  }
```

- カテゴリ : イベント = 1 : 多(`events.category_id` は必須)。タグ : イベント = 多 : 多(中間テーブル `event_tags`)。
- 参加確定(`registrations`)とキャンセル待ち(`waitlist_entries`)は別テーブル。同じユーザーが同じイベントの両方に同時に存在しないことはアプリ層で保証する。

### 5.2 テーブル定義

#### users（ユーザー）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | TEXT | PK | ユーザーID(cuid) |
| email | TEXT | NOT NULL, UNIQUE | 小文字に正規化して保存 |
| name | TEXT | NOT NULL | 表示名 |
| passwordHash | TEXT | NOT NULL | bcrypt(12 ラウンド)のハッシュ |
| role | UserRole | NOT NULL, DEFAULT 'MEMBER' | `MEMBER` / `ADMIN` |
| createdAt | TIMESTAMPTZ(3) | NOT NULL, DEFAULT now() | 作成日時 |
| updatedAt | TIMESTAMPTZ(3) | NOT NULL | 更新日時(Prisma が自動更新) |

**ビジネスルール・制約**
- メールアドレスは一意 — 担保: DB(UNIQUE)。比較前の小文字化はアプリ層(Zod スキーマ)。
- `passwordHash` は API レスポンスに含めない — 担保: アプリ層(`toUser()` 経由でのみ外に出す)。
- ユーザーは seed でのみ作成し、削除しない — 担保: アプリ層(作成・削除 API を提供しない)。履歴からの参照は DB(FK RESTRICT)。
- ロールはリクエストごとに DB の値を使う — 担保: アプリ層(`requireAuth` が DB から読み込む)。
- 既存テーブルのため列名は camelCase のまま。日時列の型は timestamp から timestamptz に変更する(マイグレーションで ALTER)。

#### categories（カテゴリ）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | TEXT | PK | カテゴリID(cuid) |
| name | VARCHAR(30) | NOT NULL, UNIQUE, UNIQUE(lower(name)) | カテゴリ名 |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | 表示順(0〜999) |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | false = 新規選択不可(無効化) |
| created_at | TIMESTAMPTZ(3) | NOT NULL, DEFAULT now() | 作成日時 |
| updated_at | TIMESTAMPTZ(3) | NOT NULL | 更新日時 |

**ビジネスルール・制約**
- カテゴリ名は大文字小文字を区別せず一意 — 担保: DB(`lower(name)` の一意インデックス。違反は `409 CATEGORY_NAME_TAKEN` に変換)+ アプリ層(事前チェックで分かりやすいエラーを返す)。
- カテゴリ名は 1〜30 文字、表示順は 0〜999 — 担保: アプリ層(Zod)+ DB(VARCHAR(30))。
- イベント(論理削除済みを含む)が紐づくカテゴリは削除できない — 担保: DB(`events.category_id` の FK RESTRICT)+ アプリ層(`categories.service` が件数を数えて `409 CATEGORY_IN_USE`)。
- 無効化カテゴリは新規作成・カテゴリ変更で選べない(既存イベントはそのまま) — 担保: アプリ層(`events.service` が `is_active` を確認)。
- 初期データ: 勉強会 / 懇親会 / 講演会 / 研修 / その他 — 担保: seed。

#### events（イベント）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | TEXT | PK | イベントID(cuid) |
| title | VARCHAR(100) | NOT NULL | タイトル |
| description | TEXT | NOT NULL | 説明(最大 2000 文字) |
| location | VARCHAR(100) | NULL | 場所・URL |
| starts_at | TIMESTAMPTZ(3) | NOT NULL | 開催開始 |
| ends_at | TIMESTAMPTZ(3) | NOT NULL, CHECK (ends_at > starts_at) | 開催終了 |
| capacity | INTEGER | NOT NULL, CHECK (capacity BETWEEN 1 AND 1000) | 定員(主催者は含まない) |
| registration_deadline | TIMESTAMPTZ(3) | NULL, CHECK (NULL または <= starts_at) | 登録締切。NULL = 開催開始まで |
| cancel_deadline | TIMESTAMPTZ(3) | NULL, CHECK (NULL または <= starts_at) | キャンセル期限。NULL = 開催開始まで |
| schedule_changed_at | TIMESTAMPTZ(3) | NULL | 参加確定者がいる状態で日時を変更した最終時刻 |
| category_id | TEXT | NOT NULL, FK→categories.id (RESTRICT) | カテゴリ |
| organizer_id | TEXT | NOT NULL, FK→users.id (RESTRICT) | 主催者 |
| deleted_at | TIMESTAMPTZ(3) | NULL | 論理削除日時 |
| created_at | TIMESTAMPTZ(3) | NOT NULL, DEFAULT now() | 作成日時 |
| updated_at | TIMESTAMPTZ(3) | NOT NULL | 更新日時 |

インデックス: `(deleted_at, starts_at)`(一覧の既定条件「未削除・開催前」とソート)、`(category_id)`、`(organizer_id)`(マイページの主催イベント)。

**ビジネスルール・制約**
- 過去日時のイベントは作成できない。日時を変更する場合も新しい開始日時は未来 — 担保: アプリ層(Zod + `events.service`、サーバー時刻で判定)。
- 終了 > 開始、締切・期限 <= 開始、定員 1〜1000 — 担保: DB(CHECK)+ アプリ層(Zod で `details` 付きのエラーを返す)。
- 登録締切を設定・変更する場合は現在より未来。キャンセル期限には「未来」の制約を設けない — 担保: アプリ層。
- 主催者は作成者自身(ボディの `organizerId` は使わない) — 担保: アプリ層(`events.service`)。
- 開催開始後は日時・定員・締切・期限を変更できない — 担保: アプリ層(`409 EVENT_ALREADY_STARTED`)。
- 定員は現在の参加確定者数以上 — 担保: アプリ層(行ロック下で数えて `409 CAPACITY_BELOW_REGISTERED`)。
- 定員を増やしたら増えた枠の分だけ待機者を繰り上げる — 担保: アプリ層(同一トランザクション、`waitlist_promotions` に記録)。
- 参加確定者がいる状態で日時を変更したら `schedule_changed_at` を記録 — 担保: アプリ層。
- 論理削除済みイベントはどの API からも 404。開催状態にかかわらず削除できる — 担保: アプリ層(全クエリに `deleted_at IS NULL`)。
- 参加登録・待機・キャンセル・定員変更・削除はイベント行を `SELECT ... FOR UPDATE` でロックして直列化する — 担保: アプリ層(Prisma の対話的トランザクション + `$queryRaw`)。

#### tags（タグ）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | TEXT | PK | タグID(cuid) |
| name | VARCHAR(20) | NOT NULL, UNIQUE | 正規化済みのタグ名 |
| created_at | TIMESTAMPTZ(3) | NOT NULL, DEFAULT now() | 作成日時 |

**ビジネスルール・制約**
- タグ名は正規化(`trim` → NFKC → 英字小文字化 → 連続空白を 1 つ)してから保存・検索する — 担保: アプリ層(`lib/tag-normalize.ts`)。
- 正規化後の名前は一意 — 担保: DB(UNIQUE)。保存時は upsert で作成する。
- 1〜20 文字 — 担保: アプリ層(Zod)+ DB(VARCHAR(20))。
- 使われなくなったタグは削除しない(オートコンプリート候補として残す) — 担保: アプリ層(削除処理を持たない)。

#### event_tags（イベント×タグ 中間テーブル）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| event_id | TEXT | PK, FK→events.id (CASCADE) | イベント |
| tag_id | TEXT | PK, FK→tags.id (CASCADE) | タグ |

インデックス: 複合 PK `(event_id, tag_id)` がイベント→タグに、`(tag_id)` がタグ→イベントの検索に効く。

**ビジネスルール・制約**
- 同じイベントに同じタグは 1 回だけ — 担保: DB(複合 PK)+ アプリ層(正規化後に重複をまとめる)。
- 1 イベントあたり最大 10 個 — 担保: アプリ層(Zod)。
- イベント編集でタグを指定した場合は丸ごと置き換える(行を削除して作り直す) — 担保: アプリ層。

#### registrations（参加確定）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | TEXT | PK | 参加登録ID(cuid) |
| event_id | TEXT | NOT NULL, FK→events.id (RESTRICT) | イベント |
| user_id | TEXT | NOT NULL, FK→users.id (RESTRICT) | 参加者 |
| attendance | AttendanceStatus | NOT NULL, DEFAULT 'UNMARKED' | `UNMARKED` / `PRESENT` / `ABSENT` |
| attendance_marked_at | TIMESTAMPTZ(3) | NULL | 出席・欠席をマークした日時(未マークなら NULL) |
| attendance_marked_by_id | TEXT | NULL, FK→users.id (SET NULL) | マークした主催者/admin |
| created_at | TIMESTAMPTZ(3) | NOT NULL, DEFAULT now() | 参加確定日時(API の `registeredAt`) |
| updated_at | TIMESTAMPTZ(3) | NOT NULL | 更新日時 |

一意制約: `(event_id, user_id)`。インデックス: `(user_id)`(マイページ・統計)。

**ビジネスルール・制約**
- 二重登録の防止 — 担保: DB(UNIQUE、違反は `409 ALREADY_REGISTERED`)+ アプリ層(参加確定・待機の両方を事前チェック)。
- 定員を超えない — 担保: アプリ層(行ロック下で件数 < `capacity` を確認)。
- 主催者は登録できない、登録締切前かつ開催前のみ登録できる — 担保: アプリ層。
- 本人のキャンセルは期限前のみ、admin は期限後も可。キャンセルは行の物理削除 — 担保: アプリ層。
- キャンセル時、開催前なら先頭の待機者を同一トランザクションで昇格 — 担保: アプリ層(`registrations.service`)。
- 出席マークは開催開始後のみ、どの状態間でも変更可。`UNMARKED` に戻したら `attendance_marked_at` / `attendance_marked_by_id` を NULL — 担保: アプリ層。
- 集計: 累計参加数 = 開催開始済み・未削除イベントで `attendance <> 'ABSENT'`、出席率 = PRESENT ÷ (PRESENT + ABSENT) — 担保: アプリ層(`me.service` の集計クエリ)。

#### waitlist_entries（キャンセル待ち）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | TEXT | PK | 待機ID(cuid) |
| event_id | TEXT | NOT NULL, FK→events.id (RESTRICT) | イベント |
| user_id | TEXT | NOT NULL, FK→users.id (RESTRICT) | 待機者 |
| position | INTEGER | NOT NULL, CHECK (position > 0) | 待機順。欠番あり、振り直さない |
| created_at | TIMESTAMPTZ(3) | NOT NULL, DEFAULT now() | 待機登録日時(API の `joinedAt`) |

一意制約: `(event_id, user_id)`、`(event_id, position)`(position 順の取得にも使う)。インデックス: `(user_id)`。

**ビジネスルール・制約**
- 同じイベントで同じユーザーは 1 回だけ待機できる — 担保: DB(UNIQUE)。参加確定との重複禁止はアプリ層。
- 満席時のみ、登録締切前かつ開催前のみ待機登録できる(空きがあれば `409 SEATS_AVAILABLE`) — 担保: アプリ層。
- position は行ロック下で `現在の最大 + 1` を採番し、解除・繰り上げ時に振り直さない — 担保: アプリ層 + DB(`(event_id, position)` UNIQUE で重複を防ぐ)。
- 表示順位は position 昇順で数えて API が計算する — 担保: アプリ層。
- 待機解除はいつでも可能(行の物理削除) — 担保: アプリ層。

#### waitlist_promotions（繰り上げ履歴）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | TEXT | PK | 履歴ID(cuid) |
| event_id | TEXT | NOT NULL, FK→events.id (RESTRICT) | イベント |
| promoted_user_id | TEXT | NOT NULL, FK→users.id (RESTRICT) | 繰り上がった人 |
| vacated_by_user_id | TEXT | NULL, FK→users.id (SET NULL) | 空きを作った人(定員増加時は NULL) |
| trigger | PromotionTrigger | NOT NULL | `CANCELLATION` / `ADMIN_CANCELLATION` / `CAPACITY_INCREASE` |
| waitlist_position | INTEGER | NOT NULL | 繰り上げ時点の position(監査用) |
| promoted_at | TIMESTAMPTZ(3) | NOT NULL, DEFAULT now() | 繰り上げ日時 |

インデックス: `(event_id, promoted_at)`、`(promoted_user_id)`。

**ビジネスルール・制約**
- 繰り上げのたびに 1 行記録する。キャンセル・繰り上げと同じトランザクションで書く — 担保: アプリ層。
- 追記のみで更新・削除しない — 担保: アプリ層(更新・削除処理を持たない)+ DB(FK RESTRICT で親の物理削除を防ぐ)。
- 繰り上げのログ出力はコミット後に行う — 担保: アプリ層。

#### feedbacks（フィードバック）
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | TEXT | PK | フィードバックID(cuid) |
| event_id | TEXT | NOT NULL, FK→events.id (RESTRICT) | イベント |
| user_id | TEXT | NOT NULL, FK→users.id (RESTRICT) | 投稿者(匿名でも保存) |
| rating | SMALLINT | NOT NULL, CHECK (rating BETWEEN 1 AND 5) | 星評価 |
| comment | VARCHAR(200) | NOT NULL | 一言コメント |
| is_anonymous | BOOLEAN | NOT NULL, DEFAULT false | 匿名投稿 |
| is_hidden | BOOLEAN | NOT NULL, DEFAULT false | admin による非公開化 |
| hidden_at | TIMESTAMPTZ(3) | NULL | 非公開化日時 |
| hidden_by_id | TEXT | NULL, FK→users.id (SET NULL) | 非公開化した admin |
| created_at | TIMESTAMPTZ(3) | NOT NULL, DEFAULT now() | 投稿日時 |
| updated_at | TIMESTAMPTZ(3) | NOT NULL | 更新日時 |

一意制約: `(event_id, user_id)`。インデックス: `(event_id, is_hidden)`(公開分の一覧・平均評価)。

**ビジネスルール・制約**
- 1 イベント 1 人 1 件 — 担保: DB(UNIQUE、違反は `409 FEEDBACK_ALREADY_EXISTS`)+ アプリ層。
- 投稿条件: イベント未削除・開催終了済み・自分の参加が `PRESENT`・主催者でない — 担保: アプリ層(`403 FEEDBACK_NOT_ALLOWED`)。
- 編集は本人のみ、`PRESENT` のときだけ。編集しても非公開状態は変わらない — 担保: アプリ層。
- 評価 1〜5、コメント 1〜200 文字 — 担保: DB(CHECK, VARCHAR(200))+ アプリ層(Zod)。
- 平均評価・件数・一般ユーザーの一覧は `is_hidden = false` のみ — 担保: アプリ層(`feedbacks.service` のクエリ条件)。
- 匿名投稿の投稿者は admin にのみ返す — 担保: アプリ層(閲覧者のロールでレスポンスを出し分け)。
- 出席状態が後から変わっても行は削除しない — 担保: アプリ層。

### 5.3 削除・無効化ポリシー
| リソース | 方針 | 実装 | 関連データの扱い | 備考 |
|---|---|---|---|---|
| ユーザー | 削除しない | 作成・削除 API なし(seed のみ) | 参加・待機・履歴・フィードバックの FK は RESTRICT | スコープ外。マーク者・非公開化者の参照は SET NULL |
| カテゴリ | 未使用なら物理削除、使用中は無効化 | `DELETE`(使用中は 409)/ `is_active = false` | 使用中は FK RESTRICT で削除不可。無効化しても既存イベントはそのまま表示 | 自動移動は分類と過去集計を書き換えるため採用しない |
| イベント | 論理削除 | `deleted_at` | 参加・待機・繰り上げ履歴・フィードバック・タグ付けは残す(全 API から 404) | 復元 API なし。開催状態にかかわらず削除可 |
| タグ | 削除しない | 削除処理なし | `event_tags` から外れても残る | オートコンプリート候補として残す |
| タグ付け(event_tags) | 物理削除 | イベント編集時に差し替え | なし | 関連だけで履歴価値がない。親の物理削除時は CASCADE |
| 参加確定(registrations) | 物理削除 | キャンセル・強制キャンセル時に `DELETE` | 繰り上げの事実は waitlist_promotions に残る | キャンセルは参加履歴ではないため |
| キャンセル待ち(waitlist_entries) | 物理削除 | 待機解除・繰り上げ時に `DELETE` | 他の待機者の position は変えない | 再登録すると最後尾 |
| 繰り上げ履歴(waitlist_promotions) | 削除しない(追記のみ) | 更新・削除処理なし | — | 監査と将来の通知用 |
| フィードバック | 削除しない、非公開化で対応 | `is_hidden` / `hidden_at` / `hidden_by_id` | 非公開分は集計と一般ユーザーの一覧から除外 | admin の判断を後から見直せるように再公開も可能 |

### 5.4 Prismaスキーマ（schema.prisma）

配置: `backend/prisma/schema.prisma`。`npx prisma validate` で検証済み。

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

**マイグレーション SQL への追記**(Prisma スキーマで表現できない制約。`--create-only` で生成したマイグレーションに適用前に追記する)

```sql
ALTER TABLE "events" ADD CONSTRAINT "events_capacity_check" CHECK ("capacity" BETWEEN 1 AND 1000);
ALTER TABLE "events" ADD CONSTRAINT "events_period_check" CHECK ("ends_at" > "starts_at");
ALTER TABLE "events" ADD CONSTRAINT "events_registration_deadline_check"
  CHECK ("registration_deadline" IS NULL OR "registration_deadline" <= "starts_at");
ALTER TABLE "events" ADD CONSTRAINT "events_cancel_deadline_check"
  CHECK ("cancel_deadline" IS NULL OR "cancel_deadline" <= "starts_at");
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_position_check" CHECK ("position" > 0);
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
-- カテゴリ名の大文字小文字を区別しない一意性
CREATE UNIQUE INDEX "categories_name_lower_key" ON "categories" (lower("name"));
```

## 6. API設計

**設計方針**
- REST API。ベースパス `/api`、JSON のみ。認証は Cookie `token` の JWT。
- 成功は `{ data }`(作成 201、削除・解除 204 でボディなし、その他 200)。失敗は `{ error: { code, message, details? } }`、`details` は `{ field, message }[]`。
- エラーコードとステータスの対応は `shared/src/api.ts` の `ERROR_STATUS` にのみ定義する。テンプレートの `EMAIL_TAKEN` は削除する。
- 入力形式の不正は 400、満席・締切後などの状態エラーは主に 409。開催前の出席マークは 400 `EVENT_NOT_STARTED`、主催者の自己登録は 403 `ORGANIZER_CANNOT_REGISTER`、投稿条件不足は 403 `FEEDBACK_NOT_ALLOWED`。
- 日時は ISO 8601 UTC(`Z` 付き)。
- リソース名は複数形。ログインユーザー自身の 1 件は単数形のサブリソース(`/registration`, `/waitlist`, `/feedback`)で表し、URL にユーザー ID を入れない。
- 参加登録とキャンセル待ち登録は別エンドポイント。admin 専用操作も `/admin` 配下にまとめず、通常のリソースに置いて権限で制御する。
- ページングは `page`(1 始まり, 既定 1)・`limit`(既定 20, 最大 50)、レスポンスは `{ items, total, page, limit }`。
- イベント詳細はボタン制御用の `permissions` を返す(サーバーでも必ず再判定)。匿名レビューの投稿者は閲覧者のロールで出し分ける。

**エラーコード一覧**(`shared/src/api.ts` の `ERROR_STATUS` の正本)

| code | status | 発生条件 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | 入力形式・範囲・日時の前後関係の不正 |
| `EVENT_NOT_STARTED` | 400 | 開催開始前の出席マーク |
| `INVALID_CREDENTIALS` | 401 | ログイン失敗 |
| `UNAUTHENTICATED` | 401 | 未ログイン・トークン無効・ユーザー不存在 |
| `FORBIDDEN` | 403 | 主催者/admin 権限なし、admin 専用操作 |
| `ORGANIZER_CANNOT_REGISTER` | 403 | 主催者の自己登録・自己キャンセル待ち |
| `FEEDBACK_NOT_ALLOWED` | 403 | フィードバック投稿・編集条件を満たさない |
| `NOT_FOUND` | 404 | リソースなし・論理削除済み・自分の登録なし |
| `ROUTE_NOT_FOUND` | 404 | 未定義ルート(テンプレート既存) |
| `ALREADY_REGISTERED` | 409 | 参加確定済み・待機中 |
| `EVENT_FULL` | 409 | 満席 |
| `SEATS_AVAILABLE` | 409 | 空きありでのキャンセル待ち登録 |
| `REGISTRATION_CLOSED` | 409 | 登録締切後・開催開始後 |
| `CANCEL_DEADLINE_PASSED` | 409 | キャンセル期限後の本人キャンセル |
| `EVENT_ALREADY_STARTED` | 409 | 開催開始後の日時・定員・締切の変更 |
| `CAPACITY_BELOW_REGISTERED` | 409 | 参加確定者数未満への定員変更 |
| `CATEGORY_IN_USE` | 409 | 使用中カテゴリの削除 |
| `CATEGORY_NAME_TAKEN` | 409 | カテゴリ名の重複 |
| `FEEDBACK_ALREADY_EXISTS` | 409 | 2 件目のフィードバック |
| `RATE_LIMITED` | 429 | ログイン試行回数超過 |
| `INTERNAL_ERROR` | 500 | 想定外のエラー(詳細はログのみ、レスポンスには出さない) |

**エンドポイント一覧**(ID は 2 章のアクセスマトリクス・4 章の画面設計から参照する)

| ID | リソース | メソッド | パス | 概要 |
| --- | --- | --- | --- | --- |
| A1 | 認証 | POST | `/api/auth/login` | ログイン |
| A2 | 認証 | POST | `/api/auth/logout` | ログアウト |
| A3 | 認証 | GET | `/api/auth/me` | ログイン中ユーザー |
| E1 | イベント | GET | `/api/events` | 一覧 |
| E2 | イベント | GET | `/api/events/:eventId` | 詳細 |
| E3 | イベント | POST | `/api/events` | 作成 |
| E4 | イベント | PATCH | `/api/events/:eventId` | 編集 |
| E5 | イベント | DELETE | `/api/events/:eventId` | 論理削除 |
| R1 | 参加登録 | POST | `/api/events/:eventId/registration` | 自分の参加登録 |
| R2 | 参加登録 | DELETE | `/api/events/:eventId/registration` | 自分のキャンセル |
| R3 | 参加登録 | GET | `/api/events/:eventId/registrations` | 参加者・出席・待機一覧 |
| R4 | 参加登録 | DELETE | `/api/events/:eventId/registrations/:registrationId` | 強制キャンセル |
| R5 | 参加登録 | PUT | `/api/events/:eventId/registrations/:registrationId/attendance` | 出席マーク |
| W1 | キャンセル待ち | POST | `/api/events/:eventId/waitlist` | 待機登録 |
| W2 | キャンセル待ち | DELETE | `/api/events/:eventId/waitlist` | 待機解除 |
| F1 | フィードバック | GET | `/api/events/:eventId/feedbacks` | 一覧・平均評価 |
| F2 | フィードバック | POST | `/api/events/:eventId/feedback` | 投稿 |
| F3 | フィードバック | PATCH | `/api/events/:eventId/feedback` | 編集 |
| F4 | フィードバック | PATCH | `/api/feedbacks/:feedbackId/visibility` | 非公開化・再公開 |
| C1 | カテゴリ | GET | `/api/categories` | 一覧 |
| C2 | カテゴリ | POST | `/api/categories` | 追加 |
| C3 | カテゴリ | PATCH | `/api/categories/:categoryId` | 編集・有効/無効 |
| C4 | カテゴリ | DELETE | `/api/categories/:categoryId` | 削除(未使用時のみ) |
| T1 | タグ | GET | `/api/tags` | 候補 |
| M1 | マイページ | GET | `/api/me/events` | マイイベント |
| M2 | マイページ | GET | `/api/me/stats` | 統計 |
| H1 | ヘルスチェック | GET | `/api/health` | 死活確認(テンプレート既存) |

### API詳細

#### 認証

---
##### **POST /api/auth/login**

- **機能概要:** メールアドレスとパスワードで認証し、JWT を httpOnly Cookie に設定してログイン状態にする。
- **認可:** 公開(未ログインで呼べる。ログイン済みで呼んだ場合は新しいトークンで上書きする)。IP 単位のレート制限あり。

**リクエスト**

- **Body**
| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `email` | `String` | ✅ | メールアドレス。メール形式。前後空白を除去し小文字化してから照合する |
| `password` | `String` | ✅ | パスワード。1 文字以上 |

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": User }` に従う。`User` は `id`(`String`, cuid)、`email`、`name`、`role`(`"MEMBER"` \| `"ADMIN"`)、`createdAt`(ISO 8601 UTC)。`passwordHash` は含めない(`toUser()` を通す)。
  併せて `Set-Cookie: token=<JWT>` を返す(`HttpOnly`、`SameSite=Lax`、本番は `Secure`、有効期限 7 日)。JWT のペイロードは `sub`(ユーザーID)と `role`、署名は HS256。
- **Error Responses: `400`**
  `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "field", "message" }] } }` — メール形式不正、必須項目の欠落
- **Error Responses: `401`**
  `INVALID_CREDENTIALS` — メールアドレスが存在しない、またはパスワードが一致しない。どちらの場合も同じメッセージを返し、存在しないメールでもダミーハッシュと照合して応答時間を揃える(登録済みメールの推測を防ぐため)
- **Error Responses: `429`**
  `RATE_LIMITED` — 同一 IP からのログイン試行回数が上限を超えた
---

---
##### **POST /api/auth/logout**

- **機能概要:** 認証用 Cookie `token` を削除してログアウトする。
- **認可:** 公開(未ログイン・トークン期限切れでも呼べる。冪等で、何度呼んでも同じ結果になる)。

**リクエスト**

リクエストボディなし。

**レスポンス**

- **Success: `204`**
  ボディなし(共通形式の例外: 削除・解除系は 204 でボディを返さない)。`Set-Cookie` で `token` を削除する(ログイン時と同じ `Path`・`HttpOnly`・`SameSite=Lax`・`Secure` 属性で失効させる)。Cookie が無い・無効な場合も 204。
- **Error Responses: なし**
  入力を受け取らず認証も要求しないため、業務上のエラーは発生しない(想定外の障害時のみ共通の `500 INTERNAL_ERROR`)
---

---
##### **GET /api/auth/me**

- **機能概要:** ログイン中のユーザー情報を返す。フロントエンドは起動時・画面遷移時にこれでログイン状態とロールを確認し、ルートガードとメニュー表示(admin 用リンクなど)に使う。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)。`requireAuth` が JWT を検証したうえで DB からユーザーを読み込むため、返すロールはトークン内の値ではなく DB の現在値。

**リクエスト**

パラメータ・ボディなし(Cookie `token` のみ)。

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": User }` に従う。`User` は `id`(`String`, cuid)、`email`、`name`、`role`(`"MEMBER"` \| `"ADMIN"`)、`createdAt`(ISO 8601 UTC)。`passwordHash` は含めない(`toUser()` を通す)。
- **Error Responses: `401`**
  `UNAUTHENTICATED` — Cookie `token` が無い、JWT の署名不正・期限切れ・改ざん、またはトークンの `sub` に該当するユーザーが DB に存在しない。フロントエンドは `/login` に遷移し、ログイン後に元のページへ戻す
---

#### イベント

---
##### **GET /api/events**

- **機能概要:** イベント一覧を返す。キーワード検索・カテゴリ絞り込み・タグ検索・開催日順ソート・ページングに対応する。論理削除済みイベントは常に除外する。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)。返す内容はロールで変わらない(`myStatus` のみ閲覧者ごとに異なる)。

**リクエスト**

- **Query Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `q` | `String` | 任意。0〜100 文字(前後空白を除去、空なら条件なし)。タイトル・説明文の部分一致、大文字小文字を区別しない。`%` `_` はワイルドカードではなく文字として扱う |
| `categoryId` | `String` | 任意。cuid 形式。指定カテゴリのイベントのみ。無効化カテゴリの ID も指定可。存在しない ID の場合は 0 件を返す |
| `tag` | `String` | 任意。1〜20 文字。保存時と同じ正規化(`trim` → NFKC → 英字小文字化 → 連続空白を 1 つ)を行い、完全一致するタグを持つイベントのみ |
| `sort` | `"startsAt_asc"` \| `"startsAt_desc"` | 任意。既定 `startsAt_asc`。開催開始日時順。同時刻は `id` 昇順で順序を固定する |
| `includePast` | `"true"` \| `"false"` | 任意。既定 `"false"`。`"false"` なら開催開始前(`starts_at >= 現在時刻`)のみ、`"true"` なら開催済みも含める |
| `page` | `Int` | 任意。1 以上、既定 1 |
| `limit` | `Int` | 任意。1〜50、既定 20 |

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": { "items": EventSummary[], "total", "page", "limit" } }` に従う。`total` は条件に合う件数(ページング前)。`EventSummary` の主な項目:
  - `id`、`title`、`startsAt`、`endsAt`、`location`(`String` \| `null`)、`capacity`
  - `category`: `{ id, name, isActive }`
  - `tags`: 正規化済みタグ名の配列
  - `organizer`: `{ id, name }`
  - `registeredCount`(参加確定者数。主催者は含まない)、`remainingSeats`(`max(capacity - registeredCount, 0)`)、`waitlistCount`
  - `myStatus`: 閲覧者とイベントの関係。`{ kind: "ORGANIZER" }` / `{ kind: "REGISTERED" }` / `{ kind: "WAITLISTED", rank }`(rank は position 昇順で数えた 1 始まりの順位) / `{ kind: "NONE" }`
  - 説明文・参加者リストは含めない(詳細 API で返す)
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `q` が 100 文字超、`categoryId` が cuid 形式でない、`tag` が正規化後に 0 文字または 20 文字超、`sort` / `includePast` が許可値以外、`page` / `limit` が範囲外・整数でない(`details` に該当パラメータ名)
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
---

---
##### **GET /api/events/:eventId**

- **機能概要:** イベント詳細を返す。基本情報・主催者・空き状況・参加者リスト(氏名のみ)・平均評価に加え、画面のボタン制御用に閲覧者ごとの `permissions` を返す。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)。出席状態・待機者の氏名はここでは返さない(主催者・admin 向けの `GET /api/events/:eventId/registrations` で返す)。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `eventId` | `String` | イベントID(cuid) |

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": EventDetail }` に従う。`EventDetail` は `GET /api/events` の `EventSummary` の全項目に以下を加えたもの:
  - `description`
  - `registrationDeadline` / `cancelDeadline`: 設定値(ISO 8601 UTC)。未設定は `null` で、実効値は `startsAt`
  - `scheduleChangedAt`: 参加確定者がいる状態で日時が変更された最終時刻、または `null`。画面は `myStatus.kind = "REGISTERED"` の閲覧者に変更バナーを出す
  - `participants`: 参加確定者 `{ id, name }[]`(登録順)。主催者は含めない
  - `rating`: `{ average, count }`。非公開レビューを除いて集計し、`average` は小数第 1 位に丸める。0 件なら `average: null`
  - `permissions`: 閲覧者がいま実行できる操作。表示制御専用で、各 API はサーバー側で同じ条件を必ず再判定する
    - `canEdit`(編集・削除): 主催者または admin
    - `canManageAttendance`(出席管理画面を開ける): 主催者または admin
    - `canMarkAttendance`: 上記 かつ 現在時刻 >= `startsAt`
    - `canRegister`: 主催者でない、`myStatus` が `NONE`、現在時刻 < 実効登録締切(かつ < `startsAt`)、`remainingSeats > 0`
    - `canJoinWaitlist`: `canRegister` と同じ条件で `remainingSeats = 0`
    - `canCancel`: `myStatus` が `REGISTERED` かつ 現在時刻 < 実効キャンセル期限
    - `canLeaveWaitlist`: `myStatus` が `WAITLISTED`
    - `canPostFeedback`: 主催者でない、自分の参加が `PRESENT`、現在時刻 >= `endsAt`、未投稿
    - `canEditFeedback`: 自分の投稿があり、自分の参加が `PRESENT`
  - `createdAt` / `updatedAt`
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `eventId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `404`**
  `NOT_FOUND` — イベントが存在しない、または論理削除済み(admin・主催者に対しても 404)
---

---
##### **POST /api/events**

- **機能概要:** イベントを作成する。ログインユーザーがそのイベントの主催者になる。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)。`organizerId` はボディから受け取らず、常にログインユーザーの ID を使う(ボディに含まれていても無視する)。

**リクエスト**

- **Body**
| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `title` | `String` | ✅ | 前後空白を除去して 1〜100 文字 |
| `description` | `String` | ✅ | 前後空白を除去して 1〜2000 文字。改行可 |
| `location` | `String` \| `null` |  | 場所・URL。前後空白を除去して 0〜100 文字。空文字は `null` として保存 |
| `startsAt` | `String`(ISO 8601) | ✅ | 開催開始日時。オフセット付き(`Z` または `+09:00` など)。現在時刻より未来であること |
| `endsAt` | `String`(ISO 8601) | ✅ | 開催終了日時。`startsAt` より後であること |
| `capacity` | `Int` | ✅ | 定員(主催者は含まない)。1〜1000 |
| `registrationDeadline` | `String`(ISO 8601) \| `null` |  | 登録締切。未指定・`null` なら開催開始まで。指定する場合は現在時刻より未来、かつ `startsAt` 以前 |
| `cancelDeadline` | `String`(ISO 8601) \| `null` |  | キャンセル期限。未指定・`null` なら開催開始まで。指定する場合は `startsAt` 以前 |
| `categoryId` | `String` | ✅ | カテゴリID(cuid)。存在し、かつ有効(`isActive: true`)なカテゴリであること |
| `tags` | `String[]` |  | 0〜10 個。各要素を正規化(`trim` → NFKC → 英字小文字化 → 連続空白を 1 つ)し、正規化後 1〜20 文字。重複は 1 つにまとめる。未登録のタグはこの時点で作成する。既定は空配列 |

- 日時の前後関係・「現在より未来」の判定はサーバー時刻で行う。

**レスポンス**

- **Success: `201`**
  共通レスポンス形式 `{ "data": EventDetail }` に従う(`GET /api/events/:eventId` と同じ形)。作成直後なので `myStatus` は `{ kind: "ORGANIZER" }`、`registeredCount` は 0、`participants` は空。
- **Error Responses: `400`**
  `VALIDATION_ERROR`(`details` に該当フィールド名)— 以下のいずれか
  - 必須項目の欠落、文字数・定員の範囲外、日時の形式不正
  - `startsAt` が現在時刻以前(過去日時のイベントは作成不可)
  - `endsAt` が `startsAt` 以前
  - `registrationDeadline` が現在時刻以前、または `startsAt` より後
  - `cancelDeadline` が `startsAt` より後
  - `categoryId` のカテゴリが存在しない、または無効化されている(`field: "categoryId"`)
  - `tags` が 11 個以上、または正規化後に 0 文字・20 文字超の要素がある
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
---

---
##### **PATCH /api/events/:eventId**

- **機能概要:** イベントを部分更新する。定員を増やした場合は待機者を自動で繰り上げ、参加確定者がいる状態で日時を変えた場合は警告を返す。
- **認可:** そのイベントの主催者、または `ADMIN`。それ以外のログインユーザーは 403(イベントは全員に公開されているため 404 にしない)。判定は `event-policy.ts` を通す。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `eventId` | `String` | イベントID(cuid) |

- **Body**(すべて任意。最低 1 項目。各項目の形式は `POST /api/events` と同じ)
| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `title` | `String` |  | 1〜100 文字 |
| `description` | `String` |  | 1〜2000 文字 |
| `location` | `String` \| `null` |  | 0〜100 文字。空文字・`null` で削除 |
| `startsAt` | `String`(ISO 8601) |  | 変更する場合は現在時刻より未来 |
| `endsAt` | `String`(ISO 8601) |  | 更新後の `startsAt` より後 |
| `capacity` | `Int` |  | 1〜1000。現在の参加確定者数以上 |
| `registrationDeadline` | `String`(ISO 8601) \| `null` |  | `null` で未設定(開催開始まで)に戻す。値を変更する場合は現在時刻より未来、かつ更新後の `startsAt` 以前 |
| `cancelDeadline` | `String`(ISO 8601) \| `null` |  | `null` で未設定に戻す。更新後の `startsAt` 以前 |
| `categoryId` | `String` |  | 変更する場合は存在し有効なカテゴリ。現在のカテゴリが無効化済みでも、変更しなければそのまま保存できる |
| `tags` | `String[]` |  | 指定した場合はタグを丸ごと置き換える。0〜10 個、正規化ルールは作成時と同じ |

- 日時の前後関係は、既存値と送信値をマージした「更新後の値」に対して検証する。
- 「変更」とは、送信値が現在値と異なる場合を指す(同じ値の送信は変更とみなさない)。
- 処理全体を 1 トランザクションで行い、最初に `SELECT ... FOR UPDATE` でイベント行をロックする(定員・参加者数の判定と繰り上げを他の登録・キャンセルと直列化するため)。

**処理(更新に伴う副作用)**

1. **定員の増加:** 増えた空き数と待機人数の少ない方の人数を、position 昇順で参加確定に繰り上げる(待機行を削除し参加確定行を作成、`waitlist_promotions` に `trigger = CAPACITY_INCREASE`、`vacated_by_user_id = NULL` で記録)。
2. **日時の変更(参加確定者 1 人以上):** `schedule_changed_at` に現在時刻を記録する。
3. コミット後にログを出力する: 繰り上げ(1 人ごと)、日時変更(イベントID・旧日時・新日時・参加確定者数を `warn`)。

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": { "event": EventDetail, "warnings": Warning[] } }` に従う。作成 API(`{ "data": EventDetail }`)と異なり、警告を返すため `data` は `{ event, warnings }` の形にする(意図的な差)。`event` は更新後の詳細(`GET /api/events/:eventId` と同じ形)。`warnings` は該当がなければ空配列:
  - `{ code: "SCHEDULE_CHANGED_WITH_PARTICIPANTS", participantCount }` — 参加確定者がいる状態で `startsAt` / `endsAt` を変更した
  - `{ code: "WAITLIST_PROMOTED", promotedCount }` — 定員増加により待機者を繰り上げた
- **Error Responses: `400`**
  `VALIDATION_ERROR`(`details` に該当フィールド名)— 項目が 1 つもない、形式・範囲の不正、変更後の `startsAt` が現在時刻以前、`endsAt` が `startsAt` 以前、締切・期限が `startsAt` より後、変更後の `registrationDeadline` が現在時刻以前、変更先カテゴリが存在しない・無効化されている、`eventId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `403`**
  `FORBIDDEN` — 主催者でも admin でもない
- **Error Responses: `404`**
  `NOT_FOUND` — イベントが存在しない、または論理削除済み
- **Error Responses: `409`**
  - `EVENT_ALREADY_STARTED` — 開催開始後に `startsAt` / `endsAt` / `capacity` / `registrationDeadline` / `cancelDeadline` を変更しようとした(タイトル・説明・場所・カテゴリ・タグは開催後も変更可)
  - `CAPACITY_BELOW_REGISTERED` — `capacity` が現在の参加確定者数より小さい
---

---
##### **DELETE /api/events/:eventId**

- **機能概要:** イベントを論理削除する(`deleted_at` に現在時刻を記録)。削除後は一覧・詳細・マイページ・集計から除外され、どの API からも 404 になる。参加登録・キャンセル待ち・繰り上げ履歴・フィードバックの行は削除せず残す(誤削除時に DB から復旧できるようにするため)。
- **認可:** そのイベントの主催者、または `ADMIN`(不適切なイベントの削除)。それ以外のログインユーザーは 403。判定は `event-policy.ts` を通す。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `eventId` | `String` | イベントID(cuid) |

- 開催前・開催中・開催済みのいずれの状態でも削除できる。
- 1 トランザクションで、`SELECT ... FOR UPDATE` でイベント行をロックしてから `deleted_at` を設定する(同時に処理中の参加登録が削除済みイベントに登録しないようにするため)。
- コミット後、参加確定者または待機者が 1 人以上いれば、イベントID・参加確定者数・待機者数をログ出力する(通知の代わり)。
- 削除したイベントの復元 API は提供しない。

**レスポンス**

- **Success: `204`**
  ボディなし。
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `eventId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `403`**
  `FORBIDDEN` — 主催者でも admin でもない
- **Error Responses: `404`**
  `NOT_FOUND` — イベントが存在しない、または既に論理削除済み
---

#### 参加登録

---
##### **POST /api/events/:eventId/registration**

- **機能概要:** ログインユーザー自身をイベントの参加確定者として登録する。満席の場合は登録せず `EVENT_FULL` を返す(画面はキャンセル待ち登録に切り替える)。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)。ただしそのイベントの主催者は不可(403)。登録対象は常にログインユーザー自身で、URL・ボディにユーザー ID を含めない。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `eventId` | `String` | イベントID(cuid) |

- リクエストボディなし。
- 1 トランザクションで、最初に `SELECT ... FOR UPDATE` でイベント行をロックしてから、以下の順に判定する(空き 1 席への同時登録で定員を超えないようにするため)。
  1. イベントが存在し未削除 → 違反は `404`
  2. ログインユーザーが主催者でない → 違反は `403 ORGANIZER_CANNOT_REGISTER`
  3. 現在時刻 < `startsAt` かつ 現在時刻 < 実効登録締切(`registrationDeadline ?? startsAt`)→ 違反は `409 REGISTRATION_CLOSED`
  4. 自分の参加確定行・キャンセル待ち行がどちらもない → 違反は `409 ALREADY_REGISTERED`
  5. 参加確定者数 < `capacity` → 違反は `409 EVENT_FULL`
  6. `registrations` に行を作成(`attendance = UNMARKED`)
- DB の一意制約 `(event_id, user_id)` 違反(Prisma `P2002`)も `409 ALREADY_REGISTERED` に変換する。
- 判定に使う現在時刻はサーバー時刻。

**レスポンス**

- **Success: `201`**
  共通レスポンス形式 `{ "data": { "registrationId", "event": EventDetail } }` に従う。`event` は登録後の詳細(`myStatus` は `{ kind: "REGISTERED" }`、`registeredCount` / `remainingSeats` / `participants` / `permissions` は更新後の値)。
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `eventId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `403`**
  `ORGANIZER_CANNOT_REGISTER` — 自分が主催するイベントには登録できない(主催者は参加者とは別管理)
- **Error Responses: `404`**
  `NOT_FOUND` — イベントが存在しない、または論理削除済み
- **Error Responses: `409`**
  - `REGISTRATION_CLOSED` — 開催開始済み、または登録締切を過ぎている
  - `ALREADY_REGISTERED` — 既に参加確定、またはキャンセル待ち中(二重登録防止)
  - `EVENT_FULL` — 定員に達している(キャンセル待ちに登録できる)
---

---
##### **DELETE /api/events/:eventId/registration**

- **機能概要:** ログインユーザー自身の参加登録をキャンセルする。キャンセル待ちの待機者がいれば、先頭の待機者を同じトランザクションで参加確定に繰り上げる。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)。対象は常にログインユーザー自身の参加登録。admin が他人の参加をキャンセルする場合は `DELETE /api/events/:eventId/registrations/:registrationId` を使う。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `eventId` | `String` | イベントID(cuid) |

- リクエストボディなし。
- 以下を 1 トランザクションで行う。途中で失敗した場合はすべてロールバックする(キャンセルだけ成功して繰り上げが失われる、二重に繰り上がる、を防ぐため)。
  1. `SELECT ... FOR UPDATE` でイベント行をロック
  2. イベントが存在し未削除 → 違反は `404`
  3. 自分の参加確定行がある → 違反は `404`(未登録、キャンセル待ち中のみ、主催者の場合を含む)
  4. 現在時刻 < 実効キャンセル期限(`cancelDeadline ?? startsAt`)→ 違反は `409 CANCEL_DEADLINE_PASSED`
  5. 自分の参加確定行を物理削除する(キャンセルは参加履歴ではないため)
  6. 現在時刻 < `startsAt` で、キャンセル待ちが 1 人以上いれば、position が最小の待機者について: 参加確定行を作成(`attendance = UNMARKED`)→ 待機行を削除 → `waitlist_promotions` に記録(`trigger = CANCELLATION`、`promoted_user_id` = 繰り上がった人、`vacated_by_user_id` = キャンセルした本人、`waitlist_position` = 繰り上げ時点の position)
- 他の待機者の position は変更しない(順位は表示時に計算する)。
- コミット後、繰り上げがあれば繰り上げをログ出力する(通知の代わり)。
- キャンセル後に同じイベントへ再登録することは可能(通常の登録条件を満たす場合)。
- 判定に使う現在時刻はサーバー時刻。

**レスポンス**

- **Success: `204`**
  ボディなし。
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `eventId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `404`**
  `NOT_FOUND` — イベントが存在しない・論理削除済み、または自分の参加確定登録がない
- **Error Responses: `409`**
  `CANCEL_DEADLINE_PASSED` — キャンセル期限(未設定なら開催開始日時)を過ぎている。期限後のキャンセルは admin の強制キャンセルのみ可能
---

---
##### **GET /api/events/:eventId/registrations**

- **機能概要:** 出席管理画面用に、参加確定者の一覧(出席状態付き)、キャンセル待ちの一覧(順位付き)、出席状態の集計を返す。
- **認可:** そのイベントの主催者、または `ADMIN`。それ以外のログインユーザーは 403(参加者の氏名だけなら `GET /api/events/:eventId` で誰でも見られる)。判定は `event-policy.ts` を通す。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `eventId` | `String` | イベントID(cuid) |

- ページングなし(定員の上限が 1000 のため全件返す)。開催前でも呼べる(待機リストの確認・強制キャンセルのため)。

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": { "registrations", "waitlist", "summary" } }` に従う。
  - `registrations`: 参加確定者の配列(登録順)。各要素は `id`(registrationId)、`user`(`{ id, name }`)、`attendance`(`"UNMARKED"` \| `"PRESENT"` \| `"ABSENT"`)、`attendanceMarkedAt`(ISO 8601 UTC \| `null`)、`registeredAt`
  - `waitlist`: 待機者の配列(position 昇順)。各要素は `id`(waitlistEntryId)、`user`(`{ id, name }`)、`rank`(1 始まりの順位。position の値そのものではなく、並び順から計算した順位)、`joinedAt`
  - `summary`: `{ present, absent, unmarked }`(参加確定者の出席状態ごとの人数)
  - 主催者は `registrations` に含まれない。
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `eventId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `403`**
  `FORBIDDEN` — 主催者でも admin でもない
- **Error Responses: `404`**
  `NOT_FOUND` — イベントが存在しない、または論理削除済み
---

---
##### **DELETE /api/events/:eventId/registrations/:registrationId**

- **機能概要:** admin が他人の参加登録を強制キャンセルする。キャンセル期限を過ぎていても実行できる。開催開始前であれば、キャンセル待ちの先頭を同じトランザクションで繰り上げる。
- **認可:** `ADMIN` のみ(ルートに `requireRole("ADMIN")`)。主催者であっても member は不可。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `eventId` | `String` | イベントID(cuid) |
| `registrationId` | `String` | 参加登録ID(cuid)。`GET /api/events/:eventId/registrations` の `registrations[].id` |

- リクエストボディなし。
- 以下を 1 トランザクションで行い、途中で失敗した場合はすべてロールバックする。
  1. `SELECT ... FOR UPDATE` でイベント行をロック
  2. イベントが存在し未削除 → 違反は `404`
  3. `registrationId` の参加確定行が存在し、かつ `eventId` のイベントに属する → 違反は `404`(別イベントの登録 ID を指定した場合も 404)
  4. キャンセル期限の判定は行わない
  5. 参加確定行を物理削除する
  6. 現在時刻 < `startsAt` で、キャンセル待ちが 1 人以上いれば、position が最小の待機者を繰り上げる(参加確定行を作成 → 待機行を削除 → `waitlist_promotions` に `trigger = ADMIN_CANCELLATION`、`vacated_by_user_id` = キャンセルされた参加者、`waitlist_position` = 繰り上げ時点の position で記録)。開催開始後は繰り上げない
- コミット後、繰り上げがあれば繰り上げをログ出力する(通知の代わり)。
- 判定に使う現在時刻はサーバー時刻。

**レスポンス**

- **Success: `204`**
  ボディなし。
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `eventId` または `registrationId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `403`**
  `FORBIDDEN` — admin ではない
- **Error Responses: `404`**
  `NOT_FOUND` — イベントが存在しない・論理削除済み、または参加登録が存在しない・そのイベントの登録ではない
---

---
##### **PUT /api/events/:eventId/registrations/:registrationId/attendance**

- **機能概要:** 参加確定者 1 人の出席状態を設定する。出席・欠席のマークに加え、誤操作リカバリのため未マークに戻すこともできる。
- **認可:** そのイベントの主催者、または `ADMIN`。それ以外のログインユーザーは 403。判定は `event-policy.ts` を通す。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `eventId` | `String` | イベントID(cuid) |
| `registrationId` | `String` | 参加登録ID(cuid)。`GET /api/events/:eventId/registrations` の `registrations[].id` |

- **Body**
| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `status` | `"PRESENT"` \| `"ABSENT"` \| `"UNMARKED"` | ✅ | 設定する出席状態。どの状態からどの状態へも変更できる |

- 判定順: イベントが存在し未削除(`404`)→ 主催者または admin(`403`)→ 現在時刻 >= `startsAt`(`400 EVENT_NOT_STARTED`)→ `registrationId` の参加確定行が存在しそのイベントに属する(`404`)。
- `PRESENT` / `ABSENT` を設定した場合は `attendance_marked_at` = 現在時刻、`attendance_marked_by_id` = ログインユーザーを記録する。`UNMARKED` に戻した場合は両方を `null` にする。
- 同じ状態を再設定しても成功(冪等)。PUT のため結果は送信値だけで決まる。
- 出席状態を変更しても、既存のフィードバックは削除しない。
- 判定に使う現在時刻はサーバー時刻。

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": { "id", "attendance", "attendanceMarkedAt" } }` に従う。`id` は registrationId、`attendanceMarkedAt` は ISO 8601 UTC または `null`。- **Error Responses: `400`**
  - `VALIDATION_ERROR` — `status` が許可値以外・欠落、`eventId` / `registrationId` が cuid 形式でない
  - `EVENT_NOT_STARTED` — 開催開始日時より前は出席マークできない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `403`**
  `FORBIDDEN` — 主催者でも admin でもない
- **Error Responses: `404`**
  `NOT_FOUND` — イベントが存在しない・論理削除済み、または参加登録が存在しない・そのイベントの登録ではない
---

#### キャンセル待ち

---
##### **POST /api/events/:eventId/waitlist**

- **機能概要:** 満席のイベントに、ログインユーザー自身をキャンセル待ちとして登録する。待機順(position)は最後尾に付く。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)。ただしそのイベントの主催者は不可(403)。登録対象は常にログインユーザー自身。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `eventId` | `String` | イベントID(cuid) |

- リクエストボディなし。
- 1 トランザクションで、最初に `SELECT ... FOR UPDATE` でイベント行をロックしてから、以下の順に判定する(空き判定と position 採番を他の登録・キャンセルと直列化するため)。
  1. イベントが存在し未削除 → 違反は `404`
  2. ログインユーザーが主催者でない → 違反は `403 ORGANIZER_CANNOT_REGISTER`
  3. 現在時刻 < `startsAt` かつ 現在時刻 < 実効登録締切(`registrationDeadline ?? startsAt`)→ 違反は `409 REGISTRATION_CLOSED`
  4. 自分の参加確定行・キャンセル待ち行がどちらもない → 違反は `409 ALREADY_REGISTERED`
  5. 参加確定者数 >= `capacity`(満席)→ 空きがあれば `409 SEATS_AVAILABLE`(通常の参加登録をすべきため)
  6. `waitlist_entries` に行を作成。`position` = そのイベントの現在の待機行の最大 position + 1(行が無ければ 1)。最後尾の待機者が抜けた直後は同じ番号が再利用されることがあるが、残っている全員より後ろになるため順序は崩れない
- position は単調増加で、一度振った番号は振り直さない。待機解除してから再登録した場合も最後尾になる。
- DB の一意制約 `(event_id, user_id)` / `(event_id, position)` 違反(Prisma `P2002`)は `409 ALREADY_REGISTERED` に変換する。
- 判定に使う現在時刻はサーバー時刻。

**レスポンス**

- **Success: `201`**
  共通レスポンス形式 `{ "data": { "waitlistEntryId", "event": EventDetail } }` に従う(参加登録 API と同じ形)。`event` は登録後の詳細で、`myStatus` は `{ kind: "WAITLISTED", rank }`(rank は position 昇順で数えた 1 始まりの順位。登録直後は待機人数と同じ)。
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `eventId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `403`**
  `ORGANIZER_CANNOT_REGISTER` — 自分が主催するイベントにはキャンセル待ち登録できない
- **Error Responses: `404`**
  `NOT_FOUND` — イベントが存在しない、または論理削除済み
- **Error Responses: `409`**
  - `REGISTRATION_CLOSED` — 開催開始済み、または登録締切を過ぎている
  - `ALREADY_REGISTERED` — 既に参加確定、またはキャンセル待ち中
  - `SEATS_AVAILABLE` — 空きがあるため、キャンセル待ちではなく通常の参加登録を行う
---

---
##### **DELETE /api/events/:eventId/waitlist**

- **機能概要:** ログインユーザー自身のキャンセル待ちを解除する。期限はなく、いつでも解除できる。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)。対象は常にログインユーザー自身のキャンセル待ち。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `eventId` | `String` | イベントID(cuid) |

- リクエストボディなし。
- 1 トランザクションで、最初に `SELECT ... FOR UPDATE` でイベント行をロックしてから処理する(同時に起きた繰り上げと競合しないようにするため。繰り上げ済みなら待機行は既に無く 404 になる)。
  1. イベントが存在し未削除 → 違反は `404`
  2. 自分のキャンセル待ち行がある → 違反は `404`
  3. 自分のキャンセル待ち行を物理削除する
- 他の待機者の position は変更しない。後ろの待機者の表示順位は、position 昇順で数え直すことで自動的に 1 つ繰り上がって見える。
- 解除後に再びキャンセル待ちに登録した場合は最後尾になる。

**レスポンス**

- **Success: `204`**
  ボディなし。
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `eventId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `404`**
  `NOT_FOUND` — イベントが存在しない・論理削除済み、または自分のキャンセル待ちがない(既に繰り上げ済みで参加確定になっている場合を含む)
---

#### フィードバック

---
##### **GET /api/events/:eventId/feedbacks**

- **機能概要:** イベントのレビュー一覧と平均評価を返す。閲覧者自身の投稿(非公開化されていても)も別枠で返す。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)。返す内容はロールで変わる:
  - 一般ユーザー: 公開レビューのみ。匿名投稿の投稿者は返さない
  - `ADMIN`: 非公開レビューも含めて返し、匿名投稿の投稿者も返す

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `eventId` | `String` | イベントID(cuid) |

- **Query Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `page` | `Int` | 任意。1 以上、既定 1 |
| `limit` | `Int` | 任意。1〜50、既定 20 |

- 並び順は投稿日時の新しい順(同時刻は `id` 降順)。
- 開催終了前でも呼べる(その場合は 0 件)。

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": { "rating", "myFeedback", "items", "total", "page", "limit" } }` に従う。
  - `rating`: `{ average, count }`。**非公開レビューを除いて**集計する(admin が閲覧しても同じ値)。`average` は小数第 1 位に丸め、0 件なら `null`
  - `myFeedback`: 閲覧者自身の投稿(`Feedback`)、無ければ `null`。非公開化されていても返す(本人には「非公開」状態で見せるため)
  - `items`: `Feedback[]`。一般ユーザーには `isHidden = false` のもののみ、admin には全件。`total` はそれに対応する件数
  - `Feedback` の項目:
    - `id`、`rating`(1〜5)、`comment`、`isAnonymous`、`isHidden`、`isMine`(閲覧者自身の投稿か)、`createdAt`、`updatedAt`
    - `author`: `{ id, name }` または `null`。匿名投稿で閲覧者が admin でなければ `null`(閲覧者本人の投稿でも `null`。本人の判定は `isMine` で行う)
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `eventId` が cuid 形式でない、`page` / `limit` が範囲外・整数でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `404`**
  `NOT_FOUND` — イベントが存在しない、または論理削除済み
---

---
##### **POST /api/events/:eventId/feedback**

- **機能概要:** 開催終了後、出席したイベントに対してログインユーザー自身のフィードバック(星評価 + 一言コメント)を投稿する。1 イベントにつき 1 人 1 件。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)のうち、投稿条件を満たすユーザーのみ。そのイベントの主催者は不可。投稿者は常にログインユーザー自身。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `eventId` | `String` | イベントID(cuid) |

- **Body**
| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `rating` | `Int` | ✅ | 星評価。1〜5 の整数 |
| `comment` | `String` | ✅ | 一言コメント。前後空白を除去して 1〜200 文字 |
| `isAnonymous` | `Boolean` |  | 匿名投稿にするか。既定 `false`。匿名でも投稿者は DB に保存し、admin には表示する |

- 判定順(入力形式の検証の後):
  1. イベントが存在し未削除 → 違反は `404`
  2. ログインユーザーが主催者でない → 違反は `403 FEEDBACK_NOT_ALLOWED`
  3. 現在時刻 >= `endsAt`(開催終了済み)→ 違反は `403 FEEDBACK_NOT_ALLOWED`
  4. 自分の参加確定行があり `attendance = PRESENT` → 違反は `403 FEEDBACK_NOT_ALLOWED`(未登録・欠席・未マークを含む)
  5. 自分の投稿がまだない → 違反は `409 FEEDBACK_ALREADY_EXISTS`
- 2〜4 は同じコードで返し、`message` で理由(主催者のため / 開催終了前のため / 出席が記録されていないため)を区別する。
- DB の一意制約 `(event_id, user_id)` 違反(Prisma `P2002`、同時投稿)も `409 FEEDBACK_ALREADY_EXISTS` に変換する。
- 判定に使う現在時刻はサーバー時刻。

**レスポンス**

- **Success: `201`**
  共通レスポンス形式 `{ "data": Feedback }` に従う(`GET /api/events/:eventId/feedbacks` の `Feedback` と同じ形。`isMine: true`、`isHidden: false`。匿名投稿で投稿者が admin でなければ `author: null`)。
- **Error Responses: `400`**
  `VALIDATION_ERROR`(`details` に該当フィールド名)— `rating` が 1〜5 の整数でない、`comment` が空・200 文字超、`isAnonymous` が真偽値でない、`eventId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `403`**
  `FEEDBACK_NOT_ALLOWED` — 主催者である、開催終了前である、または出席(`PRESENT`)が記録されていない
- **Error Responses: `404`**
  `NOT_FOUND` — イベントが存在しない、または論理削除済み
- **Error Responses: `409`**
  `FEEDBACK_ALREADY_EXISTS` — 既にこのイベントに投稿済み(編集は `PATCH /api/events/:eventId/feedback`)
---

---
##### **PATCH /api/events/:eventId/feedback**

- **機能概要:** ログインユーザー自身のフィードバックを編集する(評価・コメント・匿名フラグ)。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)のうち、そのイベントに自分の投稿があり、現在も出席(`PRESENT`)と記録されているユーザーのみ。対象は常にログインユーザー自身の投稿。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `eventId` | `String` | イベントID(cuid) |

- **Body**(すべて任意。最低 1 項目)
| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `rating` | `Int` |  | 1〜5 の整数 |
| `comment` | `String` |  | 前後空白を除去して 1〜200 文字 |
| `isAnonymous` | `Boolean` |  | 匿名投稿にするか |

- 判定順(入力形式の検証の後):
  1. イベントが存在し未削除 → 違反は `404`
  2. 自分の投稿がある → 違反は `404`
  3. 自分の参加確定行があり `attendance = PRESENT`(投稿後に欠席・未マークへ修正された場合は編集不可)→ 違反は `403 FEEDBACK_NOT_ALLOWED`
- 非公開化されている投稿も編集できるが、編集しても非公開状態(`is_hidden`, `hidden_at`, `hidden_by_id`)は変わらない(admin の判断を投稿者が解除できないようにするため)。

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": Feedback }` に従う(`GET /api/events/:eventId/feedbacks` の `Feedback` と同じ形、`isMine: true`)。
- **Error Responses: `400`**
  `VALIDATION_ERROR`(`details` に該当フィールド名)— 項目が 1 つもない、`rating` / `comment` / `isAnonymous` の形式・範囲の不正、`eventId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `403`**
  `FEEDBACK_NOT_ALLOWED` — 出席(`PRESENT`)が記録されていない(投稿後に出席状態が変更された)
- **Error Responses: `404`**
  `NOT_FOUND` — イベントが存在しない・論理削除済み、または自分の投稿がない
---

---
##### **PATCH /api/feedbacks/:feedbackId/visibility**

- **機能概要:** admin が不適切なレビューを非公開化、または非公開化したレビューを再公開する。非公開レビューは平均評価・件数の集計と一般ユーザーの一覧から除外される。
- **認可:** `ADMIN` のみ(ルートに `requireRole("ADMIN")`)。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `feedbackId` | `String` | フィードバックID(cuid) |

- **Body**
| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `isHidden` | `Boolean` | ✅ | `true` で非公開化、`false` で再公開 |

- `true` の場合は `hidden_at` = 現在時刻、`hidden_by_id` = ログインユーザーを記録する。`false` の場合は両方を `null` にする。
- 既に同じ状態でも成功する(冪等)。
- 論理削除済みイベントのレビューは対象外(404)。

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": Feedback }` に従う(admin 向けの形。匿名投稿でも `author` を含む)。
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `isHidden` が真偽値でない・欠落、`feedbackId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `403`**
  `FORBIDDEN` — admin ではない
- **Error Responses: `404`**
  `NOT_FOUND` — フィードバックが存在しない、またはそのイベントが論理削除済み
---

#### カテゴリ

`Category` の形: `{ id, name, sortOrder, isActive }`。

---
##### **GET /api/categories**

- **機能概要:** カテゴリ一覧を返す。イベント作成・編集フォームと一覧の絞り込みの選択肢、カテゴリ管理画面で使う。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)。無効化カテゴリを含めた取得は admin のみ。

**リクエスト**

- **Query Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `includeInactive` | `"true"` \| `"false"` | 任意。既定 `"false"`。`"true"` は admin のみ有効で、無効化カテゴリも含める。admin 以外が指定した場合は無視して有効なカテゴリのみ返す(エラーにはしない) |

- 並び順は `sortOrder` 昇順、同値は `name` 昇順。

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": Category[] }` に従う。admin が `includeInactive=true` で取得した場合に限り、各要素に `eventCount`(そのカテゴリを使うイベント数。論理削除済みを含む)を加える。カテゴリ管理画面は `eventCount > 0` なら削除ボタンの代わりに無効化を案内する。member 向けのレスポンスには含めない。
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `includeInactive` が許可値以外
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
---

---
##### **POST /api/categories**

- **機能概要:** カテゴリを追加する。
- **認可:** `ADMIN` のみ(ルートに `requireRole("ADMIN")`)。

**リクエスト**

- **Body**
| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `name` | `String` | ✅ | カテゴリ名。前後空白を除去して 1〜30 文字。既存カテゴリ(無効化済みを含む)と大文字小文字を区別せず重複しないこと |
| `sortOrder` | `Int` |  | 表示順。0〜999、既定 0 |

- 作成時は `isActive: true`。
- 名前の重複は、サービス層の大文字小文字を区別しない比較と、DB の一意制約(`P2002` を変換)の両方で検出する。

**レスポンス**

- **Success: `201`**
  共通レスポンス形式 `{ "data": Category }` に従う。
- **Error Responses: `400`**
  `VALIDATION_ERROR`(`details` に該当フィールド名)— `name` が空・30 文字超、`sortOrder` が範囲外・整数でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `403`**
  `FORBIDDEN` — admin ではない
- **Error Responses: `409`**
  `CATEGORY_NAME_TAKEN` — 同じ名前(大文字小文字の違いのみを含む)のカテゴリが既にある
---

---
##### **PATCH /api/categories/:categoryId**

- **機能概要:** カテゴリの名前・表示順を変更する、または有効/無効を切り替える。使用中のカテゴリを使わせたくない場合は削除ではなく `isActive: false` にする。
- **認可:** `ADMIN` のみ(ルートに `requireRole("ADMIN")`)。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `categoryId` | `String` | カテゴリID(cuid) |

- **Body**(すべて任意。最低 1 項目)
| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `name` | `String` |  | 1〜30 文字。自分以外のカテゴリと大文字小文字を区別せず重複しないこと |
| `sortOrder` | `Int` |  | 0〜999 |
| `isActive` | `Boolean` |  | `false` で無効化(新規選択肢・絞り込み候補から消える。既存イベントの表示には残る)、`true` で再有効化 |

- 名前を変更すると、そのカテゴリを使う既存イベントの表示名も変わる(イベントは ID で参照しているため)。

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": Category }` に従う。
- **Error Responses: `400`**
  `VALIDATION_ERROR`(`details` に該当フィールド名)— 項目が 1 つもない、形式・範囲の不正、`categoryId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `403`**
  `FORBIDDEN` — admin ではない
- **Error Responses: `404`**
  `NOT_FOUND` — カテゴリが存在しない
- **Error Responses: `409`**
  `CATEGORY_NAME_TAKEN` — 同じ名前のカテゴリが他にある
---

---
##### **DELETE /api/categories/:categoryId**

- **機能概要:** 使われていないカテゴリを物理削除する。イベントが 1 件でも紐づくカテゴリは削除できない(代わりに `PATCH` で無効化する)。
- **認可:** `ADMIN` のみ(ルートに `requireRole("ADMIN")`)。

**リクエスト**

- **Path Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `categoryId` | `String` | カテゴリID(cuid) |

- 紐づくイベントの件数は論理削除済みイベントも含めて数える(削除済みイベントの履歴と集計の整合性を保つため)。
- DB の外部キー `events.category_id` は `ON DELETE RESTRICT` のため、判定と削除の間に別リクエストでイベントが作られても孤児イベントは生まれない(外部キー違反は `409 CATEGORY_IN_USE` に変換する)。

**レスポンス**

- **Success: `204`**
  ボディなし。
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `categoryId` が cuid 形式でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
- **Error Responses: `403`**
  `FORBIDDEN` — admin ではない
- **Error Responses: `404`**
  `NOT_FOUND` — カテゴリが存在しない
- **Error Responses: `409`**
  `CATEGORY_IN_USE` — このカテゴリを使うイベント(論理削除済みを含む)がある。`message` に件数を含め、無効化を案内する
---

#### タグ

---
##### **GET /api/tags**

- **機能概要:** タグ検索・タグ入力のオートコンプリート候補を返す。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)。

**リクエスト**

- **Query Parameters**
| 名前 | 型 | 説明 |
|---|---|---|
| `q` | `String` | 任意。0〜20 文字。保存時と同じ正規化をしてから前方一致で絞り込む。空なら全タグが対象 |
| `limit` | `Int` | 任意。1〜20、既定 10 |

- 並び順は `eventCount` 降順、同数は `name` 昇順。使用件数 0 のタグも候補に含める(最後尾に並ぶ)。

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": { "name", "eventCount" }[] }` に従う。`eventCount` は未削除イベントでの使用件数。
- **Error Responses: `400`**
  `VALIDATION_ERROR` — `q` が 20 文字超、`limit` が範囲外・整数でない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
---

#### マイページ

---
##### **GET /api/me/events**

- **機能概要:** マイページ用に、ログインユーザーが主催・参加登録・キャンセル待ちしているイベントと参加履歴を返す。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)。対象は常にログインユーザー自身。

**リクエスト**

パラメータ・ボディなし。論理削除済みイベントはすべての区分から除外する。

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": { "organizing", "organizedPast", "registered", "waitlisted", "history" } }` に従う。各要素は `GET /api/events` の `EventSummary`。
  - `organizing`: 自分が主催し、開催開始前のイベント(開催日昇順)
  - `organizedPast`: 自分が主催し、開催開始済みのイベント(新しい順、最大 20 件)
  - `registered`: 参加確定で、開催開始前のイベント(開催日昇順)
  - `waitlisted`: キャンセル待ち中で、開催開始前のイベント(開催日昇順。`myStatus.rank` に順位)
  - `history`: 参加確定で、開催開始済みのイベント(新しい順、最大 50 件)。`EventSummary` に `attendance`(`"UNMARKED"` \| `"PRESENT"` \| `"ABSENT"`)と `hasFeedback`(自分の投稿があるか)を加える
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
---

---
##### **GET /api/me/stats**

- **機能概要:** マイページの統計(累計参加数・出席率・カテゴリ別参加傾向)を返す。
- **認可:** ログイン済みの全ロール(`MEMBER` / `ADMIN`)。対象は常にログインユーザー自身。

**リクエスト**

パラメータ・ボディなし。

- 母集団: 開催開始済み(`starts_at <= 現在時刻`)・未削除のイベントに対する、自分の参加確定行。主催したイベントは含まない。

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": { ... } }` に従う。
  - `participationCount`: 累計参加数。母集団のうち `attendance` が `ABSENT` 以外(`PRESENT` + `UNMARKED`)の件数
  - `presentCount` / `absentCount` / `unmarkedCount`: 母集団の出席状態ごとの件数
  - `attendanceRate`: `presentCount ÷ (presentCount + absentCount)`、0〜1 の数値。分母 0 なら `null`(画面は「-」と表示)
  - `byCategory`: `{ category: Category, count }[]`。`participationCount` と同じ数え方をカテゴリ別に集計(無効化カテゴリも含む)。`count` 降順、同数は `sortOrder` 昇順。件数 0 のカテゴリは含めない
- **Error Responses: `401`**
  `UNAUTHENTICATED` — 未ログイン、トークン無効・期限切れ
---

#### ヘルスチェック

---
##### **GET /api/health**

- **機能概要:** API が起動しているかを返す(テンプレート既存)。コンテナのヘルスチェックや監視に使う。
- **認可:** 公開(未ログインで呼べる)。

**レスポンス**

- **Success: `200`**
  共通レスポンス形式 `{ "data": { "ok": true } }` に従う。
- **Error Responses: なし**
  入力を受け取らず認証も要求しないため、業務上のエラーは発生しない
---


## 7. 技術スタック

選定理由は `docs/技術スタック.md` を参照。構成は SPA + REST API(SSR なし)。空き数などのリアルタイム反映は行わず、表示時に取得し操作後に再取得する。

### 7.1 フロントエンド

| 技術 | バージョン | 用途・方針 |
|---|---|---|
| React | 19.3 | UI。features ごとにコンポーネントを分ける(8 章) |
| Vite | 8 | 開発サーバー・ビルド。`/api` を `API_PROXY_TARGET` へプロキシ |
| React Router | 8(ライブラリモード) | ルーティング、ルートガード(未ログイン → P-01、ADMIN 専用 → P-10) |
| TanStack Query | 5 | サーバー状態の管理。キーファクトリは feature ごと。操作後に関連キーを invalidate |
| Tailwind CSS | 4.3 | スタイル。色はデザイントークン(`styles/index.css` の `@theme`)。コンポーネントライブラリは使わない |
| Zod | 4.6 | `shared/` の共有スキーマでフォームを検証 |
| date-fns + date-fns-tz | 4 / 3 | JST 表示・`datetime-local` の JST → UTC 変換(`utils/datetime.ts` に集約) |

### 7.2 バックエンド

| 技術 | バージョン | 用途・方針 |
|---|---|---|
| Node.js | 24 | ランタイム(ESM, TypeScript, `tsx` で実行) |
| Express | 5.3 | HTTP。非同期ハンドラの例外はエラーハンドラへ(コントローラに try/catch を書かない) |
| Zod | 4.6 | 全入力(params / query / body)の検証 |
| Prisma | 7.10(`@prisma/adapter-pg`) | ORM・マイグレーション。対話的トランザクション + `$queryRaw` で `SELECT ... FOR UPDATE` |
| jsonwebtoken | 9 | JWT(HS256 固定、7 日) |
| bcrypt | 6 | パスワードハッシュ(12 ラウンド) |
| cookie-parser | 1.4 | Cookie `token` の読み取り |
| helmet | 8.3 | セキュリティヘッダー |
| express-rate-limit | 8.7 | ログインの IP 単位レート制限 |
| ロガー | 既存 `lib/logger.ts` | JSON Lines。通知の代わりのログ出力(コミット後) |

### 7.3 データベース

| 技術 | バージョン | 用途・方針 |
|---|---|---|
| PostgreSQL | 17(Docker) | 日時は `timestamptz` で UTC 保存。CHECK 制約・`lower(name)` 一意インデックス・行ロックを使う |
| Prisma Migrate | 7.10 | スキーマ変更は新しいマイグレーションで行い、適用済みマイグレーションは編集しない |

### 7.4 テスト

| 技術 | バージョン | 用途・方針 |
|---|---|---|
| Vitest | 5 | バックエンド・フロントエンド共通のテストランナー |
| Supertest | 7 | API テスト。実 DB(`app_test`)に対して実行し、Prisma はモックしない。同時キャンセルは `Promise.all` で再現 |
| Testing Library | 16 | コンポーネントテスト(`renderApp()` でルーター込みで描画) |
| Playwright | `@playwright/test` | E2E(Chromium のみ、`e2e/` ワークスペース、ローカル実行) |

### 7.5 共通の方針
- API レスポンスは `{ data }` / `{ error: { code, message, details? } }`。JSON のキーは camelCase。
- ID は cuid 文字列。
- 日時は UTC 保存・ISO 8601 UTC 送受信・JST 表示。コンテナは `TZ=UTC`。

## 8. ディレクトリ構成

npm workspaces のモノレポ(既存テンプレートを土台にする)。Prisma スキーマとマイグレーションは `backend/prisma/` に置く(仕様の提出物 `prisma/schema.prisma` はこの位置を指す。README にも明記する)。テンプレートの `todos` 関連とサインアップは削除する。

```
/
├── .github/workflows/ci.yml        # push 時に lint・型チェック・API テスト・フロントテスト
├── docker-compose.yml              # db / backend / frontend
├── docker/postgres-init/           # 初回起動時に app_test DB を作成
├── docs/
│   ├── manifest.md                 # 本書(仕様の正本)
│   ├── 詳細要求リスト.md  技術スタック.md  初期選定要素リスト.md
│   ├── coding_standards.md  ARCHITECTURE.md
│   └── screenshots/                # 動作確認のスクリーンショット
├── shared/src/                     # フロント・バック共通の Zod スキーマと型
│   ├── api.ts                      # レスポンス型・ERROR_STATUS(6 章のエラーコード一覧)
│   ├── auth.ts  event.ts  registration.ts  waitlist.ts
│   └── feedback.ts  category.ts  tag.ts  me.ts
├── backend/
│   ├── Dockerfile
│   ├── prisma/
│   │   ├── schema.prisma           # 5.4 のスキーマ
│   │   ├── migrations/             # CHECK・lower(name) 一意インデックスを含む
│   │   └── seed.ts                 # 冪等、日時は実行時刻からの相対値
│   ├── src/
│   │   ├── app.ts  server.ts
│   │   ├── config/env.ts           # 環境変数の読み込みはここだけ
│   │   ├── routes/                 # auth, events, registrations, waitlist, feedbacks,
│   │   │                           # categories, tags, me, health(index.ts で登録)
│   │   ├── middleware/             # validate, requireAuth(DB からロール読込), requireRole,
│   │   │                           # rateLimits, errorHandler
│   │   ├── controllers/            # routes と同名の *.controller.ts(HTTP のみ)
│   │   ├── services/               # events, registrations(登録・キャンセル・繰り上げ),
│   │   │   │                       # waitlist, attendance, feedbacks, categories, tags, me, auth
│   │   │   └── policies/event-policy.ts   # 主催者 or admin の判定を集約
│   │   ├── lib/                    # prisma, jwt, password, logger, tag-normalize, event-lock
│   │   └── errors/AppError.ts
│   └── tests/                      # *.api.test.ts(実 DB)
├── frontend/
│   ├── Dockerfile
│   └── src/
│       ├── app/
│       │   ├── router.tsx  provider.tsx  root-layout.tsx  route-guards.tsx
│       │   └── routes/             # login, events, event-detail, event-new, event-edit,
│       │                           # attendance, feedback, my, admin-categories,
│       │                           # forbidden, not-found の各 *-page.tsx(P-01〜P-11)
│       ├── features/
│       │   ├── auth/               # ログインフォーム、useMe、ログアウト
│       │   ├── events/             # 一覧・検索・カード・詳細・作成/編集フォーム・削除
│       │   ├── registrations/      # 参加ボタン、出席管理テーブル、強制キャンセル
│       │   ├── feedbacks/          # レビュー一覧・平均評価・投稿フォーム・非公開化
│       │   ├── categories/         # 選択肢取得、カテゴリ管理
│       │   └── me/                 # マイイベント・統計
│       ├── components/ui/          # Button, FormField, Spinner, ErrorMessage, Modal など
│       ├── utils/datetime.ts       # JST ⇔ UTC 変換と表示
│       ├── lib/  config/  hooks/  styles/
│       └── testing/                # renderApp()
└── e2e/                            # Playwright(ワークスペース)
    ├── playwright.config.ts
    └── tests/
```

- 各 feature は `api/`(リクエスト関数・クエリフック・キーファクトリ)と `components/` を持ち、他の feature や `app/` を import しない。ページ(`app/routes/`)で features を組み合わせる。

## 9. 開発環境構築

### 9.1 前提ツール
- Docker Desktop(`docker compose` が使えること)
- ローカルで実行する場合のみ: Node.js 24(`.nvmrc`)、npm

### 9.2 Docker で起動する(推奨・提出物の確認方法)

1. リポジトリを clone する。
2. `docker compose up -d` を実行する。以下が起動する。
   - `db`: `postgres:17`、ホストポート 5433、ヘルスチェック付き。初回起動時に `app_test` DB も作成する。
   - `backend`: `node:24`、ポート 3000。`db` が healthy になってから `prisma migrate deploy` → `seed` → `tsx watch` の順に実行する。
   - `frontend`: `node:24`、ポート 5173、`vite --host 0.0.0.0`。`/api` は `http://backend:3000` へプロキシする。
3. `http://localhost:5173` を開き、seed ユーザーでログインする。

- ソースはボリュームマウントでホットリロードする。`node_modules` は名前付きボリュームでホストと共有しない。
- コンテナは `TZ=UTC` で動かす。backend の環境変数は compose の `environment` で開発用の値を渡し、本物の秘密情報は置かない。

### 9.3 ローカルで起動する

1. `npm install`
2. `cp backend/.env.example backend/.env`(`JWT_SECRET` を 32 文字以上に設定)
3. `npm run db:up`(`db` サービスのみ起動)
4. `npm run db:migrate`
5. `npm run db:seed`
6. `npm run dev`(API :3000 + Web :5173)

### 9.4 環境変数

| 変数 | 設定先 | 例(開発) | 説明 |
|---|---|---|---|
| `DATABASE_URL` | backend | `postgresql://app:app@localhost:5433/app`(Docker 内は `@db:5432`) | PostgreSQL の接続先 |
| `JWT_SECRET` | backend | 32 文字以上のランダム文字列 | JWT の署名鍵。短いと起動時にエラー |
| `PORT` | backend | `3000` | API のポート |
| `NODE_ENV` | backend | `development` | `development` / `test` / `production`。`production` で Cookie に `Secure` を付ける |
| `CORS_ORIGIN` | backend | `http://localhost:5173` | ブラウザから API を呼べるオリジン |
| `TZ` | backend コンテナ | `UTC` | サーバー時刻を UTC に固定 |
| `API_PROXY_TARGET` | frontend | 既定 `http://localhost:3000`(Docker 内は `http://backend:3000`) | Vite の `/api` プロキシ先 |

- `.env` はコミットしない。`backend/.env.example` と `backend/.env.test`(秘密情報なし)はコミットする。

### 9.5 seed データ
- ユーザー: `admin@example.com`(ADMIN)と `alice` / `bob` / `carol` / `dave` / `erin`(`@example.com`, MEMBER)。パスワードは全員 `password123`(開発専用)。
- カテゴリ: 勉強会 / 懇親会 / 講演会 / 研修 / その他。
- イベント: 空きあり・満席 + 待機 2 名・登録締切済み・キャンセル期限済み・開催済み(出席状態混在 + レビュー 3 件、うち匿名 1・非公開 1)・フィードバック未投稿の出席者あり・論理削除済み・無効化カテゴリ使用、の各パターン。日時は seed 実行時刻からの相対値で作る。

### 9.6 テスト・品質チェック

| 内容 | コマンド |
|---|---|
| バックエンド API テスト + フロントエンドテスト | `npm test` |
| 型チェック | `npm run typecheck` |
| Lint | `npm run lint` |
| E2E(Docker で起動した環境に対して実行) | `npm test -w e2e` |

- バックエンドのテストは `backend/.env.test` を読み、`tests/global-setup.ts` で `prisma migrate deploy` を実行する。`app_test` が無い場合は `docker compose down -v && npm run db:up`(開発データも消える)。

### 9.7 開発ルール
- Git は `main` に直接コミットし、コミットメッセージは Conventional Commits(`feat(scope): ...` / `fix` / `docs` / `test` / `refactor` / `chore`)。
- CI は GitHub Actions で、push 時に lint・型チェック・バックエンド API テスト(Postgres サービスコンテナ)・フロントエンドテストを実行する。E2E はローカルのみ。
- 動作確認のスクリーンショットは `docs/screenshots/` に保存する。

## 10. 将来の拡張（スコープ外）

- 通知の実送信(メール・Slack 連携など)。現状はログ出力と繰り上げ履歴で代替。
- ユーザー登録・招待(seed のみで作成)。
- 削除したイベントの復元。
- リアルタイム反映(WebSocket / SSE)。
- 候補: パスワード変更、ユーザー管理画面(ロール変更)、使われなくなったタグの定期削除、モバイル最適化とアクセシビリティ対応(仕様上は任意)、E2E テストの CI 実行。
