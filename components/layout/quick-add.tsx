"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ListTodo, MessageSquarePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/input";
import { NewPropertyDialog } from "@/components/shared/new-property-dialog";
import { TaskDialog } from "@/components/shared/task-dialog";
import { PropertyPicker, type PickedProperty } from "@/components/shared/property-picker";
import { usePermissions } from "./app-data";

export function QuickAdd() {
  const router = useRouter();
  const { canWrite } = usePermissions();
  const [which, setWhich] = useState<null | "property" | "task" | "note">(null);
  const [picked, setPicked] = useState<PickedProperty | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1" aria-label="Quick add"><Plus /> <span className="hidden sm:inline">Quick add</span></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {canWrite && <DropdownMenuItem onSelect={() => setWhich("property")}><Building2 /> Property</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => setWhich("task")}><ListTodo /> Task</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setWhich("note")}><MessageSquarePlus /> Note on a property</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewPropertyDialog open={which === "property"} onOpenChange={(o) => setWhich(o ? "property" : null)} />
      <TaskDialog open={which === "task"} onOpenChange={(o) => setWhich(o ? "task" : null)} />
      <Dialog open={which === "note"} onOpenChange={(o) => { setWhich(o ? "note" : null); setPicked(null); }}>
        <DialogContent title="Add a note" description="Pick the property; the note editor opens on its Activity tab.">
          <Field group label="Property"><PropertyPicker value={picked} onChange={setPicked} /></Field>
          <DialogFooter>
            <Button
              disabled={!picked}
              onClick={() => { setWhich(null); router.push(`/properties/${picked!.id}?tab=activity&compose=1`); }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
