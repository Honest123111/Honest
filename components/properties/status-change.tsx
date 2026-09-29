"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { DEAD_REASON_LABELS } from "@/lib/labels";
import { errorMessage } from "@/lib/utils";
import { uploadPropertyFile } from "@/lib/upload";
import { useAppData } from "@/components/layout/app-data";
import type { Database } from "@/lib/database.types";

type PropertyUpdate = Database["public"]["Tables"]["properties"]["Update"];

interface Pending { propertyId: string; status: string; label: string; need: "reason" | "offer" | "contract" }

/**
 * Status changes with the §8 gates: Dead needs a reason, Offer made needs an
 * offer record, Under contract needs a contract document. The database
 * enforces the same rules; this collects what's missing first.
 */
export function useStatusChange(onDone?: () => void) {
  const router = useRouter();
  const { statuses } = useAppData();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    async (propertyId: string, status: string, extra: PropertyUpdate = {}) => {
      const { error } = await createClient().from("properties").update({ lead_status: status, ...extra }).eq("id", propertyId);
      if (error) {
        toast.error(errorMessage(error));
        return false;
      }
      toast.success(`Moved to ${statuses.find((s) => s.key === status)?.label ?? status}`);
      onDone?.();
      router.refresh();
      return true;
    },
    [onDone, router, statuses],
  );

  const request = useCallback(
    async (propertyId: string, status: string) => {
      const st = statuses.find((s) => s.key === status);
      if (!st) return false;
      const supabase = createClient();
      if (st.requires_reason) {
        setPending({ propertyId, status, label: st.label, need: "reason" });
        return false;
      }
      if (st.requires_offer) {
        const { count } = await supabase.from("offers").select("id", { count: "exact", head: true }).eq("property_id", propertyId);
        if (!count) {
          setPending({ propertyId, status, label: st.label, need: "offer" });
          return false;
        }
      }
      if (st.requires_contract_doc) {
        const { count } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("property_id", propertyId).eq("doc_type", "contract");
        if (!count) {
          setPending({ propertyId, status, label: st.label, need: "contract" });
          return false;
        }
      }
      return apply(propertyId, status);
    },
    [apply, statuses],
  );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pending) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      if (pending.need === "reason") {
        await apply(pending.propertyId, pending.status, {
          dead_reason: f.get("dead_reason") as PropertyUpdate["dead_reason"],
          dead_reason_note: String(f.get("dead_reason_note") ?? "").trim() || null,
        });
      } else if (pending.need === "offer") {
        const amount = Number(String(f.get("amount")).replace(/[$,]/g, ""));
        const { error } = await createClient().from("offers").insert({
          property_id: pending.propertyId,
          amount,
          terms: String(f.get("terms") ?? "").trim() || null,
          sent_date: (f.get("sent_date") as string) || null,
          status: "sent",
        });
        if (error) throw error;
        await apply(pending.propertyId, pending.status);
      } else {
        const file = (f.get("file") as File | null) ?? null;
        if (!file || !file.size) throw new Error("Choose the contract file");
        await uploadPropertyFile(pending.propertyId, file, "contract");
        await apply(pending.propertyId, pending.status);
      }
      setPending(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const dialog = (
    <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
      {pending && (
        <DialogContent
          title={`Move to ${pending.label}`}
          description={
            pending.need === "reason" ? "Why is this lead dead?"
              : pending.need === "offer" ? "Record the offer first — it's required for this stage."
              : "Upload the signed contract — it's required for this stage."
          }
        >
          <form onSubmit={submit} className="grid gap-3">
            {pending.need === "reason" && (
              <>
                <Field label="Reason">
                  <NativeSelect name="dead_reason" required defaultValue="not_selling">
                    {Object.entries(DEAD_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Details (optional)"><Textarea name="dead_reason_note" rows={2} /></Field>
              </>
            )}
            {pending.need === "offer" && (
              <>
                <Field label="Offer amount ($)"><Input name="amount" required inputMode="decimal" autoFocus /></Field>
                <Field label="Terms"><Textarea name="terms" rows={2} placeholder="Cash, 30-day close, buyer pays escrow…" /></Field>
                <Field label="Sent on"><Input name="sent_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
              </>
            )}
            {pending.need === "contract" && (
              <Field label="Contract (PDF)"><Input name="file" type="file" accept="application/pdf,image/*" required /></Field>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPending(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : `Move to ${pending.label}`}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );

  return { request, dialog };
}
