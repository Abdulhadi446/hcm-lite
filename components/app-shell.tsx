"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BookOpenIcon,
  BuildingIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  CreditCardIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MegaphoneIcon,
  MenuIcon,
  ShieldAlertIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { cn } from "@/lib/utils";
import { navItemsFor } from "@/lib/nav";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  employeeId: number | null;
  mustChangePassword: boolean;
  companyName: string;
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard: LayoutDashboardIcon,
  Users: UsersIcon,
  Clock: ClockIcon,
  Calendar: CalendarIcon,
  CreditCard: CreditCardIcon,
  Building: BuildingIcon,
  Megaphone: MegaphoneIcon,
  ShieldAlert: ShieldAlertIcon,
  Bot: BookOpenIcon,
  FileText: FileTextIcon,
};

function roleLabel(role: string) {
  if (role === "admin") return "Admin";
  if (role === "hr") return "HR";
  return "Employee";
}

function Brand({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[10px] font-semibold tracking-tight text-primary-foreground">
        HCM
      </div>
      <span className="truncate text-sm font-semibold">{name}</span>
    </div>
  );
}

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = navItemsFor(user.role);
  const label = roleLabel(user.role);
  const company = user.companyName || "HCM Lite";

  async function handleSignOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    router.push("/login");
    router.refresh();
  }

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(path + "/");

  const nav = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboardIcon;
        const active = isActive(item.path);
        return (
          <Link
            key={item.path}
            href={item.path}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-4">
          <Brand name={company} />
        </div>
        {nav()}
        <div className="mt-auto border-t border-border p-3">
          <div className="flex items-center gap-2.5 rounded-md px-1 py-1">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
              {user.name.slice(0, 1)}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-medium">{user.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{label}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
              aria-label="Open menu"
            >
              <MenuIcon className="size-5" />
            </button>
            <div className="lg:hidden">
              <Brand name={company} />
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              <span className="text-xs font-medium text-muted-foreground">{label} workspace</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button
              variant="ghost"
              size="sm"
              className="hidden text-xs text-muted-foreground sm:flex"
              onClick={() => router.push("/ai")}
            >
              <BookOpenIcon className="size-4" />
              Ask AI
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" className="gap-2" />
                }
              >
                <UserIcon className="size-4" />
                <span className="hidden max-w-[10rem] truncate sm:inline">{user.name}</span>
                <ChevronDownIcon className="size-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/change-password")}>
                  Change password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={handleSignOut}>
                  <LogOutIcon className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      {/* Mobile menu */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-card p-0">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Brand name={company} />
          </SheetHeader>
          {nav(() => setMobileOpen(false))}
          <div className="border-t border-border p-3">
            <div className="mb-2 flex items-center gap-2.5 px-1">
              <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                {user.name.slice(0, 1)}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-xs font-medium">{user.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{label}</p>
              </div>
            </div>
            <Separator className="my-2" />
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={handleSignOut}
            >
              <LogOutIcon className="size-4" />
              Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
