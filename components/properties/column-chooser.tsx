"use client";

import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Columns3, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COLUMNS, DEFAULT_HIDDEN, DEFAULT_ORDER } from "./columns";

export interface ColumnState { order: string[]; hidden: string[] }

function Row({ id, visible, onToggle }: { id: string; visible: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const col = COLUMNS.find((c) => c.id === id)!;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-sm px-1 py-1 text-sm ${isDragging ? "bg-muted shadow" : "hover:bg-muted"}`}
    >
      <button type="button" className="cursor-grab touch-none text-muted-foreground" aria-label={`Drag ${col.label}`} {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <label className="flex flex-1 items-center gap-2">
        <input type="checkbox" checked={visible} onChange={onToggle} disabled={id === "apn"} />
        {col.label}
      </label>
    </div>
  );
}

export function ColumnChooser({ value, onChange }: { value: ColumnState; onChange: (v: ColumnState) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = value.order.indexOf(String(e.active.id));
    const to = value.order.indexOf(String(e.over.id));
    onChange({ ...value, order: arrayMove(value.order, from, to) });
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm"><Columns3 /> Columns</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70dvh] w-64 overflow-y-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={value.order} strategy={verticalListSortingStrategy}>
            {value.order.map((id) => (
              <Row
                key={id}
                id={id}
                visible={!value.hidden.includes(id)}
                onToggle={() =>
                  onChange({ ...value, hidden: value.hidden.includes(id) ? value.hidden.filter((h) => h !== id) : [...value.hidden, id] })
                }
              />
            ))}
          </SortableContext>
        </DndContext>
        <Button variant="link" size="sm" className="mt-1 px-1" onClick={() => onChange({ order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN })}>
          Reset to default
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Keep stored state valid when columns are added/removed in code. */
export function normalizeColumnState(v: Partial<ColumnState> | null | undefined): ColumnState {
  const known = new Set(DEFAULT_ORDER);
  const order = (v?.order ?? []).filter((id) => known.has(id));
  for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id);
  const hidden = (v?.hidden ?? DEFAULT_HIDDEN).filter((id) => known.has(id) && id !== "apn");
  return { order, hidden };
}
