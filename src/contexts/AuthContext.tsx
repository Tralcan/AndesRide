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
  console.log("[AuthContext] Provider execution start.");
  const supabase = useMemo(() => createClientComponentClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRoleState] = useState<Role>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  console.log('[AuthContext] AuthProvider initial state:', { user, session, role, isLoading });

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
    console.log("[AuthContext][useEffect] Start. Initializing, checking session. isMounted:", isMounted);
    console.log('[AuthContext][useEffect] Setting isLoading to true (initial)');
    setIsLoading(true);

    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (!isMounted) {
        console.log("[AuthContext][getSession] Callback: Component unmounted, aborting state update.");
        return;
      }
      console.log("[AuthContext][getSession] Initial session from getSession():", currentSession);
      console.log('[AuthContext][getSession] Before setSession:', currentSession);
      setSession(currentSession);

      if (currentSession?.user) {
        console.log('[AuthContext][getSession] User found in session. Fetching profile...');
        try {
          const profile = await fetchUserProfile(currentSession.user);
          if (!isMounted) {
             console.log("[AuthContext][getSession] fetchUserProfile callback: Component unmounted, aborting state update.");
            return;
          }
          console.log('[AuthContext][getSession] Profile fetched:', profile);
          console.log('[AuthContext][getSession] Before setUser with profile:', { user: currentSession.user, profile });
          setUser({ ...currentSession.user, profile });
          if (profile?.role) {
            console.log('[AuthContext][getSession] Profile has role. Before setRoleState:', profile.role);
            setRoleState(profile.role);
          } else {
            console.log('[AuthContext][getSession] Profile has no role or profile is null. Before setRoleState(null)');
            setRoleState(null);
          }
        } catch (profileError) {
          console.error("[AuthContext][getSession] Error fetching profile during initial session load:", profileError);
        }
      } else {
        console.log('[AuthContext][getSession] No user in session. Before setUser(null) and setRoleState(null)');
        setUser(null);
        setRoleState(null);
      }
      console.log('[AuthContext][getSession] Before setIsLoading(false). Current state:', { user, session, role, isLoading });
      setIsLoading(false);
      console.log("[AuthContext][getSession] Initial session processing complete. isLoading set to false. isMounted:", isMounted);
    }).catch(sessionError => {
        if (!isMounted) {
            console.log("[AuthContext][getSession] getSession().catch: Component unmounted, aborting state update.");
            return;
        }
        console.error("[AuthContext][getSession] Error in supabase.auth.getSession() promise:", sessionError);
        console.log('[AuthContext][getSession] Catch block. Before setIsLoading(false).');
        setIsLoading(false);
    });

    const { data: authListenerData } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!isMounted) {
            console.log("[AuthContext][onAuthStateChange] Callback: Component unmounted, aborting handler.");
            return;
        }
        console.log('[AuthContext][onAuthStateChange] Auth event:', event, 'New session:', newSession, 'isMounted:', isMounted);
        console.log('[AuthContext][onAuthStateChange] Before setIsLoading(true)');
        setIsLoading(true);
        try {
          console.log('[AuthContext][onAuthStateChange] Before setSession:', newSession);
          setSession(newSession);
          if (newSession?.user) {
            console.log('[AuthContext][onAuthStateChange] User found in new session. Fetching profile...');
            const profile = await fetchUserProfile(newSession.user);
            if (!isMounted) {
                console.log("[AuthContext][onAuthStateChange] fetchUserProfile callback: Component unmounted, aborting state update.");
                return;
            }
            console.log('[AuthContext][onAuthStateChange] Profile fetched:', profile);
            console.log('[AuthContext][onAuthStateChange] Before setUser with profile:', { user: newSession.user, profile });
            setUser({ ...newSession.user, profile });

            if (profile?.role) {
              console.log('[AuthContext][onAuthStateChange] Profile has role. Before setRoleState:', profile.role);
              setRoleState(profile.role);
              if (window.location.pathname === '/role-selection' || window.location.pathname === '/') {
                console.log('[AuthContext][onAuthStateChange] Redirecting to /dashboard (role found, from /role-selection or /). Path:', window.location.pathname);
                router.replace("/dashboard");
              }
            } else if (profile && window.location.pathname !== '/role-selection' && window.location.pathname !== '/') {
              console.log('[AuthContext][onAuthStateChange] Profile exists but no role. Before setRoleState(null). Redirecting to /role-selection. Path:', window.location.pathname);
              setRoleState(null);
              router.replace("/role-selection");
            } else if (!profile && event === 'SIGNED_IN' && window.location.pathname !== '/role-selection' && window.location.pathname !== '/') {
               console.warn('[AuthContext][onAuthStateChange] No profile, SIGNED_IN. Before setRoleState(null). Redirecting to /role-selection. Path:', window.location.pathname);
               setRoleState(null); // Ensure role is null
               router.replace("/role-selection");
            } else {
              console.log('[AuthContext][onAuthStateChange] No specific redirect condition met for profile/role. Current role state:', profile?.role);
              setRoleState(profile?.role || null); // Ensure role state matches profile
            }
          } else {
            console.log('[AuthContext][onAuthStateChange] No user in new session. Before setUser(null) and setRoleState(null).');
            setUser(null);
            setRoleState(null);
             if (window.location.pathname !== '/') {
              console.log('[AuthContext][onAuthStateChange] Redirecting to / (no session, not on login page). Path:', window.location.pathname);
              router.replace("/");
            }
          }
        } catch (e: any) {
          console.error("[AuthContext][onAuthStateChange] Error in handler:", e);
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
            console.log('[AuthContext][onAuthStateChange] Finally block. Before setIsLoading(false). Current isLoading:', isLoading);
            setIsLoading(false);
            console.log('[AuthContext][onAuthStateChange] isLoading set to false.');
          }
        }
      }
    );
    
    const subscription = authListenerData?.subscription;

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
      console.log("[AuthContext][useEffect] Cleanup. Unsubscribed from auth changes. Component unmounted.");
    };
  }, [router, fetchUserProfile, toast, supabase]); // supabase and fetchUserProfile are stable due to useMemo/useCallback

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
    } else {
      // Explicitly clear local state on successful logout
      setUser(null);
      setSession(null);
      setRoleState(null);
      router.push('/'); // Redirect to login page
    }
    return { error };
  };

  const setRoleAndUpdateProfile = async (newRole: Role) => {
    if (!user?.id || !newRole) {
      console.error("[AuthContext][setRole] User not authenticated or invalid role for update. UserID:", user?.id, "NewRole:", newRole);
      toast({
        title: "Error",
        description: "Usuario no autenticado o rol no válido.",
        variant: "destructive"
      });
      return;
    }
    console.log(`[AuthContext][setRole] Setting role to ${newRole} for user ${user.id}`);
    console.log('[AuthContext][setRole] Before setIsLoading(true)');
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
        console.log("[AuthContext][setRole] Profile upserted successfully with new role:", profileData);
        console.log('[AuthContext][setRole] Before setRoleState:', newRole);
        setRoleState(newRole);
        const updatedProfile = {
            id: profileData.id,
            fullName: profileData.full_name,
            avatarUrl: profileData.avatar_url,
            role: profileData.role as Role,
        };
        console.log('[AuthContext][setRole] Before setUser (updating profile with new role):', updatedProfile);
        setUser(currentUser => currentUser ? ({ ...currentUser, profile: updatedProfile }) : null);
        router.push("/dashboard");
      } else {
        console.error("[AuthContext][setRole] Profile data was null after upsert, though no explicit error.");
        toast({
            title: "Error al Establecer Rol",
            description: "No se recibió información del perfil después de la actualización.",
            variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("[AuthContext][setRole] Error setting role:", error);
      toast({
        title: "Error al Establecer Rol",
        description: error.message || "No se pudo actualizar tu rol. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      console.log('[AuthContext][setRole] Finally block. Before setIsLoading(false). Current isLoading:', isLoading);
      setIsLoading(false);
      console.log('[AuthContext][setRole] isLoading set to false.');
    }
  };
  
  console.log('[AuthContext] AuthProvider render end. Context value:', { user, role, isAuthenticated: !!user && !!session, isLoading, session });

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

