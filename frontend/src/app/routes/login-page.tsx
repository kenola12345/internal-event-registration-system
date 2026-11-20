import { LoginForm } from "@/features/auth/components/login-form";

/** P-01 ログイン。アカウントは seed で作成するため、サインアップへの導線は置かない(マニフェスト 3-1) */
export function LoginPage() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">ログイン</h2>
      <LoginForm />
    </div>
  );
}
