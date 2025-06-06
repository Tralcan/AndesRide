
// src/components/UserNav.tsx
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, User, Settings, LayoutDashboard } from "lucide-react";
import Link from "next/link";

export function UserNav() {
  const { user, logout, role, isLoading: authIsLoading } = useAuth();

  if (authIsLoading || !user) {
    // Podrías mostrar un esqueleto o nada mientras carga o si no hay usuario
    return null; 
  }

  const displayName = user.profile?.fullName || user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Usuario";
  const displayEmail = user.email || "No disponible";

  const getInitials = (name: string) => {
    if (!name || name.trim() === '' || name.includes('@')) { 
        const emailPart = name.split('@')[0];
        if (emailPart && emailPart.trim() !== '') {
            return emailPart.substring(0, Math.min(2, emailPart.length)).toUpperCase();
        }
        return "??";
    }
    const names = name.split(" ").filter(n => n.trim() !== '');
    if (names.length === 0) return "??";
    let initials = names[0].substring(0, 1).toUpperCase();
    if (names.length > 1) {
      initials += names[names.length - 1].substring(0, 1).toUpperCase();
    } else if (names[0].length > 1) { // Handle single name case for second initial
      initials += names[0].substring(1, 2).toUpperCase();
    }
    return initials || "??";
  };
  
  const rawAvatar = user.profile?.avatarUrl || user.user_metadata?.avatar_url;
  // Asegurarse de que displayAvatar sea siempre una URL válida.
  // Si rawAvatar es una cadena pero está vacía o solo espacios, usar placeholder.
  const displayAvatar = rawAvatar && rawAvatar.trim() !== "" 
    ? rawAvatar 
    : `https://placehold.co/100x100.png?text=${encodeURIComponent(getInitials(displayName))}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10 border-2 border-primary">
            {/* Aseguramos que AvatarImage no reciba una cadena vacía como src */}
            <AvatarImage src={displayAvatar} alt={displayName} data-ai-hint="user avatar" />
            <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {displayEmail}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/dashboard">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Panel</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <User className="mr-2 h-4 w-4" />
            <span>Perfil</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Settings className="mr-2 h-4 w-4" />
            <span>Configuración</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={async () => await logout()}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Cerrar Sesión</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
