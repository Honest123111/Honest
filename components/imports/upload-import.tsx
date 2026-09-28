"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { errorMessage } from "@/lib/utils";
import { registerImport } from "@/app/(app)/imports/actions";

export function UploadImport() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function handle(file: File) {
    if (!/\.(xlsx|csv)$/i.test(file.name)) return toast.error("Upload an .xlsx or .csv file (save older .xls files as .xlsx first).");
    if (file.size > 50 * 1024 * 1024) return toast.error("Max 50 MB");
    const id = crypto.randomUUID();
    const path = `${id}/${file.name.replace(/[^\w.\-]+/g, "_")}`;
    try {
      setBusy("Uploading…");
      const up = await createClient().storage.from("imports").upload(path, file, { contentType: file.type || undefined });
      if (up.error) throw up.error;
      setBusy("Reading the workbook…");
      await registerImport({ importId: id, path, fileName: file.name });
      router.push(`/imports/${id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <label
          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center hover:bg-muted/50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
        >
          {busy ? <FileSpreadsheet className="size-8 animate-pulse text-primary" /> : <Upload className="size-8 text-muted-foreground" />}
          <span className="font-medium">{busy ?? "Drop a CSV or XLSX here, or tap to choose"}</span>
          <span className="max-w-lg text-xs text-muted-foreground">
            Recognized automatically: Riverside TTC tax-default inventory, the I-10 leads workbook (all tabs), your off-market list (book/page/parcel + co-owners), sold comps, and assessor owner files. Anything else can be mapped by hand.
          </span>
          <input type="file" accept=".xlsx,.csv" className="sr-only" disabled={!!busy} onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
        </label>
      </CardContent>
    </Card>
  );
}
