"use client";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";

type DocType = Database["public"]["Enums"]["doc_type"];

export function guessDocType(file: File): DocType {
  const n = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return "photo";
  if (/contract|psa|purchase.?agreement/.test(n)) return "contract";
  if (/\bloi\b|letter.?of.?intent/.test(n)) return "loi";
  if (/deed/.test(n)) return "deed";
  if (/title|prelim/.test(n)) return "title_report";
  if (/zoning/.test(n)) return "zoning_letter";
  if (/survey/.test(n)) return "survey";
  if (/sce|capacity|pca/.test(n)) return "sce_capacity_report";
  if (/offer/.test(n)) return "offer";
  return "other";
}

/** Upload to property-files/{propertyId}/{uuid}-{name} and record it in documents. */
export async function uploadPropertyFile(propertyId: string, file: File, docType: DocType, noteId?: string) {
  const supabase = createClient();
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${propertyId}/${crypto.randomUUID()}-${safe}`;
  const up = await supabase.storage.from("property-files").upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) throw up.error;
  const { data, error } = await supabase
    .from("documents")
    .insert({ property_id: propertyId, file_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size, doc_type: docType, note_id: noteId ?? null })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from("property-files").remove([path]);
    throw error;
  }
  return data;
}

export async function signedUrl(path: string, download = false) {
  const { data, error } = await createClient().storage.from("property-files").createSignedUrl(path, 60 * 10, download ? { download: true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
