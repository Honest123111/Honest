import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Waiting for access" };

export default async function PendingPage() {
  const { user, profile } = await getSession();
  if (!user) redirect("/login");
  if (profile?.is_active) redirect("/");
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="max-w-sm">
        <CardContent className="grid gap-3 p-5 text-sm">
          <h1 className="text-base font-semibold">Waiting for access</h1>
          <p>
            You&apos;re signed in as <b>{user.email}</b>, but this account hasn&apos;t been activated. An admin needs to turn it on
            in Settings → Users.
          </p>
          <form action="/auth/signout" method="post">
            <Button variant="outline" className="w-full">Sign out</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
