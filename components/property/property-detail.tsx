"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, FilePlus2, Handshake, ListTodo, MessageSquarePlus, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NativeSelect } from "@/components/ui/input";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatApn } from "@/lib/apn";
import { COUNTY_LABELS } from "@/lib/labels";
import { errorMessage, fmtNumber } from "@/lib/utils";
import { useAppData, usePermissions } from "@/components/layout/app-data";
import { AssigneeSelect, PrioritySelect, ScoreChip, StatusSelect, StrategyBadge, TagEditor } from "@/components/properties/inline-edits";
import { useStatusChange } from "@/components/properties/status-change";
import { TaskDialog } from "@/components/shared/task-dialog";
import { OverviewTab } from "./overview-tab";
import { OwnersTab } from "./owners-tab";
import { ActivityTab, LogCallDialog } from "./activity-tab";
import { TasksTab } from "./tasks-tab";
import { DocumentsTab, UploadDialog } from "./documents-tab";
import { DealTab, OfferDialog } from "./deal-tab";
import { TaxTab } from "./tax-tab";
import { HistoryTab } from "./history-tab";
import { SiteTab } from "./site-tab";
import type { Activity, Audit, Comp, Doc, Note, Offer, OwnerLink, Property, Site, Task, Tax } from "./types";

export function PropertyDetail(props: {
  property: Property;
  owners: OwnerLink[];
  notes: Note[];
  activities: Activity[];
  tasks: Task[];
  documents: Doc[];
  offers: Offer[];
  tax: Tax[];
  audit: Audit[];
  site: Site | null;
  comps: Comp[];
  initialTab: string;
  compose: boolean;
}) {
  const { property: p } = props;
  const router = useRouter();
  const { strategies } = useAppData();
  const { canWrite, canResearch } = usePermissions();
  const [tab, setTab] = useState(props.initialTab);
  const [composeOpen, setComposeOpen] = useState(props.compose);
  const [dialog, setDialog] = useState<null | "call" | "task" | "upload" | "offer">(null);
  const { request: requestStatus, dialog: statusDialog } = useStatusChange();

  function changeTab(t: string) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    url.searchParams.delete("compose");
    window.history.replaceState(null, "", url);
  }

  async function setStrategy(key: string) {
    const { error } = await createClient().from("properties").update({ strategy: key || null, strategy_locked: true }).eq("id", p.id);
    if (error) return toast.error(errorMessage(error));
    toast.success("Strategy set (locked from automatic reclassification)");
    router.refresh();
  }

  const openCount = props.tasks.filter((t) => t.status !== "done").length;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/properties" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Properties
      </Link>

      {/* header */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-mono text-xl font-semibold tracking-tight">{formatApn(p.county, p.apn)}</h1>
            <p className="text-sm">
              {p.situs_address ?? "No situs address"}
              {p.situs_city ? `, ${p.situs_city}` : ""}
              <span className="text-muted-foreground"> · {COUNTY_LABELS[p.county]} · {fmtNumber(p.acres)} ac</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ScoreChip label="EV" value={p.ev_score} />
            <ScoreChip label="Big-rig" value={p.big_rig_access_score} />
            <ScoreChip label="Overall" value={p.overall_score} />
            <ScoreChip label="Site" value={props.site?.feasibility_score ?? null} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:flex sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-1"><span className="text-xs text-muted-foreground">Status</span><StatusSelect id={p.id} value={p.lead_status} onRequest={requestStatus} /></div>
          <div className="flex items-center gap-1"><span className="text-xs text-muted-foreground">Owner</span><AssigneeSelect id={p.id} value={p.assignee_id} /></div>
          <div className="flex items-center gap-1"><span className="text-xs text-muted-foreground">Priority</span><PrioritySelect id={p.id} value={p.priority} /></div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Strategy</span>
            {canWrite ? (
              <NativeSelect aria-label="Strategy" className="h-7 w-auto border-transparent px-1 text-xs" value={p.strategy ?? ""} onChange={(e) => setStrategy(e.target.value)}>
                <option value="">—</option>
                {strategies.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </NativeSelect>
            ) : (
              <StrategyBadge value={p.strategy} />
            )}
          </div>
          <div className="col-span-2 flex items-center gap-1"><TagEditor id={p.id} value={p.tags} /></div>
        </div>
        {canResearch && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            <Button size="sm" variant="secondary" onClick={() => { changeTab("activity"); setComposeOpen(true); }}><MessageSquarePlus /> Add note</Button>
            <Button size="sm" variant="secondary" onClick={() => setDialog("call")}><PhoneCall /> Log call</Button>
            <Button size="sm" variant="secondary" onClick={() => setDialog("task")}><ListTodo /> Add task</Button>
            <Button size="sm" variant="secondary" onClick={() => setDialog("upload")}><FilePlus2 /> Upload doc</Button>
            {canWrite && <Button size="sm" variant="secondary" onClick={() => setDialog("offer")}><Handshake /> Start offer</Button>}
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={changeTab} className="mt-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="site">Site</TabsTrigger>
          <TabsTrigger value="owners">Owner & Contacts</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="tasks">Tasks{openCount ? ` (${openCount})` : ""}</TabsTrigger>
          <TabsTrigger value="documents">Documents{props.documents.length ? ` (${props.documents.length})` : ""}</TabsTrigger>
          <TabsTrigger value="tax">Tax</TabsTrigger>
          <TabsTrigger value="deal">Deal</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab property={p} notes={props.notes} tasks={props.tasks} tax={props.tax[0] ?? null} owners={props.owners} /></TabsContent>
        <TabsContent value="site"><SiteTab property={p} site={props.site} comps={props.comps} /></TabsContent>
        <TabsContent value="owners"><OwnersTab property={p} owners={props.owners} /></TabsContent>
        <TabsContent value="activity">
          <ActivityTab property={p} notes={props.notes} activities={props.activities} composeOpen={composeOpen} setComposeOpen={setComposeOpen} />
        </TabsContent>
        <TabsContent value="tasks"><TasksTab propertyId={p.id} tasks={props.tasks} /></TabsContent>
        <TabsContent value="documents"><DocumentsTab propertyId={p.id} documents={props.documents} /></TabsContent>
        <TabsContent value="tax"><TaxTab property={p} tax={props.tax} /></TabsContent>
        <TabsContent value="deal"><DealTab property={p} offers={props.offers} documents={props.documents} onNewOffer={() => setDialog("offer")} /></TabsContent>
        <TabsContent value="history"><HistoryTab audit={props.audit} /></TabsContent>
      </Tabs>

      <LogCallDialog open={dialog === "call"} onOpenChange={(o) => setDialog(o ? "call" : null)} propertyId={p.id} owners={props.owners} />
      <TaskDialog open={dialog === "task"} onOpenChange={(o) => setDialog(o ? "task" : null)} propertyId={p.id} />
      <UploadDialog open={dialog === "upload"} onOpenChange={(o) => setDialog(o ? "upload" : null)} propertyId={p.id} />
      <OfferDialog open={dialog === "offer"} onOpenChange={(o) => setDialog(o ? "offer" : null)} propertyId={p.id} />
      {statusDialog}
    </div>
  );
}
