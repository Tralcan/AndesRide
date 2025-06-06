// src/contexts/AuthContext.tsx
"use client";

import type { Role } from "@/lib/constants";
import { createClientComponentClient } from '@/lib/supabase/client'; // Updated import
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
  // Logs for env vars moved to createClientComponentClient directly
  const supabase = useMemo(() => createClientComponentClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRoleState] = useState<Role>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  const fetchUserProfile = useCallback(async (supabaseUser: SupabaseUser): Promise<UserProfile | null> => {
    console.log("[AuthContext] Fetching profile for user:", supabaseUser.id);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role")
      .eq("id", supabaseUser.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log("[AuthContext] No profile found for user (PGRST116):", supabaseUser.id);
        return null;
      }
      console.error("[AuthContext] Error fetching user profile:", error);
      toast({
        title: "Error de Perfil",
        description: "No se pudo cargar tu perfil de usuario: " + error.message,
        variant: "destructive",
      });
      return null;
    }
    if (data) {
      console.log("[AuthContext] Profile data found:", data);
      return {
        id: data.id,
        fullName: data.full_name,
        avatarUrl: data.avatar_url,
        role: data.role as Role,
      };
    }
    console.log("[AuthContext] No profile data returned, though no explicit error, for user:", supabaseUser.id);
    return null;
  }, [toast, supabase]);

  useEffect(() => {
    let isMounted = true;
    console.log("[AuthContext] useEffect triggered. Initializing, checking session. isMounted:", isMounted);
    setIsLoading(true);

    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (!isMounted) {
        console.log("[AuthContext] getSession callback: Component unmounted, aborting state update.");
        return;
      }
      console.log("[AuthContext] Initial session from getSession():", currentSession);
      setSession(currentSession);
      if (currentSession?.user) {
        try {
          const profile = await fetchUserProfile(currentSession.user);
          if (!isMounted) {
             console.log("[AuthContext] fetchUserProfile (initial) callback: Component unmounted, aborting state update.");
            return;
          }
          setUser({ ...currentSession.user, profile });
          if (profile?.role) {
            setRoleState(profile.role);
          }
        } catch (profileError) {
          console.error("[AuthContext] Error fetching profile during initial session load:", profileError);
        }
      }
      setIsLoading(false);
      console.log("[AuthContext] Initial session processing complete. isLoading set to false. isMounted:", isMounted);
    }).catch(sessionError => {
        if (!isMounted) {
            console.log("[AuthContext] getSession().catch: Component unmounted, aborting state update.");
            return;
        }
        console.error("[AuthContext] Error in supabase.auth.getSession() promise:", sessionError);
        setIsLoading(false);
    });

    const { data: authListenerData } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!isMounted) {
            console.log("[AuthContext] onAuthStateChange: Component unmounted, aborting handler.");
            return;
        }
        console.log('[AuthContext] Auth event:', event, 'New session:', newSession, 'isMounted:', isMounted);
        setIsLoading(true);
        try {
          setSession(newSession);
          if (newSession?.user) {
            const profile = await fetchUserProfile(newSession.user);
            if (!isMounted) {
                console.log("[AuthContext] fetchUserProfile (authChange) callback: Component unmounted, aborting state update.");
                return;
            }
            console.log('[AuthContext] Fetched profile after auth change:', profile);
            setUser({ ...newSession.user, profile });

            if (profile?.role) {
              setRoleState(profile.role);
              if (window.location.pathname === '/role-selection' || window.location.pathname === '/') {
                console.log('[AuthContext] Redirecting to /dashboard (role found after auth change, from /role-selection or /)');
                router.replace("/dashboard");
              }
            } else if (profile && window.location.pathname !== '/role-selection' && window.location.pathname !== '/') {
              console.log('[AuthContext] Profile exists but no role. Redirecting to /role-selection.');
              router.replace("/role-selection");
            } else if (!profile && event === 'SIGNED_IN' && window.location.pathname !== '/role-selection' && window.location.pathname !== '/') {
               console.warn('[AuthContext] User signed in, no profile found. Redirecting to /role-selection.');
               router.replace("/role-selection");
            }
          } else {
            console.log('[AuthContext] No user in session after auth change, clearing user state.');
            setUser(null);
            setRoleState(null);
             if (window.location.pathname !== '/') {
              console.log('[AuthContext] Redirecting to / (no session after auth change, not on login page)');
              router.replace("/");
            }
          }
        } catch (e: any) {
          console.error("[AuthContext] Error in onAuthStateChange handler:", e);
          if (isMounted) {
            setUser(null);
            setRoleState(null);
            toast({
              title: "Error de Autenticación",
              description: e.message || "Ocurrió un error durante el cambio de estado de autenticación.",
              variant: "destructive",
            });
          }
        } finally {
          if (isMounted) {
            setIsLoading(false);
            console.log('[AuthContext] onAuthStateChange processing finished, isLoading set to false. isMounted:', isMounted);
          }
        }
      }
    );
    
    const subscription = authListenerData?.subscription;

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
      console.log("[AuthContext] Unsubscribed from auth changes. Component unmounted.");
    };
  }, [router, fetchUserProfile, toast, supabase]);

  const login = async () => {
    console.log("[AuthContext] Attempting login with Google.");
    const redirectURL = window.location.origin + "/auth/callback";
    console.log("[AuthContext] Constructed redirectTo URL for OAuth:", redirectURL);
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
    }
    return { error };
  };

  const setRoleAndUpdateProfile = async (newRole: Role) => {
    if (!user?.id || !newRole) {
      console.error("[AuthContext] User not authenticated or invalid role for update.");
      toast({
        title: "Error",
        description: "Usuario no autenticado o rol no válido.",
        variant: "destructive"
      });
      return;
    }
    console.log(`[AuthContext] Setting role to ${newRole} for user ${user.id}`);
    setIsLoading(true);
    try {
      const dataToUpsert: {
        id: string;
        role: Role;
        updated_at: string;
        full_name?: string | null;
        avatar_url?: string | null;
      } = {
        id: user.id,
        role: newRole,
        updated_at: new Date().toISOString(),
      };

      dataToUpsert.full_name = user.profile?.fullName || user.user_metadata?.full_name || user.user_metadata?.name || user.email;
      dataToUpsert.avatar_url = user.profile?.avatarUrl || user.user_metadata?.avatar_url || null;

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .upsert([dataToUpsert], { onConflict: 'id' })
        .select("id, full_name, avatar_url, role")
        .single();

      if (profileError) {
        throw profileError;
      }

      if (profileData) {
        console.log("[AuthContext] Profile upserted successfully with new role:", profileData);
        setRoleState(newRole);
        setUser(currentUser => currentUser ? ({
            ...currentUser,
            profile: {
                id: profileData.id,
                fullName: profileData.full_name,
                avatarUrl: profileData.avatar_url,
                role: profileData.role as Role,
            }
        }) : null);
        router.push("/dashboard");
      } else {
        console.error("[AuthContext] Profile data was null after upsert, though no explicit error.");
        toast({
            title: "Error al Establecer Rol",
            description: "No se recibió información del perfil después de la actualización.",
            variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("[AuthContext] Error setting role:", error);
      toast({
        title: "Error al Establecer Rol",
        description: error.message || "No se pudo actualizar tu rol. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      console.log("[AuthContext] setRoleAndUpdateProfile finished. isLoading set to false.");
    }
  };

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
