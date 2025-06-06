// src/contexts/AuthContext.tsx
"use client";

import type { Role } from "@/lib/constants";
import { createClientComponentClient } from '@/lib/supabase/client';
import type { AuthError, AuthSubscription, Session, User as SupabaseUser, SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import type { Dispatch, ReactNode, SetStateAction} from "react";
import { createContext, useState, useEffect, useCallback, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";

interface UserProfile {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: Role | null;
}

interface User extends SupabaseUser {
  profile: UserProfile | null;
}

interface AuthContextType {
  user: User | null;
  role: Role | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<{ error: AuthError | null }>;
  logout: () => Promise<{ error: AuthError | null }>;
  setRole: (newRole: Role) => Promise<void>;
  setUser: Dispatch<SetStateAction<User | null>>;
  session: Session | null;
  supabase: SupabaseClient;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRoleState] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  console.log("[AuthContext] Provider instance created/re-rendered. Initial/Current isLoading:", isLoading);

  const fetchUserProfile = useCallback(async (supabaseUser: SupabaseUser): Promise<UserProfile | null> => {
    console.log("[AuthContext][fetchUserProfile] Fetching profile for user:", supabaseUser.id);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role")
      .eq("id", supabaseUser.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log("[AuthContext][fetchUserProfile] No profile found for user (PGRST116):", supabaseUser.id);
        return null;
      }
      console.error("[AuthContext][fetchUserProfile] Error fetching user profile:", error);
      toast({
        title: "Error de Perfil",
        description: "No se pudo cargar tu perfil de usuario: " + error.message,
        variant: "destructive",
      });
      return null;
    }
    if (data) {
      console.log("[AuthContext][fetchUserProfile] Profile data found:", data);
      return {
        id: data.id,
        fullName: data.full_name,
        avatarUrl: data.avatar_url,
        role: data.role as Role,
      };
    }
    console.log("[AuthContext][fetchUserProfile] No profile data returned, though no explicit error, for user:", supabaseUser.id);
    return null;
  }, [toast, supabase]);

  useEffect(() => {
    let isMounted = true;
    console.log("[AuthContext][useEffect] Mounting. Setting up onAuthStateChange listener.");

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!isMounted) {
          console.log("[AuthContext][onAuthStateChange] Component unmounted, ignoring auth event:", event);
          return;
        }
        console.log(`[AuthContext][onAuthStateChange] Event: ${event}. Session available: ${!!currentSession}. Current isLoading (before processing): ${isLoading}`);
        
        setSession(currentSession);

        if (currentSession?.user) {
          setUser(prevUser => ({ ...currentSession.user, profile: prevUser?.profile || null }));
          
          if (isLoading && isMounted) {
            console.log('[AuthContext][onAuthStateChange] User session confirmed. Setting isLoading to false BEFORE profile fetch.');
            setIsLoading(false);
          }

          console.log('[AuthContext][onAuthStateChange] Fetching profile for user:', currentSession.user.id);
          const profile = await fetchUserProfile(currentSession.user);
          
          if (!isMounted) {
            console.log("[AuthContext][onAuthStateChange] Unmounted during/after profile fetch for event:", event);
            return; 
          }
          
          if (profile) {
            setUser(prevUser => prevUser ? ({ ...prevUser, profile }) : ({...currentSession.user, profile }));
            setRoleState(profile.role || null);
            console.log('[AuthContext][onAuthStateChange] User profile and role updated after fetch.');
          } else {
            setRoleState(null);
            console.log('[AuthContext][onAuthStateChange] No profile found for user. Role explicitly set to null.');
          }

        } else {
          console.log('[AuthContext][onAuthStateChange] No user in session. Clearing user and role.');
          setUser(null);
          setRoleState(null);

          if (isLoading && isMounted) {
            console.log('[AuthContext][onAuthStateChange] No user session. Setting isLoading to false.');
            setIsLoading(false);
          }
        }
      }
    );

    return () => {
      isMounted = false;
      console.log("[AuthContext][useEffect] Unmounting. Unsubscribing from auth changes.");
      authListener?.subscription.unsubscribe();
    };
  }, [fetchUserProfile, supabase, isLoading]);

  const login = async () => {
    console.log("[AuthContext] Attempting login with Google.");
    const redirectURL = window.location.origin + "/auth/callback";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectURL
      },
    });
    if (error) {
      console.error("[AuthContext] Error during signInWithOAuth:", error);
      toast({
        title: "Error de inicio de sesión",
        description: error.message || "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
        variant: "destructive",
      });
      if (isLoading) setIsLoading(false); 
    }
    return { error };
  };

  const logout = async () => {
    console.log("[AuthContext] Attempting logout.");
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[AuthContext] Error during signOut:", error);
      toast({
        title: "Error al cerrar sesión",
        description: error.message || "No se pudo cerrar la sesión. Inténtalo de nuevo.",
        variant: "destructive",
      });
      if (isLoading) setIsLoading(false);
    } else {
      console.log("[AuthContext] signOut successful. onAuthStateChange will handle state updates and AuthRedirector navigation.");
    }
    return { error };
  };

  const setRoleAndUpdateProfile = async (newRole: Role) => {
    if (!user?.id || !newRole) {
      console.error("[AuthContext][setRole] User not authenticated or invalid role for update. UserID:", user?.id, "NewRole:", newRole);
      toast({ title: "Error", description: "Usuario no autenticado o rol no válido.", variant: "destructive" });
      return;
    }
    console.log(`[AuthContext][setRole] Attempting to set role to ${newRole} for user ${user.id}.`);

    // Prioritize user_metadata from OAuth, then existing profile, then email for full_name
    const fullNameFromMetadata = user.user_metadata?.full_name || user.user_metadata?.name;
    const avatarUrlFromMetadata = user.user_metadata?.avatar_url;

    const currentProfileName = user.profile?.fullName;
    const currentProfileAvatar = user.profile?.avatarUrl;

    const dataToUpsert = {
      id: user.id,
      role: newRole,
      updated_at: new Date().toISOString(),
      full_name: fullNameFromMetadata || currentProfileName || user.email || "Usuario Anónimo",
      avatar_url: avatarUrlFromMetadata || currentProfileAvatar || null,
    };

    console.log("[AuthContext][setRole] Data to upsert:", dataToUpsert);

    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .upsert(dataToUpsert, { onConflict: 'id' })
        .select("id, full_name, avatar_url, role")
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error("[AuthContext][setRole] Error upserting/selecting profile:", profileError);
        toast({
          title: "Error al Guardar Rol",
          description: `No se pudo guardar tu rol: ${profileError.message}`,
          variant: "destructive",
        });
        throw profileError;
      }

      if (profileData) {
        console.log("[AuthContext][setRole] Profile upserted/selected successfully:", profileData);
        setRoleState(newRole); // Set the role in context
        const updatedProfile: UserProfile = {
            id: profileData.id,
            fullName: profileData.full_name,
            avatarUrl: profileData.avatar_url,
            role: profileData.role as Role,
        };
        setUser(currentUser => currentUser ? ({ ...currentUser, profile: updatedProfile }) : null);
        toast({
          title: "Rol Establecido",
          description: `Tu rol ha sido establecido como ${newRole}. Redirigiendo...`,
          variant: "default",
        });
        router.push("/dashboard");
      } else {
        console.error("[AuthContext][setRole] No profile data returned after upsert/select, though no explicit error.");
        toast({
          title: "Error al Establecer Rol",
          description: "No se recibió información del perfil actualizada después de guardar.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      // This catch block might be redundant if profileError is thrown and caught,
      // but good for other unexpected errors.
      console.error("[AuthContext][setRole] Catch-all error during role setting:", error);
      if (!toast.isActive(`error-setting-role-${user.id}`)) { // Avoid duplicate toasts for same error
         toast({
          id: `error-setting-role-${user.id}`,
          title: "Error Inesperado al Establecer Rol",
          description: error.message || "Ocurrió un error desconocido al actualizar tu rol.",
          variant: "destructive",
        });
      }
    }
  };
  
  console.log('[AuthContext] AuthProvider render end. Context value:', { isAuthenticated: !!user && !!session, isLoading, role: role });

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated: !!user && !!session,
        isLoading,
        login,
        logout,
        setRole: setRoleAndUpdateProfile,
        setUser,
        session,
        supabase,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
