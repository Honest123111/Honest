"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Lock, MessageSquareReply, Paperclip, Pin, PinOff, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { ACTIVITY_LABELS } from "@/lib/labels";
import { cn, errorMessage, fmtDateTime } from "@/lib/utils";
import { signedUrl, uploadPropertyFile, guessDocType } from "@/lib/upload";
import { displayName, useAppData, usePermissions, type TeamMember } from "@/components/layout/app-data";
import type { Activity, Note, OwnerLink, Property } from "./types";

// ---------------------------------------------------------------------------
// Note composer with @mentions, markdown, attachments, pin & private
// ---------------------------------------------------------------------------
function NoteComposer({ propertyId, parentId, onDone, autoFocus }: { propertyId: string; parentId?: string; onDone?: () => void; autoFocus?: boolean }) {
  const router = useRouter();
  const { me, team } = useAppData();
  const [body, setBody] = useState("");
  const [mentioned, setMentioned] = useState<TeamMember[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pinned, setPinned] = useState(false);
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const suggestions = query === null ? [] : team.filter((m) => m.id !== me.id && displayName(m).toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  function onChange(v: string) {
    setBody(v);
    const caret = ref.current?.selectionStart ?? v.length;
    const m = v.slice(0, caret).match(/(?:^|\s)@([\w.-]*)$/);
    setQuery(m ? m[1] : null);
  }

  function pick(m: TeamMember) {
    const el = ref.current;
    const caret = el?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@([\w.-]*)$/, `@${displayName(m)} `);
    const next = before + body.slice(caret);
    setBody(next);
    setMentioned((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m]));
    setQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  }

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const mentions = mentioned.filter((m) => body.includes(`@${displayName(m)}`)).map((m) => m.id);
    const { data: note, error } = await supabase
      .from("notes")
      .insert({ property_id: propertyId, parent_id: parentId ?? null, body: body.trim(), mentions, pinned, visibility: priv ? "private" : "team", created_by: me.id })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      return toast.error(errorMessage(error));
    }
    for (const f of files) {
      try { await uploadPropertyFile(propertyId, f, guessDocType(f), note.id); } catch (e) { toast.error(`${f.name}: ${errorMessage(e)}`); }
    }
    setBusy(false);
    setBody(""); setFiles([]); setMentioned([]); setPinned(false); setPriv(false);
    if (mentions.length) toast.success(`Note saved · notified ${mentions.length}`);
    onDone?.();
    router.refresh();
  }

  return (
    <div className="relative grid gap-2">
      <Textarea
        ref={ref}
        value={body}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (suggestions.length && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); pick(suggestions[0]); }
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
        }}
        rows={parentId ? 2 : 4}
        placeholder={parentId ? "Reply…" : "Write a note — markdown works, type @ to mention a teammate"}
      />
      {suggestions.length > 0 && (
        <div className="absolute left-2 top-full z-20 mt-1 w-64 rounded-md border bg-popover p-1 shadow-md">
          {suggestions.map((m) => (
            <button key={m.id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(m); }} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted">
              <Avatar name={displayName(m)} /> {displayName(m)} <span className="ml-auto text-xs text-muted-foreground">{m.email}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
          <Paperclip className="size-3.5" /> Attach
          <input type="file" multiple className="sr-only" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
        </label>
        {files.map((f, i) => (
          <Badge key={i} variant="secondary">{f.name} <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove">×</button></Badge>
        ))}
        {!parentId && (
          <>
            <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin</label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Private</label>
          </>
        )}
        <div className="ml-auto flex gap-2">
          {onDone && <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>}
          <Button size="sm" onClick={submit} disabled={busy || !body.trim()}>{busy ? "Saving…" : parentId ? "Reply" : "Save note"}</Button>
        </div>
      </div>
    </div>
  );
}

function Attachment({ path, name }: { path: string; name: string }) {
  return (
    <button
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
      onClick={async () => { try { window.open(await signedUrl(path), "_blank", "noopener"); } catch (e) { toast.error(errorMessage(e)); } }}
    >
      <Paperclip className="size-3" /> {name}
    </button>
  );
}

function NoteCard({ note, replies, propertyId }: { note: Note; replies: Note[]; propertyId: string }) {
  const router = useRouter();
  const { me, team } = useAppData();
  const { isAdmin, canResearch } = usePermissions();
  const [replying, setReplying] = useState(false);
  const author = (id: string | null) => team.find((t) => t.id === id) ?? null;
  const mine = note.created_by === me.id;

  async function togglePin() {
    const { error } = await createClient().from("notes").update({ pinned: !note.pinned }).eq("id", note.id);
    if (error) toast.error(errorMessage(error)); else router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this note?")) return;
    const { error } = await createClient().from("notes").delete().eq("id", id);
    if (error) toast.error(errorMessage(error)); else router.refresh();
  }

  const renderOne = (n: Note, isReply = false) => (
    <div key={n.id} id={`note-${n.id}`} className={cn("flex gap-2", isReply && "ml-8 mt-3")}>
      <Avatar name={displayName(author(n.created_by))} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{displayName(author(n.created_by))}</span>
          <span>{fmtDateTime(n.created_at)}</span>
          {n.visibility === "private" && <span className="inline-flex items-center gap-0.5"><Lock className="size-3" /> private</span>}
          {n.pinned && <span className="inline-flex items-center gap-0.5"><Pin className="size-3" /> pinned</span>}
        </div>
        <div className="prose-note text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{n.body}</ReactMarkdown></div>
        {n.documents.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{n.documents.map((d) => <Attachment key={d.id} path={d.file_path} name={d.file_name} />)}</div>}
        {(isAdmin || n.created_by === me.id) && isReply && (
          <button onClick={() => remove(n.id)} className="mt-1 text-xs text-muted-foreground hover:text-destructive">Delete</button>
        )}
      </div>
    </div>
  );

  return (
    <Card>
      <CardContent className="p-3">
        {renderOne(note)}
        {replies.map((r) => renderOne(r, true))}
        <div className="mt-2 flex gap-1 pl-8">
          {canResearch && <Button size="sm" variant="ghost" onClick={() => setReplying(!replying)}><MessageSquareReply /> Reply</Button>}
          {(mine || isAdmin) && <Button size="sm" variant="ghost" onClick={togglePin}>{note.pinned ? <PinOff /> : <Pin />}{note.pinned ? "Unpin" : "Pin"}</Button>}
          {(mine || isAdmin) && <Button size="sm" variant="ghost" onClick={() => remove(note.id)}><Trash2 /> Delete</Button>}
        </div>
        {replying && <div className="mt-2 pl-8"><NoteComposer propertyId={propertyId} parentId={note.id} onDone={() => setReplying(false)} autoFocus /></div>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
const FILTERS = ["all", "note", "call", "sms", "email", "mail_sent", "site_visit", "offer", "status_change", "document", "import", "enrichment"] as const;

export function ActivityTab({ property, notes, activities, composeOpen, setComposeOpen }: {
  property: Property; notes: Note[]; activities: Activity[]; composeOpen: boolean; setComposeOpen: (o: boolean) => void;
}) {
  const { canResearch } = usePermissions();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const items = useMemo(() => {
    const roots = notes.filter((n) => !n.parent_id);
    const repliesOf = (id: string) => notes.filter((n) => n.parent_id === id);
    const noteItems = roots.map((n) => ({ kind: "note" as const, at: n.created_at, note: n, replies: repliesOf(n.id) }));
    const actItems = activities.filter((a) => a.type !== "note").map((a) => ({ kind: "activity" as const, at: a.occurred_at, activity: a }));
    return [...noteItems, ...actItems]
      .filter((i) => filter === "all" || (i.kind === "note" ? filter === "note" : i.activity.type === filter))
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [notes, activities, filter]);

  return (
    <div className="grid gap-3">
      {canResearch && (composeOpen ? (
        <Card><CardContent className="p-3"><NoteComposer propertyId={property.id} onDone={() => setComposeOpen(false)} autoFocus /></CardContent></Card>
      ) : (
        <button onClick={() => setComposeOpen(true)} className="rounded-lg border border-dashed p-3 text-left text-sm text-muted-foreground hover:bg-muted">
          Write a note… (type @ to mention)
        </button>
      ))}
      <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs", filter === f ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}
          >
            {f === "all" ? "All" : ACTIVITY_LABELS[f]}
          </button>
        ))}
      </div>
      {items.length === 0 && <p className="text-sm text-muted-foreground">Nothing here yet.</p>}
      {items.map((i) =>
        i.kind === "note" ? (
          <NoteCard key={i.note.id} note={i.note} replies={i.replies} propertyId={property.id} />
        ) : (
          <div key={i.activity.id} className="rounded-lg border bg-card px-3 py-2">
            <ActivityFeed items={[i.activity]} />
            {(i.activity.outcome || i.activity.duration_sec || i.activity.follow_up_date) && (
              <div className="ml-6 mt-1 text-xs text-muted-foreground">
                {[i.activity.direction !== "internal" && i.activity.direction, i.activity.outcome, i.activity.duration_sec && `${Math.round(i.activity.duration_sec / 60)} min`, i.activity.follow_up_date && `follow up ${i.activity.follow_up_date}`].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log a call / text / email / site visit (manual; Twilio logging is Phase 4)
// ---------------------------------------------------------------------------
export function LogCallDialog({ open, onOpenChange, propertyId, owners }: {
  open: boolean; onOpenChange: (o: boolean) => void; propertyId: string; owners: OwnerLink[];
}) {
  const router = useRouter();
  const { me } = useAppData();
  const [busy, setBusy] = useState(false);
  const contacts = owners.flatMap((o) => (o.owners?.contacts ?? []).map((c) => ({ ...c, ownerName: o.owners!.name, ownerId: o.owners!.id })));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const contactId = (f.get("contact_id") as string) || null;
    const c = contacts.find((x) => x.id === contactId);
    const mins = Number(f.get("minutes") || 0);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("activities").insert({
      type: f.get("type") as Activity["type"],
      property_id: propertyId,
      contact_id: contactId,
      owner_id: c?.ownerId ?? null,
      direction: f.get("direction") as Activity["direction"],
      outcome: (f.get("outcome") as string) || null,
      duration_sec: mins ? Math.round(mins * 60) : null,
      summary: String(f.get("summary") ?? "").trim() || null,
      follow_up_date: (f.get("follow_up_date") as string) || null,
      occurred_at: f.get("occurred_at") ? new Date(String(f.get("occurred_at"))).toISOString() : new Date().toISOString(),
      created_by: me.id,
    });
    if (!error && f.get("follow_up_date")) {
      await supabase.from("tasks").insert({
        property_id: propertyId, title: `Follow up${c ? ` with ${c.name ?? c.ownerName}` : ""}`, category: "outreach",
        due_date: String(f.get("follow_up_date")), assignee_id: me.id, priority: 2,
      });
    }
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success("Logged");
    onOpenChange(false);
    router.refresh();
  }

  const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Log activity" description="Record a call, text, email or site visit. Setting a follow-up date also creates a task for you.">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <NativeSelect name="type" defaultValue="call">
              <option value="call">Call</option><option value="sms">Text</option><option value="email">Email</option><option value="site_visit">Site visit</option><option value="mail_sent">Mail sent</option>
            </NativeSelect>
          </Field>
          <Field label="Direction">
            <NativeSelect name="direction" defaultValue="outbound"><option value="outbound">Outbound</option><option value="inbound">Inbound</option><option value="internal">Internal</option></NativeSelect>
          </Field>
          <Field label="Contact" className="sm:col-span-2">
            <NativeSelect name="contact_id" defaultValue="">
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id} disabled={c.do_not_contact}>{c.ownerName} · {c.name ?? c.phone ?? c.email}{c.do_not_contact ? " (do not contact)" : ""}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Outcome">
            <NativeSelect name="outcome" defaultValue="">
              <option value="">—</option><option>Connected</option><option>Left voicemail</option><option>No answer</option><option>Wrong number</option><option>Not interested</option><option>Interested</option><option>Call back later</option>
            </NativeSelect>
          </Field>
          <Field label="Duration (min)"><Input name="minutes" type="number" min="0" step="1" inputMode="numeric" /></Field>
          <Field label="When"><Input name="occurred_at" type="datetime-local" defaultValue={nowLocal()} /></Field>
          <Field label="Follow up on"><Input name="follow_up_date" type="date" /></Field>
          <Field label="Notes / next step" className="sm:col-span-2"><Textarea name="summary" rows={3} /></Field>
          <DialogFooter className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Log it"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
