import { useMe } from "@/features/auth/api/auth-queries";

/**
 * 仮のトップページ。ログインできていることだけを確認する。
 * イベント一覧(P-02)などの画面はフロントエンドのタスクリストで実装し、このページは置き換える。
 */
export function HomePage() {
  const { user } = useMe();
  if (!user) return null;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">ようこそ、{user.name} さん</h2>
      <p className="text-sm text-muted">
        ロール: {user.role} / {user.email}
      </p>
      <p className="text-sm text-muted">イベントの画面はこれから実装します。</p>
    </div>
  );
}
