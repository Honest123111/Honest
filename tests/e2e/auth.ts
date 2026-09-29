import type { BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

/** Password sign-in in Node, then hand the SSR auth cookies to the browser. */
export async function signIn(context: BrowserContext, baseURL: string, email: string, password: string) {
  const jar = new Map<string, string>();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const url = new URL(baseURL);
  await context.clearCookies();
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, domain: url.hostname, path: "/", sameSite: "Lax" as const })));
}
