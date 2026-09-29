import { requireMember } from "@/lib/auth";
import { AppDataProvider } from "@/components/layout/app-data";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireMember();
  const [team, statuses, strategies, tags] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, is_active").order("full_name"),
    supabase.from("lead_statuses").select("*").eq("active", true).order("sort_order"),
    supabase.from("strategies").select("*").eq("active", true).order("sort_order"),
    supabase.from("tags").select("*").order("name"),
  ]);
  const me = { id: profile.id, full_name: profile.full_name, email: profile.email, role: profile.role, is_active: profile.is_active };
  return (
    <AppDataProvider
      value={{
        me,
        team: (team.data ?? []).filter((t) => t.is_active),
        statuses: statuses.data ?? [],
        strategies: strategies.data ?? [],
        tags: tags.data ?? [],
      }}
    >
      <AppShell>{children}</AppShell>
    </AppDataProvider>
  );
}
