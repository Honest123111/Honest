import { redirect } from "next/navigation";
import { can, requireMember } from "@/lib/auth";
import { PageHeader } from "@/components/ui/misc";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, profile } = await requireMember();
  if (!can.admin(profile.role)) redirect("/");
  const [users, settings, providers] = await Promise.all([
    supabase.from("profiles").select("*").order("is_active", { ascending: false }).order("email"),
    supabase.from("app_settings").select("*").single(),
    supabase.from("provider_settings").select("provider, enabled, is_paid, monthly_budget_usd").order("provider"),
  ]);
  return (
    <>
      <PageHeader title="Settings" description="Admin only." />
      <SettingsView users={users.data ?? []} settings={settings.data!} providers={providers.data ?? []} />
    </>
  );
}
