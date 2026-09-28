"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Phone, Search, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { inputClass } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Hit = { kind: string; id: string; property_id: string | null; label: string; sublabel: string | null };

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc("search_global", { q: term, lim: 8 });
      setHits((data as Hit[]) ?? []);
      setIdx(0);
      setOpen(true);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function go(h: Hit | undefined) {
    if (!h?.property_id) return;
    setOpen(false);
    setQ("");
    router.push(`/properties/${h.property_id}${h.kind === "property" ? "" : "?tab=owners"}`);
  }

  const Icon = ({ kind }: { kind: string }) =>
    kind === "property" ? <Building2 className="size-4" /> : kind === "owner" ? <User className="size-4" /> : <Phone className="size-4" />;

  return (
    <Popover open={open && q.trim().length >= 2} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative min-w-0 flex-1 md:max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            className={cn(inputClass, "pl-8")}
            placeholder="APN, address, owner, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => hits.length && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter") go(hits[idx]);
              if (e.key === "Escape") setOpen(false);
            }}
            aria-label="Search"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-[min(28rem,calc(100vw-1.5rem))] p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
        {hits.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No matches</p>
        ) : (
          hits.map((h, i) => (
            <button
              key={`${h.kind}-${h.id}`}
              onClick={() => go(h)}
              disabled={!h.property_id}
              className={cn("flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm disabled:opacity-50", i === idx && "bg-muted")}
            >
              <Icon kind={h.kind} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{h.label}</span>
                {h.sublabel && <span className="block truncate text-xs text-muted-foreground">{h.sublabel}</span>}
              </span>
              <span className="text-xs capitalize text-muted-foreground">{h.kind}</span>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
