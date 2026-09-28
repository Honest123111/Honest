"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building, Landmark, Plus, ScrollText, ShieldAlert, ShieldCheck, User, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { errorMessage, fmtDate } from "@/lib/utils";
import { OWNER_TYPE_LABELS } from "@/lib/labels";
import { usePermissions } from "@/components/layout/app-data";
import type { Owner, OwnerLink, Property } from "./types";
import type { Database } from "@/lib/database.types";

type OwnerType = Database["public"]["Enums"]["owner_type"];
type Contact = Database["public"]["Tables"]["contacts"]["Row"];

const TYPE_ICON: Record<OwnerType, typeof User> = {
  individual: User, entity: Building, trust: ScrollText, estate: Users, government: Landmark, unknown: User,
};

export function OwnersTab({ property: p, owners }: { property: Property; owners: OwnerLink[] }) {
  const { canResearch, canWrite } = usePermissions();
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [contactFor, setContactFor] = useState<Owner | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const totalPct = owners.reduce((s, o) => s + (o.ownership_pct ?? 0), 0);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {canResearch && <Button size="sm" onClick={() => setOwnerOpen(true)}><Plus /> Add owner</Button>}
        <Button size="sm" variant="outline" disabled title="Secretary of State lookup arrives in Phase 3">Look up in SOS</Button>
        <Button size="sm" variant="outline" disabled title="Apollo (paid, approval required) arrives in Phase 3">Find principals in Apollo</Button>
        <Button size="sm" variant="outline" disabled title="Disabled until a skip-trace vendor and budget are set">Skip trace</Button>
        {owners.length > 1 && (
          <span className={`ml-auto text-xs ${Math.abs(totalPct - 100) > 0.5 && totalPct > 0 ? "text-destructive" : "text-muted-foreground"}`}>
            Ownership adds to {totalPct.toFixed(2)}%
          </span>
        )}
      </div>

      {owners.length === 0 ? (
        <EmptyState title="No owners yet">Add one by hand, or import the county owner files (Phase 3) / your off-market list.</EmptyState>
      ) : (
        owners.map(({ owners: o, ownership_pct, role }) => {
          if (!o) return null;
          const Icon = TYPE_ICON[o.owner_type];
          return (
            <Card key={`${o.id}-${role}`}>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-base"><Icon className="size-4 text-muted-foreground" />{o.name}</CardTitle>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="secondary">{OWNER_TYPE_LABELS[o.owner_type]}</Badge>
                    {role !== "owner" && <Badge variant="outline">{role}</Badge>}
                    {ownership_pct !== null && <Badge>{ownership_pct}%</Badge>}
                    {p.is_absentee && <Badge variant="warning">Absentee</Badge>}
                    {o.sos_status && <Badge variant="outline">SOS: {o.sos_status}</Badge>}
                  </div>
                </div>
                {canResearch && <Button size="sm" variant="ghost" onClick={() => setContactFor(o)}><Plus /> Contact</Button>}
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="text-muted-foreground">
                  {o.mailing_address ? [o.mailing_address, [o.mailing_city, o.mailing_state, o.mailing_zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "No mailing address"}
                  {o.sos_entity_number && <span> · SOS #{o.sos_entity_number}</span>}
                </div>
                {o.contacts.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr><th className="py-1 pr-3 font-medium">Contact</th><th className="pr-3 font-medium">Source</th><th className="pr-3 font-medium">Status</th><th /></tr>
                      </thead>
                      <tbody>
                        {o.contacts.map((c) => (
                          <tr key={c.id} className="border-t">
                            <td className="py-1.5 pr-3">
                              <div>{c.name ?? ""}{c.title ? <span className="text-muted-foreground"> · {c.title}</span> : null}</div>
                              {c.phone && <a className="block text-primary" href={c.do_not_contact ? undefined : `tel:${c.phone_e164 ?? c.phone}`}>{c.phone}{c.phone_type ? ` (${c.phone_type})` : ""}</a>}
                              {c.email && <a className="block text-primary" href={c.do_not_contact ? undefined : `mailto:${c.email}`}>{c.email}</a>}
                            </td>
                            <td className="pr-3 text-xs capitalize">{c.source.replace("_", " ")}</td>
                            <td className="pr-3">
                              <div className="flex flex-wrap gap-1">
                                {c.do_not_contact && <Badge variant="destructive"><ShieldAlert className="size-3" />Do not contact</Badge>}
                                {c.verified && <Badge>Verified</Badge>}
                                {c.consent ? <Badge><ShieldCheck className="size-3" />Consent {fmtDate(c.consent_at)}</Badge> : <Badge variant="outline">No consent</Badge>}
                                {c.dnc_checked_at ? (c.dnc_hit ? <Badge variant="destructive">DNC hit</Badge> : <Badge variant="secondary">DNC clear {fmtDate(c.dnc_checked_at)}</Badge>) : <Badge variant="outline">DNC unchecked</Badge>}
                              </div>
                            </td>
                            <td className="text-right">{canResearch && <Button size="sm" variant="ghost" onClick={() => setEditContact(c)}>Edit</Button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <OwnerDialog open={ownerOpen} onOpenChange={setOwnerOpen} propertyId={p.id} />
      <ContactDialog
        open={!!contactFor || !!editContact}
        onOpenChange={(o) => { if (!o) { setContactFor(null); setEditContact(null); } }}
        ownerId={contactFor?.id ?? editContact?.owner_id ?? null}
        contact={editContact}
        canConsent={canWrite}
      />
    </div>
  );
}

function OwnerDialog({ open, onOpenChange, propertyId }: { open: boolean; onOpenChange: (o: boolean) => void; propertyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim() || null;
    setBusy(true);
    const supabase = createClient();
    try {
      const { data: owner, error } = await supabase
        .from("owners")
        .insert({
          name: s("name")!, owner_type: f.get("owner_type") as OwnerType,
          mailing_address: s("mailing_address"), mailing_city: s("mailing_city"), mailing_state: s("mailing_state"), mailing_zip: s("mailing_zip"),
          source: "manual",
        })
        .select("id")
        .single();
      if (error) throw error;
      const pct = s("ownership_pct");
      const link = await supabase.from("property_owners").insert({
        property_id: propertyId, owner_id: owner.id, role: f.get("role") as Database["public"]["Enums"]["owner_role"], ownership_pct: pct ? Number(pct) : null,
      });
      if (link.error) throw link.error;
      toast.success("Owner added");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add owner">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><Input name="name" required autoFocus /></Field>
          <Field label="Type">
            <NativeSelect name="owner_type" defaultValue="individual">
              {Object.entries(OWNER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Role">
            <NativeSelect name="role" defaultValue="owner"><option value="owner">Owner</option><option value="trustee">Trustee</option><option value="officer">Officer</option><option value="agent">Agent</option></NativeSelect>
          </Field>
          <Field label="Ownership %"><Input name="ownership_pct" type="number" step="0.01" min="0" max="100" /></Field>
          <Field label="Mailing address" className="sm:col-span-2"><Input name="mailing_address" /></Field>
          <Field label="City"><Input name="mailing_city" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State"><Input name="mailing_state" maxLength={2} /></Field>
            <Field label="ZIP"><Input name="mailing_zip" inputMode="numeric" /></Field>
          </div>
          <DialogFooter className="sm:col-span-2"><Button type="submit" disabled={busy}>Add owner</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContactDialog({ open, onOpenChange, ownerId, contact, canConsent }: {
  open: boolean; onOpenChange: (o: boolean) => void; ownerId: string | null; contact: Contact | null; canConsent: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim() || null;
    const consent = f.get("consent") === "on";
    const row: Database["public"]["Tables"]["contacts"]["Update"] = {
      owner_id: ownerId, name: s("name"), title: s("title"), phone: s("phone"),
      phone_type: (s("phone_type") as Contact["phone_type"]) ?? null, email: s("email")?.toLowerCase() ?? null,
      verified: f.get("verified") === "on", notes: s("notes"),
      ...(contact ? {} : { source: "manual" as const }),
      ...(canConsent
        ? {
            do_not_contact: f.get("do_not_contact") === "on",
            consent,
            consent_method: consent ? s("consent_method") : null,
            consent_at: consent ? (contact?.consent && contact.consent_at ? contact.consent_at : new Date().toISOString()) : null,
          }
        : {}),
    };
    setBusy(true);
    const supabase = createClient();
    const { error } = contact
      ? await supabase.from("contacts").update(row).eq("id", contact.id)
      : await supabase.from("contacts").insert(row as Database["public"]["Tables"]["contacts"]["Insert"]);
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success("Contact saved");
    onOpenChange(false);
    router.refresh();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={contact ? "Edit contact" : "Add contact"}>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" key={contact?.id ?? "new"}>
          <Field label="Name"><Input name="name" defaultValue={contact?.name ?? ""} /></Field>
          <Field label="Title"><Input name="title" defaultValue={contact?.title ?? ""} /></Field>
          <Field label="Phone"><Input name="phone" type="tel" defaultValue={contact?.phone ?? ""} /></Field>
          <Field label="Phone type">
            <NativeSelect name="phone_type" defaultValue={contact?.phone_type ?? ""}><option value="">—</option><option value="mobile">Mobile</option><option value="landline">Landline</option><option value="voip">VoIP</option><option value="unknown">Unknown</option></NativeSelect>
          </Field>
          <Field label="Email" className="sm:col-span-2"><Input name="email" type="email" defaultValue={contact?.email ?? ""} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" defaultChecked={contact?.verified} /> Verified</label>
          {canConsent && (
            <>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="do_not_contact" defaultChecked={contact?.do_not_contact} /> Do not contact</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="consent" defaultChecked={contact?.consent} /> Consent to contact</label>
              <Field label="Consent method"><Input name="consent_method" placeholder="inbound call, written…" defaultValue={contact?.consent_method ?? ""} /></Field>
            </>
          )}
          <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} defaultValue={contact?.notes ?? ""} /></Field>
          <DialogFooter className="sm:col-span-2"><Button type="submit" disabled={busy || !ownerId}>Save contact</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
