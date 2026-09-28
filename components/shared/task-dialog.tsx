"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { PRIORITY_LABELS, TASK_CATEGORY_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import { errorMessage } from "@/lib/utils";
import { displayName, useAppData } from "@/components/layout/app-data";
import { PropertyPicker, type PickedProperty } from "./property-picker";
import type { Database } from "@/lib/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

export function TaskDialog({
  open, onOpenChange, task, propertyId, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task?: Task | null;
  /** fixed property (property page); otherwise the user may pick one */
  propertyId?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { me, team } = useAppData();
  const [property, setProperty] = useState<PickedProperty | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      title: String(f.get("title")).trim(),
      description: String(f.get("description") ?? "").trim() || null,
      category: f.get("category") as Task["category"],
      priority: Number(f.get("priority")),
      status: f.get("status") as Task["status"],
      assignee_id: (f.get("assignee_id") as string) || null,
      due_date: (f.get("due_date") as string) || null,
      property_id: task ? task.property_id : (propertyId ?? property?.id ?? null),
    };
    if (!row.title) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = task
      ? await supabase.from("tasks").update(row).eq("id", task.id)
      : await supabase.from("tasks").insert(row);
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(task ? "Task updated" : "Task added");
    onOpenChange(false);
    setProperty(null);
    onSaved?.();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={task ? "Edit task" : "New task"}>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Task">
            <Input name="title" required defaultValue={task?.title} autoFocus placeholder="e.g. Call SCE planner about Blythe site" />
          </Field>
          {!task && !propertyId && (
            <Field label="Property (optional)">
              <PropertyPicker value={property} onChange={setProperty} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <NativeSelect name="category" defaultValue={task?.category ?? "parcel_check"}>
                {Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Priority">
              <NativeSelect name="priority" defaultValue={String(task?.priority ?? 3)}>
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Assignee">
              <NativeSelect name="assignee_id" defaultValue={task ? (task.assignee_id ?? "") : me.id}>
                <option value="">Unassigned</option>
                {team.map((m) => <option key={m.id} value={m.id}>{displayName(m)}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Due">
              <Input name="due_date" type="date" defaultValue={task?.due_date ?? ""} />
            </Field>
            <Field label="Status" className="col-span-2">
              <NativeSelect name="status" defaultValue={task?.status ?? "not_started"}>
                {Object.entries(TASK_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Notes / how">
            <Textarea name="description" defaultValue={task?.description ?? ""} rows={3} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save task"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
