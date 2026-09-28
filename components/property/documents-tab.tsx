"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Eye, FileText, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { DOC_TYPE_LABELS } from "@/lib/labels";
import { errorMessage, fmtDate } from "@/lib/utils";
import { guessDocType, signedUrl, uploadPropertyFile } from "@/lib/upload";
import { displayName, useAppData, usePermissions } from "@/components/layout/app-data";
import type { Doc } from "./types";

export function UploadDialog({ open, onOpenChange, propertyId, defaultType }: {
  open: boolean; onOpenChange: (o: boolean) => void; propertyId: string; defaultType?: Doc["doc_type"];
}) {
  const router = useRouter();
  const [files, setFiles] = useState<{ file: File; type: Doc["doc_type"] }[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    let ok = 0;
    for (const { file, type } of files) {
      try { await uploadPropertyFile(propertyId, file, type); ok++; } catch (e) { toast.error(`${file.name}: ${errorMessage(e)}`); }
    }
    setBusy(false);
    if (ok) toast.success(`Uploaded ${ok} file${ok === 1 ? "" : "s"}`);
    setFiles([]);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setFiles([]); onOpenChange(o); }}>
      <DialogContent title="Upload documents" description="PDFs, photos, and other files — stored privately. Max 50 MB each.">
        <Input
          type="file"
          multiple
          accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.kml,.kmz"
          capture={undefined}
          onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? []).map((f) => ({ file: f, type: defaultType ?? guessDocType(f) }))])}
        />
        {files.map((f, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{f.file.name}</span>
            <NativeSelect className="h-8 w-40 text-xs" value={f.type} onChange={(e) => setFiles(files.map((x, j) => (j === i ? { ...x, type: e.target.value as Doc["doc_type"] } : x)))}>
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
          </div>
        ))}
        <DialogFooter><Button onClick={submit} disabled={busy || !files.length}><Upload /> {busy ? "Uploading…" : "Upload"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentsTab({ propertyId, documents }: { propertyId: string; documents: Doc[] }) {
  const router = useRouter();
  const { team } = useAppData();
  const { canResearch, isAdmin } = usePermissions();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState<{ doc: Doc; url: string } | null>(null);
  const [type, setType] = useState<string>("all");
  const shown = type === "all" ? documents : documents.filter((d) => d.doc_type === type);

  async function open(doc: Doc, download = false) {
    try {
      const url = await signedUrl(doc.file_path, download);
      if (download) window.location.href = url;
      else if (doc.mime_type === "application/pdf" || doc.mime_type?.startsWith("image/")) setPreview({ doc, url });
      else window.open(url, "_blank", "noopener");
    } catch (e) { toast.error(errorMessage(e)); }
  }
  async function setDocType(doc: Doc, t: Doc["doc_type"]) {
    const { error } = await createClient().from("documents").update({ doc_type: t }).eq("id", doc.id);
    if (error) toast.error(errorMessage(error)); else router.refresh();
  }
  async function remove(doc: Doc) {
    if (!confirm(`Delete ${doc.file_name}?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) return toast.error(errorMessage(error));
    await supabase.storage.from("property-files").remove([doc.file_path]);
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {canResearch && <Button size="sm" onClick={() => setUploadOpen(true)}><Upload /> Upload</Button>}
        <NativeSelect className="h-8 w-auto text-xs" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No documents">Upload deeds, title reports, zoning letters, SCE reports, photos, offers and contracts.</EmptyState>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((d) => (
            <div key={d.id} className="flex items-start gap-2 rounded-lg border bg-card p-3">
              {d.mime_type?.startsWith("image/") ? <ImageIcon className="mt-0.5 size-5 text-muted-foreground" /> : <FileText className="mt-0.5 size-5 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <button className="block w-full truncate text-left text-sm font-medium hover:underline" onClick={() => open(d)}>{d.file_name}</button>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {canResearch ? (
                    <select className="rounded border bg-transparent px-1 py-0.5 text-xs" value={d.doc_type} onChange={(e) => setDocType(d, e.target.value as Doc["doc_type"])}>
                      {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  ) : <Badge variant="secondary">{DOC_TYPE_LABELS[d.doc_type]}</Badge>}
                  <span>{fmtDate(d.created_at)} · {displayName(team.find((t) => t.id === d.uploaded_by))}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" className="size-7" onClick={() => open(d)} aria-label="Preview"><Eye /></Button>
                <Button size="icon" variant="ghost" className="size-7" onClick={() => open(d, true)} aria-label="Download"><Download /></Button>
                {isAdmin && <Button size="icon" variant="ghost" className="size-7" onClick={() => remove(d)} aria-label="Delete"><Trash2 /></Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} propertyId={propertyId} />
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        {preview && (
          <DialogContent title={preview.doc.file_name} className="sm:max-w-4xl">
            {preview.doc.mime_type === "application/pdf" ? (
              <iframe src={preview.url} className="h-[70dvh] w-full rounded-md border" title={preview.doc.file_name} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={preview.doc.file_name} className="max-h-[70dvh] w-full rounded-md object-contain" />
            )}
            <DialogFooter><Button variant="outline" asChild><a href={preview.url} target="_blank" rel="noreferrer">Open in new tab</a></Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
