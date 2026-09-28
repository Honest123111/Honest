import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** PKCE redirect target for magic links and Google sign-in. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(
      "That sign-in link couldn't be used (it may have been opened in a different browser). Enter the 6-digit code instead, or request a new link.",
    )}`);
  }
  const desc = url.searchParams.get("error_description");
  return NextResponse.redirect(`${origin}/login${desc ? `?error=${encodeURIComponent(desc)}` : ""}`);
}
