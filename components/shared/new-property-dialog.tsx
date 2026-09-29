"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { COUNTY_LABELS } from "@/lib/labels";
import { formatApn, isValidApn, normalizeApn, type County } from "@/lib/apn";
import { errorMessage } from "@/lib/utils";

export function NewPropertyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const county = f.get("county") as County;
    const apn = normalizeApn(String(f.get("apn")));
    if (!isValidApn(apn)) return toast.error("APN must be 9–14 digits");
    const supabase = createClient();
    // dedupe: open the existing parcel instead of failing on the unique key
    const { data: existing } = await supabase.from("properties").select("id").eq("county", county).eq("apn", apn).maybeSingle();
    if (existing) {
      toast.info(`${formatApn(county, apn)} already exists — opening it`);
      onOpenChange(false);
      return router.push(`/properties/${existing.id}`);
    }
    setBusy(true);
    const acres = f.get("acres") ? Number(f.get("acres")) : null;
    const asking = f.get("asking_price") ? Number(String(f.get("asking_price")).replace(/[$,]/g, "")) : null;
    const { data, error } = await supabase
      .from("properties")
      .insert({
        county,
        apn,
        situs_address: String(f.get("situs_address") ?? "").trim() || null,
        situs_city: String(f.get("situs_city") ?? "").trim() || null,
        acres,
        asking_price: asking,
        source_list: "manual",
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    onOpenChange(false);
    router.push(`/properties/${data.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add property" description="Matched on county + APN — an existing parcel opens instead of creating a duplicate.">
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="County">
              <NativeSelect name="county" defaultValue="riverside">
                {Object.entries(COUNTY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </Field>
            <Field label="APN">
              <Input name="apn" required inputMode="numeric" placeholder="836-121-003" autoFocus />
            </Field>
          </div>
          <Field label="Situs address"><Input name="situs_address" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" className="col-span-3 sm:col-span-1"><Input name="situs_city" /></Field>
            <Field label="Acres"><Input name="acres" type="number" step="0.01" min="0" /></Field>
            <Field label="Asking $"><Input name="asking_price" inputMode="decimal" /></Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add property"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
