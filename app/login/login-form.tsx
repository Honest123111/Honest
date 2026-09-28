"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const supabase = createClient();
  const redirectTo = `${siteUrl()}/auth/callback?next=${encodeURIComponent(next?.startsWith("/") ? next : "/")}`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSent(true);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return toast.error(error.message);
    window.location.href = next?.startsWith("/") ? next : "/";
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { hd: "honesttransportation.com", prompt: "select_account" } },
    });
    if (error) toast.error(error.message);
  }

  return (
    <Card>
      <CardContent className="grid gap-4 p-5">
        {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
        {!sent ? (
          <form onSubmit={sendLink} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@honesttransportation.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy}>
              <Mail /> {busy ? "Sending…" : "Email me a sign-in link"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="grid gap-3">
            <p className="text-sm">
              Check <b>{email}</b> for a sign-in link. Open it on this device — or type the code from the email here.
            </p>
            <Input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={busy || code.trim().length < 6}>Verify code</Button>
            <Button type="button" variant="link" onClick={() => setSent(false)}>Use a different email</Button>
          </form>
        )}
        <div className="relative text-center text-xs text-muted-foreground">
          <span className="relative z-10 bg-card px-2">or</span>
          <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        </div>
        <Button variant="outline" onClick={google}>
          <svg viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>
          Continue with Google
        </Button>
      </CardContent>
    </Card>
  );
}
