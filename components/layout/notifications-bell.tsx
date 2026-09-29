"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, fmtDateTime } from "@/lib/utils";
import type { Database } from "@/lib/database.types";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export function NotificationsBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await createClient().from("notifications").select("*").order("created_at", { ascending: false }).limit(30);
    setItems(data ?? []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const unread = items.filter((n) => !n.read_at).length;

  async function openItem(n: Notification) {
    if (!n.read_at) {
      await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function markAll() {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    await createClient().from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    load();
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`} className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && <button onClick={markAll} className="text-xs text-primary">Mark all read</button>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nothing yet. You&apos;ll see @mentions and assignments here.</p>
          ) : (
            items.map((n) => (
              <button key={n.id} onClick={() => openItem(n)} className={cn("block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted", !n.read_at && "bg-accent/40")}>
                <div className="font-medium">{n.title}</div>
                {n.body && <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
                <div className="mt-0.5 text-[11px] text-muted-foreground">{fmtDateTime(n.created_at)}</div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
