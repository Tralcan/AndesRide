
// src/components/layout/AppHeader.tsx
import { Logo } from "@/components/Logo";
import { UserNav } from "@/components/UserNav";
import { SidebarTrigger } from "@/components/ui/sidebar";
import Link from "next/link";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-card shadow-sm">
      <div className="container flex h-16 items-center justify-between p-4 mx-auto">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <Link href="/dashboard" aria-label="Dashboard">
            <Logo size="sm" />
          </Link>
        </div>
        <UserNav />
      </div>
    </header>
  );
}
