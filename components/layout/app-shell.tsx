"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Columns3, FileUp, Home, ListTodo, LogOut, Map as MapIcon, Menu as MenuIcon, Moon, Settings, Sun, Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS } from "@/lib/labels";
import { displayName, useAppData, usePermissions } from "./app-data";
import { GlobalSearch } from "./global-search";
import { NotificationsBell } from "./notifications-bell";
import { QuickAdd } from "./quick-add";

const NAV = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/properties", label: "Properties", icon: Table2 },
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/imports", label: "Imports", icon: FileUp, needs: "write" as const },
  { href: "/settings", label: "Settings", icon: Settings, needs: "admin" as const },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me } = useAppData();
  const perms = usePermissions();
  const { resolvedTheme, setTheme } = useTheme();
  const items = NAV.filter((n) => !n.needs || (n.needs === "write" ? perms.canWrite : perms.isAdmin));
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="flex min-h-dvh">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-sidebar md:flex">
        <Link href="/" className="flex items-center gap-2 px-4 py-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">HT</span>
          <span className="text-sm font-semibold leading-tight">Land<br /><span className="font-normal text-muted-foreground">Acquisitions</span></span>
        </Link>
        <nav className="grid gap-0.5 px-2">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                active(n.href, n.exact) && "bg-accent font-medium text-accent-foreground",
              )}
            >
              <n.icon className="size-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t p-3 text-xs text-muted-foreground">
          {displayName(me)} · {ROLE_LABELS[me.role]}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur pt-[env(safe-area-inset-top)] md:px-5">
          <Link href="/" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground md:hidden">HT</Link>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            {perms.canResearch && <QuickAdd />}
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account">
                  <Avatar name={displayName(me)} className="size-7" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>
                  {me.email}
                  <div className="font-normal">{ROLE_LABELS[me.role]}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
                  {resolvedTheme === "dark" ? <Sun /> : <Moon />} {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                {perms.isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/settings"><Settings /> Settings</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <form action="/auth/signout" method="post">
                  <DropdownMenuItem asChild>
                    <button type="submit" className="w-full"><LogOut /> Sign out</button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 pb-24 md:px-6 md:pb-8">{children}</main>
      </div>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {items.slice(0, 4).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground", active(n.href, n.exact) && "text-primary")}
          >
            <n.icon className="size-5" />
            {n.label}
          </Link>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground">
            <MenuIcon className="size-5" />
            More
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top">
            {items.slice(4).map((n) => (
              <DropdownMenuItem key={n.href} asChild>
                <Link href={n.href}><n.icon /> {n.label}</Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun /> : <Moon />} Theme
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </div>
  );
}
