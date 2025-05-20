
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
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
];

const driverLinks = [
  { href: "/dashboard/driver/publish-trip", label: "Publicar Viaje", icon: PlusCircle },
];

const passengerLinks = [
  { href: "/dashboard/passenger/search-trips", label: "Buscar Viajes", icon: Search },
  { href: "/dashboard/passenger/saved-routes", label: "Rutas Guardadas", icon: Bookmark },
];

export function AppSidebar() {
  const { role, user } = useAuth();
  const pathname = usePathname();

  const links = role === ROLES.DRIVER ? driverLinks : passengerLinks;
  const roleName = role === ROLES.DRIVER ? "Conductor" : "Pasajero";

  return (
    <Sidebar collapsible="offcanvas" variant="sidebar" side="left">
      <SidebarHeader className="p-4 border-b">
        <Link href="/dashboard" className="flex items-center gap-2" aria-label="Panel de AndesRide">
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
              <p className="text-xs text-muted-foreground capitalize truncate">{roleName}</p>
            </div>
          </div>
      </SidebarFooter>
    </Sidebar>
  );
}
