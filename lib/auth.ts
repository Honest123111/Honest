import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Role = Database["public"]["Enums"]["app_role"];

export const can = {
  write: (r: Role | null | undefined) => r === "admin" || r === "acquisitions",
  research: (r: Role | null | undefined) => r === "admin" || r === "acquisitions" || r === "analyst",
  admin: (r: Role | null | undefined) => r === "admin",
};

/** Current user + profile, cached per request. */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null as Profile | null };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { supabase, user, profile };
});

/** For pages: signed in and active, or redirect. */
export async function requireMember() {
  const s = await getSession();
  if (!s.user) redirect("/login");
  if (!s.profile?.is_active) redirect("/pending");
  return s as typeof s & { profile: Profile };
}

/** For server actions: throws instead of redirecting. */
export async function assertRole(check: (r: Role) => boolean, what = "do that") {
  const s = await getSession();
  if (!s.user || !s.profile?.is_active || !check(s.profile.role)) {
    throw new Error(`You don't have permission to ${what}.`);
  }
  return s as typeof s & { profile: Profile };
}
