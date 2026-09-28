"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { errorMessage, fmtDate, fmtMoney } from "@/lib/utils";
import { DOC_TYPE_LABELS } from "@/lib/labels";
import { usePermissions } from "@/components/layout/app-data";
import type { Doc, Offer, Property } from "./types";

const OFFER_STATUSES: Offer["status"][] = ["draft", "sent", "countered", "accepted", "rejected", "expired", "withdrawn"];

export function OfferDialog({ open, onOpenChange, propertyId, offer }: { open: boolean; onOpenChange: (o: boolean) => void; propertyId: string; offer?: Offer | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      property_id: propertyId,
      amount: Number(String(f.get("amount")).replace(/[$,]/g, "")),
      terms: String(f.get("terms") ?? "").trim() || null,
      status: f.get("status") as Offer["status"],
      sent_date: (f.get("sent_date") as string) || null,
      expires_on: (f.get("expires_on") as string) || null,
      response: String(f.get("response") ?? "").trim() || null,
    };
    setBusy(true);
    const supabase = createClient();
    const { error } = offer ? await supabase.from("offers").update(row).eq("id", offer.id) : await supabase.from("offers").insert(row);
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(offer ? "Offer updated" : "Offer recorded");
    onOpenChange(false);
    router.refresh();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={offer ? "Edit offer" : "Start an offer"}>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" key={offer?.id ?? "new"}>
          <Field label="Amount ($)"><Input name="amount" required inputMode="decimal" defaultValue={offer?.amount ?? ""} autoFocus /></Field>
          <Field label="Status">
            <NativeSelect name="status" defaultValue={offer?.status ?? "draft"}>{OFFER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</NativeSelect>
          </Field>
          <Field label="Sent on"><Input name="sent_date" type="date" defaultValue={offer?.sent_date ?? ""} /></Field>
          <Field label="Expires"><Input name="expires_on" type="date" defaultValue={offer?.expires_on ?? ""} /></Field>
          <Field label="Terms" className="sm:col-span-2"><Textarea name="terms" rows={2} defaultValue={offer?.terms ?? ""} /></Field>
          <Field label="Seller response" className="sm:col-span-2"><Textarea name="response" rows={2} defaultValue={offer?.response ?? ""} /></Field>
          <DialogFooter className="sm:col-span-2"><Button type="submit" disabled={busy}>Save offer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DealTab({ property, offers, documents, onNewOffer }: { property: Property; offers: Offer[]; documents: Doc[]; onNewOffer: () => void }) {
  const { canWrite } = usePermissions();
  const [edit, setEdit] = useState<Offer | null>(null);
  const dealDocs = documents.filter((d) => ["offer", "loi", "contract"].includes(d.doc_type));
  const current = offers.find((o) => ["sent", "countered", "accepted", "draft"].includes(o.status));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Offers</CardTitle>
          {canWrite && <Button size="sm" onClick={onNewOffer}><Plus /> New offer</Button>}
        </CardHeader>
        <CardContent>
          {offers.length === 0 ? <EmptyState title="No offers yet" /> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 font-medium">Amount</th><th className="font-medium">Status</th><th className="font-medium">Sent</th><th className="font-medium">Terms / response</th></tr></thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id} className="cursor-pointer border-t hover:bg-muted/50" onClick={() => canWrite && setEdit(o)}>
                    <td className="py-2 font-medium tabular-nums">{fmtMoney(o.amount)}</td>
                    <td><Badge variant={o.status === "accepted" ? "default" : o.status === "rejected" ? "destructive" : "secondary"}>{o.status}</Badge></td>
                    <td>{fmtDate(o.sent_date)}</td>
                    <td className="text-xs text-muted-foreground">{[o.terms, o.response].filter(Boolean).join(" — ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <div className="grid content-start gap-4">
        <Card>
          <CardHeader><CardTitle>Current position</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {current ? <><div className="text-xl font-semibold">{fmtMoney(current.amount)}</div><div className="text-muted-foreground">{current.status}{current.expires_on ? ` · expires ${fmtDate(current.expires_on)}` : ""}</div></> : <p className="text-muted-foreground">No open offer.</p>}
            <p className="mt-2 text-xs text-muted-foreground">Asking {fmtMoney(property.asking_price)} · land value {fmtMoney(property.land_value)}. The offer calculator with comps arrives in Phase 5.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>LOI & contract documents</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {dealDocs.length === 0 ? <p className="text-muted-foreground">None uploaded. Use Upload doc and set the type to LOI or Contract.</p> : dealDocs.map((d) => <div key={d.id}>{d.file_name} <span className="text-xs text-muted-foreground">· {DOC_TYPE_LABELS[d.doc_type]}</span></div>)}
          </CardContent>
        </Card>
      </div>
      <OfferDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} propertyId={property.id} offer={edit} />
    </div>
  );
}
