"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/labels";
import { errorMessage, fmtDateTime, fmtMoney } from "@/lib/utils";
import { useAppData } from "@/components/layout/app-data";
import type { Database } from "@/lib/database.types";

type T = Database["public"]["Tables"];

export function SettingsView({ users, settings, providers }: {
  users: T["profiles"]["Row"][];
  settings: T["app_settings"]["Row"];
  providers: Pick<T["provider_settings"]["Row"], "provider" | "enabled" | "is_paid" | "monthly_budget_usd">[];
}) {
  const router = useRouter();
  const { me, tags } = useAppData();
  const [busy, setBusy] = useState(false);
  const [tag, setTag] = useState("");

  async function updateUser(id: string, values: T["profiles"]["Update"]) {
    const { error } = await createClient().from("profiles").update(values).eq("id", id);
    if (error) return toast.error(errorMessage(error));
    toast.success("User updated");
    router.refresh();
  }

  async function saveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => Number(f.get(k));
    setBusy(true);
    const { error } = await createClient().from("app_settings").update({
      overall_monthly_budget_usd: n("overall_monthly_budget_usd"),
      red_flag_monthly_spend_usd: n("red_flag_monthly_spend_usd"),
      red_flag_mom_growth_pct: n("red_flag_mom_growth_pct"),
      red_flag_tokens_per_tx: n("red_flag_tokens_per_tx"),
      stale_lead_days: n("stale_lead_days"),
      auction_alert_days: n("auction_alert_days"),
      allowed_email_domain: String(f.get("allowed_email_domain")).trim().toLowerCase(),
    }).eq("id", true);
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success("Settings saved");
    router.refresh();
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    if (!tag.trim()) return;
    const { error } = await createClient().from("tags").insert({ name: tag.trim() });
    if (error) return toast.error(errorMessage(error));
    setTag("");
    router.refresh();
  }
  async function removeTag(name: string) {
    const { error } = await createClient().from("tags").delete().eq("name", name);
    if (error) return toast.error(errorMessage(error));
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle>Users & roles</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <p className="mb-2 text-xs text-muted-foreground">
            People sign in with a magic link or Google. <b>@{settings.allowed_email_domain}</b> accounts start active as Viewers; anyone else waits here until you activate them.
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 font-medium">User</th><th className="font-medium">Role</th><th className="font-medium">Access</th><th className="font-medium">Joined</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="py-2"><div className="font-medium">{u.full_name ?? "—"}</div><div className="text-xs text-muted-foreground">{u.email}</div></td>
                  <td>
                    <NativeSelect className="h-8 w-40 text-xs" value={u.role} disabled={u.id === me.id} onChange={(e) => updateUser(u.id, { role: e.target.value as T["profiles"]["Row"]["role"] })}>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </NativeSelect>
                  </td>
                  <td>
                    {u.id === me.id ? <Badge>You</Badge> : (
                      <Button size="sm" variant={u.is_active ? "outline" : "default"} onClick={() => updateUser(u.id, { is_active: !u.is_active })}>
                        {u.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                  </td>
                  <td className="text-xs text-muted-foreground">{fmtDateTime(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">Admin: everything · Acquisitions: edit, outreach, imports, request paid enrichment · Analyst: research fields, notes, tasks, documents · Viewer: read-only.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Alerts & budgets</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={saveSettings} className="grid gap-3 sm:grid-cols-3">
            <Field label="Overall monthly budget ($)" hint="Hard stop for paid enrichment"><Input name="overall_monthly_budget_usd" type="number" min={0} step="1" defaultValue={settings.overall_monthly_budget_usd} /></Field>
            <Field label="Red flag: projected spend ($/mo)"><Input name="red_flag_monthly_spend_usd" type="number" min={0} defaultValue={settings.red_flag_monthly_spend_usd} /></Field>
            <Field label="Red flag: month-over-month growth (%)"><Input name="red_flag_mom_growth_pct" type="number" min={0} defaultValue={settings.red_flag_mom_growth_pct} /></Field>
            <Field label="Red flag: tokens per LLM call"><Input name="red_flag_tokens_per_tx" type="number" min={0} defaultValue={settings.red_flag_tokens_per_tx} /></Field>
            <Field label="Stale lead after (days)"><Input name="stale_lead_days" type="number" min={1} defaultValue={settings.stale_lead_days} /></Field>
            <Field label="Auction alert window (days)"><Input name="auction_alert_days" type="number" min={1} defaultValue={settings.auction_alert_days} /></Field>
            <Field label="Company email domain" hint="Auto-activated on first sign-in"><Input name="allowed_email_domain" defaultValue={settings.allowed_email_domain} /></Field>
            <div className="flex items-end sm:col-span-2"><Button type="submit" disabled={busy}>Save</Button></div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Tags</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <Badge key={t.name} tone={t.color}>{t.name}<button onClick={() => removeTag(t.name)} aria-label={`Remove ${t.name}`} className="ml-0.5">×</button></Badge>
              ))}
            </div>
            <form onSubmit={addTag} className="flex gap-2"><Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="New tag" /><Button type="submit" variant="outline">Add</Button></form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Integrations</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {providers.map((p) => (
              <div key={p.provider} className="flex items-center justify-between border-b py-1 last:border-0">
                <span className="capitalize">{p.provider.replace("_", " ")}</span>
                <span className="flex items-center gap-1">
                  {p.is_paid && <Badge variant="outline">paid · cap {fmtMoney(p.monthly_budget_usd)}</Badge>}
                  <Badge variant={p.enabled ? "default" : "secondary"}>{p.enabled ? "on" : "off"}</Badge>
                </span>
              </div>
            ))}
            <p className="mt-1 text-xs text-muted-foreground">API keys, per-provider budgets, strategy rules, scoring weights and templates become editable with Phase 3 (enrichment) and Phase 5.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
