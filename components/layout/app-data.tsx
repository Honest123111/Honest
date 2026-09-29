"use client";

import { createContext, useContext } from "react";
import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type TeamMember = Pick<Tables["profiles"]["Row"], "id" | "full_name" | "email" | "role" | "is_active">;
export type LeadStatus = Tables["lead_statuses"]["Row"];
export type Strategy = Tables["strategies"]["Row"];
export type Tag = Tables["tags"]["Row"];

export interface AppData {
  me: TeamMember;
  team: TeamMember[];
  statuses: LeadStatus[];
  strategies: Strategy[];
  tags: Tag[];
}

const Ctx = createContext<AppData | null>(null);

export function AppDataProvider({ value, children }: { value: AppData; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppData outside AppDataProvider");
  return v;
}

export const displayName = (m: Pick<TeamMember, "full_name" | "email"> | null | undefined) =>
  m ? m.full_name || m.email.split("@")[0] : "Unassigned";

export function usePermissions() {
  const { me } = useAppData();
  return {
    role: me.role,
    canWrite: me.role === "admin" || me.role === "acquisitions",
    canResearch: me.role !== "viewer",
    isAdmin: me.role === "admin",
  };
}
