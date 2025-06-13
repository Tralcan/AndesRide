// src/contexts/AuthContext.tsx
"use client";

import type { Role } from "@/lib/constants";
import { createClientComponentClient } from '@/lib/supabase/client';
import type { AuthError, AuthSubscription, Session, User as SupabaseUser, SupabaseClient, PostgrestError } from "@supabase/supabase-js";
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
  const { toast: showToast } = useToast();

  const fetchUserProfile = useCallback(async (supabaseUser: SupabaseUser): Promise<UserProfile | null> => {
    console.log("[AuthContext][fetchUserProfile] Fetching profile for user:", supabaseUser.id);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role")
      .eq("id", supabaseUser.id)
      .single();

    if (error) {
      console.error("[AuthContext][fetchUserProfile] Error fetching user profile:", JSON.stringify(error, null, 2));
      let title = "Error de Perfil";
      let description = `No se pudo cargar tu perfil de usuario: ${error.message}`;
      if (error.message.toLowerCase().includes("infinite recursion detected")) {
        title = "Error Crítico de RLS";
        description = "Se detectó una recursión infinita en las políticas de seguridad (RLS). Por favor, revisa las políticas.";
      } else if (error.code === 'PGRST116') {
         console.warn("[AuthContext][fetchUserProfile] No profile found (PGRST116) or RLS check failed for user:", supabaseUser.id);
         return null;
      }
       showToast({ title, description, variant: "destructive", duration: 7000 });
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
    console.log("[AuthContext][fetchUserProfile] No profile data returned for user:", supabaseUser.id);
    return null;
  }, [supabase, showToast]);

  useEffect(() => {
    let isMounted = true;
    console.log("[AuthContext][useEffect] Mounting. Initial isLoading=true.");
    setIsLoading(true); // Explicitly set loading to true at the start of the effect

    async function initializeAuth() {
      console.log("[AuthContext][initializeAuth] Starting initial auth state load.");
      try {
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();

        if (!isMounted) {
            console.log("[AuthContext][initializeAuth] Unmounted during getSession. Aborting.");
            return;
        }
        
        if (sessionError) {
          console.error("[AuthContext][initializeAuth] Error fetching initial session:", sessionError);
          setUser(null);
          setSession(null);
          setRoleState(null);
          return; // Don't proceed if session fetch fails
        }

        console.log("[AuthContext][initializeAuth] Initial getSession complete. Session exists:", !!initialSession);
        setSession(initialSession);

        if (initialSession?.user) {
          console.log('[AuthContext][initializeAuth] User session exists. Setting basic user, then fetching profile...');
          const basicUser = { ...initialSession.user, profile: null };
          setUser(basicUser);

          const profile = await fetchUserProfile(initialSession.user);
          if (!isMounted) {
            console.log("[AuthContext][initializeAuth] Unmounted after profile fetch. Aborting state update.");
            return;
          }

          if (profile) {
            setUser(prevUser => prevUser ? ({ ...prevUser, profile }) : ({...initialSession.user, profile }));
            setRoleState(profile.role || null);
            console.log('[AuthContext][initializeAuth] User profile and role updated. Role:', profile.role);
          } else {
            setUser(prevUser => prevUser ? ({ ...prevUser, profile: null }) : ({...initialSession.user, profile: null }));
            setRoleState(null);
            console.warn('[AuthContext][initializeAuth] No profile found or error during fetch. Role set to null.');
          }
        } else {
          console.log('[AuthContext][initializeAuth] No user in initial session. Clearing user and role.');
          setUser(null);
          setRoleState(null);
        }
      } catch (error) {
        console.error('[AuthContext][initializeAuth] Exception during initial auth processing:', error);
        setUser(null);
        setSession(null);
        setRoleState(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
          console.log('[AuthContext][initializeAuth] Initial auth processing finished. isLoading set to false.');
        } else {
            console.log('[AuthContext][initializeAuth] Unmounted before finally block could set isLoading false.');
        }
      }
    }

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!isMounted) {
          console.log("[AuthContext][onAuthStateChange] Component unmounted, ignoring auth event:", event);
          return;
        }
        console.log(`[AuthContext][onAuthStateChange] Event: ${event}. Session available: ${!!currentSession}.`);
        
        // Potentially set loading true if it's an event that requires refetching profile
        // but be careful not to interfere with the initial load's setIsLoading(false)
        // For now, let's assume initial load handles the primary isLoading state.

        setSession(currentSession);

        if (event === "SIGNED_IN" || event === "USER_UPDATED" || (event === "INITIAL_SESSION" && currentSession?.user)) {
          if (currentSession?.user) {
            console.log('[AuthContext][onAuthStateChange] Event requires profile check/update for user:', currentSession.user.id);
            const profile = await fetchUserProfile(currentSession.user);
            if (!isMounted) return;
            if (profile) {
              setUser(prevUser => ({ ...(prevUser || currentSession.user), profile }));
              setRoleState(profile.role || null);
            } else {
              setUser(prevUser => ({ ...(prevUser || currentSession.user), profile: null }));
              setRoleState(null);
            }
          }
        } else if (event === "SIGNED_OUT") {
          console.log('[AuthContext][onAuthStateChange] SIGNED_OUT event. Clearing user and role.');
          setUser(null);
          setRoleState(null);
        }
        // Only set isLoading to false here if no initial load is in progress or if it's a terminal event.
        // The `initializeAuth` function is now primarily responsible for setting isLoading after initial load.
        // If a subsequent auth event happens, the UI should ideally already be "loaded".
      }
    );

    return () => {
      isMounted = false;
      console.log("[AuthContext][useEffect] Unmounting. Unsubscribing from auth changes.");
      authListener?.subscription.unsubscribe();
    };
  }, [fetchUserProfile, supabase]);


  const login = async () => {
    console.log("[AuthContext] Attempting login with Google.");
    setIsLoading(true); // Set loading true before redirect
    const redirectURL = window.location.origin + "/auth/callback";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectURL,
      },
    });
    if (error) {
      console.error("[AuthContext] Error during signInWithOAuth:", error);
      showToast({
        title: "Error de inicio de sesión",
        description: error.message || "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
    // isLoading will be set to false by initializeAuth or onAuthStateChange after redirect
    return { error };
  };

  const logout = async () => {
    console.log("[AuthContext] Attempting logout.");
    setIsLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[AuthContext] Error during signOut:", error);
      showToast({
        title: "Error al cerrar sesión",
        description: error.message || "No se pudo cerrar la sesión. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
    // setUser, setRoleState, setSession will be cleared by onAuthStateChange ('SIGNED_OUT')
    // setIsLoading(false) will also be handled by onAuthStateChange or initial load if app refreshes
    router.push('/');
    return { error };
  };

  const setRoleAndUpdateProfile = async (newRole: Role) => {
    console.log(`[AuthContext][setRole] Start. Attempting to set role to ${newRole} for user ${user?.id}.`);
    if (!user?.id || !newRole) {
      console.error("[AuthContext][setRole] Invalid parameters. UserID:", user?.id, "NewRole:", newRole);
      showToast({ title: "Error de Parámetros", description: "Usuario no autenticado o rol no válido.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    const toastControl = showToast({
      title: "Actualizando Rol",
      description: `Estableciendo rol a ${newRole}... Por favor, espera.`,
      variant: "default"
    });

    const userFullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email;
    const userAvatarUrl = user.user_metadata?.avatar_url;

    const dataToUpsert: { id: string; role: Role; updated_at: string; full_name: string | null; avatar_url?: string | null } = {
      id: user.id,
      role: newRole,
      updated_at: new Date().toISOString(),
      full_name: userFullName || "Usuario Anónimo",
    };
    if (userAvatarUrl) {
      dataToUpsert.avatar_url = userAvatarUrl;
    }
    
    console.log("[AuthContext][setRole] Data for profiles upsert:", JSON.stringify(dataToUpsert, null, 2));

    try {
      console.time(`[AuthContext][setRole] Supabase upsert for user ${user.id}`);
      const { error: upsertError, data: upsertData } = await supabase
        .from("profiles")
        .upsert(dataToUpsert)
        .select("id, full_name, avatar_url, role")
        .single();
      console.timeEnd(`[AuthContext][setRole] Supabase upsert for user ${user.id}`);

      console.log("[AuthContext][setRole] Upsert result. Error:", upsertError ? JSON.stringify(upsertError, null, 2) : "No Error. Data:", upsertData ? JSON.stringify(upsertData, null, 2) : "No Data");

      if (upsertError) {
        console.error("[AuthContext][setRole] Error upserting profile:", JSON.stringify(upsertError, null, 2));
        let toastMessage = `No se pudo guardar tu rol: ${upsertError.message}`;
        if (upsertError.message.includes("violates row-level security policy") || upsertError.message.includes("permission denied")) { 
            toastMessage = "Error de RLS: No tienes permiso para actualizar tu perfil. Verifica las políticas de INSERT/UPDATE en la tabla 'profiles'.";
        }
        toastControl.update({
          id: toastControl.id,
          title: "Error al Guardar Rol",
          description: toastMessage,
          variant: "destructive",
          duration: 9000,
        });
        return;
      }
      
      if (!upsertData) {
        console.error("[AuthContext][setRole] Upsert successful but no data returned from DB.");
        toastControl.update({
          id: toastControl.id,
          title: "Error Inesperado",
          description: "El rol se guardó, pero no se pudo confirmar la actualización. Intenta recargar la página.",
          variant: "destructive",
        });
        return;
      }

      console.log("[AuthContext][setRole] Profile upsert successful. New role in DB:", upsertData.role);
      
      const updatedProfile: UserProfile = {
        id: upsertData.id,
        fullName: upsertData.full_name,
        avatarUrl: upsertData.avatar_url,
        role: upsertData.role as Role,
      };

      setUser(currentUser => {
        if (!currentUser) return null;
        return {
          ...currentUser,
          profile: updatedProfile,
        };
      });
      setRoleState(upsertData.role as Role);

      toastControl.update({
        id: toastControl.id,
        title: "Rol Establecido Correctamente",
        description: `Tu rol ha sido configurado como ${newRole}. Redirigiendo...`,
        variant: "default",
      });
      console.log("[AuthContext][setRole] Role set locally. Navigating to /dashboard. New local role:", newRole);
      router.push("/dashboard");

    } catch (error: any) {
      console.error("[AuthContext][setRole] EXCEPTION during setRole process:", error);
      toastControl.update({
        id: toastControl.id,
        title: "Error Inesperado al Establecer Rol",
        description: error.message || "Ocurrió un error desconocido al actualizar tu rol.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      console.log(`[AuthContext][setRole][FINALLY] Role update process finished. isLoading set to false.`);
    }
  };
  
  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated: !!user && !!session, // isAuthenticated depends on both user and session
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
