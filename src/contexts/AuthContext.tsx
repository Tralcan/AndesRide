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
          
          // Set isLoading to false BEFORE async profile fetch if it's currently true
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
          // Ensure isLoading is false if there's no session either.
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
      console.error("[AuthContext][setRole] User not authenticated or invalid role. UserID:", user?.id, "NewRole:", newRole);
      toast({ title: "Error de Parámetros", description: "Usuario no autenticado o rol no válido para la operación.", variant: "destructive" });
      return;
    }
    console.log(`[AuthContext][setRole] Attempting to set role to ${newRole} for user ${user.id}.`);

    const dataToUpsert = {
      id: user.id,
      role: newRole,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.profile?.fullName || user.email || "Usuario Anónimo",
      avatar_url: user.user_metadata?.avatar_url || user.profile?.avatarUrl || null,
      // Supabase handles `updated_at` automatically if the column default is `now()`
    };

    console.log("[AuthContext][setRole] Data to upsert:", JSON.stringify(dataToUpsert, null, 2));

    try {
      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(dataToUpsert, { onConflict: 'id' });

      if (upsertError) {
        console.error("[AuthContext][setRole] Error upserting profile:", JSON.stringify(upsertError, null, 2));
        toast({
          title: "Error al Guardar Rol (Upsert)",
          description: `No se pudo guardar tu rol: ${upsertError.message}`,
          variant: "destructive",
        });
        return; 
      }
      console.log("[AuthContext][setRole] Profile upsert successful.");

      const { data: fetchedProfileData, error: fetchError } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role")
        .eq('id', user.id)
        .single();

      if (fetchError) {
        console.error("[AuthContext][setRole] Error fetching profile after upsert:", JSON.stringify(fetchError, null, 2));
        toast({
          title: "Error al Cargar Perfil (Fetch)",
          description: "No se pudo cargar el perfil actualizado: " + fetchError.message,
          variant: "destructive",
        });
        return;
      }

      if (fetchedProfileData) {
        console.log("[AuthContext][setRole] Profile fetched successfully after upsert:", JSON.stringify(fetchedProfileData, null, 2));
        
        const updatedProfile: UserProfile = {
            id: fetchedProfileData.id,
            fullName: fetchedProfileData.full_name,
            avatarUrl: fetchedProfileData.avatar_url,
            role: fetchedProfileData.role as Role,
        };
        
        setUser(currentUser => currentUser ? ({ ...currentUser, profile: updatedProfile }) : null);
        setRoleState(updatedProfile.role); // Use role from fetched data to be sure

        toast({
          title: "Rol Establecido",
          description: `Tu rol ha sido establecido como ${updatedProfile.role}. Redirigiendo...`,
          variant: "default",
        });
        console.log("[AuthContext][setRole] Pushing to /dashboard");
        router.push("/dashboard");
      } else {
        console.error("[AuthContext][setRole] No profile data returned after upsert/fetch, though no explicit error.");
        toast({
          title: "Error al Establecer Rol (Fetch)",
          description: "No se recibió información del perfil actualizada después de guardar. La base de datos podría no haber devuelto los datos esperados.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("[AuthContext][setRole] Catch-all error during role setting:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        id: `error-setting-role-catch-all-${user.id}`,
        title: "Error Inesperado al Establecer Rol",
        description: error.message || "Ocurrió un error desconocido al actualizar tu rol.",
        variant: "destructive",
      });
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
