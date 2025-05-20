// src/components/layout/AppSidebar.tsx
"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter
} from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { ROLES } from "@/lib/constants";
import { LayoutDashboard, Car, PlusCircle, Search, Bookmark, UserCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const commonLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const driverLinks = [
  { href: "/dashboard/driver/publish-trip", label: "Publish Trip", icon: PlusCircle },
  // Add more driver specific links here
];

const passengerLinks = [
  { href: "/dashboard/passenger/search-trips", label: "Search Trips", icon: Search },
  { href: "/dashboard/passenger/saved-routes", label: "Saved Routes", icon: Bookmark },
  // Add more passenger specific links here
];

export function AppSidebar() {
  const { role, user } = useAuth();
  const pathname = usePathname();

  const links = role === ROLES.DRIVER ? driverLinks : passengerLinks;

  return (
    <Sidebar collapsible="icon" variant="sidebar" side="left">
      <SidebarHeader className="p-4 border-b">
        <Link href="/dashboard" className="flex items-center gap-2" aria-label="AndesRide Dashboard">
          <Logo iconOnly className="group-data-[collapsible=icon]:hidden" />
          <Logo size="sm" iconOnly className="hidden group-data-[collapsible=icon]:block" />
        </Link>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {commonLinks.map((link) => (
            <SidebarMenuItem key={link.href}>
              <Link href={link.href} legacyBehavior passHref>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === link.href}
                  tooltip={link.label}
                >
                  <a>
                    <link.icon />
                    <span>{link.label}</span>
                  </a>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
          {links.map((link) => (
            <SidebarMenuItem key={link.href}>
              <Link href={link.href} legacyBehavior passHref>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === link.href || pathname.startsWith(link.href + '/')}
                  tooltip={link.label}
                >
                  <a>
                    <link.icon />
                    <span>{link.label}</span>
                  </a>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
       <SidebarFooter className="p-4 border-t mt-auto">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
            <UserCircle className="h-6 w-6 text-muted-foreground"/>
            <div className="group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground capitalize truncate">{role}</p>
            </div>
          </div>
      </SidebarFooter>
    </Sidebar>
  );
}
