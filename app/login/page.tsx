import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { safePath } from "@/lib/utils";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { user } = await getSession();
  const { next, error } = await searchParams;
  if (user) redirect(safePath(next));
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">HT</div>
          <h1 className="text-xl font-semibold">Land Acquisitions</h1>
          <p className="text-sm text-muted-foreground">Honest Transportation</p>
        </div>
        <LoginForm next={safePath(next)} error={error} />
      </div>
    </main>
  );
}
