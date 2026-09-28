"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputClass } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PickedProperty { id: string; label: string; sublabel: string | null }

/** Type-ahead for properties by APN or address. */
export function PropertyPicker({ value, onChange, placeholder = "Search APN or address…" }: {
  value: PickedProperty | null;
  onChange: (p: PickedProperty | null) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PickedProperty[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc("search_global", { q: q.trim(), lim: 8 });
      setHits(((data ?? []) as { kind: string; id: string; label: string; sublabel: string | null }[])
        .filter((h) => h.kind === "property")
        .map((h) => ({ id: h.id, label: h.label, sublabel: h.sublabel })));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className={cn(inputClass, "items-center justify-between")}>
        <span className="truncate">{value.label}{value.sublabel ? ` · ${value.sublabel}` : ""}</span>
        <button type="button" className="text-xs text-primary" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input className={inputClass} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
          {hits.map((h) => (
            <button type="button" key={h.id} onClick={() => { onChange(h); setQ(""); setHits([]); }} className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted">
              <span className="font-medium">{h.label}</span>
              {h.sublabel && <span className="text-muted-foreground"> · {h.sublabel}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
